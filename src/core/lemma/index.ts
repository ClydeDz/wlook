export interface Lemmatizer {
  /** BCP-47 language tag, e.g. "en", "fr" */
  readonly language: string
  /**
   * Returns candidate base forms (lemmas) for the given word.
   * The original word is always included.
   * Results are ordered most-likely first.
   *
   * Example: lemmas("running") → ["run", "running"]
   */
  lemmas(word: string): string[]
}

// Registry of language → Lemmatizer factory
type LemmatizerFactory = () => Lemmatizer

const registry = new Map<string, LemmatizerFactory>()

/**
 * Register a Lemmatizer factory for a language tag.
 * Called at module load time by each language implementation.
 */
export function registerLemmatizer(language: string, factory: LemmatizerFactory): void {
  registry.set(language.toLowerCase(), factory)
}

/**
 * Returns a Lemmatizer for the given language, or null if none is registered.
 *
 * Example: getLemmatizer("en") → EnglishLemmatizer instance
 */
export function getLemmatizer(language: string): Lemmatizer | null {
  const key = language.toLowerCase()
  const factory = registry.get(key)
  if (!factory) return null
  return factory()
}

// Eagerly load all built-in lemmatizers so they register themselves
import './english'
