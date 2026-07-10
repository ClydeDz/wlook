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

interface AppConfig {
  preferredDialect: string
  startOnLogin: boolean
  hotkey: string
  theme: 'default' | 'dark'
  clipboardFallback: boolean
  popupSearch: {
    label: string
    urlTemplate: string
  }
  catalogueUrl: string | null
  version: string
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

      <SystemHealth status={status} />

      <PreferredDialect
        config={config}
        installedPacks={status.installedPacks}
        onSave={handleSaveDialect}
      />

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

      <Settings config={config} onSave={handleSaveConfig} />

      <About version={config.version} />
    </div>
  )
}

render(<App />, document.getElementById('app')!)
