# Wlook Architecture

## Process model

Three execution contexts, deliberately small:

1. **wlook-agent** (Electron main process) — always running, headless when idle.
2. **wlook-popup** (Electron renderer, frameless `BrowserWindow`) — created per lookup, hidden (not destroyed) between lookups. Radio: the popup recently moved from per-lookup creation to a singleton with a renderer-ready handshake.
3. **wlook-dashboard** (Electron renderer, `BrowserWindow`) — opened on demand; closing it releases the renderer process.

`wlook-agent` is the only always-running context. It owns all long-lived state.

## Lookup flow

```
User presses hotkey
  → globalShortcut fires in main process
  → captureCurrentSelection(config)            (src/agent/selection-capture.ts)
      reads selected text via UI Automation (Windows) or clipboard fallback
  → query.trim().toLowerCase()                  (normalise, in src/agent/main.ts)
  → getLemmatizer(language).lemmas(normalised)  (src/core/lemma/<lang>.ts)
      produces candidate forms (e.g. "running" → ["running", "run"])
  → DefaultDictionaryResolver.resolve(candidates, preferredDialect)
                                                  (src/core/dictionary/resolver.ts)
      iterates open SQLiteDictionaryProvider instances
      preferred dialect pack queried first, then sibling en-* packs
  → SQLiteDictionaryProvider.lookup(form)       (src/core/dictionary/sqlite-provider.ts)
      1. FTS5 MATCH on entries_fts
      2. Fall back to exact match on entries(lower(headword))
      Returns null on miss
  → PopupWindow.show(response, cursorPosition)  (src/agent/popup-window.ts)
      webContents.send('lookup-result', response)
  → PopupRenderer                                  (src/popup/popup.ts, lit-html)
      renders the entry, or the "no definition" empty card with the configurable
      search-engine link
```

The agent-internal lookup path — `handleHotkeyTrigger` → `performLookup` in `src/agent/main.ts` — mirrors the IPC `lookup-request` handler in `src/agent/ipc.ts`. They share the resolver + provider code; only the entry point differs (a hotkey-driven main call vs an `ipcMain.handle('lookup-request')`).

## IPC channels

Authoritative type definitions live in `src/shared/ipc-contracts.ts`. Channel names + direction, as registered today (see `src/agent/ipc.ts`, `src/agent/preload.ts`, and `src/agent/popup-window.ts`):

| Channel                | Direction        | Mechanism                                              |
| ---------------------- | ---------------- | ------------------------------------------------------ |
| `lookup-request`       | renderer → main  | `ipcMain.handle`                                       |
| `lookup-result`        | main → renderer  | `webContents.send` (popup-only, see `PopupWindow.show`) |
| `popup-renderer-ready` | renderer → main  | `ipcMain.on` (popup signals its `onDefinition` is registered) |
| `get-status`           | renderer → main  | `ipcMain.handle`                                       |
| `get-config`           | renderer → main  | `ipcMain.handle`                                       |
| `update-config`        | renderer → main  | `ipcMain.handle`                                       |
| `install-pack`         | renderer → main  | `ipcMain.handle`; emits `install-progress` to the caller |
| `install-progress`     | main → renderer  | `event.sender.send` (per-pack filtered by `packId`)    |
| `uninstall-pack`       | renderer → main  | `ipcMain.handle`                                       |
| `get-manifest`         | renderer → main  | `ipcMain.handle`                                       |
| `open-external`        | renderer → main  | `ipcMain.handle`                                       |

Notes
- `lookup-result` is sent via `BrowserWindow.webContents.send`, not `ipcMain.emit`. Each popup registers its own `lookup-result` listener via `window.wlook.onDefinition`. Main queues the latest result until the popup signals ready via `popup-renderer-ready` — see `PopupWindow.show` and the `pendingResult` field. This avoids the first-lookup race where the renderer isn't listening yet.
- The dashboard subscribes per-pack to `install-progress` via `window.wlook.onInstallProgress(packId, cb)`; main emits only when `data.packId === packId`, so concurrent installs (when introduced later) would each see their own progress without coordination.

## How dictionaries get to users

