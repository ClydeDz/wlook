/**
 * Internal entry shape used throughout the build pipeline.
 * Both Kaikki and WordNet parsers produce RawEntry values;
 * the writer consumes them to populate the .wlpack SQLite schema.
 */
export interface RawSense {
  definition: string
  example?: string
}

export interface RawEntry {
  headword: string
  /** Base/lemma form — e.g. "running" → "run". Falls back to headword if unknown. */
  lemma: string
  pos?: string
  ipa_uk?: string
  ipa_us?: string
  senses: RawSense[]
  /**
   * Dialect affinity of this entry.
   * - 'en-GB'  → only emitted into the British English pack
   * - 'en-US'  → only emitted into the American English pack
   * - null     → emitted into both packs (dialect-neutral)
   */
  dialect: 'en-GB' | 'en-US' | null
}
