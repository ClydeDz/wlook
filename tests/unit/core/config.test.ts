import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'

// We need to intercept getConfigDir. We'll use a temp dir approach:
// Override the HOME-based path by controlling getConfigDir via env or by
// directly importing and patching the module.

// Because config.ts uses getConfigDir() internally (and the production
// readConfig binds to the un-mocked getConfigDir through module-local
// closures, so we can't safely delegate readConfig to it under vi.mock),
// we re-implement readConfig/writeConfig here with the file ops scoped to
// `tempDir`. The merge step is delegated to the production `mergeConfig`
// so the migration rules live in one place.
let tempDir: string

vi.mock('../../../src/core/config', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../src/core/config')>()

  return {
    ...original,
    getConfigDir: () => tempDir,
    readConfig: async () => {
      const configPath = path.join(tempDir, 'config.json')
      let raw: Record<string, unknown> = {}
      try {
        const text = await fs.readFile(configPath, 'utf-8')
        raw = JSON.parse(text) as Record<string, unknown>
      } catch (err: unknown) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
      }
      return original.mergeConfig(raw)
    },
    writeConfig: async (config: import('../../../src/core/config').WlookConfig) => {
      await fs.mkdir(tempDir, { recursive: true })
      const configPath = path.join(tempDir, 'config.json')
      const tmpPath = configPath + '.tmp'
      await fs.writeFile(tmpPath, JSON.stringify(config, null, 2), 'utf-8')
      await fs.rename(tmpPath, configPath)
    },
  }
})

import {
  readConfig,
  writeConfig,
  getConfigDir,
  DEFAULT_CONFIG,
  mergeConfig,
  normaliseHotkey,
} from '../../../src/core/config'

