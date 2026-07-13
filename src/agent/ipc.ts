import { app, ipcMain, shell, BrowserWindow } from 'electron'
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
  /**
   * Returns the path the agent's `SelectionCapture` *actually* used on its
   * most recent capture attempt, or `null` if no capture has happened yet.
   * Lets `get-status` report runtime state (what path the user just
   * exercised) instead of configured state (what is on/off in config).
   */
  getSelectionCaptureMethod: () => 'uia' | 'clipboard' | 'unavailable' | null
  /**
   * Push the current `DashboardStatus` to every open renderer via the
   * `'status-update'` event. Used by the agent after each capture so
   * the dashboard's System Health row reflects the runtime method
   * without waiting for a mount/reload/install to refresh.
   */
  broadcastStatus: () => Promise<void>
}

/**
 * Builds a fresh `DashboardStatus` from the live agent state. Used by
 * `get-status` (renderer pull) and by `main.ts`'s `broadcastStatus`
 * closure (push after each capture). Single source of truth so the
 * pull and push paths always agree on field shape.
 */
export async function buildDashboardStatus(ctx: IPCContext): Promise<DashboardStatus> {
  const config = ctx.getConfig()
  const installedPacks = await ctx.packManager.scanInstalled()

  // Selection capture method reflects which path the **most recent**
  // capture actually used. Null (no capture yet) collapses to
  // `'unknown'`, which the renderer renders as a neutral grey dot
  // with the prompt to test the hotkey.
  const lastMethod = ctx.getSelectionCaptureMethod()
  const selectionCaptureMethod: DashboardStatus['selectionCaptureMethod'] =
    lastMethod ?? 'unknown'

  return {
    agentRunning: true,
    hotkeyRegistered: ctx.hotkeyManager.isRegistered(),
    hotkeyAccelerator: config.hotkey ?? '',
    selectionCaptureMethod,
    installedPacks,
    preferredDialect: config.preferredDialect,
    dictionariesDir: ctx.packManager.dictionariesDir,
  }
}

/**
 * Fan-out helper for the agent's `broadcastStatus` closure. Sends the
 * given status to every open `BrowserWindow` via the `'status-update'`
 * channel. Renderers that haven't subscribed yet drop the event at
 * their `ipcRenderer` boundary, so broadcasting is safe even when a
 * window is mid-mount.
 */
export function pushStatusToRenderers(status: DashboardStatus): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue
    const wc = win.webContents
    if (wc.isDestroyed()) continue
    wc.send('status-update', status)
  }
}

/**
 * Registers all IPC handlers for communication between main and renderer
 * processes. Should be called once after the app is ready.
 */
export function setupIPC(ctx: IPCContext): void {
  // ── Status ──────────────────────────────────────────────────────────────

  ipcMain.handle('get-status', async (): Promise<DashboardStatus> => {
    return buildDashboardStatus(ctx)
  })

  // ── Config ───────────────────────────────────────────────────────────────

  ipcMain.handle('get-config', () => {
    // Augment WlookConfig with `version` (read from the running app's
    // package.json via `app.getVersion()`) so the dashboard header can
    // render "Wlook v<version>". WlookConfig's index signature makes this
    // shape-additive without breaking existing callers.
    return { ...ctx.getConfig(), version: app.getVersion() }
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
    console.log(`[ipc] install-pack received: "${pack.id}" from ${pack.url}`)
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
