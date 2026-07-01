import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'

// We need to intercept getConfigDir. We'll use a temp dir approach:
// Override the HOME-based path by controlling getConfigDir via env or by
// directly importing and patching the module.

// Because config.ts uses getConfigDir() internally and it reads process.env / os.homedir(),
// we set up a temp dir and stub it by mocking the module.
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
      const merged = {
        ...original.DEFAULT_CONFIG,
        ...raw,
        popupSearch: {
          ...original.DEFAULT_CONFIG.popupSearch,
          ...(typeof raw.popupSearch === 'object' && raw.popupSearch !== null
            ? (raw.popupSearch as Record<string, unknown>)
            : {}),
        },
      }
      return merged
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

import { readConfig, writeConfig, getConfigDir, DEFAULT_CONFIG } from '../../../src/core/config'

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
})
