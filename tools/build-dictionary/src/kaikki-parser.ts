/**
 * kaikki-parser.ts
 *
 * Parses the Kaikki.org pre-parsed Wiktionary English JSONL dump.
 * Download: https://kaikki.org/dictionary/English/kaikki.org-dictionary-English.json
 *
 * Each line is a JSON object (not a JSON array), one entry per line.
 */

import { createReadStream } from 'node:fs'
import { createInterface } from 'node:readline'
import type { RawEntry, RawSense } from './types.js'

// ── Kaikki JSONL shapes ───────────────────────────────────────────────────────

interface KaikkiSound {
  ipa?: string
  tags?: string[]
  /** Some sounds carry an "audio" key instead of "ipa" — we ignore those. */
  audio?: string
}

interface KaikkiExample {
  text?: string
  ref?: string
}

interface KaikkiSense {
  glosses?: string[]
  examples?: KaikkiExample[]
  tags?: string[]
}

interface KaikkiEntry {
  word?: string
  pos?: string
  sounds?: KaikkiSound[]
  senses?: KaikkiSense[]
  tags?: string[]
}

// ── Dialect detection ─────────────────────────────────────────────────────────

/**
 * Maps top-level Kaikki entry tags to a dialect.
 * Returns null when no dialect tag is present (entry goes into both packs).
 */
function detectDialect(tags: string[] | undefined): 'en-GB' | 'en-US' | null {
  if (!tags || tags.length === 0) return null

  const t = tags.map((x) => x.toLowerCase())

  const isBritish =
    t.includes('british') ||
    t.includes('british english') ||
    t.includes('uk') ||
    t.includes('united kingdom')

  const isAmerican =
    t.includes('us') ||
    t.includes('american') ||
    t.includes('american english') ||
    t.includes('united states')

  if (isBritish && !isAmerican) return 'en-GB'
  if (isAmerican && !isBritish) return 'en-US'
  // Both tagged, or neither — treat as dialect-neutral.
  return null
}

// ── IPA extraction ────────────────────────────────────────────────────────────

function extractIpa(
  sounds: KaikkiSound[] | undefined,
): { ipa_uk?: string; ipa_us?: string } {
  if (!sounds) return {}

  let ipa_uk: string | undefined
  let ipa_us: string | undefined

  for (const sound of sounds) {
    if (!sound.ipa) continue
    const tags = (sound.tags ?? []).map((t) => t.toLowerCase())

    const isBritish =
      tags.includes('british') ||
      tags.includes('received pronunciation') ||
      tags.includes('rp') ||
      tags.includes('uk')

    const isAmerican =
      tags.includes('general american') ||
      tags.includes('us') ||
      tags.includes('american')

    if (isBritish && !ipa_uk) {
      ipa_uk = sound.ipa
    } else if (isAmerican && !ipa_us) {
      ipa_us = sound.ipa
    } else if (!isBritish && !isAmerican) {
      // Untagged pronunciation — use as fallback for whichever is still missing.
      if (!ipa_uk) ipa_uk = sound.ipa
      if (!ipa_us) ipa_us = sound.ipa
    }

    // Stop early if we have both.
    if (ipa_uk && ipa_us) break
  }

  return { ipa_uk, ipa_us }
}

// ── Sense extraction ──────────────────────────────────────────────────────────

const MIN_DEFINITION_LENGTH = 8

function extractSenses(rawSenses: KaikkiSense[] | undefined): RawSense[] {
  if (!rawSenses) return []

  const result: RawSense[] = []

  for (const s of rawSenses) {
    const gloss = (s.glosses ?? []).join(' ').trim()
    if (!gloss || gloss.length < MIN_DEFINITION_LENGTH) continue

    const example = s.examples?.find((e) => e.text && e.text.trim())?.text?.trim()

    result.push({
      definition: gloss,
      ...(example ? { example } : {}),
    })
  }

  return result
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Parses a single JSONL line from the Kaikki dump.
 * Returns null if the line should be skipped (parse error, no senses, etc.).
 */
export function parseKaikkiLine(line: string): RawEntry | null {
  const trimmed = line.trim()
  if (!trimmed) return null

  let raw: KaikkiEntry
  try {
    raw = JSON.parse(trimmed) as KaikkiEntry
  } catch {
    return null
  }

  const headword = raw.word?.trim()
  if (!headword) return null

  const senses = extractSenses(raw.senses)
  if (senses.length === 0) return null

  const dialect = detectDialect(raw.tags)
  const { ipa_uk, ipa_us } = extractIpa(raw.sounds)

  return {
    headword,
    lemma: headword.toLowerCase(),
    pos: raw.pos ?? undefined,
    ...(ipa_uk ? { ipa_uk } : {}),
    ...(ipa_us ? { ipa_us } : {}),
    senses,
    dialect,
  }
}

/**
 * Lazily yields RawEntry objects from a Kaikki JSONL file.
 * Skips lines that fail quality checks or don't match *targetDialect*.
 *
 * @param filePath      Path to the Kaikki .json JSONL file.
 * @param targetDialect Which dialect pack is being built.
 *   - 'en-GB'  → include entries tagged en-GB and dialect-neutral entries.
 *   - 'en-US'  → include entries tagged en-US and dialect-neutral entries.
 *   - 'both'   → include all entries (useful for a combined/debug pack).
 */
export async function* parseKaikkiFile(
  filePath: string,
  targetDialect: 'en-GB' | 'en-US' | 'both',
): AsyncGenerator<RawEntry> {
  const stream = createReadStream(filePath, { encoding: 'utf8' })
  const rl = createInterface({ input: stream, crlfDelay: Infinity })

  for await (const line of rl) {
    const entry = parseKaikkiLine(line)
    if (!entry) continue

    // Dialect filter.
    if (targetDialect !== 'both') {
      if (entry.dialect !== null && entry.dialect !== targetDialect) {
        // Entry is explicitly tagged for the other dialect — skip.
        continue
      }
    }

    yield entry
  }
}
