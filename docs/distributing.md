# Distributing

This document captures how Wlook ships to users. Current target: **Microsoft Store**, via the **URL-hosted Win32 installer** pathway.

## Decision

The distribution strategy is staged as two phases rather than a single end state:

1. **Phase 1 (current).** Submit an unsigned NSIS `.exe` to Microsoft Store via the URL-hosted Win32 installer pathway. The Store lists the app and points users to an HTTPS URL we control; the binary itself is unsigned, so end users see SmartScreen "Unknown publisher" on install/launch.
2. **Phase 2 (next).** Apply to SignPath Foundation (free OSS cert; Wlook is MIT-licensed and on GitHub — eligible), then ship a cert-signed installer for direct distribution alongside the Store listing. Signed installer removes the SmartScreen warning and surfaces a publisher name instead.

Between phases the only thing that changes is the cert chain on the `.exe`. The build pipeline, artifact names, and `latest.yml` flow stay identical. This document's primary focus is Phase 1 (Store submission mechanics); Phase 2 is sketched below for completeness.

A future third option — the Store-native MSIX/APPX pipeline (`electron-builder --win appx`, Microsoft re-signs `com.wlook.app` with their own cert at ingest) — is the right answer if at some point SmartScreen friction warrants migration cost. Held in reserve.

## Phase plan

### Phase 1 — submit unsigned to Microsoft Store (now)

- Build → `yarn package` produces `release/Wlook Setup <version>.exe`.
- Host on HTTPS endpoint (GitHub Releases recommended — see **Hosting** below).
- Submit the versioned URL via Partner Center's URL-hosted Win32 pathway.
- Trade-off accepted: SmartScreen "Unknown publisher" warning on install/launch. The Store listing itself provides discovery + install trust (Microsoft → user hand-off), which is enough for initial distribution.

### Phase 2 — SignPath-signed direct distribution (next step)

1. **Apply to SignPath Foundation.** Eligibility checklist (all met):
   - OSI-approved license. MIT ✓ (per `package.json`).
   - Hosted on a public source-control platform. GitHub ✓ (Wlook is on `github.com/ClydeDz/wlook`).
   - Active maintainer / project activity. ✓
   - Approval timeline typically weeks-to-months; the foundation reviews manually.
2. **Wire up signing.** Once approved, signing happens out-of-band — SignPath's platform triggers the build + sign. The signed artifact replaces the unsigned one in `release/`.
3. **Distribute alongside the Store listing.** Continue shipping through Microsoft Store (Phase 1 keeps running). Add the signed installer to GitHub Releases as a direct download option. Users who come in via the Store get the unsigned path; users who download from GitHub Releases get the cert-signed path with no SmartScreen dialog.
4. **electron-updater compatibility.** `latest.yml` works for both signed and unsigned installers; the cert lives in the binary itself, not the update manifest.

### When to consider Phase 3 (MSIX)

- SmartScreen friction has become a real blocker (PRs / user reports quantify it).
- Migration cost: ~1–2 days to add `appx:` target to `electron-builder.yml`, swap publisher identity to your Partner Center reserved value, declare `runFullTrust` capability, run WACK locally, and update the submission flow.
- Phase 2 is the right next move given SignPath is cheaper and we're MIT-licensed; Phase 3 is an eventual upgrade, not a Phase 1 replacement.

---

## Why this path — vs the alternatives

| Option | Status | Reasoning |
|---|---|---|
| Direct download from our own website | Considered initially, **rejected** | Triggers SmartScreen "Unknown publisher" warning on first run until reputation accrues. Requires our own code-signing cert ($200–400/yr for EV) unless we accept the SmartScreen dialog. No discovery surface, no Store trust signal, no payment plumbing. |
| SignPath Foundation (free EV cert for OSS) | **Phase 2 — eligible** | SignPath Foundation grants free code-signing cert + HSM to OSI-licensed OSS projects. Wlook is now MIT-licensed (`package.json` `"license": "MIT"`) and is on GitHub, so we qualify. Plan: apply once Phase 1 is live, ship a cert-signed installer alongside the Store listing for direct download with no SmartScreen warning. See **Phase plan** below. |
| MSIX / APPX as a Store-native package | Deferred | Requires migrating `electron-builder.yml` off NSIS to add an `appx:` target (manifest, `identityName`, `publisher`, `runFullTrust` capability). Adds the Windows Application Certification Kit (WACK) pre-flight to the release process. Becomes the right answer once installation friction from SmartScreen matters more than migration cost. |
| **URL-hosted Win32 installer** | **Chosen** | `electron-builder.yml` already targets NSIS. Zero pipeline change. No code-sign cert required for ingestion. No capability manifest. No WACK pre-check. Microsoft's listing gives us Store discoverability and a trust badge without changing what the binary looks like. |

