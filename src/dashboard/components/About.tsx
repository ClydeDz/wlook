import { h } from "preact";

interface Props {
  version: string;
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
          <span class="about-row__key">Developed by</span>
          <span class="about-row__value">
            <a
              class="link"
              href="https://clydedsouza.net"
              onClick={(e) => {
                e.preventDefault();
                window.wlook.openExternal("https://clydedsouza.net");
              }}
            >
              Clyde D'Souza
            </a>
          </span>
        </div>
        <div class="about-row">
          <span class="about-row__key">App source</span>
          <span class="about-row__value">
            <a
              class="link"
              href="https://github.com/clydedz/wlook"
              onClick={(e) => {
                e.preventDefault();
                window.wlook.openExternal("https://github.com/clydedz/wlook");
              }}
            >
              github.com/clydedz/wlook
            </a>
          </span>
        </div>
        <div class="about-row">
          <span class="about-row__key">App license</span>
          <span class="about-row__value">MIT</span>
        </div>
        <div class="about-row">
          <span class="about-row__key">Dictionary source</span>
          <span class="about-row__value">
            <a
              class="link"
              href="https://kaikki.org/dictionary/rawdata.html"
              onClick={(e) => {
                e.preventDefault();
                window.wlook.openExternal(
                  "https://kaikki.org/dictionary/rawdata.html",
                );
              }}
            >
              Original source
            </a>{" "}
            and{" "}
            <a
              class="link"
              href="https://github.com/ClydeDz/wlook/releases/tag/0.0.0"
              onClick={(e) => {
                e.preventDefault();
                window.wlook.openExternal(
                  "https://github.com/ClydeDz/wlook/releases/tag/0.0.0",
                );
              }}
            >
              redistributed for this app here
            </a>
          </span>
        </div>
        <div class="about-row">
          <span class="about-row__key">Dictionary packs</span>
          <span class="about-row__value">Released under CC BY-SA 4.0</span>
        </div>
        <div class="about-row">
          <span class="about-row__key">No telemetry</span>
          <span class="about-row__value">All data stays on your device</span>
        </div>
      </div>
    </section>
  );
}
