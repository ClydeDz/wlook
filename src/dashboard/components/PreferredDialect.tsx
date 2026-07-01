import { h } from 'preact'
import { useState } from 'preact/hooks'
import type { DashboardStatus, PackInfo } from '../../shared/ipc-contracts'

interface Config {
  preferredDialect: string
  [key: string]: unknown
}

interface Props {
  config: Config
  installedPacks: PackInfo[]
  onSave: (dialect: string) => Promise<void>
}

// Only show packs that share a language with the current preferred dialect,
// or all English packs when preferred is an en-* dialect.
function dialectPacks(packs: PackInfo[], preferred: string): PackInfo[] {
  const lang = preferred.split('-')[0] || 'en'
  return packs.filter(p => p.language === lang)
}

export function PreferredDialect({ config, installedPacks, onSave }: Props) {
  const [selected, setSelected] = useState(config.preferredDialect)
  const [saving, setSaving] = useState(false)
  const packs = dialectPacks(installedPacks, config.preferredDialect)

  const isDirty = selected !== config.preferredDialect

  async function handleSave() {
    setSaving(true)
    try {
      await onSave(selected)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section class="section">
      <h2 class="section__heading">Preferred Dialect</h2>
      <div class="section__body">
        <p class="dialect-explainer">
          Lookups search every English dictionary you have installed. This setting decides which
          spelling and pronunciation Wlook shows first when both have a match.
        </p>

        {packs.length === 0 ? (
          <p class="dialect-empty">No dictionaries installed yet. Install one below.</p>
        ) : (
          <div class="radio-group" role="radiogroup" aria-label="Preferred dialect">
            {packs.map(pack => (
              <label key={pack.id} class="radio-option">
                <input
                  type="radio"
                  name="dialect"
                  value={pack.id}
                  checked={selected === pack.id}
                  onChange={() => setSelected(pack.id)}
                />
                <span class="radio-option__label">{pack.displayName}</span>
              </label>
            ))}
          </div>
        )}

        {isDirty && packs.length > 0 && (
          <div class="dialect-save">
            <button
              class="btn btn--primary"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? 'Saving…' : 'Save preference'}
            </button>
          </div>
        )}
      </div>
    </section>
  )
}
