# Customisation Guide

Everything a power user is likely to change lives under `assets/` or is configurable via `config.json` at `%APPDATA%\Wlook\config.json` (Windows) or `~/.wlook/config.json` (dev/macOS). No rebuild is required for config changes; a restart of the agent picks them up.

---

## 15.1 Replacing the icons

Icon files live in `assets/icons/`. Replace a file in-place with one of the same name, then rebuild and repackage.

| File | Used for | Recommended sizes |
|------|----------|-------------------|
| `tray.ico` | System tray icon | 16, 24, 32, 48 px |
| `app.ico` | Installer, Start Menu, taskbar | 16, 32, 48, 64, 128, 256 px |
| `popup-logo.svg` | Small mark in popup header | Vector — renders at ~20 px |

After replacing, run:

```sh
yarn build
yarn package
```

The installer picks up the new icons automatically. No code changes are needed.

See `assets/icons/README.md` for the exact format requirements and tooling suggestions.

---

## 15.2 Changing the popup theme

1. Copy `assets/themes/default.css` to `assets/themes/<my-theme>.css`.
2. Edit the CSS custom properties in the `:root` block. All colours, spacing, border radius, and font stack are exposed as variables — you should not need to touch any other rule.
3. Set `"theme": "<my-theme>"` in `config.json`.
4. Restart the agent. The popup loads the theme file at startup.

Available built-in themes: `default`, `dark`.

The popup renderer imports the active theme at load time via `<link rel="stylesheet">` injected by the main process. You can also use a full file path as the theme value if you want to keep your theme file outside the app directory.

### Custom property reference

| Property | Default value | Description |
|----------|--------------|-------------|
| `--bg` | `#ffffff` | Card background |
| `--border` | `#e2e2e2` | Card border and divider |
| `--text` | `#1d1d1f` | Primary text |
| `--text-muted` | `#86868b` | Secondary text (source label, IPA) |
| `--text-example` | `#515154` | Example sentence text |
| `--accent` | `#0071e3` | Links and interactive elements |
| `--pos-bg` | `#f0f0f5` | Part-of-speech badge background |
| `--pos-text` | `#515154` | Part-of-speech badge text |
| `--shadow` | *(see file)* | Card drop shadow |
| `--radius` | `12px` | Card border radius |
| `--font` | system-ui stack | Font family |

---

## 15.3 Changing the popup's search engine

The footer link is driven by `config.json`:

```json
"popupSearch": {
  "label": "Search on Google",
  "urlTemplate": "https://www.google.com/search?q={query}"
}
```

`{query}` is replaced with the URL-encoded **original selection** (not the lemma). Swap in your preferred engine and label, then restart the agent. No rebuild required.

Examples:

| Engine | `urlTemplate` |
|--------|--------------|
| DuckDuckGo | `https://duckduckgo.com/?q={query}` |
| Bing | `https://www.bing.com/search?q={query}` |
| Kagi | `https://kagi.com/search?q={query}` |
| Merriam-Webster | `https://www.merriam-webster.com/dictionary/{query}` |

The link opens in the user's default browser. The popup closes immediately after the link is activated.

---

## 15.4 Changing the hotkey

**Via the dashboard:** open the dashboard → Settings → Hotkey. Click the field and press your desired key combination. The dashboard validates the combination and shows a "conflict" error if another application has already registered it.

**Via `config.json`:**

```json
"hotkey": "Ctrl+Shift+D"
```

Use [Electron accelerator syntax](https://www.electronjs.org/docs/latest/api/accelerator). Restart the agent to apply. If the combination is already registered, the agent logs a warning and falls back to no hotkey — check the dashboard's status panel.

To disable the hotkey entirely:

```json
"hotkey": null
```

---

## 15.5 Adding your own dictionary pack (private / offline)

You can install a `.wlpack` file that you have built yourself or obtained from a trusted source without going through the dashboard's public pack browser.

1. Build a `.wlpack` file with `tools/build-dictionary` (see `docs/packaging-a-dictionary.md`).
2. Drop the `.wlpack` file into `%APPDATA%\Wlook\dictionaries\` (Windows) or `~/.wlook/dictionaries/` (dev).
3. Restart the agent. There is no live "Reload packs" button today — restart picks up the new file via `PackManager.scanInstalled()`.
4. The pack appears in the dashboard automatically under "Installed".

The pack's `metadata.language` value determines which lookup group it belongs to. A pack with `language = en-XX` will be searched alongside `en-GB` and `en-US` when those are installed.

---

## 15.6 Adding a new language (developer task)

Adding a language requires a code change and a new dictionary pack:

1. **Implement a lemmatizer** under `src/core/lemma/<lang>.ts`. The file must export a class implementing the `Lemmatizer` interface from `src/core/lemma/types.ts`.

   At minimum, implement `lemmatise(word: string): string[]` returning the input word plus any morphological variants to try (e.g. for German: strip `-en`, `-t`, `-st` verb endings).

2. **Register the lemmatizer** in `src/core/lemma/index.ts`:
   ```ts
   import { DeLemmatizer } from './de.js';
   registry.set('de', new DeLemmatizer());
   ```

3. **Build the dictionary pack** using `tools/build-dictionary` (see `docs/packaging-a-dictionary.md`). Set `language` in the pack's metadata to the BCP-47 tag for your language (e.g. `de`, `fr`, `ja`).

4. **Add a manifest entry** in `packs/manifest.json` (or the hosted manifest) so the language appears in the dashboard's "Browse" section.

No changes to `src/agent/`, `src/popup/`, or `src/dashboard/` are required. The resolver picks up any registered lemmatizer automatically.
