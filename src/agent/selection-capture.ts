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
        '-NonInteractive',
        '-Command',
        script,
      ], { timeout: 2000 })

      const text = stdout.trim()
      return text.length > 0 ? text : null
    } catch {
      // UIA failed — caller decides whether to fall back
      return null
    }
  }

  /**
   * Clipboard fallback:
   * 1. Saves the current clipboard contents
   * 2. Sends Ctrl+C to the foreground app via PowerShell SendKeys
   * 3. Reads the clipboard
   * 4. Restores the original clipboard
   */
  private async captureViaClipboard(): Promise<string | null> {
    // Save original clipboard text (we can only easily round-trip text)
    const original = clipboard.readText()

    // Send Ctrl+C using PowerShell + SendKeys
    const sendScript = `
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.SendKeys]::SendWait('^c')
Start-Sleep -Milliseconds 120
`.trim()

    try {
      await execFileAsync('powershell.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        sendScript,
      ], { timeout: 1500 })
    } catch {
      // Even if SendKeys fails, try to read clipboard in case something was there
    }

    // Give the app a short moment to write to clipboard
    await new Promise<void>((resolve) => setTimeout(resolve, 150))

    const selected = clipboard.readText()

    // Restore original clipboard content
    clipboard.writeText(original)

    if (selected && selected.trim().length > 0 && selected !== original) {
      return selected.trim()
    }

    return null
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
