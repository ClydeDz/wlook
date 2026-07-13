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
  /**
   * The path the agent actually used the last time it performed a
   * selection capture: `'uia'` if it read the focused element via UIA
   * TextPattern, `'clipboard'` if the SendKeys-based fallback was needed,
   * or `'unavailable'` if both paths failed to produce a usable result.
   *
   * Before the agent performs its first capture (i.e. on a freshly
   * launched tray app, before the user has pressed the global hotkey),
   * this is `'unknown'` — rendered as a neutral grey dot with the
   * prompt "Press the global hotkey to test". Distinguishable from
   * all three resolved states so the dashboard no longer shows
   * "UI Automation" (green) before any capture has actually happened.
   *
   * Drives the System Health "Selection capture" row in the dashboard —
   * green / amber / red / grey respectively for the four values above.
   * The field changed from configured mode (`config.clipboardFallback`)
   * to runtime mode (the path actually used) in v0.x; see CHANGELOG
   * for the timeline.
   */
  selectionCaptureMethod: 'uia' | 'clipboard' | 'unavailable' | 'unknown'
  installedPacks: PackInfo[]
  preferredDialect: string
  /**
   * Absolute path of the user's `dictionaries` directory. Surfaced so the
   * dashboard can tell the user where to drop `.wlpack` files when no
   * remote catalogue is configured.
   */
  dictionariesDir: string
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
  /**
   * Optional SHA-256 of the pack binary in lowercase hex.
   *
   * When present, `PackManager.installPack` validates the downloaded bytes
   * against this hash and the install fails on mismatch. When omitted the
   * install proceeds without inline integrity checking (still subject to
   * transport-layer errors, but no defence against manifest tampering).
   *
   * Treating this as optional lets publishers ship a simple catalogue
   * without computing and pasting a hash per pack. Recommended for
   * trusted, single-publisher catalogues; strongly recommended for any
   * catalogue served over an untrusted channel.
   */
  sha256?: string
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
  | 'status-update'
