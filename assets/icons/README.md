# Icons

This directory contains the icon assets used by Wlook. Replace any file in-place with a file of the same name, then run `yarn build && yarn package` to pick up the change.

## Required files

| File | Used for | Format | Recommended sizes |
|------|----------|--------|-------------------|
| `tray.ico` | Windows system tray | ICO | 16, 24, 32, 48 px |
| `app.ico` | Installer, Start Menu, taskbar | ICO | 16, 32, 48, 64, 128, 256 px |
| `popup-logo.svg` | Small mark in the popup header | SVG | Vector — rendered at ~20 px |

## ICO format notes

A Windows `.ico` file is a container that holds multiple bitmap sizes. Tools that can produce multi-size ICO files:

- **ImageMagick:** `magick convert icon-256.png -resize 128x128 -resize 64x64 ... app.ico`
- **GIMP:** File → Export As → `.ico`, then select all sizes in the export dialog.
- **Online converters:** search for "multi-size ICO generator".

For the tray icon, Windows draws the nearest-size bitmap from the container. Providing at least 16, 24, 32, and 48 px bitmaps ensures a sharp result at all system DPI settings (96 DPI through 200+ DPI / 200% scale).

For the app icon, providing 256 px is required for the Windows installer header and the high-DPI Start Menu tile.

## SVG notes

`popup-logo.svg` is inlined into the popup HTML at ~20 px. Use a simple, single-colour mark that reads clearly at that size. The popup CSS colours it via `currentColor`, so the mark automatically inherits the theme's `--accent` colour.

## Customisation reference

Full instructions for replacing icons are in `docs/customisation.md` section 15.1.