## Build

From project root on a Windows runner:

```sh
yarn install               # postinstall rebuilds better-sqlite3 for win32-x64
yarn build                 # compile TS, bundle renderers, copy assets
yarn test                  # unit tests must pass
yarn measure               # RAM/latency budget per AGENTS.md
yarn package               # electron-builder → release/
```

The `yarn package` script is `yarn build && electron-builder` and runs the NSIS x64 target already configured in `electron-builder.yml`.

## What ends up in `release/`

```
release/
├── Wlook Setup <version>.exe              ← this is what gets hosted (or uploaded)
├── Wlook Setup <version>.exe.blockmap    ← electron-updater differential update map
├── latest.yml                            ← electron-updater version manifest
├── win-unpacked/                         ← raw electron layout, not for direct install
└── ...
```

The version baked into the installer filename comes from `package.json` → `"version"`. For v0.3.0 the artifact is `Wlook Setup 0.3.0.exe`.

## Versioning

Before each release, bump and rebuild:

```sh
npm version patch           # 0.3.0 → 0.3.1
# or
npm version minor           # 0.3.0 → 0.4.0

yarn package                # rebuilds with the new version baked into the filename
```

Result: `release/Wlook Setup 0.3.1.exe`. The `latest.yml` next to it is regenerated and tells `electron-updater` (which is in `dependencies`) where to find the next version. This is the same release flow whether or not we ship through the Store — the URL or the GitHub download link is the only thing that changes.

## Architectures

We ship **x64 only** today. `electron-builder.yml`:

```yaml
win:
  target:
    - target: nsis
      arch: [x64]
```

Microsoft's URL-hosted Win32 pathway lists five arch slots (`x86`, `x64`, `neutral`, `ARM`, `ARM64`). We fill only the x64 slot. The store automatically matches the user's device to that installer.

If we ever want arm64:

- **Config change** is one line: `arch: [x64, arm64]`.
- `better-sqlite3` ships prebuilt binaries for `win32-x64` and `win32-arm64`, so no expansion of the native toolchain is required.
- A second `release/Wlook Setup <version>-arm64.exe` is produced alongside the x64 one and gets its own URL field in Partner Center.

Adding x86 (ia32) or 32-bit ARM is not on the roadmap. x86 covers vanishingly few users in 2026; Partner Center does not accept 32-bit ARM for hosted Win32 installers.

## Hosting

The URL we hand Partner Center must be **HTTPS**, **stable per version**, and **reachable indefinitely** (Microsoft keeps referencing it for users on older installers).

| Host | Trade-off |
|---|---|
| **GitHub Releases** (recommended for Wlook) | Free, version-tagged, HTTPS, simple `releases/download/v<version>/…` URL shape. Natural fit since the project is already on GitHub. |
| Azure Blob / S3 / Cloudflare R2 | Equivalent for-money options. Better for very large numbers of downloads where GitHub's edge quotas might matter. (Wlook's installer is ~85 MB — well within GitHub Release limits.) |
| Own static site | Fine, but adds HTTPS renewal, uptime, and CDN concerns we would otherwise inherit for free. |

Suggested URL pattern:

```
https://github.com/<owner>/wlook/releases/download/v0.3.0/Wlook%20Setup%200.3.0.exe
```

The `v<version>` segment is what makes this a "versioned URL" per Partner Center's requirement, so the URL changes when a new release ships.

## Partner Center submission

Endpoint: <https://partner.microsoft.com/dashboard/apps-and-games/overview>.

