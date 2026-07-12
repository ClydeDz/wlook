import { app } from 'electron'
import { readConfig, writeConfig, getConfigDir } from '../core/config'
import type { WlookConfig } from '../core/config'
import { PackManager } from '../core/dictionary/pack-manager'
import { HotkeyManager } from './hotkey'
import { PopupWindow } from './popup-window'
import { DashboardWindow } from './dashboard-window'
import { createTray } from './tray'
import { setupIPC } from './ipc'
import { captureCurrentSelection } from './selection-capture'
import * as path from 'path'
import type { Tray } from 'electron'

// ── Single-instance lock ────────────────────────────────────────────────────

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  // Another instance is already running — hand off and exit
  app.quit()
  process.exit(0)
}

// ── Windows taskbar identity ────────────────────────────────────────────────

// ── Display name for Windows taskbar / Alt-Tab / notifications ────────────────
// package.json has `"name": "wlook"` (lowercase, npm-style); we want Windows
// to display "Wlook" everywhere it surfaces the app identity. setName() takes
// precedence over the package.json name for Electron's app-name APIs.
app.setName('Wlook')

app.setAppUserModelId('com.wlook.app')

// ── Mac: hide from Dock (it's a tray-only app) ──────────────────────────────

app.dock?.hide()

// ── Module-level references (must be kept alive to prevent GC) ──────────────

let tray: Tray | null = null // eslint-disable-line @typescript-eslint/no-unused-vars
let config: WlookConfig
let hotkeyManager: HotkeyManager
let popupWindow: PopupWindow
let dashboardWindow: DashboardWindow
let packManager: PackManager

// ── App lifecycle ────────────────────────────────────────────────────────────

app.on('ready', () => {
  initApp().catch((err) => {
    console.error('[main] Fatal error during init:', err)
    app.quit()
  })
})

// Keep the app alive when all windows are closed
app.on('window-all-closed', () => {
  // Intentionally do nothing — the tray keeps the process alive
})

// When a second instance is launched, focus the dashboard
app.on('second-instance', () => {
  dashboardWindow?.open()
})

// ── Init ─────────────────────────────────────────────────────────────────────

async function initApp(): Promise<void> {
  // 1. Load config
  config = await readConfig()
  console.log('[main] Config loaded:', config.preferredDialect, config.hotkey)

  // 2. Set up pack manager
  const dictionariesDir = path.join(getConfigDir(), 'dictionaries')
  packManager = new PackManager(dictionariesDir)

  // 3. Create windows (hidden initially)
  popupWindow = new PopupWindow(config.popupDismissTimeoutMs)
  dashboardWindow = new DashboardWindow()

  // 4. Create tray
  tray = createTray(
    () => dashboardWindow.open(),
    () => {
      popupWindow.destroy()
      app.exit(0)
    }
  )

  // 5. Register hotkey
  hotkeyManager = new HotkeyManager()
  hotkeyManager.onTriggered(handleHotkeyTrigger)

  if (config.hotkeyEnabled && config.hotkey) {
    const ok = hotkeyManager.register(config.hotkey)
    if (!ok) {
      console.warn(`[main] Hotkey "${config.hotkey}" conflict — could not register`)
    }
  }

  // 6. Register IPC handlers
  setupIPC({
    getConfig: () => config,
    setConfig: async (updated: WlookConfig) => {
      config = updated
      await writeConfig(updated)

      // Re-apply login item setting
      applyLoginItem(updated)
    },
    packManager,
    hotkeyManager,
    popupWindow,
  })

  // 7. Auto-launch on login (Windows only — setLoginItemSettings is a no-op on Mac)
  applyLoginItem(config)

  // 8. First-run check: open dashboard if no dictionaries installed
  const installed = await packManager.scanInstalled()
  if (installed.length === 0) {
    setTimeout(() => dashboardWindow.open(), 1000)
  }

  console.log('[main] Wlook agent ready')
}

// ── Hotkey trigger ───────────────────────────────────────────────────────────

async function handleHotkeyTrigger(): Promise<void> {
  const selected = await captureCurrentSelection(config)

  if (!selected) {
    console.log('[main] Hotkey fired but no selection detected')
    return
  }

  // Get cursor position for popup placement
  const { screen } = await import('electron')
  const { x, y } = screen.getCursorScreenPoint()

  // Run the lookup via IPC pipeline — reuse the same logic by invoking the
  // handler directly (avoids duplicating the lookup pipeline)
  const { ipcMain } = await import('electron')

  // We invoke the handler directly to avoid coupling to the IPC channel string.
  // In practice the IPC handler is already registered by setupIPC; we emit it
  // from within main so we don't need an actual renderer event.
  // Instead we call the lookup logic directly here for simplicity.
  await performLookup(selected, x, y)
}

async function performLookup(query: string, x: number, y: number): Promise<void> {
  try {
    const { getLemmatizer } = await import('../core/lemma/index')
    const { DefaultDictionaryResolver } = await import('../core/dictionary/resolver')

    const normalised = query.trim().toLowerCase()
    if (!normalised) return

    const language = config.preferredDialect.split('-')[0]
    const lemmatizer = getLemmatizer(language)
    const lemmas = lemmatizer ? lemmatizer.lemmas(normalised) : [normalised]

    const installedPacks = await packManager.scanInstalled()
    const providers = installedPacks.map((pack) => packManager.getProvider(pack))

    if (providers.length === 0) {
      // No packs installed — show the dashboard instead
      dashboardWindow.open()
      return
    }

    try {
      const resolver = new DefaultDictionaryResolver(providers, config.preferredDialect)
      const resolved = await resolver.resolve(normalised, lemmas)

      const response = {
        type: 'lookup-result' as const,
        query,
        entry: resolved
          ? {
              headword: resolved.headword,
              pos: resolved.pos,
              ipa: resolved.ipa,
              senses: resolved.senses,
              sources: resolved.sources,
            }
          : null,
      }

      popupWindow.show(response, x, y)
    } finally {
      await Promise.allSettled(providers.map((p) => p.close()))
    }
  } catch (err) {
    console.error('[main] Lookup error:', err)
  }
}

// ── Login item ───────────────────────────────────────────────────────────────

function applyLoginItem(cfg: WlookConfig): void {
  // setLoginItemSettings is a Windows/Mac API.
  // On Windows it writes to HKCU\Software\Microsoft\Windows\CurrentVersion\Run.
  // On Mac it uses SMAppService / Launch Services depending on Electron version.
  // On Linux it is a no-op.
  try {
    app.setLoginItemSettings({
      openAtLogin: cfg.startOnLogin,
      // On Windows, pass the app path so it can be registered correctly
      ...(process.platform === 'win32' && { path: app.getPath('exe') }),
    })
  } catch (err) {
    // Not fatal — just log
    console.warn('[main] setLoginItemSettings failed:', err)
  }
}
