# Troubleshooting

---

## Hotkey not working

**Symptom:** Pressing the configured hotkey does nothing.

**Causes and fixes:**

1. **Conflict with another application.** Another app, or Windows itself, has already registered the same key combination. Open the dashboard → Settings → Hotkey. The dashboard validates combinations on save and surfaces a conflict if the OS already has the bind. Pick a different combination.

2. **Accessibility permissions (macOS dev only).** On macOS, Electron apps need explicit accessibility permission to receive global shortcuts. System Settings → Privacy & Security → Accessibility → enable the entry for Wlook (or the Electron binary during development). Restart the agent after granting.

3. **Agent not running.** Check the system tray for the Wlook icon. If absent, the agent isn't running. Start it from the Start Menu (production) or `yarn dev:agent` (development).

4. **Hotkey set to `null`.** Check `%APPDATA%\Wlook\config.json` — if `"hotkey": null`, the hotkey is intentionally disabled. Set it to a valid Electron accelerator and restart.

---

## "Couldn't read selection" message

**Symptom:** The popup appears but shows "Couldn't read selection" instead of a definition.

**Causes and fixes:**

1. **UI Automation access denied.** Some applications (certain games, elevated-privilege windows) block UI Automation. There's no fix for an individual closed window from Wlook's side.

2. **Clipboard fallback is disabled.** When UI Automation fails, the agent can fall back to reading the clipboard. Off by default. Enable it in dashboard → Settings → "Use clipboard fallback for selection capture". Note: this briefly overwrites your clipboard.

3. **Nothing was selected.** Make sure text is highlighted before pressing the hotkey.

---

## Dashboard won't open

**Symptom:** Clicking the tray icon or the Start Menu entry does nothing, or the dashboard appears and disappears.

**Causes and fixes:**

1. **Agent isn't running.** No tray icon → no agent. Start from the Start Menu or `yarn dev:agent` (development).

2. **Single-instance lock.** Wlook registers a single Electron instance via `app.requestSingleInstanceLock` (`src/agent/main.ts`). If a previous instance crashed hard (kill -9, power loss), the OS-level socket the lock uses may sit in TIME_WAIT briefly. Wait ~30 s and try again, or reboot.

3. **Dashboard window moved off-screen.** If you previously moved the dashboard to a now-disconnected monitor, it may open off-screen. Today there's no persisted-bounds reset; edit `%APPDATA%\Wlook\config.json`, remove any caching keys, and restart.

---

## Antivirus quarantine (unsigned binary)

**Symptom:** Windows Defender or a third-party AV quarantines or blocks `wlook-agent.exe`.

**Explanation:** Dev builds are unsigned. Electron apps with global hotkey hooks + IPC patterns are sometimes flagged by heuristic scanners. This is expected for dev and does not indicate malware.

**Fixes:**

- **Development:** Add an exclusion for your project's `dist/` directory in your AV settings. Only for paths you control.
- **Production release:** Currently the release workflow at `.github/workflows/release.md` is a placeholder (the surrounding tooling hasn't been wired into a real `.yml`). When the pipeline runs, it supports both PFX and Azure Trusted Signing — the placeholder `.github/workflows/release.md` documents the exact secrets each path expects.

---

## Dictionary not loading

**Symptom:** A pack shows as "Installed" in the dashboard but lookups return "No definition found", or the pack doesn't appear at all after a manual drop.

**Causes and fixes:**

1. **Pack not picked up yet.** After dropping a `.wlpack` file into `dictionariesDir` manually, the agent won't see it until next restart — there is no live "Reload packs" button. Restart the agent (tray menu → Quit, then relaunch).

2. **Corrupt pack file.** Quick sanity check (replace `<file>` with your pack path):

   ```sh
   node -e "const db=require('better-sqlite3')('<file>',{readonly:true}); console.log(db.prepare('SELECT count(*) c FROM entries').get())"
   ```

   If a count comes back, the pack is at least readable. If it errors, rebuild it with `tools/build-dictionary` (see `docs/packaging-a-dictionary.md`).

3. **Language mismatch.** The lemmatizer is keyed to the pack's `metadata.language` (BCP-47 root, e.g. `en`). If a lookup hits a pack whose language has no registered lemmatizer in `src/core/lemma/index.ts`, only exact matches will be found.

4. **FTS5 index out of sync.** If the pack was modified post-creation, FTS5 may be stale. Rebuild from sources.

5. **Wrong filename on disk.** The runtime's `installPack` writes `<id>-<version>.wlpack` (see `src/core/dictionary/pack-manager.ts`). If you copy a pack manually and rename it, `scanInstalled` will still grab it (it reads `metadata.id` directly), but `getProvider` composes the path from `id` + `version` — so keep the filename convention for consistency, even though scan tolerates other names.

---

## App won't start after update

**Symptom:** After an auto-update, the agent fails to start or immediately exits.

**Causes and fixes:**

1. **Native module mismatch.** `better-sqlite3` is compiled for a specific Electron + ABI. If an update changes Electron's native-module ABI, prebuilt `better-sqlite3` may be incompatible. The installer is *supposed* to handle this via `electron-rebuild`; if it doesn't:

   - Uninstall completely — your dictionaries and config under `%APPDATA%\Wlook\` are preserved.
   - Install the latest from GitHub Releases.
   - Reinstall.

2. **Config schema mismatch.** A major-version update may have changed `config.json` field names. If the agent crashes on startup, rename `%APPDATA%\Wlook\config.json` to `config.json.bak` and restart. The agent creates a fresh default config; re-apply non-default values from the backup manually.

3. **Looking for logs.** Logs are *not* written to disk today — agent output goes to stdout/stderr. Run from a terminal (`yarn dev:agent`) to see startup messages; for production installs, the agent's `[main]` prefixed console lines appear in your terminal / Windows Event Viewer for the Electron process. There is no rotating file log yet.
