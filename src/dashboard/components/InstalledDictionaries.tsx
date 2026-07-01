import { h } from 'preact'
import { useState } from 'preact/hooks'
import type { PackInfo } from '../../shared/ipc-contracts'

interface Props {
  packs: PackInfo[]
  preferredId: string
  onUninstall: (id: string) => Promise<void>
}

function groupByLanguage(packs: PackInfo[]): Map<string, PackInfo[]> {
  const groups = new Map<string, PackInfo[]>()
  for (const pack of packs) {
    const list = groups.get(pack.language) ?? []
    list.push(pack)
    groups.set(pack.language, list)
  }
  return groups
}

function PackRow({
  pack,
  isPreferred,
  onUninstall,
}: {
  pack: PackInfo
  isPreferred: boolean
  onUninstall: (id: string) => Promise<void>
}) {
  const [uninstalling, setUninstalling] = useState(false)

  async function handleUninstall() {
    const confirmed = window.confirm(
      `Uninstall "${pack.displayName}"? You can reinstall it later from Browse Dictionaries.`
    )
    if (!confirmed) return
    setUninstalling(true)
    try {
      await onUninstall(pack.id)
    } finally {
      setUninstalling(false)
    }
  }

  return (
    <li class="pack-row">
      <span class="pack-row__name">
        {pack.displayName}
        {isPreferred && (
          <span class="pack-row__preferred-badge" style={{ marginLeft: 8 }}>
            preferred
          </span>
        )}
      </span>
      <span class="pack-row__meta">
        v{pack.version} &middot; {pack.sizeMB} MB
      </span>
      <button
        class="btn btn--danger"
        onClick={handleUninstall}
        disabled={uninstalling}
        aria-label={`Uninstall ${pack.displayName}`}
      >
        {uninstalling ? 'Removing…' : 'Uninstall'}
      </button>
    </li>
  )
}

export function InstalledDictionaries({ packs, preferredId, onUninstall }: Props) {
  const [lastUninstalledPreferred, setLastUninstalledPreferred] = useState<string | null>(null)

  async function handleUninstall(id: string) {
    const wasPreferred = id === preferredId
    await onUninstall(id)
    if (wasPreferred) {
      setLastUninstalledPreferred(id)
    }
  }

  const groups = groupByLanguage(packs)

  return (
    <section class="section">
      <h2 class="section__heading">Installed Dictionaries</h2>
      <div class="section__body">
        {packs.length === 0 ? (
          <p class="installed-empty">No dictionaries installed yet.</p>
        ) : (
          Array.from(groups.entries()).map(([lang, langPacks]) => (
            <div key={lang} class="lang-group">
              <div class="lang-group__title">{lang.toUpperCase()}</div>
              <ul class="pack-list">
                {langPacks.map(pack => (
                  <PackRow
                    key={pack.id}
                    pack={pack}
                    isPreferred={pack.id === preferredId}
                    onUninstall={handleUninstall}
                  />
                ))}
              </ul>
            </div>
          ))
        )}

        {lastUninstalledPreferred && (
          <p class="uninstall-note mt-12">
            Your preferred dialect was uninstalled. Wlook has automatically selected the next
            available dialect in the same language.
          </p>
        )}
      </div>
    </section>
  )
}
