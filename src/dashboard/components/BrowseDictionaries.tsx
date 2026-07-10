import { h } from 'preact'
import { useState, useEffect } from 'preact/hooks'
import type { ManifestPack } from '../../shared/ipc-contracts'

// Map language codes to flag emojis
const LANG_FLAG: Record<string, string> = {
  'en-GB': '🇬🇧',
  'en-US': '🇺🇸',
  'fr-FR': '🇫🇷',
  'de-DE': '🇩🇪',
  'es-ES': '🇪🇸',
  'ja-JP': '🇯🇵',
  'zh-CN': '🇨🇳',
}

function flagFor(id: string): string {
  return LANG_FLAG[id] ?? '📖'
}

interface InstallProgress {
  packId: string
  percent: number
}

interface Props {
  installedIds: string[]
  onInstall: (pack: ManifestPack) => Promise<void>
  /**
   * URL of the remote dictionary catalogue, or `null` if no remote
   * catalogue is configured. When `null`, we skip the fetch entirely and
   * show a friendly empty state explaining that `.wlpack` files can be
   * dropped into `dictionariesDir` for local installs.
   */
  catalogueUrl: string | null
  /**
   * Absolute path to the user's local dictionaries folder, so we can tell
   * the user where to drop packs when no remote catalogue exists.
   */
  dictionariesDir: string
}

export function BrowseDictionaries({ installedIds, onInstall, catalogueUrl, dictionariesDir }: Props) {
  const [packs, setPacks] = useState<ManifestPack[]>([])
  const [loading, setLoading] = useState(catalogueUrl !== null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [installing, setInstalling] = useState<Map<string, number>>(new Map())

  useEffect(() => {
    // No remote catalogue configured — skip the fetch and leave the
    // section in a quiet empty state pointing at the local folder.
    if (!catalogueUrl) {
      setLoading(false)
      setError(null)
      setPacks([])
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    window.wlook
      .fetchManifest(catalogueUrl)
      .then(manifest => {
        if (!cancelled) {
          setPacks(manifest.packs ?? [])
          setLoading(false)
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setError(err.message ?? 'Failed to load dictionary catalogue')
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [catalogueUrl])

  async function handleInstall(pack: ManifestPack) {
    setInstalling(prev => new Map(prev).set(pack.id, 0))

    const progressHandler = (percent: number) => {
      setInstalling(prev => new Map(prev).set(pack.id, percent))
    }

    // Register progress listener before starting
    window.wlook.onInstallProgress(pack.id, progressHandler)

    try {
      await onInstall(pack)
    } finally {
      window.wlook.offInstallProgress(pack.id, progressHandler)
      setInstalling(prev => {
        const next = new Map(prev)
        next.delete(pack.id)
        return next
      })
    }
  }

  const filtered = query.trim()
    ? packs.filter(
        p =>
          p.displayName.toLowerCase().includes(query.toLowerCase()) ||
          p.id.toLowerCase().includes(query.toLowerCase())
      )
    : packs

  return (
    <section class="section">
      <h2 class="section__heading">Browse Dictionaries</h2>
      <div class="section__body">
        {catalogueUrl && (
          <div class="browse-search">
            <input
              type="search"
              class="browse-search__input"
              placeholder="Search languages…"
              value={query}
              onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
              aria-label="Search dictionaries"
            />
          </div>
        )}

        {loading && <p class="browse-loading">Loading catalogue…</p>}

        {!loading && !error && !catalogueUrl && (
          <div class="browse-empty">
            <p>No remote dictionary catalogue is configured.</p>
            <p style={{ marginTop: 8 }}>
              You can install dictionary packs by dropping{' '}
              <code style={{
                fontFamily: '"SF Mono", "Cascadia Code", "Consolas", monospace',
                fontSize: '12px',
                background: 'var(--section-bg)',
                padding: '1px 5px',
                borderRadius: '3px',
              }}>.wlpack</code>{' '}
              files into this folder:
            </p>
            <code style={{
              display: 'block',
              marginTop: 8,
              fontFamily: '"SF Mono", "Cascadia Code", "Consolas", monospace',
              fontSize: '12px',
              color: 'var(--text-primary)',
              background: 'var(--section-bg)',
              padding: '6px 8px',
              borderRadius: '5px',
              border: '1px solid var(--divider)',
              overflowWrap: 'break-word',
              userSelect: 'all',
            }}>{dictionariesDir}</code>
            <p style={{ marginTop: 10, fontSize: '12px', color: 'var(--text-tertiary)' }}>
              Restart the agent after dropping a pack so it gets picked up.
            </p>
          </div>
        )}

        {error && <p class="browse-error">Could not load catalogue: {error}</p>}

        {!loading && !error && catalogueUrl && filtered.length === 0 && (
          <p class="browse-empty">No dictionaries match your search.</p>
        )}

        {!loading && !error && catalogueUrl && filtered.length > 0 && (
          <ul class="browse-list">
            {filtered.map(pack => {
              const isInstalled = installedIds.includes(pack.id)
              const progress = installing.get(pack.id)
              const isInstalling = progress !== undefined

              return (
                <li key={pack.id} class="browse-row">
                  <span class="browse-row__flag" aria-hidden="true">
                    {flagFor(pack.id)}
                  </span>
                  <div class="browse-row__info">
                    <div class="browse-row__name">{pack.displayName}</div>
                    <div class="browse-row__meta">
                      {pack.id} &middot; {pack.sizeMB} MB &middot; v{pack.version}
                    </div>
                  </div>
                  <div class="browse-row__actions">
                    {isInstalled ? (
                      <span class="browse-installed-mark" title="Installed" aria-label="Installed">
                        ✓
                      </span>
                    ) : isInstalling ? (
                      <div class="progress-bar" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
                        <div class="progress-bar__fill" style={{ width: `${progress}%` }} />
                      </div>
                    ) : (
                      <button
                        class="btn btn--primary"
                        onClick={() => handleInstall(pack)}
                        aria-label={`Install ${pack.displayName}`}
                      >
                        Install
                      </button>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}
