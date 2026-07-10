/**
 * wordnet-parser.ts
 *
 * Parses Open English WordNet JSON files.
 * GitHub: https://github.com/globalwordnet/english-wordnet
 *
 * Expected directory layout (a release checkout or download):
 *   <dir>/entries-n.json   — nouns
 *   <dir>/entries-v.json   — verbs
 *   <dir>/entries-a.json   — adjectives / adverbs
 *   <dir>/entries-r.json   — adverbs (some releases split these)
 *   <dir>/synsets.json     — synset definitions + examples
 *
 * Entry file shape:
 *   { "<lemma>": { "synsets": ["ewn-<id>-n", ...], "sense_ids": [...] } }
 *   (The top-level key is the lemma string.)
 *
 * Synset file shape (array of objects):
 *   [{ "id": "ewn-<id>-n", "definition": "...", "examples": ["..."], "pos": "n" }, ...]
 */

import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import type { RawEntry, RawSense } from './types.js'

// ── WordNet JSON shapes ───────────────────────────────────────────────────────

interface WnEntryRecord {
  synsets?: string[]
  sense_ids?: string[]
}

/** Top-level shape of entries-n.json / entries-v.json etc. */
type WnEntriesFile = Record<string, WnEntryRecord>

interface WnSynset {
  id: string
  definition?: string
  examples?: string[]
  pos?: string
}

// ── POS mapping ───────────────────────────────────────────────────────────────

/** Maps WordNet POS codes to human-readable strings used in the .wlpack schema. */
const POS_MAP: Record<string, string> = {
  n: 'noun',
  v: 'verb',
  a: 'adjective',
  s: 'adjective', // satellite adjective — treat the same as adjective
  r: 'adverb',
}

/**
 * Extracts the POS code from a WordNet synset id.
 * e.g. "ewn-01234567-n" → "n"
 */
function posFromId(id: string): string | undefined {
  const parts = id.split('-')
  const code = parts[parts.length - 1]
  return POS_MAP[code] ?? undefined
}

// ── Loader helpers ────────────────────────────────────────────────────────────

function loadJson<T>(path: string): T | null {
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T
  } catch {
    return null
  }
}

/**
 * Loads all synsets from <dir>/synsets.json (or a set of synset-*.json files)
 * and returns a Map keyed by synset id.
 */
function loadSynsets(dir: string): Map<string, WnSynset> {
  const map = new Map<string, WnSynset>()

  // Some releases ship a single synsets.json; others split by POS.
  const candidates = [
    join(dir, 'synsets.json'),
    join(dir, 'synsets-n.json'),
    join(dir, 'synsets-v.json'),
    join(dir, 'synsets-a.json'),
    join(dir, 'synsets-r.json'),
  ]

  for (const path of candidates) {
    const data = loadJson<WnSynset | WnSynset[]>(path)
    if (!data) continue

    const items = Array.isArray(data) ? data : [data]
    for (const s of items) {
      if (s.id) map.set(s.id, s)
    }
  }

  return map
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Parses all Open English WordNet entry files in *dir* and returns a Map
 * from lemma (lowercase) to a RawEntry.
 *
 * Words that have no definition in any linked synset are omitted.
 */
export function parseWordNet(dir: string): Map<string, RawEntry> {
  const result = new Map<string, RawEntry>()

  const synsets = loadSynsets(dir)
  if (synsets.size === 0) {
    console.warn(`[wordnet-parser] No synsets found in ${dir}. Is this the right directory?`)
  }

  const entryFiles = [
    join(dir, 'entries-n.json'),
    join(dir, 'entries-v.json'),
    join(dir, 'entries-a.json'),
    join(dir, 'entries-r.json'),
  ]

  for (const filePath of entryFiles) {
    const data = loadJson<WnEntriesFile>(filePath)
    if (!data) continue

    for (const [lemma, record] of Object.entries(data)) {
      if (!lemma || !record.synsets?.length) continue

      const senses: RawSense[] = []
      let pos: string | undefined

      for (const synsetId of record.synsets) {
        const synset = synsets.get(synsetId)
        if (!synset || !synset.definition?.trim()) continue

        if (!pos) {
          pos = posFromId(synsetId) ?? synset.pos
        }

        const example = synset.examples?.find((e) => e.trim())?.trim()
        senses.push({
          definition: synset.definition.trim(),
          ...(example ? { example } : {}),
        })
      }

      if (senses.length === 0) continue

      const headword = lemma.trim()
      const key = headword.toLowerCase()

      // If we already have an entry for this lemma (from a different POS file),
      // merge the senses rather than overwrite.
      const existing = result.get(key)
      if (existing) {
        existing.senses.push(...senses)
      } else {
        result.set(key, {
          headword,
          lemma: key,
          pos,
          senses,
          // WordNet has no dialect information — neutral by default.
          dialect: null,
        })
      }
    }
  }

  return result
}
