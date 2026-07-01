import { globalShortcut } from 'electron'

/**
 * HotkeyManager wraps Electron's globalShortcut with a cleaner API.
 * Thread-safe assumptions: all calls happen on the main thread.
 */
export class HotkeyManager {
  private currentAccelerator: string | null = null
  private triggerCallback: (() => void) | null = null

  /**
   * Registers a global hotkey accelerator string (e.g. "CommandOrControl+Shift+D").
   * Returns true on success, false if the combination is already taken or invalid.
   * If a hotkey was previously registered it is unregistered first.
   */
  register(accelerator: string): boolean {
    // Unregister any existing hotkey before re-registering
    this.unregister()

    try {
      const success = globalShortcut.register(accelerator, () => {
        this.triggerCallback?.()
      })

      if (success) {
        this.currentAccelerator = accelerator
        console.log(`[HotkeyManager] Registered hotkey: ${accelerator}`)
      } else {
        console.warn(
          `[HotkeyManager] Failed to register hotkey "${accelerator}" — already taken by another app`
        )
      }

      return success
    } catch (err) {
      console.error(`[HotkeyManager] Error registering hotkey "${accelerator}":`, err)
      return false
    }
  }

  /**
   * Unregisters the currently active hotkey (if any).
   */
  unregister(): void {
    if (this.currentAccelerator) {
      try {
        globalShortcut.unregister(this.currentAccelerator)
      } catch (err) {
        // Swallow — unregistering a key that was already unregistered is not fatal
        console.warn('[HotkeyManager] Error during unregister:', err)
      }
      console.log(`[HotkeyManager] Unregistered hotkey: ${this.currentAccelerator}`)
      this.currentAccelerator = null
    }
  }

  /**
   * Returns true if a hotkey is currently registered.
   */
  isRegistered(): boolean {
    if (!this.currentAccelerator) return false
    try {
      return globalShortcut.isRegistered(this.currentAccelerator)
    } catch {
      return false
    }
  }

  /**
   * Sets the callback invoked when the registered hotkey fires.
   * Replaces any previously set callback.
   */
  onTriggered(callback: () => void): void {
    this.triggerCallback = callback
  }
}
