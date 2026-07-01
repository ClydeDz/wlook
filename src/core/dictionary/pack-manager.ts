import * as fs from 'fs/promises'
import * as path from 'path'
import * as crypto from 'crypto'
import * as stream from 'stream'
import { pipeline } from 'stream/promises'
import Database from 'better-sqlite3'
import type { PackInfo, ManifestPack } from '../../shared/ipc-contracts'
import { SQLiteDictionaryProvider } from './sqlite-provider'

interface ManifestResponse {
  schemaVersion: number
  packs: ManifestPack[]
}

/**
 * PackManager handles scanning, fetching, installing, and uninstalling
 * dictionary .wlpack files. It has no Electron dependency.
 */
export class PackManager {
  readonly dictionariesDir: string

  constructor(dictionariesDir: string) {
    this.dictionariesDir = dictionariesDir
  }

  /**
   * Scans the dictionariesDir for .wlpack files and reads their metadata tables.
   * Returns a PackInfo for each valid pack found.
   */
  async scanInstalled(): Promise<PackInfo[]> {
    let entries: string[]
    try {
      entries = await fs.readdir(this.dictionariesDir)
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException).code
      if (code === 'ENOENT') return []
      throw err
    }

    const packs: PackInfo[] = []

    for (const entry of entries) {
      if (!entry.endsWith('.wlpack')) continue

      const packPath = path.join(this.dictionariesDir, entry)
      try {
        const info = this.readPackMetadata(packPath)
        if (info) packs.push(info)
      } catch {
        // Skip corrupt or unreadable packs
      }
    }

    return packs
  }

  /**
   * Fetches the remote manifest JSON and validates its structure.
   * Requires Node 18+ (built-in fetch).
   */
  async fetchManifest(url: string): Promise<ManifestPack[]> {
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Failed to fetch manifest: ${response.status} ${response.statusText}`)
    }

    const data = (await response.json()) as unknown

    // Validate top-level shape
    if (
      typeof data !== 'object' ||
      data === null ||
      !('packs' in data) ||
      !Array.isArray((data as ManifestResponse).packs)
    ) {
      throw new Error('Manifest JSON has unexpected shape (expected { packs: [...] })')
    }

    const manifest = data as ManifestResponse
    const packs = manifest.packs

    // Validate each pack entry has the required fields
    for (const pack of packs) {
      if (
        typeof pack.id !== 'string' ||
        typeof pack.url !== 'string' ||
        typeof pack.sha256 !== 'string' ||
        typeof pack.version !== 'string'
      ) {
        throw new Error(`Manifest contains invalid pack entry: ${JSON.stringify(pack)}`)
      }
    }

    return packs
  }

  /**
   * Downloads a pack file in chunks, reports progress, validates the SHA256
   * checksum, then moves the file into dictionariesDir.
   */
  async installPack(
    pack: ManifestPack,
    onProgress: (pct: number) => void
  ): Promise<void> {
    await fs.mkdir(this.dictionariesDir, { recursive: true })

    const fileName = `${pack.id}-${pack.version}.wlpack`
    const finalPath = path.join(this.dictionariesDir, fileName)
    const tmpPath = finalPath + '.tmp'

    const response = await fetch(pack.url)
    if (!response.ok) {
      throw new Error(
        `Failed to download pack ${pack.id}: ${response.status} ${response.statusText}`
      )
    }

    const contentLength = response.headers.get('content-length')
    const totalBytes = contentLength ? parseInt(contentLength, 10) : 0

    if (!response.body) {
      throw new Error(`Response body is null for pack ${pack.id}`)
    }

    const hash = crypto.createHash('sha256')
    let downloadedBytes = 0

    // Convert the web ReadableStream to a Node.js Readable stream
    const nodeReadable = stream.Readable.fromWeb(
      response.body as Parameters<typeof stream.Readable.fromWeb>[0]
    )

    const fileWriteStream = (await fs.open(tmpPath, 'w')).createWriteStream()

    // Track progress and hash as data flows through
    const trackingTransform = new stream.Transform({
      transform(chunk: Buffer, _encoding, callback) {
        downloadedBytes += chunk.length
        hash.update(chunk)

        if (totalBytes > 0) {
          const pct = Math.min(100, Math.round((downloadedBytes / totalBytes) * 100))
          onProgress(pct)
        }

        callback(null, chunk)
      },
    })

    await pipeline(nodeReadable, trackingTransform, fileWriteStream)

    // Report 100% in case content-length was unavailable
    onProgress(100)

    // Validate checksum
    const actualHash = hash.digest('hex')
    if (actualHash !== pack.sha256.toLowerCase()) {
      await fs.unlink(tmpPath).catch(() => undefined)
      throw new Error(
        `SHA256 mismatch for pack ${pack.id}: expected ${pack.sha256}, got ${actualHash}`
      )
    }

    // Atomically move to final location
    await fs.rename(tmpPath, finalPath)
  }

  /**
   * Finds and deletes the .wlpack file for the given packId.
   */
  async uninstallPack(packId: string): Promise<void> {
    let entries: string[]
    try {
      entries = await fs.readdir(this.dictionariesDir)
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException).code
      if (code === 'ENOENT') {
        throw new Error(`Pack ${packId} not found (dictionaries directory does not exist)`)
      }
      throw err
    }

    // Pack files are named <id>-<version>.wlpack; match by id prefix
    const target = entries.find(
      (e) => e.endsWith('.wlpack') && e.startsWith(`${packId}-`)
    )

    if (!target) {
      throw new Error(`Pack ${packId} not found in ${this.dictionariesDir}`)
    }

    await fs.unlink(path.join(this.dictionariesDir, target))
  }

  /**
   * Returns an open SQLiteDictionaryProvider for the given PackInfo.
   */
  getProvider(packInfo: PackInfo): SQLiteDictionaryProvider {
    const fileName = `${packInfo.id}-${packInfo.version}.wlpack`
    const packPath = path.join(this.dictionariesDir, fileName)
    const provider = new SQLiteDictionaryProvider(packPath, packInfo.id, packInfo.displayName)
    provider.open()
    return provider
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /**
   * Opens a .wlpack file briefly to read the metadata table.
   * Returns null if the file is not a valid pack.
   */
  private readPackMetadata(packPath: string): PackInfo | null {
    let db: Database.Database | null = null
    try {
      db = new Database(packPath, { readonly: true })

      const idRow = db
        .prepare<[string], { value: string }>('SELECT value FROM metadata WHERE key = ?')
        .get('id')
      const displayNameRow = db
        .prepare<[string], { value: string }>('SELECT value FROM metadata WHERE key = ?')
        .get('displayName')
      const versionRow = db
        .prepare<[string], { value: string }>('SELECT value FROM metadata WHERE key = ?')
        .get('version')
      const languageRow = db
        .prepare<[string], { value: string }>('SELECT value FROM metadata WHERE key = ?')
        .get('language')

      if (!idRow || !versionRow) return null

      // Estimate size on disk
      const stat = require('fs').statSync(packPath) as { size: number }
      const sizeMB = Math.round((stat.size / 1024 / 1024) * 10) / 10

      return {
        id: idRow.value,
        displayName: displayNameRow?.value ?? idRow.value,
        version: versionRow.value,
        sizeMB,
        language: languageRow?.value ?? idRow.value.split('-')[0],
      }
    } finally {
      db?.close()
    }
  }
}
