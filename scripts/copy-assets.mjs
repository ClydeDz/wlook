import { mkdir, copyFile, readdir, stat } from 'fs/promises'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

async function ensureDir(dir) {
  await mkdir(dir, { recursive: true })
}

async function copyRecursive(src, dest) {
  const entries = await readdir(src, { withFileTypes: true })
  await ensureDir(dest)
  for (const entry of entries) {
    const srcPath = join(src, entry.name)
    const destPath = join(dest, entry.name)
    if (entry.isDirectory()) {
      await copyRecursive(srcPath, destPath)
    } else {
      await copyFile(srcPath, destPath)
    }
  }
}

async function main() {
  // Ensure output dirs exist
  await ensureDir(join(root, 'dist', 'popup'))
  await ensureDir(join(root, 'dist', 'dashboard'))

  // Copy popup HTML
  const popupHtmlSrc = join(root, 'src', 'popup', 'index.html')
  const popupHtmlDest = join(root, 'dist', 'popup', 'index.html')
  try {
    await copyFile(popupHtmlSrc, popupHtmlDest)
    console.log('Copied src/popup/index.html -> dist/popup/index.html')
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.warn('Warning: src/popup/index.html not found, skipping.')
    } else {
      throw err
    }
  }

  // Copy dashboard HTML
  const dashboardHtmlSrc = join(root, 'src', 'dashboard', 'index.html')
  const dashboardHtmlDest = join(root, 'dist', 'dashboard', 'index.html')
  try {
    await copyFile(dashboardHtmlSrc, dashboardHtmlDest)
    console.log('Copied src/dashboard/index.html -> dist/dashboard/index.html')
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.warn('Warning: src/dashboard/index.html not found, skipping.')
    } else {
      throw err
    }
  }

  // Copy assets/ -> dist/assets/ recursively
  const assetsSrc = join(root, 'assets')
  const assetsDest = join(root, 'dist', 'assets')
  try {
    const s = await stat(assetsSrc)
    if (s.isDirectory()) {
      await copyRecursive(assetsSrc, assetsDest)
      console.log('Copied assets/ -> dist/assets/')
    }
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.warn('Warning: assets/ directory not found, skipping.')
    } else {
      throw err
    }
  }

  console.log('copy-assets done.')
}

main().catch((err) => {
  console.error('copy-assets failed:', err)
  process.exit(1)
})
