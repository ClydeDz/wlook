import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { LookupRequest, LookupResponse, DashboardStatus, PackInfo, ManifestPack } from '../shared/ipc-contracts'
import type { WlookConfig } from '../core/config'

// Re-export the config type for use in the global declaration
type WlookConfigPatch = Partial<WlookConfig>

// ── Per-pack install-progress listener registry ────────────────────────────
// The dashboard's BrowseDictionaries attaches a fresh listener per install
// (one pack id at a time) and removes it on completion. We keep the handler
// reference keyed by packId so the remove side is symmetric.
const installProgressHandlers = new Map<
  string,
  (event: IpcRendererEvent, data: { packId: string; pct: number }) => void
>()

const wlookApi = {
  lookup: (req: LookupRequest): Promise<LookupResponse> =>
    ipcRenderer.invoke('lookup-request', req),

  getStatus: (): Promise<DashboardStatus> =>
    ipcRenderer.invoke('get-status'),

  getConfig: (): Promise<WlookConfig> =>
    ipcRenderer.invoke('get-config'),

  updateConfig: (patch: WlookConfigPatch): Promise<void> =>
    ipcRenderer.invoke('update-config', patch),

  installPack: (pack: ManifestPack): Promise<void> =>
    ipcRenderer.invoke('install-pack', pack),

  uninstallPack: (id: string): Promise<void> =>
    ipcRenderer.invoke('uninstall-pack', id),

  openExternal: (url: string): Promise<void> =>
    ipcRenderer.invoke('open-external', url),

  // Wraps the IPC so the renderer receives a `{ packs: [...] }` wrapper
  // (matches what the dashboard's BrowseDictionaries expects to read).
  fetchManifest: async (url: string): Promise<{ packs: ManifestPack[] }> => {
    const packs = await ipcRenderer.invoke('get-manifest', url)
    return { packs }
  },

  // Dashboard's BrowseDictionaries subscribes per-packId so that future
  // concurrent installs would each receive only their own progress events.
  onInstallProgress: (
    packId: string,
    cb: (percent: number) => void
  ): void => {
    const handler = (
      _event: IpcRendererEvent,
      data: { packId: string; pct: number }
    ): void => {
      if (data.packId === packId) cb(data.pct)
    }
    installProgressHandlers.set(packId, handler)
    ipcRenderer.on('install-progress', handler)
  },

  // Symmetric removal. The dashboard passes the original `cb` as the second
  // arg — we ignore it and look up the saved handler by packId.
  offInstallProgress: (packId: string, _cb: (percent: number) => void): void => {
    const handler = installProgressHandlers.get(packId)
    if (handler) {
      ipcRenderer.removeListener('install-progress', handler)
      installProgressHandlers.delete(packId)
    }
  },

  // ── Popup-only ──────────────────────────────────────────────────────────
  // The popup renderer invokes these. `onDefinition` forwards the lookup
  // result pushed by main via `webContents.send('lookup-result', ...)`;
  // `notifyReady` is part of a small handshake so main knows when the
  // popup's `init()` has registered its listener (avoids the first-lookup
  // race where the message would otherwise be dropped).
  onDefinition: (cb: (payload: LookupResponse) => void): void => {
    ipcRenderer.on('lookup-result', (_event, payload) => cb(payload))
  },

  notifyReady: (): void => {
    ipcRenderer.send('popup-renderer-ready')
  },
}

contextBridge.exposeInMainWorld('wlook', wlookApi)

// Type augmentation so renderer TypeScript knows window.wlook exists
declare global {
  interface Window {
    wlook: typeof wlookApi
  }
}

// Suppress "unused import" warnings — the types are used implicitly above
export type { LookupRequest, LookupResponse, DashboardStatus, PackInfo, ManifestPack, WlookConfig }
