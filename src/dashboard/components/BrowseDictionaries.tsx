import { h } from 'preact'
import { useState, useEffect } from 'preact/hooks'
import type { ManifestPack } from '../../shared/ipc-contracts'

const MANIFEST_URL =
  'https://github.com/wlook/wlook/releases/latest/download/packs-manifest.json'

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
}

export function BrowseDictionaries({ installedIds, onInstall }: Props) {
  const [packs, setPacks] = useState<ManifestPack[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [installing, setInstalling] = useState<Map<string, number>>(new Map())

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    window.wlook
      .fetchManifest(MANIFEST_URL)
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
  }, [])

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

        {loading && <p class="browse-loading">Loading catalogue…</p>}

        {error && <p class="browse-error">Could not load catalogue: {error}</p>}

        {!loading && !error && filtered.length === 0 && (
          <p class="browse-empty">No dictionaries match your search.</p>
        )}

        {!loading && !error && filtered.length > 0 && (
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
