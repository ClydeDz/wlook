import { describe, it, expect } from 'vitest'
import { buildSearchUrl } from '../../../src/core/dictionary/index'

describe('buildSearchUrl', () => {
  it('"hello world" with Google template → encodes space as %20', () => {
    const url = buildSearchUrl('https://www.google.com/search?q={query}', 'hello world')
    expect(url).toBe('https://www.google.com/search?q=hello%20world')
  })

  it('"AT&T" → properly encodes &', () => {
    const url = buildSearchUrl('https://www.google.com/search?q={query}', 'AT&T')
    expect(url).toContain('AT%26T')
    expect(url).not.toContain('AT&T')
  })

  it('"don\'t" → query is embedded in the URL', () => {
    const url = buildSearchUrl('https://www.google.com/search?q={query}', "don't")
    // encodeURIComponent does NOT encode apostrophes (they are unreserved),
    // but the URL should still be valid and contain the word
    expect(url).toContain("don")
    expect(url).not.toContain('{query}')
    // Verify it starts with the expected base URL
    expect(url.startsWith('https://www.google.com/search?q=')).toBe(true)
  })

  it('DuckDuckGo template works', () => {
    const url = buildSearchUrl('https://duckduckgo.com/?q={query}', 'hello world')
    expect(url).toBe('https://duckduckgo.com/?q=hello%20world')
  })

  it('{query} is replaced exactly once', () => {
    const url = buildSearchUrl('https://example.com/?q={query}', 'test')
    // Should not contain any remaining {query} placeholders
    expect(url).not.toContain('{query}')
    expect(url).toBe('https://example.com/?q=test')
  })

  it('empty string query → still produces valid URL', () => {
    const url = buildSearchUrl('https://www.google.com/search?q={query}', '')
    expect(url).toBe('https://www.google.com/search?q=')
    expect(typeof url).toBe('string')
  })

  it('query with special characters is properly encoded', () => {
    const url = buildSearchUrl('https://www.google.com/search?q={query}', 'C++ programming')
    expect(url).toContain('C%2B%2B')
    expect(url).toContain('programming')
  })

  it('template without {query} returns template unchanged', () => {
    const template = 'https://www.google.com/search'
    const url = buildSearchUrl(template, 'hello')
    expect(url).toBe(template)
  })
})
