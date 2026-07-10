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
  getConfig?(): Promise<{ popupSearch?: PopupSearchConfig }>
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
  } catch {
    // fall through — use defaults
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
