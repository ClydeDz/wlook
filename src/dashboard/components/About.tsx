import { h } from 'preact'

interface Props {
  version: string
}

export function About({ version }: Props) {
  return (
    <section class="section">
      <h2 class="section__heading">About</h2>
      <div class="section__body">
        <div class="about-row">
          <span class="about-row__key">Version</span>
          <span class="about-row__value">{version}</span>
        </div>
        <div class="about-row">
          <span class="about-row__key">Source</span>
          <span class="about-row__value">
            <a
              class="link"
              href="https://github.com/clydedz/wlook"
              onClick={(e) => {
                e.preventDefault()
                window.wlook.openExternal('https://github.com/clydedz/wlook')
              }}
            >
              github.com/clydedz/wlook
            </a>
          </span>
        </div>
        <div class="about-row">
          <span class="about-row__key">Dictionary sources</span>
          <span class="about-row__value" />
        </div>

        <ul class="about-licenses" style={{ marginBottom: 12 }}>
          <li>
            <a
              class="link"
              href="https://kaikki.org"
              onClick={(e) => {
                e.preventDefault()
                window.wlook.openExternal('https://kaikki.org')
              }}
            >
              Wiktionary via Kaikki.org
            </a>
            {' '}— CC BY-SA 4.0, Wiktionary contributors
          </li>
          <li>
            <a
              class="link"
              href="https://github.com/globalwordnet/english-wordnet"
              onClick={(e) => {
                e.preventDefault()
                window.wlook.openExternal('https://github.com/globalwordnet/english-wordnet')
              }}
            >
              Open English WordNet
            </a>
            {' '}— CC BY 4.0, Princeton University &amp; contributors
          </li>
        </ul>

        <div class="about-row">
          <span class="about-row__key">Dictionary packs</span>
          <span class="about-row__value">Released under CC BY-SA 4.0</span>
        </div>
        <div class="about-row">
          <span class="about-row__key">App license</span>
          <span class="about-row__value">MIT</span>
        </div>
        <div class="about-row">
          <span class="about-row__key">No telemetry</span>
          <span class="about-row__value">All data stays on your device</span>
        </div>
      </div>
    </section>
  )
}
