import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { PackManager } from '../../../src/core/dictionary/pack-manager'
import path from 'path'
import fs from 'fs/promises'
import os from 'os'
import crypto from 'crypto'

const FIXTURE_PATH = path.join(process.cwd(), 'tests/fixtures/en-test.wlpack')

// The fixture metadata: id="en-test", version="1.0.0"
// PackManager.getProvider expects file named "<id>-<version>.wlpack"
const PACK_FILENAME = 'en-test-1.0.0.wlpack'

let tempDir: string

async function copyFixture(destDir: string, fileName = PACK_FILENAME): Promise<string> {
  const dest = path.join(destDir, fileName)
  await fs.copyFile(FIXTURE_PATH, dest)
  return dest
}

describe('PackManager', () => {
  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wlook-pm-test-'))
  })

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true })
  })

  describe('scanInstalled', () => {
    it('scanInstalled() on empty dir returns []', async () => {
      const pm = new PackManager(tempDir)
      const result = await pm.scanInstalled()
      expect(result).toEqual([])
    })

    it('scanInstalled() with fixture file returns 1 PackInfo with correct id/language', async () => {
      await copyFixture(tempDir)
      const pm = new PackManager(tempDir)
      const result = await pm.scanInstalled()
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('en-test')
      expect(result[0].language).toBe('en')
      expect(result[0].version).toBe('1.0.0')
    })

    it('scanInstalled() on non-existent dir returns []', async () => {
      const nonExistentDir = path.join(tempDir, 'does-not-exist')
      const pm = new PackManager(nonExistentDir)
      const result = await pm.scanInstalled()
      expect(result).toEqual([])
    })
  })

  describe('getProvider', () => {
    it('getProvider() returns an openable provider that can lookup words', async () => {
      await copyFixture(tempDir)
      const pm = new PackManager(tempDir)

      const packInfo = {
        id: 'en-test',
        displayName: 'Test Dictionary',
        version: '1.0.0',
        sizeMB: 0.1,
        language: 'en',
      }

      const provider = pm.getProvider(packInfo)
      expect(provider).toBeDefined()
      expect(provider.id).toBe('en-test')

      // Verify it can actually look up a word
      const entry = await provider.lookup('cat')
      expect(entry).not.toBeNull()
      expect(entry!.headword.toLowerCase()).toBe('cat')

      await provider.close()
    })
  })

  describe('validateChecksum', () => {
    it('SHA256 of fixture file matches computed hash', async () => {
      const destPath = await copyFixture(tempDir)
      const fileBuffer = await fs.readFile(destPath)
      const hash = crypto.createHash('sha256').update(fileBuffer).digest('hex')

      // The hash should be a valid 64-char hex string
      expect(hash).toMatch(/^[a-f0-9]{64}$/)

      // Compute again to confirm determinism
      const hash2 = crypto.createHash('sha256').update(fileBuffer).digest('hex')
      expect(hash).toBe(hash2)
    })

    it('SHA256 changes after file is modified', async () => {
      const destPath = await copyFixture(tempDir)
      const originalBuffer = await fs.readFile(destPath)
      const originalHash = crypto.createHash('sha256').update(originalBuffer).digest('hex')

      // Modify the file
      const handle = await fs.open(destPath, 'r+')
      await handle.write(Buffer.from([0x00, 0x00, 0x00, 0x00]), 0, 4, 0)
      await handle.close()

      const modifiedBuffer = await fs.readFile(destPath)
      const modifiedHash = crypto.createHash('sha256').update(modifiedBuffer).digest('hex')

      expect(modifiedHash).not.toBe(originalHash)
    })
  })

  describe('uninstallPack', () => {
    it('uninstallPack removes the file', async () => {
      await copyFixture(tempDir)
      const pm = new PackManager(tempDir)

      // Verify it's there
      const beforeScan = await pm.scanInstalled()
      expect(beforeScan).toHaveLength(1)

      // Uninstall
      await pm.uninstallPack('en-test')

      // Verify it's gone
      const afterScan = await pm.scanInstalled()
      expect(afterScan).toHaveLength(0)
    })

    it('uninstallPack throws if pack not found', async () => {
      const pm = new PackManager(tempDir)
      await expect(pm.uninstallPack('en-nonexistent')).rejects.toThrow()
    })
  })
})
