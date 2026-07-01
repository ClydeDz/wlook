# Changelog

All notable changes to Wlook will be documented in this file.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)

## [Unreleased]

## [0.1.0] - 2024-01-01
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
