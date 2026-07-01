export interface DictionaryEntry {
  headword: string
  pos?: string
  ipa?: { uk?: string; us?: string }
  senses: Array<{ definition: string; example?: string }>
}

export interface DictionaryProvider {
  /** Pack identifier, e.g. "en-GB", "en-US", "fr-FR" */
  readonly id: string
  readonly displayName: string
  lookup(query: string): Promise<DictionaryEntry | null>
  close(): Promise<void>
}

export interface DictionaryResolver {
  /**
   * Returns providers to query for a given preferred dialect, in priority order.
   * Includes all providers whose id shares the same language prefix.
   */
  providersFor(preferredDialect: string): DictionaryProvider[]

  /**
   * Merges results from multiple providers into a single ranked entry,
   * deduplicating by (headword, definition) and attaching a sources array.
   */
  merge(
    results: Array<{ pack: DictionaryProvider; entry: DictionaryEntry }>
  ): DictionaryEntry & { sources: string[] }
}

/**
 * Builds a URL from a template by replacing {query} with the
 * URL-encoded form of the query string.
 *
 * Example:
 *   buildSearchUrl("https://www.google.com/search?q={query}", "hello world")
 *   → "https://www.google.com/search?q=hello%20world"
 */
export function buildSearchUrl(template: string, query: string): string {
  return template.replace('{query}', encodeURIComponent(query))
}
