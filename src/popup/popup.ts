import { html, render, nothing, type TemplateResult } from 'lit-html'
import type { DictionaryEntryResult } from '../shared/ipc-contracts'

// ── Preload API surface exposed by the Electron preload script ──────────────

interface PopupSearchConfig {
  label: string
  urlTemplate: string
}

interface WlookAPI {
  onDefinition(cb: (payload: { query: string; entry: DictionaryEntryResult | null }) => void): void
  openExternal(url: string): void
  notifyReady?(): void
  getConfig?(): Promise<{ popupSearch?: PopupSearchConfig; theme?: 'light' | 'dark' | 'system' }>
}

declare global {
  interface Window {
    wlook: WlookAPI
  }
}

// ── State ───────────────────────────────────────────────────────────────────

interface AppState {
  query: string
  entry: DictionaryEntryResult | null
  searchConfig: PopupSearchConfig
}

const DEFAULT_SEARCH_CONFIG: PopupSearchConfig = {
  label: 'Search Google',
  urlTemplate: 'https://www.google.com/search?q={query}',
}

/**
 * Inlined popup logo. Lives in the same DOM tree as the rest of the popup
 * (unlike `<img src="…svg">` which loads the SVG in an isolated document
 * where `currentColor` can't see the host page's CSS colour). As a result,
 * setting `color: var(--logo-color)` on the parent `.card__logo` cascades
 * into the SVG's `stroke="currentColor"` and re-tints it per theme.
 */
const POPUP_LOGO_SVG: TemplateResult = html`
  <svg viewBox="0 0 179 179" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M29.8333 145.438V33.5625C29.8333 28.6173 31.7978 23.8747 35.2946 20.3779C38.7913 16.8811 43.534 14.9167 48.4792 14.9167H141.708C143.686 14.9167 145.583 15.7025 146.982 17.1012C148.381 18.4999 149.167 20.3969 149.167 22.375V156.625C149.167 158.603 148.381 160.5 146.982 161.899C145.583 163.298 143.686 164.083 141.708 164.083H48.4792C43.534 164.083 38.7913 162.119 35.2946 158.622C31.7978 155.125 29.8333 150.383 29.8333 145.438ZM29.8333 145.438C29.8333 140.492 31.7978 135.75 35.2946 132.253C38.7913 128.756 43.534 126.792 48.4792 126.792H149.167" stroke="currentColor" stroke-width="14.9167" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M51 44L70.5 101L89.5 62.5L109 101L128 44" stroke="currentColor" stroke-width="14.9167" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>
`

