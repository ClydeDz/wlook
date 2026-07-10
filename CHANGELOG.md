# Changelog

All notable changes to Wlook will be documented in this file.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)

## [Unreleased]

### Changed
- `DEFAULT_CONFIG.catalogueUrl` now points at the upstream (`clydedz/wlook`) GitHub Releases manifest instead of `null`, so the "Browse Dictionaries" tab in the dashboard works on first run. Users can override per-install in `%APPDATA%\Wlook\config.json`; set to `null` to fall back to the local-drop empty state.
- `ManifestPack.sha256` is now optional. Packs declared in `packs-manifest.json` without a `sha256` field install without integrity checking. Mismatched hashes still fail the install. **Trade-off:** this weakens the supply-chain check that previously protected against a tampered `.wlpack` from a compromised manifest host or hostile CDN edge. Publishers who care about integrity should keep shipping `sha256`. [0.1.0] - 2024-01-01
### Added
- Initial project scaffold
- Core dictionary engine with SQLite/FTS5 backend
- DictionaryProvider and DictionaryResolver interfaces
- English lemmatizer (irregular verbs, plurals, regular suffixes)
- Cross-dialect lookup (all en-* packs searched, preferred dialect first)
- Background Electron tray agent
- Frameless popup with definition, IPA, POS, example
- "Search on Google" link in popup footer (configurable engine)
- Dashboard: system health, dialect selector, pack manager, settings
- Global hotkey support (Electron globalShortcut)
- Auto-start on login (configurable)
- Clipboard fallback for selection capture (off by default)
- Tools: build-dictionary for ingesting Kaikki + WordNet sources
