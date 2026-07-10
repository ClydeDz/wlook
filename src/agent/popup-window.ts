import { BrowserWindow, screen, ipcMain, type IpcMainEvent } from 'electron'
import * as path from 'path'
import type { LookupResponse } from '../shared/ipc-contracts'

const POPUP_WIDTH = 380
const POPUP_HEIGHT = 300
const POPUP_MARGIN = 8 // pixels away from cursor

/**
 * PopupWindow manages a single frameless, always-on-top BrowserWindow
 * used to display dictionary lookup results near the cursor.
 *
 * The window is reused across lookups (singleton). It is created lazily
 * on first use and hidden (not destroyed) between lookups.
 *
 * Renderer-ready handshake:
 *   The popup's `init()` in popup.ts is async (it awaits loadConfig before
 *   registering its onDefinition listener). To avoid the first lookup
 *   being dropped because main sends before the renderer is listening,
 *   the renderer calls `notifyReady()` after registering its listener;
 *   main queues the latest result until that signal arrives. We listen
 *   globally on `ipcMain` and filter by `event.sender.id` so other
 *   windows don't accidentally trigger our replay.
 *
 *   Note: `pendingResult` is overwritten if `show()` is called repeatedly
 *   before the renderer signals ready — the latest lookup wins, which is
 *   the correct user-facing behaviour (we don't double-show lookups).
 */
export class PopupWindow {
  private win: BrowserWindow | null = null
  private dismissTimer: NodeJS.Timeout | null = null
  private dismissTimeoutMs: number
  private rendererReady = false
  private pendingResult: LookupResponse | null = null

  // Class-property arrow so `this` is bound and we have a stable ref to
  // register / unregister symmetrically from the constructor and destroy().
  private readonly onRendererReady = (event: IpcMainEvent): void => {
    if (!this.win || this.win.isDestroyed()) return
    if (event.sender.id !== this.win.webContents.id) return
    this.rendererReady = true
    const pending = this.pendingResult
    this.pendingResult = null
    if (pending) {
      event.sender.send('lookup-result', pending)
    }
  }

  constructor(dismissTimeoutMs: number = 8000) {
    this.dismissTimeoutMs = dismissTimeoutMs
    ipcMain.on('popup-renderer-ready', this.onRendererReady)
  }

  updateDismissTimeout(ms: number): void {
    this.dismissTimeoutMs = ms
  }

  /**
   * Shows the popup near (x, y) with the given lookup result.
   * Creates the BrowserWindow on first call.
   */
  show(result: LookupResponse, x: number, y: number): void {
    const win = this.getOrCreate()

    // Position the popup near the cursor, keeping it on screen
    const position = this.computePosition(x, y)
    win.setPosition(position.x, position.y, false)

    if (this.rendererReady) {
      win.webContents.send('lookup-result', result)
    } else {
      // Renderer hasn't signalled ready yet (first lookup, or page reloading).
      // Queue the latest result; the renderer-ready handler above will replay it.
      this.pendingResult = result
    }

    if (!win.isVisible()) {
      win.showInactive() // show without stealing focus
    }

    // Auto-dismiss after timeout
    this.resetDismissTimer()
  }

  /**
   * Hides the popup window without destroying it.
   */
  hide(): void {
    this.clearDismissTimer()
    if (this.win && !this.win.isDestroyed() && this.win.isVisible()) {
      this.win.hide()
    }
  }

  /**
   * Destroys the underlying BrowserWindow. Called during app quit.
   */
  destroy(): void {
    this.clearDismissTimer()
    this.rendererReady = false
    this.pendingResult = null
    ipcMain.removeListener('popup-renderer-ready', this.onRendererReady)
    if (this.win && !this.win.isDestroyed()) {
      this.win.destroy()
    }
    this.win = null
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private getOrCreate(): BrowserWindow {
    if (this.win && !this.win.isDestroyed()) {
      return this.win
    }

    const preloadPath = path.join(__dirname, 'preload.js')

    this.win = new BrowserWindow({
      width: POPUP_WIDTH,
      height: POPUP_HEIGHT,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: preloadPath,
      },
    })

    // Reset handshake state for a freshly-created window
    this.rendererReady = false
    this.pendingResult = null

    // Defensive: if the page is reloaded (e.g. DevTools reload, crash+restart),
    // treat the renderer as un-ready until it signals ready once more.
    this.win.webContents.on('did-start-loading', () => {
      this.rendererReady = false
    })

    // Load the popup renderer
    const popupHtml = path.join(__dirname, '..', '..', 'dist', 'popup', 'index.html')
    this.win.loadFile(popupHtml).catch((err) => {
      console.error('[PopupWindow] Failed to load popup HTML:', err)
    })

    // Dismiss on blur
    this.win.on('blur', () => this.hide())

    // Dismiss on Esc (the renderer sends this over IPC or we listen to the before-input-event)
    this.win.webContents.on('before-input-event', (_event, input) => {
      if (input.type === 'keyDown' && input.key === 'Escape') {
        this.hide()
      }
    })

    // Prevent the window from being destroyed — just hide it
    this.win.on('close', (event) => {
      if (this.win && !this.win.isDestroyed()) {
        event.preventDefault()
        this.hide()
      }
    })

    return this.win
  }

  /**
   * Calculates a screen position that keeps the popup fully visible,
   * preferring bottom-right of the cursor.
   */
  private computePosition(cursorX: number, cursorY: number): { x: number; y: number } {
    const display = screen.getDisplayNearestPoint({ x: cursorX, y: cursorY })
    const { bounds } = display

    let x = cursorX + POPUP_MARGIN
    let y = cursorY + POPUP_MARGIN

    // Flip horizontally if too close to right edge
    if (x + POPUP_WIDTH > bounds.x + bounds.width) {
      x = cursorX - POPUP_WIDTH - POPUP_MARGIN
    }

    // Flip vertically if too close to bottom edge
    if (y + POPUP_HEIGHT > bounds.y + bounds.height) {
      y = cursorY - POPUP_HEIGHT - POPUP_MARGIN
    }

    // Clamp to display bounds
    x = Math.max(bounds.x, Math.min(x, bounds.x + bounds.width - POPUP_WIDTH))
    y = Math.max(bounds.y, Math.min(y, bounds.y + bounds.height - POPUP_HEIGHT))

    return { x, y }
  }

  private resetDismissTimer(): void {
    this.clearDismissTimer()
    if (this.dismissTimeoutMs > 0) {
      this.dismissTimer = setTimeout(() => this.hide(), this.dismissTimeoutMs)
    }
  }

  private clearDismissTimer(): void {
    if (this.dismissTimer) {
      clearTimeout(this.dismissTimer)
      this.dismissTimer = null
    }
  }
}
