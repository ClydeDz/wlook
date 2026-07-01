/**
 * writer.ts
 *
 * Writes a collection of RawEntry objects into an initialised .wlpack SQLite
 * database and populates the FTS5 index and metadata table.
 *
 * All inserts are wrapped in a single transaction for maximum throughput.
 */

import type Database from 'better-sqlite3'
import type { RawEntry } from './types.js'

// ── writePack ─────────────────────────────────────────────────────────────────

/**
 * Inserts *entries* and the associated senses into *db*, then rebuilds the
 * FTS5 virtual table and writes all *metadata* key/value pairs.
 *
 * The database must already have the schema applied (call initSchema first).
 *
 * @param db       An open, writable better-sqlite3 Database instance.
 * @param entries  All entries to insert.
 * @param metadata Key/value pairs written to the metadata table.
 *                 Recommended keys: id, language, displayName, version,
 *                 builtAt, attribution.
 */
export function writePack(
  db: Database.Database,
  entries: RawEntry[],
  metadata: Record<string, string>,
): void {
  const insertEntry = db.prepare<
    [string, string, string | null, string | null, string | null],
    { lastInsertRowid: number }
  >(
    `INSERT INTO entries (headword, lemma, pos, ipa_uk, ipa_us)
     VALUES (?, ?, ?, ?, ?)`,
  )

  const insertSense = db.prepare<[number, number, string, string | null]>(
    `INSERT INTO senses (entry_id, sense_order, definition, example)
     VALUES (?, ?, ?, ?)`,
  )

  const insertMeta = db.prepare<[string, string]>(
    `INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)`,
  )

  // ── Single transaction: entries + senses ──────────────────────────────────
  const writeAll = db.transaction(() => {
    for (const entry of entries) {
      const result = insertEntry.run(
        entry.headword,
        entry.lemma,
        entry.pos ?? null,
        entry.ipa_uk ?? null,
        entry.ipa_us ?? null,
      )

      const entryId = Number(result.lastInsertRowid)

      for (let i = 0; i < entry.senses.length; i++) {
        const sense = entry.senses[i]!
        insertSense.run(entryId, i, sense.definition, sense.example ?? null)
      }
    }
  })

  writeAll()

  // ── Rebuild FTS5 index ────────────────────────────────────────────────────
  // The content= table means FTS5 does NOT auto-update on INSERT —
  // we must trigger a full rebuild after loading data.
  db.exec(`INSERT INTO entries_fts(entries_fts) VALUES ('rebuild')`)

  // ── Metadata ──────────────────────────────────────────────────────────────
  const writeMeta = db.transaction(() => {
    for (const [key, value] of Object.entries(metadata)) {
      insertMeta.run(key, value)
    }
  })

  writeMeta()
}
