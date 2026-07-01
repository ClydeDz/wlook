import { contextBridge, ipcRenderer } from 'electron'
import type { LookupRequest, LookupResponse, DashboardStatus, PackInfo, ManifestPack } from '../shared/ipc-contracts'
import type { WlookConfig } from '../core/config'

// Re-export the config type for use in the global declaration
type WlookConfigPatch = Partial<WlookConfig>

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

  getManifest: (url: string): Promise<ManifestPack[]> =>
    ipcRenderer.invoke('get-manifest', url),

  onInstallProgress: (cb: (data: { packId: string; pct: number }) => void): void => {
    ipcRenderer.on('install-progress', (_event, data) => cb(data))
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
