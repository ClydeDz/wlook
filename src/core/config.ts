import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'

export interface PopupSearch {
  label: string
  urlTemplate: string
}

export interface WlookConfig {
  preferredDialect: string
  hotkey: string
  hotkeyEnabled: boolean
  startOnLogin: boolean
  clipboardFallback: boolean
  theme: string
  popupSearch: PopupSearch
  popupDismissTimeoutMs: number
  // Allow unknown keys to be preserved
  [key: string]: unknown
}

export const DEFAULT_CONFIG: WlookConfig = {
  preferredDialect: 'en-GB',
  hotkey: 'CommandOrControl+Shift+D',
  hotkeyEnabled: true,
  startOnLogin: true,
  clipboardFallback: false,
  theme: 'default',
  popupSearch: {
    label: 'Search on Google',
    urlTemplate: 'https://www.google.com/search?q={query}',
  },
  popupDismissTimeoutMs: 8000,
}

/**
 * Returns the platform-aware config directory:
 *   Windows  → %APPDATA%\Wlook
 *   Mac/Linux → ~/.wlook
 */
export function getConfigDir(): string {
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA
    if (appData) {
      return path.join(appData, 'Wlook')
    }
    // Fallback if APPDATA is not set (should not happen on Windows)
    return path.join(os.homedir(), 'AppData', 'Roaming', 'Wlook')
  }
  return path.join(os.homedir(), '.wlook')
}

function getConfigPath(): string {
  return path.join(getConfigDir(), 'config.json')
}

/**
 * Reads config.json and deep-merges with defaults.
 * Unknown keys from the file are preserved.
 * If the file does not exist, returns a copy of DEFAULT_CONFIG.
 */
export async function readConfig(): Promise<WlookConfig> {
  const configPath = getConfigPath()
  let raw: Record<string, unknown> = {}

  try {
    const text = await fs.readFile(configPath, 'utf-8')
    raw = JSON.parse(text) as Record<string, unknown>
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code
    if (code !== 'ENOENT') {
      // Re-throw unexpected errors (e.g. permission denied, bad JSON)
      throw err
    }
    // File not found — use defaults
  }

  // Shallow-merge: defaults first, then file values override, preserving unknown keys
  const merged: WlookConfig = {
    ...DEFAULT_CONFIG,
    ...raw,
    // Deep-merge nested popupSearch so partial overrides work
    popupSearch: {
      ...DEFAULT_CONFIG.popupSearch,
      ...(typeof raw.popupSearch === 'object' && raw.popupSearch !== null
        ? (raw.popupSearch as Partial<PopupSearch>)
        : {}),
    },
  }

  return merged
}

/**
 * Writes config atomically: write to <configPath>.tmp then rename.
 * Creates the config directory if it does not exist.
 */
export async function writeConfig(config: WlookConfig): Promise<void> {
  const configDir = getConfigDir()
  const configPath = getConfigPath()
  const tmpPath = configPath + '.tmp'

  await fs.mkdir(configDir, { recursive: true })

  const text = JSON.stringify(config, null, 2)
  await fs.writeFile(tmpPath, text, 'utf-8')
  await fs.rename(tmpPath, configPath)
}
