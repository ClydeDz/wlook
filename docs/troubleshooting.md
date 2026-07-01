# Troubleshooting

---

## Hotkey not working

**Symptom:** Pressing the configured hotkey does nothing.

**Causes and fixes:**

1. **Conflict with another application.** Another app or Windows itself has already registered the same key combination. Open the dashboard → Settings → Hotkey. If there is a conflict, the field shows "Conflict detected". Pick a different combination.

2. **Accessibility permissions (macOS dev only).** On macOS, Electron apps need explicit accessibility permission to receive global shortcuts. Go to System Settings → Privacy & Security → Accessibility and enable the entry for Wlook (or the Electron binary during development). Restart the agent after granting permission.

3. **Agent not running.** Check the system tray for the Wlook icon. If it is absent, the agent is not running. Start it from the Start Menu or run `yarn dev:agent` in development.

4. **Hotkey set to `null`.** Check `%APPDATA%\Wlook\config.json` — if `"hotkey"` is `null`, the hotkey is intentionally disabled. Set it to a valid accelerator string and restart the agent.

---

## "Couldn't read selection" message

**Symptom:** The popup appears but shows "Couldn't read selection" instead of a definition.

**Causes and fixes:**

1. **UI Automation access denied.** Some applications (certain games, elevated-privilege windows) block UI Automation calls. There is no fix for this from Wlook's side for those specific windows.

2. **Clipboard fallback is disabled.** If UI Automation fails, Wlook can fall back to reading the clipboard. This is off by default. Enable it in the dashboard → Settings → "Use clipboard fallback for selection capture". Note: this briefly overwrites your clipboard contents.

3. **Nothing was selected when the hotkey was pressed.** Ensure text is highlighted before pressing the hotkey.

---

## Dashboard won't open

**Symptom:** Clicking the tray icon or the Start Menu entry does nothing, or the dashboard fails to appear.

**Causes and fixes:**

1. **Agent is not running.** No tray icon means no agent. Start Wlook from the Start Menu or run `yarn dev:agent` in development.

2. **Single-instance lock.** Wlook enforces a single agent instance. If a previous instance crashed and left a lock file, the new instance may fail silently. Restart your machine, or delete `%APPDATA%\Wlook\.lock` and try again.

3. **Dashboard window is off-screen.** If you previously moved the dashboard to a monitor that is no longer connected, it may open off-screen. Reset the window position by editing `%APPDATA%\Wlook\config.json` and removing the `"dashboardBounds"` key, then restart the agent.

---

## Antivirus quarantine (unsigned dev build)

**Symptom:** Windows Defender or a third-party antivirus quarantines or blocks the `wlook-agent.exe` binary.

**Explanation:** Development builds are unsigned. Electron apps with global hotkey hooks and named-pipe IPC are patterns that some heuristic scanners flag. This is expected for dev builds and does not indicate malware.

**Fixes:**

- **Development:** Add an exclusion for the project directory in your antivirus settings. Only do this for paths you control.
- **Production release:** The release build is code-signed with a trusted certificate (see `.github/workflows/release.yml`). Signed builds do not trigger this false positive.

---

## Dictionary not loading after install

**Symptom:** A pack appears as "Installed" in the dashboard but lookups return "No definition found."

**Causes and fixes:**

1. **Pack not registered yet.** After dropping a `.wlpack` file into the dictionaries folder manually, click "Reload packs" in the dashboard, or restart the agent.

2. **Corrupt pack file.** Verify the pack with `node tools/build-dictionary/verify.mjs <path-to-pack>`. If it reports errors, rebuild the pack.

3. **Language mismatch.** The lemmatizer is keyed to the BCP-47 language tag in the pack's `metadata`. If you are looking up a word in a pack whose language has no registered lemmatizer, only exact matches will be found. Check `src/core/lemma/index.ts` for registered languages.

4. **FTS5 index out of sync.** If the pack was modified after creation, the FTS5 index may be stale. Rebuild the pack with `tools/build-dictionary`.

---

## App won't start after update

**Symptom:** After an auto-update, the agent fails to start or immediately crashes.

**Causes and fixes:**

1. **Native module mismatch.** `better-sqlite3` and other native addons are compiled for a specific Electron version. If the update changed the Electron version, the prebuilt native modules may be incompatible. The installer should handle this, but if it fails:
   - Uninstall Wlook completely (this does not delete `%APPDATA%\Wlook\` — your dictionaries and config are preserved).
   - Download and run the latest installer from GitHub Releases.
   - Reinstall.

2. **Config schema mismatch.** A major version update may have changed `config.json` fields. If the agent crashes on startup, rename `%APPDATA%\Wlook\config.json` to `config.json.bak` and restart. The agent will create a fresh default config. Re-apply your settings from the backup.

3. **Check logs.** Agent logs are written to `%APPDATA%\Wlook\logs/`. Open the latest log file to find the specific error.
