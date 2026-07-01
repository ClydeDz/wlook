import { BrowserWindow, screen } from 'electron'
import * as path from 'path'

const DASHBOARD_WIDTH = 900
const DASHBOARD_HEIGHT = 620

/**
 * DashboardWindow manages a single standard-chrome BrowserWindow for the
 * Wlook management dashboard. It is created lazily and destroyed when closed.
 */
export class DashboardWindow {
  private win: BrowserWindow | null = null

  /**
   * Opens the dashboard window, or focuses it if already open.
   */
  open(): void {
    if (this.win && !this.win.isDestroyed()) {
      this.win.focus()
      return
    }

    const preloadPath = path.join(__dirname, 'preload.js')
    const { bounds } = screen.getPrimaryDisplay()

    const x = Math.round(bounds.x + (bounds.width - DASHBOARD_WIDTH) / 2)
    const y = Math.round(bounds.y + (bounds.height - DASHBOARD_HEIGHT) / 2)

    this.win = new BrowserWindow({
      width: DASHBOARD_WIDTH,
      height: DASHBOARD_HEIGHT,
      x,
      y,
      title: 'Wlook',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: preloadPath,
      },
    })

    const dashboardHtml = path.join(__dirname, '..', '..', 'dist', 'dashboard', 'index.html')
    this.win.loadFile(dashboardHtml).catch((err) => {
      console.error('[DashboardWindow] Failed to load dashboard HTML:', err)
    })

    // Clean up reference when the window is actually closed
    this.win.on('closed', () => {
      this.win = null
    })
  }

  /**
   * Returns true if the dashboard window is currently open and not destroyed.
   */
  isOpen(): boolean {
    return this.win !== null && !this.win.isDestroyed()
  }

  /**
   * Closes the dashboard window (if open).
   */
  close(): void {
    if (this.win && !this.win.isDestroyed()) {
      this.win.close()
    }
  }
}
