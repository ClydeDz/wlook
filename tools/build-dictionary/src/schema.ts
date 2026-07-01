import type Database from 'better-sqlite3'

// ── SQL strings ───────────────────────────────────────────────────────────────

export const CREATE_ENTRIES = `
CREATE TABLE IF NOT EXISTS entries (
  id       INTEGER PRIMARY KEY,
  headword TEXT NOT NULL,
  lemma    TEXT NOT NULL,
  pos      TEXT,
  ipa_uk   TEXT,
  ipa_us   TEXT
)`.trim()

export const CREATE_SENSES = `
CREATE TABLE IF NOT EXISTS senses (
  id          INTEGER PRIMARY KEY,
  entry_id    INTEGER NOT NULL REFERENCES entries(id),
  sense_order INTEGER NOT NULL,
  definition  TEXT NOT NULL,
  example     TEXT
)`.trim()

/**
 * FTS5 virtual table — headword and lemma are indexed, actual content lives in
 * the entries table.  The content= / content_rowid= directives let FTS5 share
 * storage with entries instead of duplicating it.
 */
export const CREATE_ENTRIES_FTS = `
CREATE VIRTUAL TABLE IF NOT EXISTS entries_fts
  USING fts5(headword, lemma, content='entries', content_rowid='id')
`.trim()

export const CREATE_METADATA = `
CREATE TABLE IF NOT EXISTS metadata (
  key   TEXT PRIMARY KEY,
  value TEXT
)`.trim()

// ── Trigger helpers to keep FTS in sync with entries ─────────────────────────

export const CREATE_FTS_INSERT_TRIGGER = `
CREATE TRIGGER IF NOT EXISTS entries_ai AFTER INSERT ON entries BEGIN
  INSERT INTO entries_fts(rowid, headword, lemma) VALUES (new.id, new.headword, new.lemma);
END`.trim()

export const CREATE_FTS_DELETE_TRIGGER = `
CREATE TRIGGER IF NOT EXISTS entries_ad AFTER DELETE ON entries BEGIN
  INSERT INTO entries_fts(entries_fts, rowid, headword, lemma)
    VALUES ('delete', old.id, old.headword, old.lemma);
END`.trim()

export const CREATE_FTS_UPDATE_TRIGGER = `
CREATE TRIGGER IF NOT EXISTS entries_au AFTER UPDATE ON entries BEGIN
  INSERT INTO entries_fts(entries_fts, rowid, headword, lemma)
    VALUES ('delete', old.id, old.headword, old.lemma);
  INSERT INTO entries_fts(rowid, headword, lemma) VALUES (new.id, new.headword, new.lemma);
END`.trim()

// ── Index on entries(lemma) for the fallback exact-match path ─────────────────

export const CREATE_LEMMA_INDEX = `
CREATE INDEX IF NOT EXISTS idx_entries_lemma ON entries(lemma)
`.trim()

export const CREATE_HEADWORD_INDEX = `
CREATE INDEX IF NOT EXISTS idx_entries_headword ON entries(lower(headword))
`.trim()

// ── initSchema ────────────────────────────────────────────────────────────────

/**
 * Runs all DDL statements against *db* inside a single transaction.
 * Safe to call on a fresh or partially-initialised database.
 */
export function initSchema(db: Database.Database): void {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous  = NORMAL;
    PRAGMA foreign_keys = ON;

    ${CREATE_ENTRIES}
    ;
    ${CREATE_SENSES}
    ;
    ${CREATE_ENTRIES_FTS}
    ;
    ${CREATE_METADATA}
    ;
    ${CREATE_LEMMA_INDEX}
    ;
    ${CREATE_HEADWORD_INDEX}
    ;
  `)
}
