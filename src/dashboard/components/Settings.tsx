import { h, Fragment } from 'preact'
import { useState, useEffect, useRef } from 'preact/hooks'

interface AppConfig {
  startOnLogin: boolean
  hotkey: string
  theme: 'default' | 'dark'
  clipboardFallback: boolean
  popupSearch: {
    label: string
    urlTemplate: string
  }
  [key: string]: unknown
}

interface Props {
  config: AppConfig
  onSave: (partial: Partial<AppConfig>) => Promise<void>
}

function Toggle({
  checked,
  onChange,
  id,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  id: string
}) {
  return (
    <input
      type="checkbox"
      id={id}
      checked={checked}
      onChange={(e) => onChange((e.target as HTMLInputElement).checked)}
    />
  )
}

export function Settings({ config, onSave }: Props) {
  const [startOnLogin, setStartOnLogin] = useState(config.startOnLogin)
  const [theme, setTheme] = useState(config.theme)
  const [clipboardFallback, setClipboardFallback] = useState(config.clipboardFallback)
  const [searchLabel, setSearchLabel] = useState(config.popupSearch.label)
  const [searchUrl, setSearchUrl] = useState(config.popupSearch.urlTemplate)

  // Hotkey recording
  const [hotkey, setHotkey] = useState(config.hotkey)
  const [recording, setRecording] = useState(false)
  const [hotkeyConflict, setHotkeyConflict] = useState<string | null>(null)
  const recordRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!recording) return

    function onKeyDown(e: KeyboardEvent) {
      e.preventDefault()
      e.stopPropagation()

      if (e.key === 'Escape') {
        setRecording(false)
        setHotkeyConflict(null)
        return
      }

      // Require at least one modifier
      if (!e.ctrlKey && !e.altKey && !e.metaKey) return

      const parts: string[] = []
      if (e.ctrlKey) parts.push('Ctrl')
      if (e.altKey) parts.push('Alt')
      if (e.shiftKey) parts.push('Shift')
      if (e.metaKey) parts.push('Meta')

      const key = e.key.length === 1 ? e.key.toUpperCase() : e.key
      if (!['Control', 'Alt', 'Shift', 'Meta'].includes(key)) {
        parts.push(key)
        const accelerator = parts.join('+')
        setHotkey(accelerator)
        setRecording(false)
        setHotkeyConflict(null)
        // Validate & save
        window.wlook.updateConfig({ hotkey: accelerator }).catch((err: Error) => {
          setHotkeyConflict(err.message ?? 'Combination already in use — pick another')
          setHotkey(config.hotkey)
        })
      }
    }

    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [recording, config.hotkey])

  async function save(patch: Partial<AppConfig>) {
    await onSave(patch)
  }

  return (
    <section class="section">
      <h2 class="section__heading">Settings</h2>
      <div class="section__body">
        <ul class="settings-list">

          {/* Start on login */}
          <li class="settings-row">
            <div class="settings-row__label-group">
              <label class="settings-row__label" htmlFor="start-login">
                Start Wlook when I sign in to Windows
              </label>
            </div>
            <div class="settings-row__control">
              <Toggle
                id="start-login"
                checked={startOnLogin}
                onChange={v => {
                  setStartOnLogin(v)
                  save({ startOnLogin: v })
                }}
              />
            </div>
          </li>

          {/* Hotkey */}
          <li class="settings-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%' }}>
              <div class="settings-row__label-group" style={{ flex: 1 }}>
                <span class="settings-row__label">Global hotkey</span>
                {hotkeyConflict && (
                  <span class="settings-row__hint" style={{ color: 'var(--dot-red)' }}>
                    {hotkeyConflict}
                  </span>
                )}
              </div>
              <div class="settings-row__control" style={{ gap: 6 }}>
                {recording ? (
                  <span ref={recordRef} class="hotkey-recording" tabIndex={0}>
                    Press a key combo…
                  </span>
                ) : (
                  <span class="hotkey-display">{hotkey}</span>
                )}
                {!recording && (
                  <button
                    class="btn btn--secondary"
                    onClick={() => {
                      setHotkeyConflict(null)
                      setRecording(true)
                    }}
                  >
                    Change
                  </button>
                )}
                {recording && (
                  <button
                    class="btn btn--ghost"
                    onClick={() => {
                      setRecording(false)
                      setHotkeyConflict(null)
                    }}
                  >
                    Cancel
                  </button>
                )}
                <button
                  class="btn btn--ghost"
                  onClick={() => {
                    const defaultKey = 'Ctrl+Shift+D'
                    setHotkey(defaultKey)
                    setHotkeyConflict(null)
                    setRecording(false)
                    save({ hotkey: defaultKey })
                  }}
                  title="Reset to default"
                >
                  Reset
                </button>
              </div>
            </div>
          </li>

          {/* Theme */}
          <li class="settings-row">
            <div class="settings-row__label-group">
              <span class="settings-row__label">Popup theme</span>
            </div>
            <div class="settings-row__control">
              <select
                class="settings-select"
                value={theme}
                onChange={(e) => {
                  const val = (e.target as HTMLSelectElement).value as AppConfig['theme']
                  setTheme(val)
                  save({ theme: val })
                }}
              >
                <option value="default">Default (system)</option>
                <option value="dark">Dark</option>
              </select>
            </div>
          </li>

          {/* Clipboard fallback */}
          <li class="settings-row">
            <div class="settings-row__label-group">
              <label class="settings-row__label" htmlFor="clipboard-fallback">
                Clipboard fallback for selection capture
              </label>
              <span class="settings-row__hint settings-row__hint--warning">
                When enabled, Wlook briefly writes to your clipboard to read the selection in apps
                that don't support UI Automation. Clipboard managers may record this.
              </span>
            </div>
            <div class="settings-row__control">
              <Toggle
                id="clipboard-fallback"
                checked={clipboardFallback}
                onChange={v => {
                  setClipboardFallback(v)
                  save({ clipboardFallback: v })
                }}
              />
            </div>
          </li>

          {/* Search engine */}
          <li class="settings-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 10 }}>
            <span class="settings-row__label">Popup search engine</span>
            <div class="search-engine-group">
              <div class="settings-subrow">
                <label class="settings-subrow__label" htmlFor="search-label">
                  Button label
                </label>
                <input
                  id="search-label"
                  class="settings-input"
                  type="text"
                  value={searchLabel}
                  onInput={(e) => setSearchLabel((e.target as HTMLInputElement).value)}
                  onBlur={() => save({ popupSearch: { label: searchLabel, urlTemplate: searchUrl } })}
                  placeholder="Search on Google"
                />
              </div>
              <div class="settings-subrow">
                <label class="settings-subrow__label" htmlFor="search-url">
                  URL template — use <code style={{ fontFamily: 'monospace' }}>{'{query}'}</code> for the search term
                </label>
                <input
                  id="search-url"
                  class="settings-input"
                  type="url"
                  value={searchUrl}
                  onInput={(e) => setSearchUrl((e.target as HTMLInputElement).value)}
                  onBlur={() => save({ popupSearch: { label: searchLabel, urlTemplate: searchUrl } })}
                  placeholder="https://www.google.com/search?q={query}"
                />
              </div>
            </div>
          </li>

        </ul>
      </div>
    </section>
  )
}
