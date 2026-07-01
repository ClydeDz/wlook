// All IPC message types shared between main and renderer processes

export type LookupRequest = {
  type: 'lookup'
  query: string          // original selected text
  x: number             // cursor X for positioning popup
  y: number             // cursor Y for positioning popup
}

export type LookupResponse = {
  type: 'lookup-result'
  query: string
  entry: DictionaryEntryResult | null
}

export type DictionaryEntryResult = {
  headword: string
  pos?: string
  ipa?: { uk?: string; us?: string }
  senses: Array<{ definition: string; example?: string }>
  sources: string[]    // e.g. ["en-GB", "en-US"]
}

export type DashboardStatus = {
  agentRunning: boolean
  hotkeyRegistered: boolean
  hotkeyAccelerator: string
  selectionCaptureMethod: 'uia' | 'clipboard' | 'unavailable'
  installedPacks: PackInfo[]
  preferredDialect: string
}

export type PackInfo = {
  id: string           // "en-GB"
  displayName: string  // "English (UK)"
  version: string
  sizeMB: number
  language: string     // "en"
}

export type ManifestPack = PackInfo & {
  url: string
  sha256: string
}

export type IPCChannel =
  | 'lookup-request'
  | 'lookup-result'
  | 'get-status'
  | 'status-response'
  | 'install-pack'
  | 'install-progress'
  | 'uninstall-pack'
  | 'update-config'
  | 'open-external'
  | 'get-config'
  | 'config-response'