describe('Config', () => {
  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wlook-test-'))
  })

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true })
  })

  describe('DEFAULT_CONFIG', () => {
    it('has preferredDialect field', () => {
      expect(typeof DEFAULT_CONFIG.preferredDialect).toBe('string')
      expect(DEFAULT_CONFIG.preferredDialect.length).toBeGreaterThan(0)
    })

    it('has hotkey field', () => {
      expect(typeof DEFAULT_CONFIG.hotkey).toBe('string')
      expect(DEFAULT_CONFIG.hotkey.length).toBeGreaterThan(0)
    })

    it('has hotkeyEnabled field as boolean', () => {
      expect(typeof DEFAULT_CONFIG.hotkeyEnabled).toBe('boolean')
    })

    it('has startOnLogin field as boolean', () => {
      expect(typeof DEFAULT_CONFIG.startOnLogin).toBe('boolean')
    })

    it('has clipboardFallback field as boolean', () => {
      expect(typeof DEFAULT_CONFIG.clipboardFallback).toBe('boolean')
    })

    it('has theme field as string', () => {
      expect(typeof DEFAULT_CONFIG.theme).toBe('string')
    })

    it('default theme is "system" (follow-OS)', () => {
      expect(DEFAULT_CONFIG.theme).toBe('system')
    })

    it('has popupSearch.label as string', () => {
      expect(typeof DEFAULT_CONFIG.popupSearch.label).toBe('string')
    })

    it('has popupSearch.urlTemplate as string', () => {
      expect(typeof DEFAULT_CONFIG.popupSearch.urlTemplate).toBe('string')
    })

    it('has popupDismissTimeoutMs as number', () => {
      expect(typeof DEFAULT_CONFIG.popupDismissTimeoutMs).toBe('number')
    })
  })

  describe('readConfig', () => {
    it('readConfig() with no file returns DEFAULT_CONFIG values', async () => {
      const config = await readConfig()
      expect(config.preferredDialect).toBe(DEFAULT_CONFIG.preferredDialect)
      expect(config.hotkey).toBe(DEFAULT_CONFIG.hotkey)
      expect(config.hotkeyEnabled).toBe(DEFAULT_CONFIG.hotkeyEnabled)
      expect(config.startOnLogin).toBe(DEFAULT_CONFIG.startOnLogin)
      expect(config.popupSearch.urlTemplate).toBe(DEFAULT_CONFIG.popupSearch.urlTemplate)
    })
  })

  describe('writeConfig + readConfig round-trip', () => {
    it('round-trips correctly', async () => {
      const custom = {
        ...DEFAULT_CONFIG,
        preferredDialect: 'en-US',
        hotkey: 'CommandOrControl+Shift+W',
        hotkeyEnabled: false,
        startOnLogin: false,
        theme: 'dark',
        popupSearch: {
          label: 'Search DuckDuckGo',
          urlTemplate: 'https://duckduckgo.com/?q={query}',
        },
      }

      await writeConfig(custom)
      const loaded = await readConfig()

      expect(loaded.preferredDialect).toBe('en-US')
      expect(loaded.hotkey).toBe('CommandOrControl+Shift+W')
      expect(loaded.hotkeyEnabled).toBe(false)
      expect(loaded.startOnLogin).toBe(false)
      expect(loaded.theme).toBe('dark')
      expect(loaded.popupSearch.label).toBe('Search DuckDuckGo')
      expect(loaded.popupSearch.urlTemplate).toBe('https://duckduckgo.com/?q={query}')
    })
  })

  describe('unknown key preservation', () => {
    it('readConfig() with extra unknown keys preserves them', async () => {
      // Write a config file directly with an extra unknown key
      const configPath = path.join(tempDir, 'config.json')
      const rawConfig = {
        ...DEFAULT_CONFIG,
        _customUnknownKey: 'some-value',
        _anotherKey: 42,
      }
      await fs.writeFile(configPath, JSON.stringify(rawConfig, null, 2), 'utf-8')

      const loaded = await readConfig()
      expect((loaded as Record<string, unknown>)['_customUnknownKey']).toBe('some-value')
      expect((loaded as Record<string, unknown>)['_anotherKey']).toBe(42)
    })
  })

  describe('theme migration', () => {
    it('migrates legacy theme value "default" → "system"', () => {
      // Pre-0.3 config files used "default" to mean "follow the OS".
      // The Settings dropdown only exposes 'light' | 'dark' | 'system',
      // so 'default' must be translated on read or the dropdown renders
      // unselected. Tested directly against the pure merge function so
      // the rule isn't tangled with filesystem / getConfigDir mocks.
      const merged = mergeConfig({ ...DEFAULT_CONFIG, theme: 'default' })
      expect(merged.theme).toBe('system')
    })

    it('leaves "light" and "dark" theme values untouched', () => {
      // Make sure the migration is scoped: only the legacy alias is
      // rewritten, not arbitrary explicit user choices.
      expect(mergeConfig({ ...DEFAULT_CONFIG, theme: 'light' }).theme).toBe('light')
      expect(mergeConfig({ ...DEFAULT_CONFIG, theme: 'dark' }).theme).toBe('dark')
    })

    it('falls back to DEFAULT_CONFIG.theme when raw theme is missing', () => {
      // A user with no theme key in their config.json gets the default
      // (which is now 'system'), not a stale 'default' alias.
      const merged = mergeConfig({ ...DEFAULT_CONFIG, theme: undefined })
      expect(merged.theme).toBe(DEFAULT_CONFIG.theme)
      expect(merged.theme).toBe('system')
    })
  })
})

