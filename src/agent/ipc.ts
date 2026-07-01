import { ipcMain, shell } from 'electron'
import type { WlookConfig } from '../core/config'
import { writeConfig } from '../core/config'
import { getLemmatizer } from '../core/lemma/index'
import { DefaultDictionaryResolver } from '../core/dictionary/resolver'
import type { PackManager } from '../core/dictionary/pack-manager'
import type {
  LookupRequest,
  LookupResponse,
  DashboardStatus,
  ManifestPack,
} from '../shared/ipc-contracts'
import type { HotkeyManager } from './hotkey'
import type { PopupWindow } from './popup-window'

export interface IPCContext {
  getConfig: () => WlookConfig
  setConfig: (config: WlookConfig) => Promise<void>
  packManager: PackManager
  hotkeyManager: HotkeyManager
  popupWindow: PopupWindow
}

/**
 * Registers all IPC handlers for communication between main and renderer
 * processes. Should be called once after the app is ready.
 */
export function setupIPC(ctx: IPCContext): void {
  // ── Status ──────────────────────────────────────────────────────────────

  ipcMain.handle('get-status', async (): Promise<DashboardStatus> => {
    const config = ctx.getConfig()
    const installedPacks = await ctx.packManager.scanInstalled()

    // Determine selection capture method based on platform + config
    let selectionCaptureMethod: DashboardStatus['selectionCaptureMethod']
    if (process.platform === 'win32') {
      selectionCaptureMethod = config.clipboardFallback ? 'clipboard' : 'uia'
    } else {
      // On non-Windows (dev), we use clipboard directly
      selectionCaptureMethod = 'clipboard'
    }

    return {
      agentRunning: true,
      hotkeyRegistered: ctx.hotkeyManager.isRegistered(),
      hotkeyAccelerator: config.hotkey,
      selectionCaptureMethod,
      installedPacks,
      preferredDialect: config.preferredDialect,
    }
  })

  // ── Config ───────────────────────────────────────────────────────────────

  ipcMain.handle('get-config', (): WlookConfig => {
    return ctx.getConfig()
  })

  ipcMain.handle('update-config', async (_event, patch: Partial<WlookConfig>): Promise<void> => {
    const current = ctx.getConfig()
    const updated: WlookConfig = { ...current, ...patch }

    // Deep-merge popupSearch if present in patch
    if (patch.popupSearch) {
      updated.popupSearch = { ...current.popupSearch, ...patch.popupSearch }
    }

    await ctx.setConfig(updated)

    // Re-apply hotkey if changed
    if ('hotkey' in patch || 'hotkeyEnabled' in patch) {
      ctx.hotkeyManager.unregister()
      if (updated.hotkeyEnabled && updated.hotkey) {
        ctx.hotkeyManager.register(updated.hotkey)
      }
    }

    // Re-apply popup dismiss timeout if changed
    if ('popupDismissTimeoutMs' in patch) {
      ctx.popupWindow.updateDismissTimeout(updated.popupDismissTimeoutMs)
    }
  })

  // ── Lookup ───────────────────────────────────────────────────────────────

  ipcMain.handle('lookup-request', async (_event, req: LookupRequest): Promise<LookupResponse> => {
    const config = ctx.getConfig()
    const { query } = req

    // 1. Normalise
    const normalised = query.trim().toLowerCase()

    if (!normalised) {
      return { type: 'lookup-result', query, entry: null }
    }

    // 2. Get lemmatizer for preferred dialect language
    const language = config.preferredDialect.split('-')[0]
    const lemmatizer = getLemmatizer(language)
    const lemmas = lemmatizer ? lemmatizer.lemmas(normalised) : [normalised]

    // 3. Build providers from installed packs
    const installedPacks = await ctx.packManager.scanInstalled()
    const providers = installedPacks.map((pack) => ctx.packManager.getProvider(pack))

    if (providers.length === 0) {
      return { type: 'lookup-result', query, entry: null }
    }

    try {
      // 4. Resolve across all installed providers
      const resolver = new DefaultDictionaryResolver(providers, config.preferredDialect)
      const resolved = await resolver.resolve(normalised, lemmas)

      if (!resolved) {
        return { type: 'lookup-result', query, entry: null }
      }

      // 5. Build response
      return {
        type: 'lookup-result',
        query,
        entry: {
          headword: resolved.headword,
          pos: resolved.pos,
          ipa: resolved.ipa,
          senses: resolved.senses,
          sources: resolved.sources,
        },
      }
    } finally {
      // Close all provider connections
      await Promise.allSettled(providers.map((p) => p.close()))
    }
  })

  // ── Pack management ───────────────────────────────────────────────────────

  ipcMain.handle('install-pack', async (event, pack: ManifestPack): Promise<void> => {
    const sender = event.sender

    await ctx.packManager.installPack(pack, (pct: number) => {
      // Send progress back to all renderers that are listening
      if (!sender.isDestroyed()) {
        sender.send('install-progress', { packId: pack.id, pct })
      }
    })
  })

  ipcMain.handle('uninstall-pack', async (_event, id: string): Promise<void> => {
    await ctx.packManager.uninstallPack(id)
  })

  // ── External / manifest ───────────────────────────────────────────────────

  ipcMain.handle('open-external', async (_event, url: string): Promise<void> => {
    await shell.openExternal(url)
  })

  ipcMain.handle('get-manifest', async (_event, url: string): Promise<ManifestPack[]> => {
    return ctx.packManager.fetchManifest(url)
  })
}
