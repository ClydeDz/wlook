# Wlook Architecture

## Process model

Three execution contexts, deliberately small:

1. **wlook-agent** (Electron main process) — always running, headless when idle.
2. **wlook-popup** (Electron renderer, frameless `BrowserWindow`) — created per lookup, destroyed on dismiss.
3. **wlook-dashboard** (Electron renderer, `BrowserWindow`) — opened on demand; closing it releases the renderer process.

`wlook-agent` is the only always-running context. It owns all long-lived state.

## IPC flow (lookup path)

```
User presses hotkey
  → globalShortcut fires in main process
  → SelectionCapture.capture()
      reads selected text via UI Automation (Windows) or clipboard fallback
  → normalise(text)
      trim, lowercase, strip punctuation
  → Lemmatizer.lemmatise(normalised)
      produces candidate forms (e.g. "running" → ["running", "run"])
  → DictionaryResolver.resolve(candidates, preferredDialect)
      iterates PackManager.openProviders()
      preferred dialect pack queried first, then sibling en-* packs
  → SQLiteDictionaryProvider.lookup(form)
      FTS5 query on the entries table
  → first result returned
  → PopupWindow.show(result, cursorPosition)
      webContents.send("lookup-result", result)
```

## Data flow diagram

```
[hotkey event]
      │
      ▼
[selection-capture]  ──(clipboard fallback)──►  [clipboard read]
      │
      ▼
[normalise]
      │
      ▼
[lemmatizer]  (src/core/lemma/<lang>.ts)
      │   produces string[]
      ▼
[DictionaryResolver]  (src/core/dictionary/resolver.ts)
      │   iterates providers
      ▼
[SQLiteDictionaryProvider]  (src/core/dictionary/sqlite-provider.ts)
      │   FTS5 SELECT on .wlpack
      ▼
[LookupResult]
      │
      ▼
[PopupWindow]  →  webContents.send("lookup-result", result)
      │
      ▼
[popup renderer]  (src/popup/)
```

## IPC channels

Full type definitions live in `src/shared/ipc-contracts.ts`. Summary:

| Channel | Direction | Payload |
|---------|-----------|---------|
| `lookup-request` | renderer → main | `{ query: string }` |
| `lookup-result` | main → renderer | `LookupResult \| null` |
| `get-status` | renderer → main | — |
| `status-update` | main → renderer | `AgentStatus` |
| `install-pack` | renderer → main | `{ packId: string, url: string }` |
| `install-progress` | main → renderer | `{ packId: string, percent: number }` |
| `uninstall-pack` | renderer → main | `{ packId: string }` |
| `update-config` | renderer → main | `Partial<Config>` |
| `open-external` | renderer → main | `{ url: string }` |

## Dictionary pack format

A `.wlpack` file is a standard SQLite database (version 3). The build tool in `tools/build-dictionary/` produces them from Kaikki JSON and WordNet sources.

### Schema

```sql
CREATE TABLE metadata (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
-- Required keys: id, displayName, version, language, license, source

CREATE TABLE entries (
  id          INTEGER PRIMARY KEY,
  lemma       TEXT NOT NULL,
  pos         TEXT,            -- noun, verb, adjective, …
  ipa         TEXT,
  definition  TEXT NOT NULL,
  example     TEXT,
  dialect     TEXT             -- en-GB, en-US, etc.
);

CREATE VIRTUAL TABLE entries_fts USING fts5(
  lemma,
  definition,
  content='entries',
  content_rowid='id'
);
```

`language` in `metadata` is a BCP-47 prefix (e.g. `en-GB`, `en-US`, `de`). The resolver groups packs by their language prefix root (e.g. `en`) for cross-dialect lookup.

## Memory model

The agent keeps all `SQLiteDictionaryProvider` instances open (WAL mode, read-only). Each open database connection holds a small page cache. The 150 MB hard cap (80 MB target) covers the sum of the Electron main process plus all open pack connections. Run `yarn measure` to check after any change that touches the agent or core.