let state: AppState = {
  query: '',
  entry: null,
  searchConfig: { ...DEFAULT_SEARCH_CONFIG },
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function buildSearchUrl(query: string, config: PopupSearchConfig): string {
  return config.urlTemplate.replace('{query}', encodeURIComponent(query))
}

function openSearch(): void {
  const url = buildSearchUrl(state.query, state.searchConfig)
  window.wlook.openExternal(url)
  window.close()
}

// ── Templates ────────────────────────────────────────────────────────────────

function ipaTemplate(ipa: DictionaryEntryResult['ipa']): TemplateResult | typeof nothing {
  if (!ipa?.uk && !ipa?.us) return nothing

  const parts: TemplateResult[] = []

  if (ipa.uk) {
    parts.push(html`<span>/&thinsp;${ipa.uk}&thinsp;/&nbsp;UK</span>`)
  }
  if (ipa.us) {
    if (parts.length > 0) {
      parts.push(html`<span class="card__ipa-sep">·</span>`)
    }
    parts.push(html`<span>/&thinsp;${ipa.us}&thinsp;/&nbsp;US</span>`)
  }

  return html`<div class="card__ipa">${parts}</div>`
}

function googleLinkTemplate(): TemplateResult {
  return html`
    <button
      class="card__google-link"
      id="google-link"
      tabindex="0"
      @click=${openSearch}
    >
      ${state.searchConfig.label}&nbsp;&#x2197;
    </button>
  `
}

function entryTemplate(entry: DictionaryEntryResult): TemplateResult {
  const firstSense = entry.senses[0]
  const sourceLabel = entry.sources.length > 0 ? `from ${entry.sources.join(', ')}` : ''

  return html`
    <div class="card">
      <div class="card__header">
        <span class="card__logo">${POPUP_LOGO_SVG}</span>
        <span class="card__word">${entry.headword}</span>
        ${entry.pos ? html`<span class="card__pos">${entry.pos}</span>` : nothing}
      </div>

      ${ipaTemplate(entry.ipa)}

      <div class="card__divider"></div>

      <div class="card__body">
        ${firstSense
          ? html`
              <p class="card__definition">${firstSense.definition}</p>
              ${firstSense.example
                ? html`<p class="card__example">${firstSense.example}</p>`
                : nothing}
            `
          : nothing}
      </div>

      <div class="card__divider"></div>

      <div class="card__footer">
        <span class="card__source">${sourceLabel}</span>
        ${googleLinkTemplate()}
      </div>
    </div>
  `
}

function emptyTemplate(query: string): TemplateResult {
  return html`
    <div class="card">
      <div class="card__header">
        <span class="card__logo">${POPUP_LOGO_SVG}</span>
        <span class="card__word"></span>
      </div>
      <div class="card__empty">
        No definition found for
        <span class="card__empty-query">&ldquo;${query}&rdquo;</span>
      </div>

      <div class="card__divider"></div>

      <div class="card__empty-footer">
        ${googleLinkTemplate()}
      </div>
    </div>
  `
}

// ── Render ───────────────────────────────────────────────────────────────────

const root = document.getElementById('app')!

function renderApp(): void {
  const template =
    state.entry !== null
      ? entryTemplate(state.entry)
      : emptyTemplate(state.query)

  render(template, root)
}

// ── Keyboard handling ────────────────────────────────────────────────────────

document.addEventListener('keydown', (e: KeyboardEvent) => {
  if (e.key === 'Escape') {
    window.close()
    return
  }

  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'g') {
    e.preventDefault()
    openSearch()
    return
  }

  // Tab cycles focus — browser default handles this naturally,
  // but we clamp focus within the popup for accessibility.
  if (e.key === 'Tab') {
    const focusable = Array.from(
      document.querySelectorAll<HTMLElement>(
        'button, a, [tabindex]:not([tabindex="-1"])'
      )
    ).filter(el => !el.hasAttribute('disabled'))

    if (focusable.length === 0) return

    const current = document.activeElement as HTMLElement
    const idx = focusable.indexOf(current)

    if (e.shiftKey) {
      e.preventDefault()
      const prev = focusable[(idx - 1 + focusable.length) % focusable.length]
      prev.focus()
    } else {
      // Only intercept if we're at the last focusable element to wrap around
      if (idx === focusable.length - 1) {
        e.preventDefault()
        focusable[0].focus()
      }
    }
  }
})

// ── Config load ──────────────────────────────────────────────────────────────

async function loadConfig(): Promise<void> {
  try {
    const config = await window.wlook.getConfig?.()
    if (config?.popupSearch) {
      state = { ...state, searchConfig: config.popupSearch }
    }
    // Apply popup theme by mapping the user's config value to a
    // `data-theme` attribute on <html>, which popup.css scopes on:
    //   - 'light'  → data-theme="light"   forces light surface, beats the
    //                                     @media prefers-color-scheme:dark
    //                                     block (because it uses
    //                                     :root:not([data-theme="light"]))
    //   - 'dark'   → data-theme="dark"    forces dark surface, beats OS
    //   - 'system' → data-theme="default" defers to OS preference
    // Anything else (legacy 'default' from pre-migration configs, or a
    // malformed value) falls through to 'default' / OS-follow.
    const theme = config?.theme ?? 'system'
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
  } catch {
    // Fall through — ensure data-theme is set so CSS rules resolve predictably.
    document.documentElement.setAttribute('data-theme', 'default')
  }
}

// ── Bootstrap ────────────────────────────────────────────────────────────────

async function init(): Promise<void> {
  await loadConfig()

  window.wlook.onDefinition(({ query, entry }) => {
    state = { ...state, query, entry }
    renderApp()
  })

  // Render initial empty shell until a definition arrives
  renderApp()

  // Signal main that the renderer has registered its onDefinition listener.
  // Main will then replay any lookup result sent while the page was loading.
  window.wlook.notifyReady?.()
}

init()
