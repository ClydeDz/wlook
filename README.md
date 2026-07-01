# Wlook

A lightweight Windows companion app that brings macOS-style "Look Up" to any text on Windows. Select one or more words anywhere, right-click, choose **Look up "&lt;word&gt;"**, and a small dictionary tooltip pops up with a definition and an example sentence.

The app runs as a quiet background tray agent — the dashboard UI is only opened when the user wants to manage dictionaries or check status.

> **Status:** Planning document. No code has been written yet. This README is the source of truth for product requirements, technical decisions, and the build plan.

---

## Table of contents

1. [Product requirements](#1-product-requirements)
2. [Non-goals (v1)](#2-non-goals-v1)
3. [Does Windows already ship dictionaries?](#3-does-windows-already-ship-dictionaries)
4. [Architecture overview](#4-architecture-overview)
5. [How the right-click integration works](#5-how-the-right-click-integration-works)
6. [Dictionary data: format, sourcing, storage](#6-dictionary-data-format-sourcing-storage)
7. [Memory & storage budget (hard limits)](#7-memory--storage-budget-hard-limits)
8. [Tech stack & key dependencies](#8-tech-stack--key-dependencies)
9. [Repository layout](#9-repository-layout)
10. [Module contracts (so things stay swappable)](#10-module-contracts-so-things-stay-swappable)
11. [Dashboard UX](#11-dashboard-ux)
12. [Installation, updates, uninstall](#12-installation-updates-uninstall)
12a. [Code signing (dev vs production)](#12a-code-signing-dev-vs-production)
13. [Testing strategy](#13-testing-strategy)
14. [Documentation plan](#14-documentation-plan)
15. [Customisation guide (icons, theme, dictionaries)](#15-customisation-guide-icons-theme-dictionaries)
16. [AGENTS.md plan](#16-agentsmd-plan)
17. [Build plan / milestones](#17-build-plan--milestones)
18. [Open questions & risks](#18-open-questions--risks)

---

## 1. Product requirements

### 1.1 Core user story
> As a Windows user, when I select one or more words in any application and right-click, I want a "Look up …" item in the context menu. Clicking it shows a small, dictionary-style popup with a definition and an example sentence, similar to macOS Look Up.

### 1.2 Functional requirements

| ID | Requirement |
|----|-------------|
| F1 | After installing Wlook, the OS context menu shows a **Look up "&lt;selection&gt;"** entry whenever text is selected. The label includes (a truncated) selection, capped at ~30 chars. |
| F2 | The feature works **without the dashboard window being open**. A background process handles the lookup. |
| F3 | Clicking the menu item opens a small **tooltip-style popup** near the cursor (not a full window) showing: word, pronunciation (if available), part of speech, definition, and at least one example sentence. See F3a for the popup footer. |
| F3a | The popup includes a **footer row** with a **"Search on Google"** link/button. Clicking it opens the user's **default browser** to `https://www.google.com/search?q=<url-encoded-selection>` and closes the popup. The link is also keyboard-accessible (`Enter` while focused, or a shortcut like `Ctrl+G` while the popup is open). The query sent is the **original selected text** (not a lemma), so the user gets the search result they'd expect. The label and target search engine are configurable in `config.json` (default: Google) so a user who prefers DuckDuckGo / Bing / Kagi can change it without code changes. |
| F4 | Multi-word selections (e.g. *"run away"*) are looked up as a phrase first; if no phrase entry exists, fall back to the first word. |
| F5 | English **UK** and English **US** dictionaries are both available in v1. The user picks a **preferred dialect** (UK or US) but lookups are **not** limited to that pack — see F5a. |
| F5a | **Cross-dialect lookup within a language.** When the user looks up a word, Wlook queries every installed pack that belongs to the same language as the preferred dialect (i.e. all `en-*` packs). So *color* resolves even when English UK is preferred, and *colour* resolves even when English US is preferred. The preferred dialect only affects: (a) which spelling/pronunciation is shown first when both dialects have an entry, (b) which example sentence is shown first, and (c) the popup's "shown from: en-GB" footer label. The user is **never** told "word not found" for a word that exists in a sibling dialect they have installed. |
| F6 | Architecture must allow adding more languages later **without changing core code** — only by dropping in a new dictionary pack. |
| F7 | A **dashboard window** opens when the user launches Wlook from Start Menu / tray icon. It shows: install health, active dictionary, installed dictionaries, and a search box to find & install additional dictionary packs. |
| F8 | The user can **search for and install additional dictionary packs** from within the dashboard. (Source list is a JSON manifest hosted on GitHub Releases initially.) |
| F9 | Once installed, Wlook **registers itself to start on Windows login** automatically — no extra step from the user. The Settings panel in the dashboard exposes a **"Start Wlook when I sign in to Windows"** toggle (default **on**) so users can opt out at any time. The toggle writes to the standard `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` key, so Windows' built-in Startup apps screen reflects it too. |
| F10 | The user can **dismiss the popup** with `Esc`, by clicking outside it, or after a short idle timeout. |
| F11 | The app respects offline use: once dictionaries are downloaded, **no network is required** for lookups. |
| F12 | All user data (settings, downloaded dictionaries) lives under `%APPDATA%\Wlook\` so uninstall is clean. |
| F13 | The **global hotkey is fully customisable** from the dashboard Settings panel. The user can re-bind it (e.g. `Ctrl+Shift+D` → `Alt+L`), disable it entirely, or reset to default. If a chosen combination is already registered by another app or Windows itself, the UI shows a clear "conflict — pick another" error rather than failing silently. |
| F14 | The installer is **fully self-contained**. The user does not need to install Node.js, Python, Visual C++ runtimes, or anything else. All native binaries (e.g. `better-sqlite3`, the key-listener) are precompiled and shipped inside the installer. |

### 1.3 Non-functional requirements

| ID | Requirement | Target |
|----|-------------|--------|
| N1 | **Idle RAM** of the background tray process | < 80 MB target, **150 MB hard cap** |
| N2 | **Cold lookup latency** (right-click → popup visible) | < 250 ms on a mid-range machine |
| N3 | **Installer size** (app only, no dictionaries) | < 80 MB |
| N4 | **Per-language dictionary pack** (English UK or US) on disk | < 40 MB |
| N5 | **CPU usage** when idle (no lookups happening) | < 0.5% average |
| N6 | Works on Windows 10 (1903+) and Windows 11, x64 and ARM64 | required |
| N7 | No telemetry by default. Any future telemetry is opt-in. | required |

### 1.4 Hard limits (these are kill-criteria — if we exceed them, we cut features)
- Idle RAM > **150 MB** → fail. (Target is 80 MB; 150 MB is the absolute ceiling agreed with the product owner.)
- Total installed footprint (app + English UK + English US) > 200 MB → fail.
- Lookup latency p95 > 500 ms → fail.

---

## 2. Non-goals (v1)

- Translation between languages.
- Thesaurus / synonyms (planned for v1.1).
- Cloud sync of preferences.
- Mobile / macOS / Linux builds.
- Reading text aloud / TTS.
- OCR or image lookup.
- Browser-extension-style hover-to-define (right-click only in v1).

---

## 3. Does Windows already ship dictionaries?

Short answer: **not as a system-wide lookup API we can call.**

What Windows actually ships:
- **Spell-check dictionaries** via the `Windows.Data.Text` and spell-checking APIs — these know if a word is valid, but do **not** expose definitions or examples.
- **Edge / Office** ship their own dictionary panels, but those are app-internal and not callable from third-party code.
- **Immersive Reader** in Edge has a picture dictionary, but it's tied to Edge content.

So we cannot piggy-back on a built-in dictionary. We must ship our own dictionary data. The plus side: this means we work fully offline.

---

## 4. Architecture overview

Three processes, deliberately small:

```
┌─────────────────────────────────────────────────────────────┐
│  Windows Explorer / any app                                 │
│  (user selects text, right-clicks)                          │
└──────────────────────────┬──────────────────────────────────┘
                           │ Shell context menu entry
                           │ (registered at install time)
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  wlook-shell-handler  (native, tiny)                        │
│  - C++/Rust shell extension OR a registered verb that       │
│    just launches `wlook-agent.exe --lookup "<text>"`        │
└──────────────────────────┬──────────────────────────────────┘
                           │ IPC (named pipe) or CLI args
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  wlook-agent  (Electron, background, no visible window)     │
│  - Owns the dictionary engine                               │
│  - Renders the popup (frameless, always-on-top BrowserWindow)│
│  - Tray icon                                                │
│  - Starts on login                                          │
└──────────────────────────┬──────────────────────────────────┘
                           │ same process, lazy-loaded
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  wlook-dashboard  (Electron renderer, only when opened)     │
│  - Status dashboard, dictionary manager, settings           │
└─────────────────────────────────────────────────────────────┘
```

Key decisions:
- The shell handler is **as small as possible**. It does not load the dictionary. It only forwards the selected text to the agent.
- The agent is **always running but headless** when idle.
- The dashboard is a renderer window opened on demand — closing it releases its renderer process.

---

## 5. How the right-click integration works

Two viable approaches. We will pick **Approach A** for v1 and document Approach B as a future upgrade.

### Approach A — Registered "verb" on text selections (v1)
Windows has limited support for context-menu entries that act on arbitrary text selections inside other applications. For most apps (Notepad, browsers, Word, Edge, etc.), the standard pattern is:
1. Register a shell verb under `HKCU\Software\Classes\*\shell\Wlook` so the entry shows on **files** — useful, but not what we want.
2. To get the entry on **text selections within other apps**, we register a global hotkey + a shell extension hosted via a **clipboard fallback**: the menu item, when clicked, reads the current selection via `WM_COPY` / UI Automation `TextPattern`, then sends it to the agent.

Because right-click context menus in arbitrary apps cannot be extended uniformly on modern Windows (Win11 tightened this), v1 ships **two entry points** so the feature feels seamless:

- **Primary:** a configurable global hotkey (default `Ctrl+Shift+D`) that looks up the current selection. This works in every app.
- **Secondary:** a true context-menu entry in **Explorer for text files** and a browser extension (Edge/Chrome) for in-page selections. Both call the same agent IPC.

#### Customising the hotkey (F13)
The hotkey is **never hard-coded**. It is read from `config.json` at startup and re-registered live whenever the user changes it from the dashboard. Implementation notes:
- The Settings panel hosts a "record hotkey" capture widget — the user presses the combination they want, and we display it in Electron-accelerator form (e.g. `Control+Shift+D`).
- Before saving, we try to register the new combination with the OS. If registration fails (combination already taken, reserved by Windows, or invalid), we keep the previous binding and surface a friendly error.
- The user can **disable** the hotkey entirely (in which case only the menu/browser entry points remain).
- A "Reset to default" button restores the shipped default.
- The active hotkey is also shown in the dashboard's **System Health** card so users always know what to press.

We will be honest in the dashboard: "Right-click integration in &lt;app&gt;: ✅ / ⚠ uses hotkey fallback".

### Approach B — Per-app shell extensions (later)
For deeper integration (a true right-click item inside every app), we would need a Win32 shell extension DLL signed with a certificate, plus per-host shims (e.g. an Office add-in, a UI Automation hook). This is significantly more work and is deferred.

### Selection capture
The agent reads the selection using, in order:
1. **UI Automation (UIA)** `TextPattern.GetSelection()` — works in most modern Windows apps (browsers, Office, Notepad, VS Code, etc.). This is the preferred path: it asks the foreground app, via a documented Windows accessibility API, "what text does the user currently have selected?" It does **not** touch the clipboard at all.
2. **Clipboard fallback** — used only when (1) fails (some legacy or custom-drawn apps don't support UIA text patterns).

#### What is the clipboard fallback, and why does it exist?
Some Windows apps draw their own text (older Win32 controls, certain Electron variants, some games, some IDE editors) and don't expose a UIA `TextPattern`. For those, there's no documented way to ask "what's selected?" — so we fall back to the same trick most lookup utilities use:

1. **Save** the user's current clipboard contents (text, image, etc.) to memory.
2. **Send `Ctrl+C`** to the foreground app. The selected text lands on the clipboard.
3. **Read** the clipboard and treat that text as the selection.
4. **Restore** the original clipboard contents so the user's copy/paste state is unchanged.

It works almost everywhere, but it has real downsides we don't want to hide:
- It briefly mutates a shared OS resource (the clipboard). Clipboard-manager apps may record the transient value.
- If the foreground app doesn't honour `Ctrl+C` as "copy" (e.g. a game with custom keybindings), the fallback gets the wrong text or nothing.
- It can race with another app writing to the clipboard at the same moment.

For these reasons the fallback is:
- **Off by default.** v1 ships with the UIA path only; lookups in apps that don't expose UIA simply show a "couldn't read selection" message with a one-click "enable clipboard fallback" link.
- **Toggleable in Settings**, with an honest one-liner explaining what it does.
- **Logged** (locally only) when it runs, so users can audit it.

---

## 6. Dictionary data: format, sourcing, storage

### 6.1 Format
We use a **single SQLite file per language pack**, with FTS5 for prefix and lemma search. Schema:

```sql
CREATE TABLE entries (
  id INTEGER PRIMARY KEY,
  headword TEXT NOT NULL,
  lemma TEXT NOT NULL,           -- normalised form ("running" -> "run")
  pos TEXT,                      -- part of speech
  ipa_uk TEXT,
  ipa_us TEXT
);

CREATE TABLE senses (
  id INTEGER PRIMARY KEY,
  entry_id INTEGER REFERENCES entries(id),
  sense_order INTEGER,
  definition TEXT NOT NULL,
  example TEXT
);

CREATE VIRTUAL TABLE entries_fts USING fts5(headword, lemma, content='entries', content_rowid='id');
```

Why SQLite:
- One file → easy to install/uninstall a pack.
- FTS5 gives sub-millisecond lookup.
- No long-running indexer process.
- Compact on disk (well under our 40 MB budget per language).

### 6.2 Sources — recommendation and rationale

We evaluated the realistic options and recommend a two-source pipeline for English. Other languages can use a different mix without touching app code (it's all in `tools/build-dictionary`).

| Source | License | Coverage | Examples? | IPA UK/US? | Parseability | Verdict |
|--------|---------|----------|-----------|-----------|--------------|---------|
| **Kaikki.org Wiktionary JSON** | CC BY-SA 4.0 (inherits from Wiktionary) | Huge — 1M+ English entries; tags dialects (`British`, `American`, `Australian`, …) | Yes, often multiple per sense | Yes, both | **Pre-parsed JSON** — clean, one record per sense | **Primary source.** Saves months of Wikitext parsing. |
| **Open English WordNet** | CC BY 4.0 | ~120k entries, hand-curated | Limited but high quality | No | Clean RDF/XML/JSON on GitHub | **Backfill** for definition quality and a more permissive base where useful. |
| Raw Wiktionary dumps | CC BY-SA 4.0 | Same as Kaikki | Yes | Yes | Wikitext — months of work | Skip; Kaikki has already done this. |
| WordNet 3.1 (Princeton) | WordNet License (permissive) | 150k entries | Sparse | No | Clean | Superseded by Open English WordNet (same data, modernised, better license). |
| GCIDE / Webster's 1913 | Public domain | Decent | Yes | No | Plain text | Useful as a public-domain fallback if BY-SA ever becomes a problem; not primary because the language is dated. |
| Free Dictionary API / commercial APIs (Oxford, Merriam-Webster, Collins) | Online only; fees for commercial use | Excellent | Yes | Yes | API | **Rejected.** Violates the offline requirement (F11) and either costs money or has rate limits. |

**Chosen pipeline for English packs:**

1. Pull the latest **Kaikki English Wiktionary** JSON extract (it's a single download, refreshed weekly).
2. Pull the latest **Open English WordNet** release from GitHub.
3. In `tools/build-dictionary`, normalise both into our internal entry shape, then:
   - Use Wiktionary as the primary entry per `(headword, sense)`.
   - Where a Wiktionary sense has no example sentence, take one from WordNet if available.
   - Where Wiktionary has dialect tags (`British` / `American`), route the entry into the right pack (`en-GB.wlpack` vs `en-US.wlpack`). Entries with no dialect tag go into **both** packs — this is what makes the cross-dialect resolver (§10) work without inflating each pack.
4. Drop entries below a quality bar (e.g. no definition text, or definition shorter than 8 chars) to keep size down.
5. Emit two SQLite `.wlpack` files. Validate each is under the 40 MB budget (§7).

The tool is reproducible and version-pinned: `tools/build-dictionary/sources.json` records the exact upstream snapshots used, so a given Wlook release can always be rebuilt byte-for-byte.

### 6.3 Licensing — what this means in practice

Both primary sources are Creative Commons licenses, which we need to handle correctly:

- **Wiktionary / Kaikki: CC BY-SA 4.0.** Requires (a) **attribution** and (b) **share-alike on derivative works of the data**. We comply by:
  - Crediting Wiktionary contributors in the dashboard's **About** screen and inside each `.wlpack` (metadata table).
  - Releasing the generated `.wlpack` files under **CC BY-SA 4.0**. Anyone can take them and redistribute them under the same terms.
  - Keeping the **app code** under its own license (e.g. MIT) — code and data are an "aggregation," not a derivative work of the data. This is the standard reading and how other offline dictionary apps (notably **GoldenDict** / GoldenDict-ng — see §18.2) handle it. We will get this explicitly confirmed before public release (§18).
- **Open English WordNet: CC BY 4.0.** Attribution only, no share-alike. Easier.
- The dashboard's About screen will list every source per installed pack, with links to the upstream project.

### 6.4 Recommended hosting for shipped packs

Packs are too big to bundle in the installer (we want a < 80 MB installer per §7) and we want to update them independently of the app. Options:

| Option | Cost | Bandwidth | Verdict |
|--------|------|-----------|---------|
| **GitHub Releases** (manifest + binary assets) | Free | Generous; CDN-backed; per-file 2 GB cap (we're at ~40 MB) | **Recommended for v1.** Zero infra, public, versioned, fits our scale. |
| Cloudflare R2 / S3 + a manifest | Cheap | Excellent | Good once we outgrow GitHub or want private packs. |
| Self-hosted | Variable | Our problem | Avoid. |

So: **GitHub Releases hosts both the app installer and the dictionary packs**, with a `packs-manifest.json` checked into the repo (or attached to a "manifest" release) that the dashboard fetches to populate its Browse tab.

We will write a **build-time tool** (`tools/build-dictionary/`) that ingests the upstream sources and emits the SQLite pack. This tool is not shipped to users.

### 6.5 Storage layout
```
%APPDATA%\Wlook\
  config.json
  dictionaries\
    en-GB-1.0.0.wlpack       (just a SQLite file with a header)
    en-US-1.0.0.wlpack
  cache\
    recent-lookups.json
```

### 6.6 Manifest for installable packs
A JSON file hosted on GitHub Releases:
```json
{
  "schemaVersion": 1,
  "packs": [
    { "id": "en-GB", "version": "1.0.0", "sizeMB": 32, "url": "...", "sha256": "..." },
    { "id": "en-US", "version": "1.0.0", "sizeMB": 33, "url": "...", "sha256": "..." }
  ]
}
```
Adding a new language later = adding an entry here. No app update required.

---

## 7. Memory & storage budget (hard limits)

| Component | Budget | How we hit it |
|-----------|--------|---------------|
| Agent idle RAM | < 80 MB | Single Electron process, V8 heap cap (`--max-old-space-size=64`), no renderer when popup hidden, SQLite opened lazily. |
| Popup RAM (when visible) | < 60 MB extra | Tiny, static HTML, no framework runtime — vanilla TS + lit-html. |
| Dashboard RAM (when visible) | < 200 MB | Standard Electron renderer; closed by default. |
| Installer (app only) | < 80 MB | Electron base + native bits only; dictionaries downloaded on first run. |
| Each English pack | < 40 MB | SQLite + FTS5, compressed text fields. |
| Idle CPU | < 0.5% | No polling. Hotkey + IPC are event-driven. |

We will add a CI check that fails if `npm run measure` reports values above these thresholds.

---

## 8. Tech stack & key dependencies

- **Electron** (latest LTS) — provides cross-version Windows support, the BrowserWindow we need for the popup, auto-update, and easy packaging. Yes, it costs RAM; we mitigate with one shared agent process.
- **TypeScript** everywhere.
- **better-sqlite3** — synchronous, fast, native; the perfect fit for a local read-only DB.
- **lit-html** for the popup view (no React in the popup — keep it tiny). Dashboard can use **Preact** (3 KB) to stay light.
- **electron-builder** for NSIS / MSIX installers.
- **electron-updater** for auto-update.
- **node-global-key-listener** or **uiohook-napi** for the global hotkey.
- **windows-ui-automation** (or a tiny native add-on) for selection capture.
- **vitest** for unit tests; **playwright** for the dashboard E2E.

We will **not** use: React in the popup, lodash, moment, any "kitchen sink" UI library.

### 8.1 Self-contained packaging (F14)
A non-negotiable rule: **the user double-clicks the installer and the app works.** They should never see a Python / Node / VC++ runtime prompt.

How we guarantee this:
- **Electron** ships its own Node + Chromium — nothing to install separately.
- **`better-sqlite3`** is a native module. We use its **prebuilt binaries** for `win32-x64` and `win32-arm64` and pin a version that publishes both. `electron-builder` packs the resolved `.node` file into the `app.asar.unpacked` directory of the installer. No node-gyp, no Python, no MSBuild on the user's machine.
- **`uiohook-napi`** (or whichever key-listener we ship) is similarly prebuilt. If a chosen library does not publish ARM64 prebuilds, it is replaced — non-negotiable.
- The **Visual C++ runtime** that native `.node` modules need (`vcruntime140.dll`, `msvcp140.dll`) is bundled next to the binary inside the installer payload, so we don't depend on the user already having "Microsoft Visual C++ 2015–2022 Redistributable" installed. `electron-builder` does this for us via `extraResources` + the `vcredist` files; we will verify on a clean Windows VM.
- **SQLite itself** is statically linked inside `better-sqlite3` — there is no separate `sqlite3.dll` for the user to provide.
- **CI gate:** every release build is installed on a **fresh Windows VM with no developer tools** and a smoke test runs (boot agent → install fixture pack → perform a lookup). If any "missing DLL" / "Python not found" / "node-gyp" error appears, the release is blocked.

---

## 9. Repository layout

```
wlook/
├─ README.md                  ← this file
├─ AGENTS.md                  ← see §16
├─ package.json
├─ tsconfig.json
├─ electron-builder.yml
├─ assets/
│  ├─ icons/                  ← drop-in replaceable (see §15)
│  │  ├─ tray.ico
│  │  ├─ app.ico
│  │  └─ popup-logo.svg
│  └─ themes/
│     ├─ default.css
│     └─ dark.css
├─ src/
│  ├─ agent/                  ← background process
│  │  ├─ main.ts
│  │  ├─ hotkey.ts
│  │  ├─ selection-capture.ts
│  │  ├─ ipc.ts
│  │  └─ tray.ts
│  ├─ popup/                  ← lookup tooltip renderer
│  │  ├─ index.html
│  │  ├─ popup.ts
│  │  └─ popup.css
│  ├─ dashboard/              ← status + dictionary manager
│  │  ├─ index.html
│  │  ├─ app.tsx
│  │  └─ ...
│  ├─ core/                   ← engine, no Electron imports here
│  │  ├─ dictionary/
│  │  │  ├─ index.ts          ← DictionaryProvider interface
│  │  │  ├─ sqlite-provider.ts
│  │  │  └─ pack-manager.ts
│  │  ├─ lemma/
│  │  │  ├─ index.ts          ← Lemmatizer interface
│  │  │  └─ english.ts
│  │  └─ config.ts
│  └─ shared/                 ← types shared across processes
│     └─ ipc-contracts.ts
├─ tools/
│  └─ build-dictionary/       ← ingests upstream → .wlpack
├─ tests/
│  ├─ unit/
│  └─ e2e/
└─ docs/
   ├─ architecture.md
   ├─ customisation.md
   ├─ packaging-a-dictionary.md
   └─ troubleshooting.md
```

---

## 10. Module contracts (so things stay swappable)

The whole point of these interfaces is that **adding a new language or swapping the dictionary source touches one file**.

```ts
// src/core/dictionary/index.ts
export interface DictionaryEntry {
  headword: string;
  pos?: string;
  ipa?: { uk?: string; us?: string };
  senses: Array<{ definition: string; example?: string }>;
}

export interface DictionaryProvider {
  readonly id: string;             // "en-GB", "en-US", "fr-FR" ...
  readonly displayName: string;
  lookup(query: string): Promise<DictionaryEntry | null>;
  close(): Promise<void>;
}

// src/core/lemma/index.ts
export interface Lemmatizer {
  readonly language: string;       // "en", "fr"
  lemmas(word: string): string[];  // ["running"] -> ["run", "running"]
}
```

Lookup pipeline:
1. Normalise selection (trim, lowercase, strip punctuation).
2. Determine the **active language** (e.g. `en`) and the **preferred dialect** (e.g. `en-GB`) from config.
3. Gather all installed `DictionaryProvider`s whose `id` starts with that language tag — e.g. `en-GB` and `en-US`. These are the **providers to query** for this lookup.
4. If multi-word → query each provider for the phrase.
5. Else, ask the `Lemmatizer` for candidate lemmas, query each provider for each lemma.
6. **Merge results across providers** using `DictionaryResolver` (below): de-dupe by `(lemma, sense)`, sort the preferred dialect's matches first, attach a `sourcePackId` to each rendered entry so the popup can show "from en-GB / en-US".
7. If at least one provider returned a hit → render. Otherwise return a structured "no result" value (friendly empty state).

```ts
// src/core/dictionary/resolver.ts
export interface DictionaryResolver {
  /** Returns providers to query for a given preferred dialect, in priority order. */
  providersFor(preferredDialect: string): DictionaryProvider[];
  /** Merges results from multiple providers into a single ranked entry. */
  merge(results: Array<{ pack: DictionaryProvider; entry: DictionaryEntry }>):
    DictionaryEntry & { sources: string[] };
}
```

This keeps the contract clean: `DictionaryProvider` still only knows about its own pack; the cross-dialect logic lives in one small resolver that can be unit-tested without touching SQLite.

---

## 11. Dashboard UX

The dashboard opens when the user clicks the tray icon or launches from Start Menu. It is **not** required for the lookup feature to work.

Sections, top to bottom:
1. **System health** — three indicators with green/amber/red:
   - Background agent running.
   - Global hotkey registered (and what it is).
   - Selection capture method working (UIA / clipboard fallback).
2. **Preferred dialect** — radio between installed dialects (e.g. English UK / English US). A short explainer sits next to it: *"Lookups search every English dictionary you have installed. This setting decides which spelling and pronunciation Wlook shows first when both have a match."*
3. **Installed dictionaries** — list grouped by language, with size on disk, version, and an Uninstall button per pack. Uninstalling the preferred-dialect pack auto-selects the next available dialect in the same language and tells the user.
4. **Browse dictionaries** — search box that filters the remote manifest; each row has an Install button with progress.
5. **Settings** — start on login, hotkey, popup theme, clipboard fallback toggle.
6. **About** — version, licenses, link to docs.

The dashboard is intentionally a single-window app — no tabs, no nav. Scroll to see everything.

---

## 12. Installation, updates, uninstall

- **Installer:** NSIS via electron-builder. Per-user install (no admin required) keeps things in `%LOCALAPPDATA%\Programs\Wlook` and `%APPDATA%\Wlook`.
- **First run:** dashboard opens with no dictionaries installed; prompts user to install English UK or US (or both). Downloads happen on demand to keep the installer small.
- **Auto-update:** electron-updater against GitHub Releases. Dictionary packs update independently of the app.
- **Uninstall:** removes the program directory; **prompts** whether to also delete `%APPDATA%\Wlook` (dictionaries + settings). Default: yes.

---

## 12a. Code signing (dev vs production)

Code signing is **only required for public production releases**. Day-to-day development and internal testing do not need a certificate. This section spells out the difference so we don't block ourselves early.

### 12a.1 Development builds — no certificate needed
- `npm run dev:*` runs Electron directly from source. Nothing is signed; nothing needs to be.
- `npm run package` produces an unsigned `.exe` installer in `dist/`. You can install and run it on your own machine.
- Expect a **SmartScreen** warning ("Windows protected your PC") on first run on someone else's machine. Click *More info → Run anyway*. This is normal for unsigned builds.
- Some corporate-managed machines and some antivirus products will quarantine the unsigned `.exe`. That is also expected.

**You do not need to do anything manually for dev builds.** Just `npm run package` and share the binary if needed.

### 12a.2 Production builds — certificate required
Public releases must be signed, otherwise SmartScreen turns most users away and certain antivirus engines flag the binary.

Two certificate options:

| Option | Cost (approx) | Effort | SmartScreen behaviour |
|--------|----|--------|----------------------|
| **OV (Organisation Validation) code-signing certificate** | ~$200–400 / year | Identity paperwork; certificate ships on a USB token (since Jun 2023, hardware-bound by CA/B Forum rule) | Warning until the binary "earns reputation" with downloads. |
| **EV (Extended Validation) code-signing certificate** | ~$400–700 / year | More paperwork (incl. business registration); also USB-token-bound | Instant SmartScreen reputation. Recommended if budget allows. |
| **Azure Trusted Signing** (Microsoft's managed service) | Subscription, pay-as-you-go | Lighter — Microsoft manages the key in the cloud; no USB token | Equivalent to OV; can graduate to EV-tier reputation. Worth evaluating before buying a traditional cert. |

### 12a.3 What you (the project owner) need to do manually

These are the steps **only you can do** — they involve real-world identity verification and payment.

1. **Decide on a certificate type** (OV vs EV vs Azure Trusted Signing). Recommendation: start with **Azure Trusted Signing** unless there's a reason to own a USB-token cert.
2. **Buy / provision the certificate** from a CA (DigiCert, Sectigo, SSL.com, GlobalSign) or set up Azure Trusted Signing in the Azure portal.
3. **Complete identity verification** — the CA will email you to verify business registration, address, phone. Allow 1–5 business days.
4. **Receive the certificate**:
   - Traditional CA → arrives on a **USB hardware token** with a PIN. Keep it physically safe.
   - Azure Trusted Signing → no physical token; you get an account identifier and access keys.
5. **Store secrets in CI** (GitHub Actions Secrets):
   - For USB-token CAs that support a cloud-signing service (e.g. DigiCert KeyLocker, SSL.com eSigner): store the API credentials.
   - For Azure Trusted Signing: store the Azure service principal credentials.
   - **Never** commit the certificate or PIN to the repo.
6. **Tell `electron-builder` how to sign.** In `electron-builder.yml` we configure the signing provider (`signtoolOptions` for traditional certs, or the Trusted Signing plugin for Azure). The CI workflow will pick up secrets and sign automatically on tagged releases.
7. **Test the signed build** on a fresh Windows VM. Verify with `signtool verify /pa /v wlook-setup.exe`.
8. **(Recommended)** Submit early signed builds to Microsoft's malware analysis portal to seed SmartScreen reputation faster.

### 12a.4 What the build system handles automatically
- Pulling secrets from the CI environment at release time.
- Calling `signtool` (or the Trusted Signing plugin) against the final installer **and** any nested executables (the agent, the popup helper).
- Timestamping signatures (so they remain valid after the certificate eventually expires).
- Failing the release if signing fails — no unsigned production binary should ever ship.

### 12a.5 Critical-path note
Code signing is on the **release critical path, not the development critical path**. We can build, test, demo, and run a closed beta entirely with unsigned builds. Only when we're ready to publish to the public do we need the certificate in hand.

---

## 13. Testing strategy

We will write tests as we go, not at the end.

### 13.1 Unit tests (vitest, run on every PR)
- `core/lemma/english`: irregular plurals, verb conjugations, comparatives.
- `core/dictionary/sqlite-provider`: lookup hits, misses, multi-word phrases, FTS ranking.
- `core/dictionary/resolver`: cross-dialect merge — *color* found in en-US when en-GB is preferred, *colour* found in en-US when only en-US is installed (graceful), dedupe of identical senses across packs, preferred-dialect-first ordering, `sources` array populated correctly.
- `popup/search-link`: builds the correct Google (or configured engine) URL — URL-encodes spaces, ampersands, quotes; preserves the original selection (not a lemma); honours the configured engine; opens via `shell.openExternal` (mocked in test).
- `core/dictionary/pack-manager`: install / uninstall / version comparison / checksum validation / corrupted pack handling.
- `core/config`: defaults, migration of older config shapes.
- `agent/selection-capture`: parsing rules (mocking the native call).
- IPC contract round-trip serialisation.

Target: **80% line coverage on `src/core/`**, lower targets elsewhere because UI is exercised by E2E.

### 13.2 Integration tests
- Spin up the agent in a child process, send a fake IPC `lookup` message, assert the rendered popup HTML.
- Pack-manager against a fixture remote manifest served by a local HTTP server.

### 13.3 E2E tests (playwright on Windows CI)
- Launch dashboard, install a fixture dictionary pack, run a lookup, assert popup appears with expected text.
- Hotkey path: simulate selection in Notepad via UI Automation, fire hotkey, assert popup.

### 13.4 Performance tests
- `npm run measure` — boots the agent, performs 100 lookups, asserts p95 latency and idle RSS thresholds from §7.

### 13.5 CI
GitHub Actions, Windows runner, matrix of Win10 + Win11, x64 + ARM64. Build artefacts uploaded per commit; signed releases tagged.

---

## 14. Documentation plan

Every doc has a single owner file, kept short. We avoid sprawling wikis.

- `README.md` — this file. Source of truth for product and architecture intent.
- `AGENTS.md` — see §16.
- `docs/architecture.md` — diagrams, IPC message shapes, process lifecycles.
- `docs/customisation.md` — see §15.
- `docs/packaging-a-dictionary.md` — how to use `tools/build-dictionary` to produce a `.wlpack` from a source.
- `docs/troubleshooting.md` — common issues (hotkey conflict, antivirus flag, dashboard won't open).
- `CHANGELOG.md` — Keep-a-Changelog format.
- Inline JSDoc only where it earns its keep (public exports of `src/core/`).

---

## 15. Customisation guide (icons, theme, dictionaries)

This section will be expanded into `docs/customisation.md`. The principle: **anything a power user is likely to change lives under `assets/` or is configurable via `config.json`.**

### 15.1 Replacing the icons
1. Locate `assets/icons/`:
   - `tray.ico` — system tray icon (recommended sizes: 16, 24, 32, 48).
   - `app.ico` — installer + Start Menu + taskbar (16, 32, 48, 64, 128, 256).
   - `popup-logo.svg` — small mark inside the popup header.
2. Replace the files in-place with files of the same names.
3. Rebuild with `npm run build` and `npm run package`. The installer picks up the new icons automatically — no code changes needed.

### 15.2 Changing the popup theme
Drop a CSS file into `assets/themes/` (e.g. `my-theme.css`), set `"theme": "my-theme"` in `%APPDATA%\Wlook\config.json`, and restart the agent. The popup loads the file at startup; CSS custom properties cover colours, fonts, spacing, and border radius.

### 15.3 Changing the popup's search engine
The "Search on Google" footer link is driven by `config.json`:
```json
"popupSearch": {
  "label": "Search on Google",
  "urlTemplate": "https://www.google.com/search?q={query}"
}
```
`{query}` is replaced with the URL-encoded original selection. Swap in DuckDuckGo (`https://duckduckgo.com/?q={query}`), Bing, Kagi, etc., update the label, restart the agent. No rebuild required.

### 15.4 Changing the hotkey
Edit `"hotkey"` in `config.json` (Electron accelerator syntax), or use the dashboard's Settings panel.

### 15.5 Adding your own dictionary pack (private / offline)
1. Build a `.wlpack` file with `tools/build-dictionary` from any source you have rights to.
2. Drop it into `%APPDATA%\Wlook\dictionaries\`.
3. It appears in the dashboard automatically. No code change needed.

### 15.6 Adding a new language (developer task)
1. Implement a `Lemmatizer` for the language under `src/core/lemma/<lang>.ts`.
2. Register it in `src/core/lemma/index.ts`.
3. Build the dictionary pack via the tool.
4. Add a manifest entry so it appears in the dashboard's "Browse" section.

No changes to `agent/`, `popup/`, or `dashboard/` are required.

---

## 16. AGENTS.md plan

We will create an `AGENTS.md` at repo root. Its purpose: give an AI coding agent (or a new human contributor) the minimum context to make safe changes without re-reading the entire codebase.

Planned sections:

1. **What this app is** — one paragraph, the elevator pitch from §1.1.
2. **Process model** — the three-process diagram from §4, with the explicit rule "the agent process is the only one always running."
3. **Where things live** — pointer to §9 repo layout, with a "if you're changing X, edit Y" table:
   - Adding a dictionary source → `src/core/dictionary/`
   - Adding a language → `src/core/lemma/`
   - Changing the popup look → `src/popup/` + `assets/themes/`
   - Changing what the dashboard shows → `src/dashboard/`
   - **Never** put Electron imports under `src/core/`.
4. **Invariants the agent must preserve**
   - The hard limits in §7. If a change risks them, call it out in the PR.
   - `src/core/` must remain framework-free and unit-testable in plain Node.
   - All user data stays under `%APPDATA%\Wlook\`.
   - No telemetry without an explicit opt-in.
5. **How to run things locally** — `npm install`, `npm run dev:agent`, `npm run dev:dashboard`, `npm test`, `npm run measure`.
6. **Definition of done for a change** — unit tests added, `npm test` green, `npm run measure` within budget, CHANGELOG entry, docs touched if behaviour changed.
7. **Things to ask before changing** — anything in §7 (budgets), anything that adds a new background process, anything that adds a network call from the agent.

The file should stay **under ~200 lines**. It is a map, not a manual.

---

## 17. Build plan / milestones

Rough sequencing. Each milestone ends with something runnable.

- **M0 — Skeleton (1 week)** — Repo, TypeScript, lint, vitest, electron-builder scaffold, CI on Windows. Empty agent boots and shows a tray icon. AGENTS.md drafted.
- **M1 — Core dictionary engine (1–2 weeks)** — `DictionaryProvider` + `Lemmatizer` interfaces, SQLite provider, English lemmatizer, full unit-test suite. No UI yet — driven by a CLI harness.
- **M2 — Build-dictionary tool + first pack (1–2 weeks)** — Ingest WordNet + Wiktionary, emit `en-US.wlpack`, validate size budget. Then `en-GB.wlpack`.
- **M3 — Popup + hotkey (1 week)** — Global hotkey, selection capture (UIA + clipboard fallback), frameless popup BrowserWindow, basic theme.
- **M4 — Dashboard (1–2 weeks)** — Status indicators, pack manager UI, settings, manifest fetch + install with progress.
- **M5 — Installer + auto-update (3–5 days)** — NSIS package, code signing, electron-updater wired to GitHub Releases.
- **M6 — Polish, docs, perf (1 week)** — Hit all budgets in §7, write `docs/*`, finalise AGENTS.md, beta release.

---

## 18. Open questions & risks

- **Right-click in arbitrary apps:** as discussed in §5, Windows does not offer a clean API for this. We accept that v1 leans on a global hotkey as the universal path and treats true context-menu integration as a per-host effort over time. We need to validate user acceptance of this early.
- **Dictionary licensing — final legal sign-off.** §6.3 lays out our position (CC BY-SA on the packs, MIT on the app code, attribution in About). The reasoning matches standard practice for offline dictionary apps, but before public release we should get an explicit legal/owner sign-off that we're comfortable shipping under those terms and that the "code + data is an aggregation, not a derivative" reading holds for our specific bundle.
- **Native add-ons + ARM64:** `better-sqlite3` and the key-listener libraries need ARM64 prebuilds. If unavailable, we either build them ourselves or drop ARM64 for v1.
- **Antivirus false positives:** unsigned Electron apps with global hotkey hooks are sometimes flagged. Code-signing certificate is on the critical path before public release.
- **Clipboard fallback UX:** transiently touching the user's clipboard is a real concession. We should ship it disabled by default and surface a clear toggle in Settings.
- **Memory budget vs Electron reality:** 80 MB idle is ambitious; 150 MB is the agreed hard ceiling. If a pure-Electron agent cannot stay under 150 MB during normal idle, the documented mitigation is to replace the always-on Electron agent with a **tiny native (Rust) agent** that only spawns Electron when the popup is actually needed. See below.

### 18.1 Prior art — GoldenDict
**GoldenDict** (and its active fork **GoldenDict-ng**) is an open-source, BSD-3 licensed offline dictionary lookup app for Windows / Linux / macOS. It solves the same core problem (select word → see a definition in a popup) but is aimed at power users: it loads many third-party dictionary formats (StarDict, DSL, MDX, ABBYY), expects users to source dictionaries themselves, uses a dense multi-pane Qt UI, and has no opinionated install/setup flow. Wlook differs in audience and shape — consumer-friendly, curated, one-click pack install, macOS-Look-Up-style mini popup, Electron stack — but GoldenDict is useful prior art for two things: (a) it validates the CC BY-SA "code + data is an aggregation" licensing reading, and (b) its rough edges (clunky setup, manual dictionary hunting, dated UX) are exactly the gaps Wlook is built to close.

### 18.2 The "Rust agent" fallback — what it costs us
The fallback architecture would be: a small Rust binary (~5–15 MB RAM idle) owns the tray, the global hotkey, the selection capture, and the IPC. It launches an Electron process only when a popup needs to render, and tears it down when the popup closes. The dashboard remains a normal Electron window opened on demand.

**Features that are NOT compromised** by this change:
- Right-click / hotkey lookup, popup UI, dictionary engine, dashboard, dictionary install/uninstall, customisation, auto-update, start-on-login — all unaffected. The user sees no difference.
- The module contracts in §10 are unchanged; `src/core/` is plain TypeScript and would be compiled to a Node-addon or re-implemented; the Rust agent just calls into it via IPC.

**Real costs of going Rust-agent:**
1. **Build complexity.** We add a Rust toolchain to CI and to anyone who wants to hack on the agent. The Electron-only path is a single `npm install`.
2. **First-lookup latency.** Spawning Electron on demand adds ~300–600 ms to the *first* lookup after idle. Subsequent lookups within a short window can reuse a warm renderer. We'd need to verify this fits within the 500 ms p95 budget — it might not, in which case we keep a hidden Electron renderer warm in the background, partially defeating the memory win.
3. **Two languages in the codebase.** Rust for the agent, TypeScript for everything else. Higher onboarding cost. AGENTS.md and `docs/architecture.md` get longer.
4. **Native key-listener / UIA bindings need to be redone in Rust** (or via FFI). This is straightforward — both have mature Rust crates (`windows`, `rdev`) — but it is work.
5. **Future features that assume "the agent can run JS"** become slightly harder. Examples we've discussed or are likely:
   - Plugin/extension API written in JS (e.g. user scripts that post-process definitions). Would need a JS runtime inside the Rust agent (embed QuickJS or always-warm Electron renderer).
   - Thesaurus / synonym features sharing the dictionary engine. Fine if the engine is also reachable from Rust via N-API; more work otherwise.
   - On-device ML features (e.g. smarter lemmatisation, language detection). Same story — fine, just more plumbing.

**Decision rule:** we build pure-Electron first. If `npm run measure` shows we're consistently above 150 MB idle on a clean Windows VM and we've exhausted V8/heap-tuning, *then* we cut over to the Rust-agent variant. We do not pre-optimise.
