import Database from 'better-sqlite3'
import type { DictionaryEntry, DictionaryProvider } from './index'

interface EntryRow {
  id: number
  headword: string
  lemma: string
  pos: string | null
  ipa_uk: string | null
  ipa_us: string | null
}

interface SenseRow {
  definition: string
  example: string | null
}

/**
 * A DictionaryProvider backed by a .wlpack file (which is a SQLite database).
 *
 * Schema (as created by tools/build-dictionary):
 *   entries(id, headword, lemma, pos, ipa_uk, ipa_us)
 *   senses(id, entry_id, sense_order, definition, example)
 *   entries_fts USING fts5(headword, lemma, content='entries', content_rowid='id')
 *   metadata(key, value)
 */
export class SQLiteDictionaryProvider implements DictionaryProvider {
  readonly id: string
  readonly displayName: string

  private readonly packPath: string
  private db: Database.Database | null = null

  constructor(packPath: string, packId: string, displayName: string) {
    this.packPath = packPath
    this.id = packId
    this.displayName = displayName
  }

  /** Opens the database in read-only mode. Must be called before lookup(). */
  open(): void {
    this.db = new Database(this.packPath, { readonly: true })
  }

  /**
   * Looks up a query against the dictionary.
   *
   * Strategy:
   *   1. FTS5 MATCH on headword and lemma (fast, handles morphological variants)
   *   2. Exact headword match (case-insensitive) as fallback
   *   3. Return null if no match found
   */
  async lookup(query: string): Promise<DictionaryEntry | null> {
    if (!this.db) {
      throw new Error(`SQLiteDictionaryProvider(${this.id}): call open() before lookup()`)
    }

    const normalised = query.trim().toLowerCase()
    if (!normalised) return null

    // Attempt 1: FTS5 match
    const ftsResult = this.tryFtsLookup(normalised)
    if (ftsResult) return ftsResult

    // Attempt 2: Exact case-insensitive headword match
    const exactResult = this.tryExactLookup(normalised)
    if (exactResult) return exactResult

    return null
  }

  /** Closes the database connection. */
  async close(): Promise<void> {
    if (this.db) {
      this.db.close()
      this.db = null
    }
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private tryFtsLookup(query: string): DictionaryEntry | null {
    const db = this.db!

    // Escape FTS5 special characters to avoid query-parse errors.
    // Wrap in double quotes for a phrase match, then fallback to prefix on first term.
    const escapedQuery = query.replace(/["]/g, '""')

    try {
      // Try phrase match first (most precise)
      const phraseRow = db
        .prepare<[string], EntryRow>(
          `SELECT e.id, e.headword, e.lemma, e.pos, e.ipa_uk, e.ipa_us
           FROM entries_fts
           JOIN entries e ON entries_fts.rowid = e.id
           WHERE entries_fts MATCH ?
           ORDER BY rank
           LIMIT 1`
        )
        .get(`"${escapedQuery}"`)

      if (phraseRow) {
        return this.buildEntry(phraseRow)
      }

      // Try token match (words in any order, broader)
      const tokenRow = db
        .prepare<[string], EntryRow>(
          `SELECT e.id, e.headword, e.lemma, e.pos, e.ipa_uk, e.ipa_us
           FROM entries_fts
           JOIN entries e ON entries_fts.rowid = e.id
           WHERE entries_fts MATCH ?
           ORDER BY rank
           LIMIT 1`
        )
        .get(escapedQuery)

      if (tokenRow) {
        return this.buildEntry(tokenRow)
      }
    } catch {
      // FTS query parse error — fall through to exact match
    }

    return null
  }

  private tryExactLookup(query: string): DictionaryEntry | null {
    const db = this.db!

    const row = db
      .prepare<[string], EntryRow>(
        `SELECT id, headword, lemma, pos, ipa_uk, ipa_us
         FROM entries
         WHERE lower(headword) = ?
         LIMIT 1`
      )
      .get(query)

    if (!row) return null
    return this.buildEntry(row)
  }

  private buildEntry(row: EntryRow): DictionaryEntry {
    const db = this.db!

    const senseRows = db
      .prepare<[number], SenseRow>(
        `SELECT definition, example
         FROM senses
         WHERE entry_id = ?
         ORDER BY sense_order ASC`
      )
      .all(row.id)

    const senses = senseRows.map((s) => {
      const sense: { definition: string; example?: string } = {
        definition: s.definition,
      }
      if (s.example) sense.example = s.example
      return sense
    })

    const entry: DictionaryEntry = {
      headword: row.headword,
      senses,
    }

    if (row.pos) {
      entry.pos = row.pos
    }

    if (row.ipa_uk || row.ipa_us) {
      entry.ipa = {}
      if (row.ipa_uk) entry.ipa.uk = row.ipa_uk
      if (row.ipa_us) entry.ipa.us = row.ipa_us
    }

    return entry
  }
}
