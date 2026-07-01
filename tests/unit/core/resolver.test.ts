import { describe, it, expect, vi } from 'vitest'
import { DefaultDictionaryResolver } from '../../../src/core/dictionary/resolver'
import type { DictionaryProvider, DictionaryEntry } from '../../../src/core/dictionary/index'

function makeEntry(headword: string, definition = 'a definition'): DictionaryEntry {
  return {
    headword,
    senses: [{ definition }],
  }
}

const colourEntry = makeEntry('colour', 'British spelling of color')
const colorEntry = makeEntry('color', 'A hue or shade')

const mockGBProvider: DictionaryProvider = {
  id: 'en-GB',
  displayName: 'English (UK)',
  lookup: vi.fn(async (query: string) => {
    if (query === 'colour') return colourEntry
    return null
  }),
  close: vi.fn(async () => {}),
}

const mockUSProvider: DictionaryProvider = {
  id: 'en-US',
  displayName: 'English (US)',
  lookup: vi.fn(async (query: string) => {
    if (query === 'color') return colorEntry
    return null
  }),
  close: vi.fn(async () => {}),
}

describe('DefaultDictionaryResolver', () => {
  describe('providersFor', () => {
    it('providersFor("en-GB") with both installed → returns [en-GB, en-US] (GB first)', () => {
      const resolver = new DefaultDictionaryResolver([mockGBProvider, mockUSProvider], 'en-GB')
      const providers = resolver.providersFor('en-GB')
      expect(providers[0].id).toBe('en-GB')
      expect(providers[1].id).toBe('en-US')
      expect(providers).toHaveLength(2)
    })

    it('providersFor("en-US") with both installed → returns [en-US, en-GB] (US first)', () => {
      const resolver = new DefaultDictionaryResolver([mockGBProvider, mockUSProvider], 'en-US')
      const providers = resolver.providersFor('en-US')
      expect(providers[0].id).toBe('en-US')
      expect(providers).toHaveLength(2)
    })
  })

  describe('resolve', () => {
    it('with [en-GB, en-US] and en-GB preferred: resolve("colour", ["colour"]) → finds result, sources includes "en-GB"', async () => {
      const resolver = new DefaultDictionaryResolver([mockGBProvider, mockUSProvider], 'en-GB')
      const result = await resolver.resolve('colour', ['colour'])
      expect(result).not.toBeNull()
      expect(result!.sources).toContain('en-GB')
    })

    it('with [en-GB, en-US] and en-GB preferred: resolve("color", ["color"]) → finds result in en-US (cross-dialect), sources includes "en-US"', async () => {
      const resolver = new DefaultDictionaryResolver([mockGBProvider, mockUSProvider], 'en-GB')
      const result = await resolver.resolve('color', ['color'])
      expect(result).not.toBeNull()
      expect(result!.sources).toContain('en-US')
    })

    it('with only en-US installed but en-GB preferred: resolve("color", ["color"]) → still finds en-US result (graceful fallback)', async () => {
      const resolver = new DefaultDictionaryResolver([mockUSProvider], 'en-GB')
      // en-GB preferred but only en-US is available
      const result = await resolver.resolve('color', ['color'])
      expect(result).not.toBeNull()
      expect(result!.sources).toContain('en-US')
    })

    it('sources[] in merged result lists the packs that had a hit', async () => {
      const resolver = new DefaultDictionaryResolver([mockGBProvider, mockUSProvider], 'en-GB')
      const result = await resolver.resolve('colour', ['colour'])
      expect(result).not.toBeNull()
      expect(Array.isArray(result!.sources)).toBe(true)
      expect(result!.sources.length).toBeGreaterThan(0)
    })

    it('resolve("xyz_nope", ["xyz_nope"]) → returns null when no provider has a hit', async () => {
      const resolver = new DefaultDictionaryResolver([mockGBProvider, mockUSProvider], 'en-GB')
      const result = await resolver.resolve('xyz_nope', ['xyz_nope'])
      expect(result).toBeNull()
    })
  })

  describe('merge', () => {
    it('merges results from both providers, deduplicating identical senses', () => {
      const resolver = new DefaultDictionaryResolver([mockGBProvider, mockUSProvider], 'en-GB')

      const sharedSense = { definition: 'shared definition' }
      const entryA: DictionaryEntry = { headword: 'test', senses: [sharedSense] }
      const entryB: DictionaryEntry = { headword: 'test', senses: [sharedSense, { definition: 'extra sense' }] }

      const merged = resolver.merge([
        { pack: mockGBProvider, entry: entryA },
        { pack: mockUSProvider, entry: entryB },
      ])

      // Shared sense should appear only once
      const matchingDefs = merged.senses.filter((s) => s.definition === 'shared definition')
      expect(matchingDefs).toHaveLength(1)

      // Extra sense should appear
      expect(merged.senses.some((s) => s.definition === 'extra sense')).toBe(true)

      // Sources should include both packs
      expect(merged.sources).toContain('en-GB')
      expect(merged.sources).toContain('en-US')
    })

    it('merge throws when called with empty array', () => {
      const resolver = new DefaultDictionaryResolver([], 'en-GB')
      expect(() => resolver.merge([])).toThrow()
    })
  })
})