Two paths, both handled by `src/core/dictionary/pack-manager.ts`:

1. **Remote catalogue (default).** The dashboard's "Browse Dictionaries" tab fetches `packs-manifest.json` from the URL in `config.catalogueUrl`. The shipped default is `https://github.com/ClydeDz/wlook/releases/download/0.0.0/packs-manifest.json` (see `src/core/config.ts` — change there if you host your own catalogue). For each entry the user clicks Install, the agent downloads the `.wlpack`, optionally validates the SHA-256 declared in the manifest (currently opt-out via CHANGELOG `[Unreleased]`), and moves it into `dictionariesDir/<id>-<version>.wlpack`.
2. **Manual drop.** Users (or scripts) can drop `.wlpack` files into `dictionariesDir` directly. The agent picks them up on next startup via `scanInstalled()`.

## Dictionary pack format

A `.wlpack` file is a standard SQLite 3 database. The build tool in `tools/build-dictionary/` produces them from Kaikki JSONL + Open English WordNet JSON sources.

### Schema (authoritative DDL in `tools/build-dictionary/src/schema.ts`)

```sql
CREATE TABLE entries (
  id       INTEGER PRIMARY KEY,
  headword TEXT NOT NULL,        -- original spelling as in source
  lemma    TEXT NOT NULL,        -- lowercased; used by FTS + exact-match fallback
  pos      TEXT,                 -- noun, verb, adjective, …
  ipa_uk   TEXT,                 -- British English IPA; nullable
  ipa_us   TEXT                  -- American English IPA; nullable
);

CREATE TABLE senses (
  id          INTEGER PRIMARY KEY,
  entry_id    INTEGER NOT NULL REFERENCES entries(id),
  sense_order INTEGER NOT NULL,
  definition  TEXT NOT NULL,
  example     TEXT
);

CREATE VIRTUAL TABLE entries_fts
  USING fts5(headword, lemma, content='entries', content_rowid='id');

CREATE TABLE metadata (
  key   TEXT PRIMARY KEY,
  value TEXT
);
```

Build-tool PRAGMAs (set in `schema.ts::initSchema`): `journal_mode = WAL`, `synchronous = NORMAL`, `foreign_keys = ON`.

Indexes created at build time: `idx_entries_lemma(lemma)` for the exact-match fallback, `idx_entries_headword(lower(headword))` for the lowercase lookup path.

FTS5 stay-in-sync triggers (`entries_ai / entries_ad / entries_au`) mirror inserts, deletes, and updates from `entries` into `entries_fts`.

IPA is split per dialect at the column level (`ipa_uk`, `ipa_us`), not normalised into a single string. Cross-dialect lookup is the resolver's job: it iterates all installed packs sharing the BCP-47 root language when the user's `preferredDialect` is `en-*`. The schema is identical across `en-GB` and `en-US` packs — only the rows differ.

### Metadata semantics

- `id` — BCP-47 dialect tag (e.g. `en-GB`, `en-US`). Used as the on-disk filename prefix; must be unique among installed packs.
- `language` — BCP-47 root (e.g. `en`). Used by the resolver for cross-dialect grouping.
- `version` — SemVer string. The runtime composes the on-disk filename `<id>-<version>.wlpack`, so installing two versions of the same pack doesn't collide.
- `displayName` — Human-readable name surfaced in the dashboard's "Installed" + "Preferred dialect" sections.
- (build tool also writes) `builtAt`, `attribution`, `sourceKaikki`, `sourceWordNet`.

The runtime reads `metadata` rows in `PackManager.readPackMetadata` to build `PackInfo`. Validation that a `.wlpack` is a real pack: it has `metadata.id` and `metadata.version`. Corrupt / non-SQLite files are silently skipped.

## Memory model

The agent opens one `SQLiteDictionaryProvider` per installed pack **per lookup**, via `PackManager.getProvider`, and closes them after the resolver runs. WAL-mode + read-only connections keep per-connection footprint small. The 150 MB hard cap (80 MB target) covers the Electron main process + the concurrent pack connections during a single lookup. Run `yarn measure` to verify after any change to `src/agent/` or `src/core/`.
