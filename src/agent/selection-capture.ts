import { clipboard } from 'electron'
import { execFile } from 'child_process'
import { promisify } from 'util'
import type { WlookConfig } from '../core/config'

const execFileAsync = promisify(execFile)

/**
 * SelectionCapture provides platform-aware selection reading.
 *
 * Windows (production):
 *   Primary: UI Automation TextPattern.GetSelection() via PowerShell
 *   Fallback (when clipboardFallback is enabled in config):
 *     Save clipboard → send Ctrl+C → read → restore
 *
 * Mac/Linux (development convenience):
 *   Read clipboard directly. The developer is expected to have already
 *   copied the text they want to test with.
 */
export class SelectionCapture {
  private config: WlookConfig
  private lastMethod: 'uia' | 'clipboard' | 'unavailable' | null = null

  constructor(config: WlookConfig) {
    this.config = config
  }

  updateConfig(config: WlookConfig): void {
    this.config = config
  }

  /**
   * Returns the method the **most recent** `capture()` call actually used,
   * or `null` if no capture has been attempted yet. Surfaced via
   * `get-status` so the dashboard's System Health "Selection capture"
   * row reflects runtime behaviour — not configured mode.
   *
   * `'unavailable'` is returned whenever a capture produced no selection,
   * regardless of which path was attempted: if UIA failed and the
   * clipboard fallback also returned null (or fallback was disabled),
   * the agent fundamentally could not read the selection, and the
   * dashboard should show the red dot.
   */
  getLastMethod(): 'uia' | 'clipboard' | 'unavailable' | null {
    return this.lastMethod
  }

  /**
   * Returns the current selection string, or null if not available.
   */
  async capture(): Promise<string | null> {
    if (process.platform === 'win32') {
      return this.captureWindows()
    }
    // Mac/Linux: dev convenience — read clipboard directly
    return this.captureClipboardDirect()
  }

  // ── Windows ──────────────────────────────────────────────────────────────

  private async captureWindows(): Promise<string | null> {
    // Try UIA first (preferred — does not touch the clipboard)
    const uiaResult = await this.captureViaUIA()
    if (uiaResult !== null && uiaResult.trim().length > 0) {
      this.lastMethod = 'uia'
      return uiaResult.trim()
    }

    // If UIA failed and clipboard fallback is enabled, use it
    if (this.config.clipboardFallback) {
      const cbResult = await this.captureViaClipboard()
      if (cbResult !== null) {
        console.log('[SelectionCapture] Used clipboard fallback to capture selection')
        this.lastMethod = 'clipboard'
        return cbResult
      }
      // Clipboard fallback ran but produced nothing — capture fundamentally failed
      this.lastMethod = 'unavailable'
      return null
    }

    // UIA failed and no fallback is enabled — capture fundamentally failed
    this.lastMethod = 'unavailable'
    return null
  }

  /**
   * Reads the focused element's selected text via UI Automation TextPattern.
   * Runs a small PowerShell snippet and parses stdout.
   *
   * PowerShell invocation deliberately drops the `-NonInteractive` flag.
   * On a subset of Windows builds (especially those where the parent
   * Electron process is running in a constrained session or under
   * `-NoProfile` constraints), `-NonInteractive` silently disables the
   * `System.Windows.Forms.SendKeys` synchronisation primitives and a
   * number of related cross-process message-pump features, which spills
   * over to UIA cross-process reads through the same plumbing in
   * practice. We keep `-NoProfile` (for deterministic prompt loading)
   * and substitute `-WindowStyle Hidden` so the brief PowerShell host
   * window never flashes on screen.
   */
  private async captureViaUIA(): Promise<string | null> {
    const script = `
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
try {
  $focused = [System.Windows.Automation.AutomationElement]::FocusedElement
  if ($null -eq $focused) { exit 1 }
  $textPattern = $focused.GetCurrentPattern([System.Windows.Automation.TextPattern]::Pattern)
  $selection = $textPattern.GetSelection()
  if ($selection.Count -eq 0) { exit 1 }
  $text = $selection[0].GetText(-1)
  Write-Output $text
} catch {
  exit 1
}
`.trim()

    try {
      const { stdout } = await execFileAsync('powershell.exe', [
        '-NoProfile',
        '-WindowStyle',
        'Hidden',
        '-Command',
        script,
      ], { timeout: 2000 })

      const text = stdout.trim()
      return text.length > 0 ? text : null
    } catch (err) {
      // Surface the failure instead of swallowing it. Without this log,
      // every PowerShell exit-code-1 (e.g. expanded UIA guard clauses
      // — `$null -eq $focused`, `$selection.Count -eq 0`) was
      // indistinguishable from "no text selected", defeating the
      // fallback path's ability to tell "UIA failed, try clipboard"
      // apart from "both paths failed". It would also mask the common
      // case where PowerShell never even spawned because of a
      // `-NonInteractive` blocking-session side effect.
      const message = err instanceof Error ? err.message : String(err)
      console.warn('[SelectionCapture] UIA PowerShell failed:', message)
      return null
    }
  }

