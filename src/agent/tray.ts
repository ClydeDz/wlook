import { Tray, Menu, nativeImage } from 'electron'
import * as path from 'path'
import * as fs from 'fs'

/**
 * Creates the system tray icon with a context menu.
 *
 * @param openDashboard  Callback to open or focus the dashboard window.
 * @param quit           Callback to cleanly quit the application.
 * @returns              The created Tray instance (caller owns it — keep a
 *                       reference to prevent GC).
 */
export function createTray(openDashboard: () => void, quit: () => void): Tray {
  const icon = resolveIcon()
  const tray = new Tray(icon)

  tray.setToolTip('Wlook — dictionary lookup')

  const menu = Menu.buildFromTemplate([
    {
      label: 'Open Wlook',
      click: openDashboard,
    },
    { type: 'separator' },
    {
      label: 'Quit Wlook',
      click: quit,
    },
  ])

  tray.setContextMenu(menu)

  // Double-click opens the dashboard (Windows primarily; Mac fires 'click')
  tray.on('double-click', openDashboard)

  return tray
}

/**
 * Resolves the tray icon path for the current platform.
 * Falls back to an empty nativeImage if the asset is missing so the app
 * still starts during development when icons haven't been generated yet.
 */
function resolveIcon(): Electron.NativeImage {
  const iconFile = process.platform === 'win32' ? 'tray.ico' : 'tray.png'
  const iconPath = path.join(__dirname, '..', '..', 'assets', 'icons', iconFile)

  if (fs.existsSync(iconPath)) {
    return nativeImage.createFromPath(iconPath)
  }

  // Asset missing — happens during early dev. Log and return empty icon.
  console.warn(`[Tray] Icon not found at ${iconPath}; using empty placeholder`)
  return nativeImage.createEmpty()
}
