import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'

export interface PopupSearch {
  label: string
  urlTemplate: string
}

export interface WlookConfig {
  preferredDialect: string
  /**
   * Hotkey accelerator. Either an Electron-prefix string
   * (`'CommandOrControl+Shift+D'`) or `null` to explicitly disable
   * the hotkey without flipping `hotkeyEnabled`. The `null` form is
   * documented in `docs/customisation.md` §15.4 and predates the
   * `hotkeyEnabled` toggle; `mergeConfig` preserves it verbatim so a
   * user who set `null` does not have their hotkey silently re-bound
   * to the default on the next read.
   */
  hotkey: string | null
  hotkeyEnabled: boolean
  startOnLogin: boolean
  clipboardFallback: boolean
  theme: string
  popupSearch: PopupSearch
  popupDismissTimeoutMs: number
  /**
   * URL of the remote dictionary catalogue JSON the dashboard fetches
   * in the "Browse Dictionaries" section. `null` means no remote
   * catalogue is configured — the section then shows an empty state
   * pointing the user at the local dictionaries folder for manual
   * `.wlpack` drops.
   */
  catalogueUrl: string | null
  // Allow unknown keys to be preserved
  [key: string]: unknown
}

export const DEFAULT_CONFIG: WlookConfig = {
  preferredDialect: 'en-GB',
  hotkey: 'CommandOrControl+Shift+D',
  hotkeyEnabled: true,
  startOnLogin: true,
  clipboardFallback: false,
  // Popup theme. Valid built-in values:
  //   'system' → follow OS light/dark preference
  //   'light'  → force the light surface regardless of OS
  //   'dark'   → force the dark surface regardless of OS
  // Unknown strings are accepted at the type level (preserving the original
  // freeform shape for future custom themes) but the dashboard UI narrows
  // the choice to these three. Migrated from the older 'default' alias;
  // see readConfig() below.
  theme: 'system',
  popupSearch: {
    label: 'Search on Google',
    urlTemplate: 'https://www.google.com/search?q={query}',
  },
  popupDismissTimeoutMs: 8000,
  // Upstream dictionary catalogue. Hard-coded so out-of-the-box installs
  // work without first-time-setup; update this URL when migrating to a
  // new manifest host. Users can override per-install in their
  // %APPDATA%\Wlook\config.json. `null` falls back to the "drop .wlpack
  // files into the dictionaries folder" empty state.
  catalogueUrl:
    'https://github.com/ClydeDz/wlook/releases/download/0.0.0/packs-manifest.json',
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
 * Canonicalises an Electron accelerator string by collapsing every
 * variant of the platform's primary modifier to `CommandOrControl`.
 * Electron treats `Ctrl`, `Control`, `Cmd, `Command` as aliases for the
 * same physical key depending on platform (`Ctrl`/`Control` on
 * Windows/Linux, `Cmd`/`Command` on macOS); `CommandOrControl` is
 * Electron's portable prefix that resolves to the right one for the
 * running OS.
 *
 * Rules (in order):
 *   - Empty / whitespace-only input → ''.
 *   - Tokenise on `+`, trim each piece, drop empties.
 *   - Primary-modifier tokens (`Ctrl` / `Control` / `Cmd` / `Command`,
 *     case-insensitive) are rewritten to `CommandOrControl`.
 *   - Known multi-character modifiers (`Meta`, `Alt`, `Shift`,
 *     `CommandOrControl`) are title-cased to their canonical names.
 *   - Single-character action keys (`a`, `b`, …, `0`, …) are upper-cased.
 *   - Other multi-character keys (`Enter`, `End`, `PageUp`, …) are
 *     preserved verbatim.
 *   - Duplicate tokens are removed, keeping the first occurrence.
 *
 * The function is pure and exported so the migration rules can be unit
 * tested without touching the filesystem (see
 * `tests/unit/core/config.test.ts`).
 */
export function normaliseHotkey(hotkey: string): string {
  if (hotkey.trim() === '') return ''
  const tokens = hotkey
    .split('+')
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of tokens) {
    const lower = raw.toLowerCase()
    let canonical: string
    if (lower === 'ctrl' || lower === 'control' || lower === 'cmd' || lower === 'command') {
      canonical = 'CommandOrControl'
    } else if (lower === 'meta') {
      canonical = 'Meta'
    } else if (lower === 'alt') {
      canonical = 'Alt'
    } else if (lower === 'shift') {
      canonical = 'Shift'
    } else if (raw.length === 1) {
      canonical = raw.toUpperCase()
    } else {
      canonical = raw
    }
    if (!seen.has(canonical)) {
      seen.add(canonical)
      out.push(canonical)
    }
  }
  return out.join('+')
}

/**
 * Pure merge of a raw config object with DEFAULT_CONFIG.
 *
 * Extracted from `readConfig` so tests can exercise the merge rules —
 * including the legacy `theme: "default" → "system"` migration and the
 * canonical hotkey prefix rewrite — without touching the filesystem.
 * Production code only ever calls this via `readConfig`, but it is
 * exported because the test suite asserts the migration rules directly
 * (a test that round-trips through a real file would be coupled to the
 * running platform's `getConfigDir`).
 *
 * Behaviour:
 * - Default values are filled in for any key missing from `raw`.
 * - All keys from `raw` (including unknown ones) override defaults,
 *   preserving them through the merge.
 * - The nested `popupSearch` object is deep-merged.
 * - `theme` is normalised: legacy `'default'` (the pre-0.3 alias for
 *   "follow OS") becomes `'system'`; any other non-empty string is
 *   passed through.
 * - `hotkey` is normalised through `normaliseHotkey`: literal
 *   `Ctrl` / `Control` / `Cmd` / `Command` tokens are rewritten to the
 *   canonical Electron `CommandOrControl` prefix while preserving
 *   modifiers like `Meta` / `Alt` / `Shift`. Legacy config.json entries
 *   written before this rule shipped (typically `"Ctrl+Shift+D"` from
 *   hand-edits or the pre-canonical recorder output) are silently
 *   migrated on next read.
 */
export function mergeConfig(raw: Record<string, unknown>): WlookConfig {
  // Treat 'default' AND undefined (key absent from config.json) as
  // "follow the OS" → 'system'. Without the explicit undefined branch,
  // a future change to DEFAULT_CONFIG.theme would silently change the
  // behaviour for users with no `theme` key in their config.
  const normalisedTheme =
    raw.theme === 'default' || raw.theme === undefined
      ? 'system'
      : (raw.theme as string)

  // `raw.hotkey` may be missing, a string, `null`, or some other
  // non-string type. Strings pass through `normaliseHotkey` so
  // pre-canonical `Ctrl` / `Control` / `Cmd` / `Command` literals are
  // silently migrated to `CommandOrControl`. `null` is preserved
  // verbatim because `docs/customisation.md` §15.4 documents it as a
  // legacy disable marker (predating `hotkeyEnabled`); rewriting it to
  // the default would silently re-enable a hotkey the user explicitly
  // disabled. Anything else (e.g. an accidentally-numbered value from
  // a hand-edit) falls back to `DEFAULT_CONFIG.hotkey`.
  const normalisedHotkey =
    raw.hotkey === null
      ? null
      : typeof raw.hotkey === 'string'
        ? normaliseHotkey(raw.hotkey)
        : DEFAULT_CONFIG.hotkey

  return {
    ...DEFAULT_CONFIG,
    ...raw,
    theme: normalisedTheme,
    hotkey: normalisedHotkey,
    popupSearch: {
      ...DEFAULT_CONFIG.popupSearch,
      ...(typeof raw.popupSearch === 'object' && raw.popupSearch !== null
        ? (raw.popupSearch as Partial<PopupSearch>)
        : {}),
    },
  }
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

  return mergeConfig(raw)
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
