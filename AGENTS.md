# Wlook — Agent Guide

## What this app is

Wlook is an offline dictionary lookup app for Windows. A background Electron tray agent runs at all times. When the user selects text and presses the global hotkey (default: `Ctrl+Shift+D`), a small frameless popup appears near the cursor showing the word's definition, pronunciation (IPA), part of speech, and an example sentence — sourced from a local SQLite dictionary pack. No cloud call, no visible window while idle.

## Process model

```
Windows Shell (hotkey / context-menu verb)
        │
        │  CLI args or named pipe
        ▼
wlook-agent  (Electron main — always running)
  ├── tray icon
  ├── globalShortcut
  ├── IPC router
  ├── DictionaryResolver + PackManager
  ├── PopupWindow  (frameless BrowserWindow, shown per lookup)
  └── DashboardWindow  (opened on demand, closed to release renderer)
```

`wlook-agent` is the only always-running process. `wlook-dashboard` is a renderer window opened inside the same Electron process when the user opens the dashboard; closing it releases its renderer. The popup is a separate frameless `BrowserWindow` created for each lookup and destroyed when dismissed.

## Where things live

| Change you want to make | Files to edit |
|-------------------------|---------------|
| Dictionary lookup logic | `src/core/dictionary/` |
| Add a language | `src/core/lemma/<lang>.ts` + register in `src/core/lemma/index.ts` |
| Popup appearance | `src/popup/` + `assets/themes/` |
| Dashboard UI | `src/dashboard/` |
| Hotkey / selection capture | `src/agent/hotkey.ts`, `src/agent/selection-capture.ts` |
| Build a new dictionary pack | `tools/build-dictionary/` |
| IPC message types | `src/shared/ipc-contracts.ts` |
| Tray icon, app icon | `assets/icons/` (see `assets/icons/README.md`) |
| Default popup theme | `assets/themes/default.css` |

**Rule: NEVER import Electron in `src/core/`. It must be testable in plain Node.**

## Invariants to preserve

- Idle agent RAM must stay under **150 MB** (80 MB target). Run `yarn measure` to check.
- `src/core/` is framework-free TypeScript only — no Electron, no DOM.
- User data lives in `%APPDATA%\Wlook\` on Windows or `~/.wlook/` in dev.
- No telemetry without explicit opt-in (requirement N7).
- All `.wlpack` files are SQLite databases. Schema changes require a migration path.
- Cross-dialect lookup: all `en-*` packs are searched when the preferred dialect is `en-GB` or `en-US`.

## Running locally (macOS dev)

```sh
yarn install          # installs deps and rebuilds better-sqlite3
yarn build            # compiles TS + bundles renderers + copies assets
yarn dev:agent        # starts Electron (tray app, no visible window)
yarn dev:dashboard    # starts Electron and opens the dashboard window
yarn test             # unit tests (vitest)
yarn measure          # perf measurement (requires agent already running)
node scripts/create-fixture-db.mjs  # recreate test fixture SQLite DB
```

## Definition of done for any change

- [ ] `yarn test` passes with no failures
- [ ] `yarn build` succeeds with zero TypeScript errors
- [ ] `yarn measure` stays within RAM/latency budget (required if change touches `src/agent/` or `src/core/`)
- [ ] `CHANGELOG.md` updated under `[Unreleased]`
- [ ] Docs updated if user-visible behaviour changed

## Things to ask before changing

Stop and flag the change for review if it:
- Risks the memory budget (§7 of README — 150 MB hard cap, 250 ms cold-lookup hard cap)
- Adds a new always-running background process or thread
- Fires a network call without direct user action
- Changes the `.wlpack` SQLite schema (requires a migration for existing installs)
- Changes types in `src/shared/ipc-contracts.ts` (both agent and renderer must be updated atomically)
- Adds a dependency that ships native binaries (needs ARM64 prebuilds)