  /**
   * Clipboard fallback with sentinel-based disambiguation:
   * 1. Snapshots the current clipboard contents as `original`.
   * 2. Writes a unique sentinel string to the clipboard *before* Ctrl+C.
   * 3. Sends Ctrl+C to the foreground app via PowerShell SendKeys.
   * 4. Reads the clipboard as `selected`.
   * 5. Restores `original` on the clipboard.
   * 6. Returns based on what is now on the clipboard:
   *      - sentinel survived → foreground didn't process Ctrl+C → null
   *      - empty after Ctrl+C → no text → null
   *      - text matches `original` → user re-selected same word → trim
   *      - any other text → fresh new selection → trim
   *
   * PowerShell invocation drops `-NonInteractive` for the same reason as
   * `captureViaUIA()` (it silently disables SendKeys synchronisation on a
   * subset of Windows builds). `-WindowStyle Hidden` keeps the brief
   * PowerShell host window out of the user's screen.
   */
  private async captureViaClipboard(): Promise<string | null> {
    // Snapshot current clipboard so we can restore it after capture.
    const original = clipboard.readText()

    // Sentinel: a unique marker we place on the clipboard *before* the
    // Ctrl+C. After capture, three possibilities for `selected`:
    //   - sentinel survived → foreground app did not process Ctrl+C
    //     (focus stolen by our lingering popup; an accessibility
    //     hook swallowed the keystroke; the foreground explicitly
    //     ignores Ctrl+C; etc.) → real failure, return null
    //   - equals `original` → user re-selected the same word that
    //     happened to be on the clipboard already → legitimate hit
    //   - anything else → fresh new selection → legitimate hit
    // Without the sentinel we cannot distinguish the first case from
    // the second; the historical strict-bail missed the second case,
    // and my prior loose-bail silently returned stale content for
    // the first case, both regressions of the original code.
    const sentinel = `__wlook_sentinel_${Date.now()}_${Math.random().toString(36).slice(2, 10)}__`
    clipboard.writeText(sentinel)

    // Inject Ctrl+C via Win32 `keybd_event` P/Invoke. Why this and not the
    // alternatives:
    //
    //  * `WM_COPY` (`SendMessage`) — works for native Win32 edit controls
    //    (Notepad, RichEdit) because they have a `WndProc` that handles the
    //    message directly. It does NOT work for Chromium-rendered surfaces
    //    (Chrome's browser body, VS Code's Monaco editor, Electron apps)
    //    because their top-level HWND is a Chrome_WidgetWin_* whose WndProc
    //    ignores WM_COPY for page content — Chromium routes clipboard copy
    //    through its accelerator chain built on real keyboard events. This
    //    was the iter-5 fix's cap: it landed Notepad but lost Chrome.
    //
    //  * PowerShell `SendKeys` (`[System.Windows.Forms.SendKeys]::SendWait('^c')`)
    //    — synthesises a keystroke but goes through the SendKeys path, which
    //    on this install doesn't reliably reach the foreground window when
    //    invoked from an Electron child PowerShell. Was the iter-3 failure.
    //
    //  * `keybd_event` (this iteration) — a raw Win32 API that synthesises a
    //    hardware-level input event bypassing SendKeys/SendMessage entirely.
    //    The keystroke is visible to every app's accelerator manager across
    //    sessions, so native edit controls receive Ctrl+C through Translate
    //    accelerator dispatch AND Chromium surfaces receive it through
    //    `views::AcceleratorManager`. The sentinel still tells us whether
    //    anything overwrote it: if the foreground app processed Ctrl+C, the
    //    sentinel is gone and we get a fresh selection; if not (no focused
    //    text control, UIPI block, focus retained by our own popup), the
    //    sentinel survives and we fall through to `null`.
    //
    // We also emit diagnostic lines (`WLOOK_FOCUS_HWND=…`, `WLOOK_FOCUS_PID=…`,
    // `WLOOK_FOCUS_TITLE=…`, `WLOOK_FOCUS_CLASS=…`) so the operator can see
    // exactly which window was foregrounded when capture fails. If the
    // diagnostic shows our own popup-process HWND, that points to a
    // different fix (force the popup to lose focus before capture).
    const sendScript = `
Add-Type -ReferencedAssemblies System.Windows.Forms,System.Drawing @'
using System;
using System.Runtime.InteropServices;
public class W {
    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    public static extern int GetWindowText(IntPtr hWnd, System.Text.StringBuilder lpString, int nMaxCount);
    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    public static extern int GetClassName(IntPtr hWnd, System.Text.StringBuilder lpClassName, int nMaxCount);
    [DllImport("user32.dll")]
    public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, IntPtr dwExtraInfo);
}
'@
$hwnd = [W]::GetForegroundWindow()
Write-Output "WLOOK_FOCUS_HWND=$hwnd"
if ($hwnd -eq [IntPtr]::Zero) { exit 0 }
$fgPid = 0
[W]::GetWindowThreadProcessId($hwnd, [ref]$fgPid) | Out-Null
Write-Output "WLOOK_FOCUS_PID=$fgPid"
$sbTitle = New-Object System.Text.StringBuilder 256
[W]::GetWindowText($hwnd, $sbTitle, 256) | Out-Null
Write-Output "WLOOK_FOCUS_TITLE=$($sbTitle.ToString())"
$sbClass = New-Object System.Text.StringBuilder 256
[W]::GetClassName($hwnd, $sbClass, 256) | Out-Null
Write-Output "WLOOK_FOCUS_CLASS=$($sbClass.ToString())"
# Synthesise Ctrl+C at the hardware-input layer via keybd_event.
# Works for native edit controls (translated by their accelerator
# table) AND Chromium-rendered surfaces (registered in
# views::AcceleratorManager). 50ms gaps so the foreground input
# thread can land each event without coalescing them.
$VK_CONTROL = 0x11
$VK_C = 0x43
$KEYUP = 0x0002
[W]::keybd_event($VK_CONTROL, 0, 0, [IntPtr]::Zero) | Out-Null
Start-Sleep -Milliseconds 50
[W]::keybd_event($VK_C, 0, 0, [IntPtr]::Zero) | Out-Null
Start-Sleep -Milliseconds 50
[W]::keybd_event($VK_C, 0, $KEYUP, [IntPtr]::Zero) | Out-Null
Start-Sleep -Milliseconds 50
[W]::keybd_event($VK_CONTROL, 0, $KEYUP, [IntPtr]::Zero) | Out-Null
Start-Sleep -Milliseconds 200
`.trim()

    try {
      const { stdout } = await execFileAsync('powershell.exe', [
        '-NoProfile',
        '-WindowStyle',
        'Hidden',
        '-Command',
        sendScript,
      ], { timeout: 1500 })

      // Forward the diagnostic lines emitted by the script so the
      // operator can see EXACTLY which HWND / PID / title / class we're
      // sending WM_COPY to. If capture then fails (sentinel still
      // present), the diagnostic readout says whether the foreground
      // was our own popup, a non-edit Win32 control, or something else
      // — each case has a different remediation.
      for (const line of stdout.split(/\r?\n/)) {
        if (line.startsWith('WLOOK_FOCUS_HWND=')) {
          const value = line.slice('WLOOK_FOCUS_HWND='.length)
          console.log(`[SelectionCapture] clipboard fallback: foreground HWND = ${value}`)
        } else if (line.startsWith('WLOOK_FOCUS_PID=')) {
          console.log(`[SelectionCapture] clipboard fallback: foreground owner PID = ${line.slice('WLOOK_FOCUS_PID='.length)}`)
        } else if (line.startsWith('WLOOK_FOCUS_TITLE=')) {
          console.log(`[SelectionCapture] clipboard fallback: foreground title = "${line.slice('WLOOK_FOCUS_TITLE='.length)}"`)
        } else if (line.startsWith('WLOOK_FOCUS_CLASS=')) {
          console.log(`[SelectionCapture] clipboard fallback: foreground window class = "${line.slice('WLOOK_FOCUS_CLASS='.length)}"`)
        }
      }
    } catch {
      // Even if PowerShell fails entirely the foreground app may have
      // independently overwritten our sentinel.
    }

    // Give the app a short moment to write to the clipboard.
    await new Promise<void>((resolve) => setTimeout(resolve, 150))

    const selected = clipboard.readText()

    // Restore original clipboard content BEFORE any return path so the
    // user's clipboard is unaffected.
    clipboard.writeText(original)

    if (selected === sentinel) {
      console.warn('[SelectionCapture] clipboard fallback: foreground window did not respond to Ctrl+C keystroke (no focused text control, focus retained by an overlay window, or UIPI block on input delivery)')
      return null
    }

    const trimmed = selected.trim()
    if (trimmed.length === 0) {
      console.warn('[SelectionCapture] clipboard fallback: empty after Ctrl+C')
      return null
    }

    if (selected === original) {
      console.log(`[SelectionCapture] clipboard fallback: re-selection matched existing clipboard content ("${trimmed.slice(0, 80)}")`)
    }

    return trimmed
  }

  // ── Mac / Linux (dev only) ───────────────────────────────────────────────

  /**
   * On non-Windows, simply read the clipboard. For development only.
   * The developer should copy the text they want to look up before triggering.
   */
  private captureClipboardDirect(): string | null {
    try {
      const text = clipboard.readText()
      if (text && text.trim().length > 0) {
        this.lastMethod = 'clipboard'
        return text.trim()
      }
      this.lastMethod = 'unavailable'
      return null
    } catch {
      this.lastMethod = 'unavailable'
      return null
    }
  }
}

/**
 * @deprecated Use a persistent `SelectionCapture` instance owned by `main.ts`
 * instead. The agent holds one such instance for its lifetime so the
 * runtime `lastMethod` cache updates with every capture; the one-shot
 * helper below creates a fresh instance per call and silently bypasses
 * that tracking. Kept exported for ad-hoc tests that don't care about
 * `lastMethod`. New callers in production code must NOT use this.
 */
export async function captureCurrentSelection(config: WlookConfig): Promise<string | null> {
  const capture = new SelectionCapture(config)
  return capture.capture()
}