1. Reserve the product name `Wlook` and identity tied to the Partner Center account.
2. New product → **Win32 app** (not "Modern app" — that's the MSIX flow which we are deliberately *not* using here).
3. Pricing + availability → Free.
4. Properties → Age rating: 3+. (English offline dictionary lookup, no network calls in the lookup path. `AGENTS.md` invariant N7 is the canonical "no telemetry without explicit opt-in" rule and applies anywhere we ever add analytics — the Store listing does not collect telemetry on its own.)
5. Packages → **Manually provide an installer URL** → fill the per-platform slots (x86, x64, neutral, ARM, ARM64). Today only the **x64** slot is filled; leave the others empty. Microsoft auto-matches the user's device to the right one.
6. Store listing → app name, short description (≤270 chars), long description (≤10 000 chars), at least one screenshot (1366×768 minimum, more placements unlock at 1920×1080), privacy policy URL, category (`Productivity` or `Utilities`), search terms.
7. App declaration → fill out the questionnaire accurately. See the section below.
8. Submit for certification. Microsoft's automated review clears in ~1–3 days for first submission, faster afterwards.

For a new version, only the **Packages → installer URL** field changes (new `v<N.M.K>` URL) — the listing metadata stays.

## App declaration — Wlook-specific disclosures

Because `src/agent/selection-capture.ts` runs PowerShell with P/Invoke to call `keybd_event`, `GetForegroundWindow`, `GetWindowText`, `GetClassName`, `GetWindowThreadProcessId`, and uses UI Automation via `Windows.Forms.SendKeys`, Partner Center's app declaration questionnaire should be answered honestly:

- **"Does this app use accessibility APIs?"** → Yes. (`SendKeys`, UI Automation TextPattern.)
- **"Does this app use system input automation?"** → Yes. (`keybd_event` Ctrl+C for the clipboard-capture fallback path on native Win32 controls.)

Not disclosing these is worse than disclosing them — Microsoft cross-checks answers against runtime telemetry from certification runs, and a "no" with PowerShell-routed input automation in the actual app will fail review and force a re-submit. Honest disclosures pass within the standard timeline.

## SmartScreen caveats

Not code-signing means SmartScreen shows "Unknown publisher" on every launch. Partner Center accepts and lists the app anyway — the warning is a per-user friction, not a submission blocker — but for an unsigned `.exe` the dialog is essentially persistent. SmartScreen reputation accrues primarily on signed binaries, so download/install counts do not clear it. Two paths to remove it:

1. **EV or OV code-sign cert** ($200–400/yr). Removes the warning and the publisher name appears in the SmartScreen dialog instead of "Unknown". Reasonable once budget allows or install counts justify.
2. **Migrate to MSIX** (see "Decision" above) — Microsoft re-signs the package with its own cert at ingest, sidestepping SmartScreen entirely. Migrate when friction matters more than the migration cost.

We accept the SmartScreen dialog in **Phase 1**. The Phase 2 plan (SignPath-signed installer for direct download) is the concrete next move to remove it — revisit if the Store-side friction becomes a blocker before Phase 2 lands, and at that point consider Phase 3 (MSIX migration) instead.

## Installer scope and user-data placement — connection to AGENTS.md

`electron-builder.yml` sets `nsis.perMachine: false`. That is the install choice which makes the launcher's user-data land in `%APPDATA%\Wlook\` on Windows (per the AGENTS.md invariant for user-data location) instead of `%PROGRAMDATA%`. We do not change this in the Store migration; the per-user install stays so existing users' dictionaries, settings, and tray-state carry over identically.

## Future work — CI automation

A GitHub Actions workflow that on tag push runs `yarn install && yarn build && yarn test && yarn package` and attaches `release/Wlook Setup <version>.exe`, `*.blockmap`, and `latest.yml` to a GitHub Release automates the versioned URL pattern. (`yarn measure` is intentionally omitted from the CI command — per AGENTS.md it requires the agent to already be running and is operator-side, not CI-side.) Configure on tag pattern `v*` so `v0.3.0` → URL contains `v0.3.0` → the same value a user can paste straight into Partner Center. (This is a doc-level note, not a CI file — implementation deferred until we are ready to wire it up.)
