# Changelog

All notable changes to Wlook will be documented in this file.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)

## [0.2.0] - 2026-07-12

### Added

- Top-level `productName: Wlook` in `package.json`. The packaging-time Product Name was already declared in `electron-builder.yml`; the new package.json field is belt-and-braces so `app.getName()` and electron-builder both resolve to "Wlook" cleanly.
- Popup header logo: the logo SVG (`assets/icons/popup-logo.svg`) is now embedded inline in `src/popup/popup.ts` via a `POPUP_LOGO_SVG` literal, rendered in both `entryTemplate` and `emptyTemplate`. Inlining (rather than `<img src=>`) lets the strokes pick up CSS `currentColor` from the host page, so the logo can be theme-tinted instead of rendering as fixed black.
- Dashboard window taskbar icon: `src/agent/dashboard-window.ts` now loads `assets/icons/app.ico` via `nativeImage.createFromPath` with an `existsSync` fallback and passes it to `BrowserWindow({ icon: ... })`. The popup window remains `skipTaskbar: true` by design.
- `--logo-color` CSS variable in `src/popup/popup.css`. Defaults to `var(--accent)` in light mode; `:root[data-theme="dark"]` and the `@media (prefers-color-scheme: dark)` fallback override it to `#ffffff` so the popup logo renders white on dark surfaces.
- `--link-color` CSS variable for the popup's "Search on Google" footer link. Defaults to `var(--accent)` in light mode; both dark-mode selectors override it to `#ffffff`.
- Hover/focus-visible state for `.card__google-link` now draws a 1 px dotted underline 3 px below the text, in `var(--link-color)` (so white on dark, blue on light).
- `app.setName('Wlook')` call in `src/agent/main.ts`, placed before `app.setAppUserModelId('com.wlook.app')`. Combined with the new `productName` in `package.json`, this ensures "Wlook" appears in userData folder naming, login-item metadata, and any Electron code path that derives a display name from `app.getName()`.

### Changed

- `DEFAULT_CONFIG.catalogueUrl` now points at the upstream (`clydedz/wlook`) GitHub Releases manifest instead of `null`, so the "Browse Dictionaries" tab in the dashboard works on first run. Users can override per-install in `%APPDATA%\Wlook\config.json`; set to `null` to fall back to the local-drop empty state.
- `ManifestPack.sha256` is now optional. Packs declared in `packs-manifest.json` without a `sha256` field install without integrity checking. Mismatched hashes still fail the install. **Trade-off:** this weakens the supply-chain check that previously protected against a tampered `.wlpack` from a compromised manifest host or hostile CDN edge. Publishers who care about integrity should keep shipping `sha256`.
- `src/popup/popup.ts` `loadConfig()` now reads `config.theme` from the `get-config` IPC response (previously dropped on the floor; only `popupSearch` was consumed). It sets `document.documentElement.setAttribute('data-theme', theme === 'dark' ? 'dark' : 'default')`. The `WlookAPI.getConfig` return type was extended accordingly.
- `src/popup/popup.css` theme switching refactored away from a pure OS-preference `@media (prefers-color-scheme: dark)` rule. The dark-surface colour block now also fires when `:root[data-theme="dark"]`, honouring an explicit user choice regardless of OS theme. The existing `assets/themes/default.css` and `dark.css` files remain in-tree as documentation but the runtime now drives theme via the new popup-side selectors.
- Dashboard render order in `src/dashboard/app.tsx`: `<SystemHealth>` was moved from position #2 (right after `<Header>`) to just above `<About>`. Final order is `Header → InstalledDictionaries → BrowseDictionaries → PreferredDialect → Settings → SystemHealth → About`.
- Dashboard render order: `<PreferredDialect>` was moved from position #2 (right after `<Header>`) to between `<BrowseDictionaries>` and `<Settings>`, so the preferred-dialect decision visually follows "what you can install" rather than appearing before browsing.
- `get-config` IPC handler in `src/agent/ipc.ts` now returns `{ ...ctx.getConfig(), version: app.getVersion() }`. Previously the renderer's `AppConfig.version` field resolved to `undefined` at runtime (TS-permissive contract, runtime-empty), so the dashboard header rendered as `Wlook v` with nothing after it.
- `assets/icons/popup-logo.svg` path strokes changed from hardcoded `#1D1D1F` to `stroke="currentColor"`, allowing the CSS-driven `--logo-color` to re-tint the icon for light and dark themes. `stroke-width`, `stroke-linecap`, and `stroke-linejoin` are unchanged.

### Fixed

- `yarn test` now runs vitest inside Electron's Node runtime (`ELECTRON_RUN_AS_NODE=1`), so the `better-sqlite3` binary built by `electron-rebuild` in `postinstall` loads cleanly under ABI 125. Resolves `ERR_DLOPEN_FAILED` failures in `tests/unit/core/pack-manager.test.ts` and `tests/unit/core/sqlite-provider.test.ts` that occurred when running tests under plain Node 22 (ABI 127). Added `cross-env` for cross-platform env-var propagation on Windows.
- Windows system tray icon was missing because `src/agent/tray.ts` looks up `tray.ico` literally on Windows (`process.platform === 'win32' ? 'tray.ico' : 'tray.png'`), but the icon file was placed at `assets/icons/wlook.ico`. Renamed to `assets/icons/tray.ico`. The `[Tray] Icon not found …` warning no longer fires.
- Windows taskbar right-click context menu and Alt-Tab switcher were showing "Electron" instead of "Wlook" because Windows reads the running executable's PE version-resource Product Name. `app.setName('Wlook')` + the new `productName` in `package.json` cover the Electron-side identity; the EXE itself is rewritten only at packaging time via `electron-builder`'s `productName` field, which was already correct in `electron-builder.yml`. Dev-mode won't show "Wlook" in the taskbar until `yarn package` produces a packaged build, but all in-process app-name resolution now resolves correctly from first launch.
- Dashboard header rendered `Wlook v` with no version string (the trailing whitespace rendered as nothing). Fixed by spreading `app.getVersion()` into the `get-config` IPC response.
- User's theme choice from the Dashboard's Settings panel was silently dropped on the popup: the value was saved to `config.json` but never propagated to the popup template. The popup now reads `config.theme`, applies `data-theme` to `<html>`, and the dark-mode selectors in `popup.css` respond.
- Popup logo rendered nearly black in dark mode even after switching the SVG to `currentColor`. Cause: `<img src="popup-logo.svg">` loads the SVG as an isolated document, so `currentColor` falls back to canvas text colour (black) rather than inheriting from `.card__logo { color: var(--accent) }`. Fixed by inlining the SVG content into the popup template.
- "Search on Google" link stayed Apple-blue in dark mode and provided no hover affordance. Fixed by introducing `--link-color` (white in dark) and a dotted underline on hover/focus that follows the same colour.

## [0.1.0]

### Added

- Initial project scaffold
- Core dictionary engine with SQLite/FTS5 backend
- DictionaryProvider and DictionaryResolver interfaces
- English lemmatizer (irregular verbs, plurals, regular suffixes)
- Cross-dialect lookup (all en-\* packs searched, preferred dialect first)
- Background Electron tray agent
- Frameless popup with definition, IPA, POS, example
- "Search on Google" link in popup footer (configurable engine)
- Dashboard: system health, dialect selector, pack manager, settings
- Global hotkey support (Electron globalShortcut)
- Auto-start on login (configurable)
- Clipboard fallback for selection capture (off by default)
- Tools: build-dictionary for ingesting Kaikki + WordNet sources
