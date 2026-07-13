import { h, render } from 'preact'
import { useState, useEffect } from 'preact/hooks'
import type { DashboardStatus, ManifestPack } from '../shared/ipc-contracts'
import { SystemHealth } from './components/SystemHealth'
import { PreferredDialect } from './components/PreferredDialect'
import { InstalledDictionaries } from './components/InstalledDictionaries'
import { BrowseDictionaries } from './components/BrowseDictionaries'
import { Settings } from './components/Settings'
import { About } from './components/About'

// ── Type for the preload API exposed by the Electron main process ─────────────

type Theme = 'light' | 'dark' | 'system'

interface AppConfig {
  preferredDialect: string
  startOnLogin: boolean
  /**
   * Mirrors `WlookConfig.hotkey`: either an Electron-prefix string
   * (`'CommandOrControl+Shift+D'`) or `null` for the legacy disable
   * marker documented at `docs/customisation.md` §15.4. None of the
   * application code in this file reads `hotkey` directly — hotkey
   * management lives in the agent — but the type is widened to match
   * what the IPC legitimately returns, so future direct access won't
   * silently disagree with reality.
   */
  hotkey: string | null
  theme: Theme
  clipboardFallback: boolean
  popupSearch: {
    label: string
    urlTemplate: string
  }
  catalogueUrl: string | null
  version: string
}

// ── Theme application ────────────────────────────────────────────────────────
// Mirrors popup.ts:applyTheme: the user's config value is mapped to a
// `data-theme` attribute on <html>, which dashboard.css scopes on. The
// 'system' bucket maps to data-theme="default" so the OS-follow media
// query in dashboard.css picks it up; 'light' and 'dark' map to their
// own attributes for explicit override.

function applyTheme(theme: Theme): void {
  let dataTheme: 'light' | 'dark' | 'default'
  switch (theme) {
    case 'light':
      dataTheme = 'light'
      break
    case 'dark':
      dataTheme = 'dark'
      break
    case 'system':
    default:
      dataTheme = 'default'
      break
  }
  document.documentElement.setAttribute('data-theme', dataTheme)
}

interface ManifestResponse {
  packs: ManifestPack[]
}

declare global {
  interface Window {
    wlook: {
      getStatus: () => Promise<DashboardStatus>
      getConfig: () => Promise<AppConfig>
      updateConfig: (patch: Partial<AppConfig>) => Promise<void>
      installPack: (pack: ManifestPack) => Promise<void>
      uninstallPack: (id: string) => Promise<void>
      fetchManifest: (url: string) => Promise<ManifestResponse>
      openExternal: (url: string) => void
      onInstallProgress: (packId: string, cb: (percent: number) => void) => void
      offInstallProgress: (packId: string, cb: (percent: number) => void) => void
      // The agent's main process pushes a fresh `DashboardStatus` here
      // after every selection capture via the `'status-update'` channel.
      // Subscribed once on mount; replaced with the payload so the
      // System Health row reflects runtime state without polling.
      onStatusUpdate: (cb: (status: DashboardStatus) => void) => void
      offStatusUpdate: (cb: (status: DashboardStatus) => void) => void
    }
  }
}

// ── Header ────────────────────────────────────────────────────────────────────

function Header({ version }: { version: string }) {
  return (
    <header class="header">
      <span class="header__wordmark">Wlook</span>
      <span class="header__version">v{version}</span>
    </header>
  )
}

// ── App root ──────────────────────────────────────────────────────────────────

function App() {
  const [status, setStatus] = useState<DashboardStatus | null>(null)
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([window.wlook.getStatus(), window.wlook.getConfig()])
      .then(([s, c]) => {
        setStatus(s)
        setConfig(c)
      })
      .catch((err: Error) => {
        setLoadError(err.message ?? 'Failed to load dashboard data')
      })
  }, [])

  // Re-apply the dashboard theme whenever the user changes the Settings
  // dropdown. Without this, the parent state updates but the rendered
  // surface keeps the previous data-theme attribute. We default to
  // 'system' when config hasn't loaded yet — matches what the OS-follow
  // block would resolve to anyway, but keeps the attribute explicit so
  // a future reader of the DOM doesn't see "unset".
  useEffect(() => {
    applyTheme(config?.theme ?? 'system')
  }, [config?.theme])

  // Subscribe to main-process `status-update` pushes so the dashboard
  // mirrors the agent's runtime selection-capture method without us
  // having to poll. The same cb identity is reused on mount/unmount
  // so preload's statusUpdateHandlers Set removes it cleanly.
  useEffect(() => {
    const onStatus = (next: DashboardStatus): void => setStatus(next)
    window.wlook.onStatusUpdate(onStatus)
    return () => {
      window.wlook.offStatusUpdate(onStatus)
    }
  }, [])

  async function handleSaveConfig(patch: Partial<AppConfig>) {
    await window.wlook.updateConfig(patch)
    // Merge optimistically
    setConfig(prev => prev ? { ...prev, ...patch } : prev)
  }

  async function handleSaveDialect(dialect: string) {
    await handleSaveConfig({ preferredDialect: dialect })
  }

  async function handleUninstall(id: string) {
    await window.wlook.uninstallPack(id)
    setStatus(prev => {
      if (!prev) return prev
      const remaining = prev.installedPacks.filter(p => p.id !== id)
      // Auto-select next available dialect in same language if preferred was removed
      let preferred = prev.preferredDialect
      if (id === preferred) {
        const lang = preferred.split('-')[0]
        const next = remaining.find(p => p.language === lang)
        preferred = next?.id ?? preferred
      }
      return { ...prev, installedPacks: remaining, preferredDialect: preferred }
    })
  }

  async function handleInstall(pack: ManifestPack) {
    await window.wlook.installPack(pack)
    // Refresh status after install
    const newStatus = await window.wlook.getStatus()
    setStatus(newStatus)
  }

  if (loadError) {
    return (
      <div id="app-root">
        <Header version="—" />
        <p style={{ color: 'var(--danger)', padding: '16px' }}>
          Could not connect to the Wlook agent: {loadError}
        </p>
      </div>
    )
  }

  if (!status || !config) {
    return (
      <div id="app-root">
        <Header version="—" />
        <p style={{ color: 'var(--text-secondary)', padding: '16px' }}>Loading…</p>
      </div>
    )
  }

  const installedIds = status.installedPacks.map(p => p.id)

  return (
    <div id="app-root">
      <Header version={config.version} />

      <InstalledDictionaries
        packs={status.installedPacks}
        preferredId={status.preferredDialect}
        onUninstall={handleUninstall}
      />

      <BrowseDictionaries
        installedIds={installedIds}
        onInstall={handleInstall}
        catalogueUrl={config.catalogueUrl}
        dictionariesDir={status.dictionariesDir}
      />

      <PreferredDialect
        config={config}
        installedPacks={status.installedPacks}
        onSave={handleSaveDialect}
      />

      <Settings config={config} onSave={handleSaveConfig} />

      <SystemHealth status={status} />

      <About version={config.version} />
    </div>
  )
}

render(<App />, document.getElementById('app')!)
