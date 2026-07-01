/**
 * create-fixture-db.mjs
 *
 * Creates the test fixture SQLite database at tests/fixtures/en-test.wlpack.
 * Run with: node scripts/create-fixture-db.mjs
 *
 * The file is a plain SQLite database with the .wlpack schema used by
 * SQLiteDictionaryProvider and the build-dictionary tool.
 */

import Database from 'better-sqlite3'
import { mkdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(__dirname, '..')
const fixtureDir = join(repoRoot, 'tests', 'fixtures')
const outputPath = join(fixtureDir, 'en-test.wlpack')

// ── Ensure the fixtures directory exists ──────────────────────────────────────
if (!existsSync(fixtureDir)) {
  mkdirSync(fixtureDir, { recursive: true })
  console.log(`Created directory: ${fixtureDir}`)
}

// ── Open database ─────────────────────────────────────────────────────────────
const db = new Database(outputPath)

// ── Schema ────────────────────────────────────────────────────────────────────
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous  = NORMAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS entries (
    id       INTEGER PRIMARY KEY,
    headword TEXT NOT NULL,
    lemma    TEXT NOT NULL,
    pos      TEXT,
    ipa_uk   TEXT,
    ipa_us   TEXT
  );

  CREATE TABLE IF NOT EXISTS senses (
    id          INTEGER PRIMARY KEY,
    entry_id    INTEGER NOT NULL REFERENCES entries(id),
    sense_order INTEGER NOT NULL,
    definition  TEXT NOT NULL,
    example     TEXT
  );

  CREATE VIRTUAL TABLE IF NOT EXISTS entries_fts
    USING fts5(headword, lemma, content='entries', content_rowid='id');

  CREATE TABLE IF NOT EXISTS metadata (
    key   TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_entries_lemma    ON entries(lemma);
  CREATE INDEX IF NOT EXISTS idx_entries_headword ON entries(lower(headword));
`)

// ── Fixture words ─────────────────────────────────────────────────────────────
// Each record: { headword, lemma, pos, ipa_uk, ipa_us, senses: [{definition, example}] }

const words = [
  {
    headword: 'cat',
    lemma: 'cat',
    pos: 'noun',
    ipa_uk: '/kæt/',
    ipa_us: '/kæt/',
    senses: [
      {
        definition: 'A small domesticated carnivorous mammal with soft fur, a short snout, and retractable claws.',
        example: 'She stroked the cat as it purred contentedly on her lap.',
      },
    ],
  },
  {
    headword: 'dog',
    lemma: 'dog',
    pos: 'noun',
    ipa_uk: '/dɒɡ/',
    ipa_us: '/dɑːɡ/',
    senses: [
      {
        definition: 'A domesticated carnivorous mammal that typically has a long snout, an acute sense of smell, and a barking, howling, or whining voice.',
        example: 'The dog wagged its tail when it heard the word "walk".',
      },
    ],
  },
  {
    headword: 'run',
    lemma: 'run',
    pos: 'verb',
    ipa_uk: '/rʌn/',
    ipa_us: '/rʌn/',
    senses: [
      {
        definition: 'Move at a speed faster than a walk, never having both or all feet on the ground at the same time.',
        example: 'She had to run to catch the bus.',
      },
      {
        definition: 'Be in charge of; manage or conduct.',
        example: 'He runs a small catering company.',
      },
    ],
  },
  {
    headword: 'ran',
    lemma: 'run',
    pos: 'verb',
    ipa_uk: '/ræn/',
    ipa_us: '/ræn/',
    senses: [
      {
        definition: 'Past tense of run: moved at a speed faster than a walk.',
        example: 'He ran as fast as he could to reach the finish line.',
      },
    ],
  },
  {
    headword: 'running',
    lemma: 'run',
    pos: 'verb',
    ipa_uk: '/ˈrʌnɪŋ/',
    ipa_us: '/ˈrʌnɪŋ/',
    senses: [
      {
        definition: 'Present participle of run; the action of moving at a speed faster than a walk.',
        example: 'Running every morning keeps her fit and energised.',
      },
    ],
  },
  {
    headword: 'water',
    lemma: 'water',
    pos: 'noun',
    ipa_uk: '/ˈwɔːtə/',
    ipa_us: '/ˈwɑːtər/',
    senses: [
      {
        definition: 'A colourless, transparent, odourless liquid that forms the seas, lakes, rivers, and rain, and is the basis of the fluids of living organisms.',
        example: 'They stopped to drink water from the mountain stream.',
      },
    ],
  },
  {
    headword: 'house',
    lemma: 'house',
    pos: 'noun',
    ipa_uk: '/haʊs/',
    ipa_us: '/haʊs/',
    senses: [
      {
        definition: 'A building for human habitation, especially one that is lived in by a family or small group of people.',
        example: 'They moved into their new house last spring.',
      },
    ],
  },
  {
    headword: 'beautiful',
    lemma: 'beautiful',
    pos: 'adjective',
    ipa_uk: '/ˈbjuːtɪf(ʊ)l/',
    ipa_us: '/ˈbjuːtɪf(ʊ)l/',
    senses: [
      {
        definition: 'Pleasing the senses or mind aesthetically; having qualities that delight or enchant.',
        example: 'The sunset over the mountains was absolutely beautiful.',
      },
    ],
  },
  {
    headword: 'quickly',
    lemma: 'quickly',
    pos: 'adverb',
    ipa_uk: '/ˈkwɪkli/',
    ipa_us: '/ˈkwɪkli/',
    senses: [
      {
        definition: 'At a fast speed; rapidly.',
        example: 'She quickly finished her homework before dinner.',
      },
    ],
  },
  {
    headword: 'think',
    lemma: 'think',
    pos: 'verb',
    ipa_uk: '/θɪŋk/',
    ipa_us: '/θɪŋk/',
    senses: [
      {
        definition: 'Have a particular opinion, belief, or idea about someone or something.',
        example: 'I think this is the best solution to the problem.',
      },
      {
        definition: 'Direct one\'s mind towards someone or something; use one\'s mind actively to form connected ideas.',
        example: 'She sat quietly, thinking about what to do next.',
      },
    ],
  },
  {
    headword: 'love',
    lemma: 'love',
    pos: 'noun',
    ipa_uk: '/lʌv/',
    ipa_us: '/lʌv/',
    senses: [
      {
        definition: 'An intense feeling of deep affection.',
        example: 'Their love for each other had grown stronger over the years.',
      },
    ],
  },
  {
    headword: 'time',
    lemma: 'time',
    pos: 'noun',
    ipa_uk: '/taɪm/',
    ipa_us: '/taɪm/',
    senses: [
      {
        definition: 'The indefinite continued progress of existence and events in the past, present, and future regarded as a whole.',
        example: 'Time flies when you are having fun.',
      },
      {
        definition: 'A point of time as measured in hours and minutes past midnight or noon.',
        example: 'What time does the meeting start?',
      },
    ],
  },
  {
    headword: 'color',
    lemma: 'color',
    pos: 'noun',
    ipa_uk: null,
    ipa_us: '/ˈkʌlər/',
    senses: [
      {
        definition: 'The property possessed by an object of producing different sensations on the eye as a result of the way it reflects or emits light. (American spelling.)',
        example: 'The artist mixed colors on his palette to find the perfect shade.',
      },
    ],
  },
  {
    headword: 'colour',
    lemma: 'colour',
    pos: 'noun',
    ipa_uk: '/ˈkʌlə/',
    ipa_us: null,
    senses: [
      {
        definition: 'The property possessed by an object of producing different sensations on the eye as a result of the way it reflects or emits light. (British spelling.)',
        example: 'She chose a colour scheme of soft blues and greens for the bedroom.',
      },
    ],
  },
  {
    headword: 'happy',
    lemma: 'happy',
    pos: 'adjective',
    ipa_uk: '/ˈhæpi/',
    ipa_us: '/ˈhæpi/',
    senses: [
      {
        definition: 'Feeling or showing pleasure or contentment.',
        example: 'She was happy to hear the good news.',
      },
    ],
  },
  {
    headword: 'happiness',
    lemma: 'happiness',
    pos: 'noun',
    ipa_uk: '/ˈhæpinəs/',
    ipa_us: '/ˈhæpinəs/',
    senses: [
      {
        definition: 'The state of being happy; feeling of pleasure and contentment.',
        example: 'Money cannot buy happiness.',
      },
    ],
  },
  {
    headword: 'mouse',
    lemma: 'mouse',
    pos: 'noun',
    ipa_uk: '/maʊs/',
    ipa_us: '/maʊs/',
    senses: [
      {
        definition: 'A small rodent that typically has a pointed snout, relatively large ears and eyes, and a long tail.',
        example: 'The mouse scurried across the kitchen floor.',
      },
      {
        definition: 'A small handheld device that is moved across a flat surface to move the cursor on a computer screen.',
        example: 'She clicked the mouse to open the file.',
      },
    ],
  },
  {
    headword: 'mice',
    lemma: 'mouse',
    pos: 'noun',
    ipa_uk: '/maɪs/',
    ipa_us: '/maɪs/',
    senses: [
      {
        definition: 'Plural of mouse: small rodents, or computer pointing devices.',
        example: 'The laboratory kept several mice for its experiments.',
      },
    ],
  },
  {
    headword: 'go',
    lemma: 'go',
    pos: 'verb',
    ipa_uk: '/ɡəʊ/',
    ipa_us: '/ɡoʊ/',
    senses: [
      {
        definition: 'Move from one place or point to another; travel.',
        example: 'She decided to go to the library after school.',
      },
    ],
  },
  {
    headword: 'went',
    lemma: 'go',
    pos: 'verb',
    ipa_uk: '/wɛnt/',
    ipa_us: '/wɛnt/',
    senses: [
      {
        definition: 'Past tense of go: moved or travelled from one place to another.',
        example: 'They went to the beach on a warm Saturday afternoon.',
      },
    ],
  },
  {
    headword: 'gone',
    lemma: 'go',
    pos: 'verb',
    ipa_uk: '/ɡɒn/',
    ipa_us: '/ɡɔːn/',
    senses: [
      {
        definition: 'Past participle of go: having moved or departed from a place.',
        example: 'By the time we arrived, all the cake was gone.',
      },
    ],
  },
  {
    headword: 'encyclopedia',
    lemma: 'encyclopedia',
    pos: 'noun',
    ipa_uk: '/ɪnˌsʌɪkləˈpiːdɪə/',
    ipa_us: '/ɪnˌsaɪkləˈpiːdiə/',
    senses: [
      {
        definition: 'A book or set of books giving information on many subjects or on many aspects of one subject, typically arranged alphabetically.',
        example: 'He looked up the history of ancient Rome in the encyclopedia.',
      },
    ],
  },
  {
    headword: 'serendipity',
    lemma: 'serendipity',
    pos: 'noun',
    ipa_uk: '/ˌsɛr(ə)nˈdɪpɪti/',
    ipa_us: '/ˌsɛrənˈdɪpɪti/',
    senses: [
      {
        definition: 'The occurrence and development of events by chance in a happy or beneficial way.',
        example: 'It was pure serendipity that led them to discover the hidden gem of a restaurant.',
      },
    ],
  },
  {
    headword: 'ephemeral',
    lemma: 'ephemeral',
    pos: 'adjective',
    ipa_uk: '/ɪˈfɛm(ə)r(ə)l/',
    ipa_us: '/ɪˈfɛmərəl/',
    senses: [
      {
        definition: 'Lasting for a very short time; transitory.',
        example: 'The beauty of cherry blossoms is ephemeral, lasting only a few days.',
      },
    ],
  },
  {
    headword: 'ubiquitous',
    lemma: 'ubiquitous',
    pos: 'adjective',
    ipa_uk: '/juːˈbɪkwɪtəs/',
    ipa_us: '/juːˈbɪkwɪtəs/',
    senses: [
      {
        definition: 'Present, appearing, or found everywhere.',
        example: 'Smartphones have become ubiquitous in modern society.',
      },
    ],
  },
  {
    headword: 'paradigm',
    lemma: 'paradigm',
    pos: 'noun',
    ipa_uk: '/ˈparədʌɪm/',
    ipa_us: '/ˈpærədaɪm/',
    senses: [
      {
        definition: 'A typical example or pattern of something; a pattern or model.',
        example: 'The scientific revolution represented a paradigm shift in how we understand the natural world.',
      },
    ],
  },
  {
    headword: 'book',
    lemma: 'book',
    pos: 'noun',
    ipa_uk: '/bʊk/',
    ipa_us: '/bʊk/',
    senses: [
      {
        definition: 'A written or printed work consisting of pages glued or sewn together along one side and bound in covers.',
        example: 'She stayed up late reading a book by her favourite author.',
      },
    ],
  },
  {
    headword: 'light',
    lemma: 'light',
    pos: 'noun',
    ipa_uk: '/lʌɪt/',
    ipa_us: '/laɪt/',
    senses: [
      {
        definition: 'The natural agent that stimulates sight and makes things visible.',
        example: 'The room was flooded with warm afternoon light.',
      },
      {
        definition: 'Not heavy; having little weight.',
        example: 'The bag was surprisingly light despite its size.',
      },
    ],
  },
  {
    headword: 'learn',
    lemma: 'learn',
    pos: 'verb',
    ipa_uk: '/ləːn/',
    ipa_us: '/lɜːrn/',
    senses: [
      {
        definition: 'Gain or acquire knowledge of or skill in something by study, experience, or being taught.',
        example: 'She is learning to play the piano.',
      },
    ],
  },
  {
    headword: 'language',
    lemma: 'language',
    pos: 'noun',
    ipa_uk: '/ˈlaŋɡwɪdʒ/',
    ipa_us: '/ˈlæŋɡwɪdʒ/',
    senses: [
      {
        definition: 'The method of human communication, either spoken or written, consisting of the use of words in a structured and conventional way.',
        example: 'She speaks three languages fluently.',
      },
    ],
  },
]

// ── Insert entries and senses ─────────────────────────────────────────────────

const insertEntry = db.prepare(
  `INSERT INTO entries (headword, lemma, pos, ipa_uk, ipa_us)
   VALUES (@headword, @lemma, @pos, @ipa_uk, @ipa_us)`,
)

const insertSense = db.prepare(
  `INSERT INTO senses (entry_id, sense_order, definition, example)
   VALUES (@entry_id, @sense_order, @definition, @example)`,
)

const insertAll = db.transaction(() => {
  for (const word of words) {
    const result = insertEntry.run({
      headword: word.headword,
      lemma: word.lemma,
      pos: word.pos ?? null,
      ipa_uk: word.ipa_uk ?? null,
      ipa_us: word.ipa_us ?? null,
    })

    const entryId = result.lastInsertRowid

    for (let i = 0; i < word.senses.length; i++) {
      const sense = word.senses[i]
      insertSense.run({
        entry_id: entryId,
        sense_order: i,
        definition: sense.definition,
        example: sense.example ?? null,
      })
    }
  }
})

insertAll()
console.log(`Inserted ${words.length} entries.`)

// ── Rebuild FTS5 index ────────────────────────────────────────────────────────
// content= table: FTS5 does NOT auto-update on INSERT, rebuild is required.
db.exec(`INSERT INTO entries_fts(entries_fts) VALUES ('rebuild')`)
console.log('FTS5 index rebuilt.')

// ── Metadata ──────────────────────────────────────────────────────────────────
const insertMeta = db.prepare(
  `INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)`,
)

const metaEntries = [
  ['id', 'en-test'],
  ['language', 'en'],
  ['displayName', 'Test Dictionary'],
  ['version', '1.0.0'],
  ['builtAt', new Date().toISOString()],
  ['attribution', 'Hand-crafted fixture data for unit tests'],
]

const writeMeta = db.transaction(() => {
  for (const [key, value] of metaEntries) {
    insertMeta.run(key, value)
  }
})

writeMeta()
console.log('Metadata written.')

db.close()

console.log(`\nFixture database created at:\n  ${outputPath}`)