describe('normaliseHotkey', () => {
  // Pure-function tests for the canonical-prefix rewrite. They don't
  // touch the filesystem — normaliseHotkey is exported precisely so
  // the rules can be exercised without coupling to getConfigDir mocks.

  it('returns empty string for empty / whitespace input', () => {
    expect(normaliseHotkey('')).toBe('')
    expect(normaliseHotkey('   ')).toBe('')
  })

  it('rewrites literal "Ctrl" to "CommandOrControl"', () => {
    expect(normaliseHotkey('Ctrl+Shift+D')).toBe('CommandOrControl+Shift+D')
  })

  it('is idempotent on the already-canonical form', () => {
    expect(normaliseHotkey('CommandOrControl+Shift+D')).toBe(
      'CommandOrControl+Shift+D'
    )
  })

  it('treats Control, Cmd and Command as aliases of the primary modifier', () => {
    // Electron accepts Ctrl / Control / Cmd / Command at the front of an
    // accelerator depending on platform. They all resolve to the same
    // physical key, so the canonical form is one token: CommandOrControl.
    expect(normaliseHotkey('Control+Shift+D')).toBe('CommandOrControl+Shift+D')
    expect(normaliseHotkey('Cmd+Shift+D')).toBe('CommandOrControl+Shift+D')
    expect(normaliseHotkey('Command+Shift+D')).toBe('CommandOrControl+Shift+D')
  })

  it('is case-insensitive on the primary-modifier token', () => {
    expect(normaliseHotkey('ctrl+shift+d')).toBe('CommandOrControl+Shift+D')
    expect(normaliseHotkey('CTRL+SHIFT+D')).toBe('CommandOrControl+Shift+D')
  })

  it('trims whitespace around individual tokens', () => {
    expect(normaliseHotkey(' Cmd + Shift + D ')).toBe('CommandOrControl+Shift+D')
  })

  it('deduplicates a repeated primary modifier', () => {
    expect(normaliseHotkey('Ctrl+Shift+Ctrl+D')).toBe('CommandOrControl+Shift+D')
  })

  it('preserves the Meta modifier (Win-key binding)', () => {
    // Meta is platform-specific and not interchangeable with Ctrl. A Win
    // key binding stays as Meta+… rather than being collapsed.
    expect(normaliseHotkey('Meta+Shift+D')).toBe('Meta+Shift+D')
  })

  it('upper-cases single-character action keys', () => {
    expect(normaliseHotkey('CommandOrControl+Shift+d')).toBe(
      'CommandOrControl+Shift+D'
    )
  })

  it('preserves multi-character action keys verbatim', () => {
    expect(normaliseHotkey('CommandOrControl+Shift+End')).toBe(
      'CommandOrControl+Shift+End'
    )
  })
})

describe('hotkey migration', () => {
  // End-to-end check that the read-time rewrite actually runs through
  // mergeConfig, not just in isolation. Mirrors the theme-migration
  // describe block above.

  it('rewrites legacy "Ctrl+Shift+D" to "CommandOrControl+Shift+D"', () => {
    // Configs written before this rule shipped typically hold the literal
    // "Ctrl+Shift+D" (hand-edit or the pre-canonical recorder output).
    // mergeConfig must normalise them on read so the IPC layer sees the
    // canonical token regardless of how the on-disk value was written.
    const merged = mergeConfig({ ...DEFAULT_CONFIG, hotkey: 'Ctrl+Shift+D' })
    expect(merged.hotkey).toBe('CommandOrControl+Shift+D')
  })

  it('leaves an already-canonical hotkey untouched', () => {
    const merged = mergeConfig({
      ...DEFAULT_CONFIG,
      hotkey: 'CommandOrControl+Shift+D',
    })
    expect(merged.hotkey).toBe('CommandOrControl+Shift+D')
  })

  it('falls back to DEFAULT_CONFIG.hotkey when raw hotkey is missing or non-string', () => {
    // `undefined` / missing or non-string values (e.g. accidental
    // numbers from a hand-edit) all fall back to the canonical
    // default. `null` is intentionally NOT treated as "missing" —
    // see the next test, which preserves it as the legacy disable
    // marker documented in `docs/customisation.md` §15.4.
    const merged = mergeConfig({ ...DEFAULT_CONFIG, hotkey: undefined })
    expect(merged.hotkey).toBe(DEFAULT_CONFIG.hotkey)
  })

  it('preserves explicit `null` as the legacy disable marker', () => {
    // `docs/customisation.md` §15.4 documents that `null` is a valid
    // way to disable the hotkey without flipping `hotkeyEnabled`.
    // `mergeConfig` must NOT rewrite null back to the default — that
    // would silently re-enable a hotkey the user explicitly disabled.
    // Use `hotkeyEnabled: false` for new ways to disable; `null` is
    // the legacy knob.
    const merged = mergeConfig({ ...DEFAULT_CONFIG, hotkey: null })
    expect(merged.hotkey).toBeNull()
  })
})
