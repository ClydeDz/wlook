import type { DictionaryEntry, DictionaryProvider, DictionaryResolver } from './index'

type ResolvedEntry = DictionaryEntry & { sources: string[] }

/**
 * DefaultDictionaryResolver implements cross-dialect lookup and result merging.
 *
 * Rules (from README §10 / F5a):
 *   - All providers sharing the same language prefix (e.g. "en") are queried.
 *   - The preferred dialect's results are ranked first.
 *   - Results are deduplicated by (headword, definition).
 *   - Every provider id that contributed a match is listed in `sources`.
 */
export class DefaultDictionaryResolver implements DictionaryResolver {
  private readonly providers: DictionaryProvider[]
  private readonly preferredDialect: string

  constructor(providers: DictionaryProvider[], preferredDialect: string) {
    this.providers = providers
    this.preferredDialect = preferredDialect
  }

  /**
   * Returns all providers whose id shares the language prefix of the given
   * preferredDialect, with the preferred dialect's provider first.
   *
   * E.g. preferredDialect="en-GB" → language="en"
   *   → returns [en-GB provider, en-US provider] (en-GB first)
   */
  providersFor(preferredDialect: string): DictionaryProvider[] {
    const language = preferredDialect.split('-')[0].toLowerCase()

    const preferred: DictionaryProvider[] = []
    const rest: DictionaryProvider[] = []

    for (const p of this.providers) {
      const providerLanguage = p.id.split('-')[0].toLowerCase()
      if (providerLanguage !== language) continue

      if (p.id === preferredDialect) {
        preferred.push(p)
      } else {
        rest.push(p)
      }
    }

    return [...preferred, ...rest]
  }

  /**
   * Merges results from multiple providers:
   *   - Deduplicates senses by (headword + definition) across providers.
   *   - Preferred dialect's entry is the structural base (headword, pos, ipa).
   *   - `sources` lists every pack id that had a hit.
   */
  merge(
    results: Array<{ pack: DictionaryProvider; entry: DictionaryEntry }>
  ): ResolvedEntry {
    if (results.length === 0) {
      throw new Error('merge() called with empty results array')
    }

    // Base entry: first result (caller ensures preferred dialect comes first)
    const base = results[0].entry
    const sources: string[] = []
    const seenSenses = new Set<string>()

    const mergedSenses: Array<{ definition: string; example?: string }> = []

    for (const { pack, entry } of results) {
      sources.push(pack.id)

      for (const sense of entry.senses) {
        const key = `${entry.headword.toLowerCase()}|${sense.definition.toLowerCase()}`
        if (!seenSenses.has(key)) {
          seenSenses.add(key)
          mergedSenses.push(sense)
        }
      }
    }

    return {
      headword: base.headword,
      pos: base.pos,
      ipa: base.ipa,
      senses: mergedSenses,
      sources,
    }
  }

  /**
   * Full resolution pipeline:
   *   1. Gets providers for the configured preferred dialect.
   *   2. Tries the original query and each lemma against every provider.
   *   3. Collects all hits, merges and deduplicates them.
   *   4. Returns null if nothing is found.
   */
  async resolve(
    query: string,
    lemmas: string[]
  ): Promise<ResolvedEntry | null> {
    const providers = this.providersFor(this.preferredDialect)
    if (providers.length === 0) return null

    // Candidates to try: original query first, then each lemma (deduped)
    const candidates: string[] = [query]
    for (const lemma of lemmas) {
      if (!candidates.includes(lemma)) {
        candidates.push(lemma)
      }
    }

    // Collect all (pack, entry) pairs; stop at the first candidate that
    // produces at least one hit so we don't return "running" when "run" gives
    // a better result set.
    let hits: Array<{ pack: DictionaryProvider; entry: DictionaryEntry }> = []

    for (const candidate of candidates) {
      const candidateHits: Array<{ pack: DictionaryProvider; entry: DictionaryEntry }> = []

      for (const provider of providers) {
        const entry = await provider.lookup(candidate)
        if (entry) {
          candidateHits.push({ pack: provider, entry })
        }
      }

      if (candidateHits.length > 0) {
        hits = candidateHits
        break
      }
    }

    if (hits.length === 0) return null

    return this.merge(hits)
  }
}
