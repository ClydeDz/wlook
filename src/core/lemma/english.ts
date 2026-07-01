import type { Lemmatizer } from './index'
import { registerLemmatizer } from './index'

// ── Irregular verb lookup table ────────────────────────────────────────────
// Maps every inflected form → base form.
const IRREGULAR_VERBS: Readonly<Record<string, string>> = {
  // be
  was: 'be',
  were: 'be',
  been: 'be',
  am: 'be',
  is: 'be',
  are: 'be',
  // have
  had: 'have',
  has: 'have',
  // do
  did: 'do',
  does: 'do',
  // go
  went: 'go',
  // run
  ran: 'run',
  // say
  said: 'say',
  // make
  made: 'make',
  // take
  took: 'take',
  taken: 'take',
  // come
  came: 'come',
  // know
  knew: 'know',
  known: 'know',
  // think
  thought: 'think',
  // see
  saw: 'see',
  seen: 'see',
  // find
  found: 'find',
  // tell
  told: 'tell',
  // give
  gave: 'give',
  given: 'give',
  // feel
  felt: 'feel',
  // become
  became: 'become',
  // leave
  left: 'leave',
  // mean
  meant: 'mean',
  // keep
  kept: 'keep',
  // begin
  began: 'begin',
  begun: 'begin',
  // show
  showed: 'show',
  shown: 'show',
  // hear
  heard: 'hear',
  // stand
  stood: 'stand',
  // lose
  lost: 'lose',
  // pay
  paid: 'pay',
  // meet
  met: 'meet',
  // sit
  sat: 'sit',
  // learn
  learnt: 'learn',
  // speak
  spoke: 'speak',
  spoken: 'speak',
  // lead
  led: 'lead',
  // grow
  grew: 'grow',
  grown: 'grow',
  // bring
  brought: 'bring',
  // hold
  held: 'hold',
  // write
  wrote: 'write',
  written: 'write',
  // fall
  fell: 'fall',
  fallen: 'fall',
  // send
  sent: 'send',
  // choose
  chose: 'choose',
  chosen: 'choose',
  // drive
  drove: 'drive',
  driven: 'drive',
  // buy
  bought: 'buy',
  // wear
  wore: 'wear',
  worn: 'wear',
  // get
  got: 'get',
  gotten: 'get',
  // build
  built: 'build',
  // sell
  sold: 'sell',
  // catch
  caught: 'catch',
  // throw
  threw: 'throw',
  thrown: 'throw',
  // win
  won: 'win',
  // draw
  drew: 'draw',
  drawn: 'draw',
  // hang
  hung: 'hang',
  // break
  broke: 'break',
  broken: 'break',
  // fly
  flew: 'fly',
  flown: 'fly',
  // read — "read" (past) is spelled the same; the table is here for completeness
  // but won't change the output since it maps to itself.
  // cut, hit, put, set, let — base = past = past participle (no-change verbs)
}

// ── Irregular plural nouns ─────────────────────────────────────────────────
const IRREGULAR_PLURALS: Readonly<Record<string, string>> = {
  mice: 'mouse',
  children: 'child',
  people: 'person',
  men: 'man',
  women: 'woman',
  teeth: 'tooth',
  feet: 'foot',
  geese: 'goose',
  oxen: 'ox',
  alumni: 'alumnus',
  cacti: 'cactus',
  fungi: 'fungus',
  syllabi: 'syllabus',
  criteria: 'criterion',
  phenomena: 'phenomenon',
  data: 'datum',
  media: 'medium',
  analyses: 'analysis',
  crises: 'crisis',
  theses: 'thesis',
  bases: 'basis',
  diagnoses: 'diagnosis',
  parentheses: 'parenthesis',
}

// ── Minimum stem length ────────────────────────────────────────────────────
const MIN_STEM = 3

/** True if the string has at least MIN_STEM characters. */
function validStem(s: string): boolean {
  return s.length >= MIN_STEM
}

/** Doubles the last consonant if needed: "running" suffix "-ing" → stem "run". */
function undoubleConsonant(stem: string): string[] {
  // If the stem ends in a doubled consonant (e.g. "runn"), return the undoubled version
  const len = stem.length
  if (len >= 2 && stem[len - 1] === stem[len - 2]) {
    const undoubled = stem.slice(0, len - 1)
    if (validStem(undoubled)) return [undoubled, stem]
  }
  return [stem]
}

/**
 * Strip regular suffixes and return candidate base forms.
 * Returns an empty array if no suffix matched or the stem would be too short.
 */
function stripSuffixes(word: string): string[] {
  const candidates: string[] = []

  // -ies → -y  (flies → fly)
  if (word.endsWith('ies') && validStem(word.slice(0, -3) + 'y')) {
    candidates.push(word.slice(0, -3) + 'y')
  }

  // -ves → -f or -fe  (knives → knife, leaves → leaf)
  if (word.endsWith('ves')) {
    const stem = word.slice(0, -3)
    if (validStem(stem + 'fe')) candidates.push(stem + 'fe')
    if (validStem(stem + 'f')) candidates.push(stem + 'f')
  }

  // -oes → -o  (tomatoes → tomato)
  if (word.endsWith('oes') && validStem(word.slice(0, -1))) {
    candidates.push(word.slice(0, -1))   // remove the 's' → e.g. "tomatoes" → "tomato" done via -s below
    candidates.push(word.slice(0, -3) + 'o')
  }

  // -sses → remove -ses (buses → bus)
  if (word.endsWith('sses') && validStem(word.slice(0, -2))) {
    candidates.push(word.slice(0, -2))
  }

  // -xes → remove -es  (fixes → fix)
  if (word.endsWith('xes') && validStem(word.slice(0, -2))) {
    candidates.push(word.slice(0, -2))
  }

  // -zes → remove -es  (buzzes → buzz, quizzes → quiz)
  if (word.endsWith('zes')) {
    const stem2 = word.slice(0, -2)
    if (validStem(stem2)) candidates.push(stem2)
    // undouble: "buzzes" → "buzz" (already handled), "quizzes" → "quiz"
    if (word.endsWith('zzes')) {
      const undoubled = word.slice(0, -3)
      if (validStem(undoubled)) candidates.push(undoubled)
    }
  }

  // -ches → remove -es  (matches → match)
  if (word.endsWith('ches') && validStem(word.slice(0, -2))) {
    candidates.push(word.slice(0, -2))
  }

  // -shes → remove -es  (flashes → flash)
  if (word.endsWith('shes') && validStem(word.slice(0, -2))) {
    candidates.push(word.slice(0, -2))
  }

  // -s → remove  (cats → cat); avoid words that are themselves base forms
  // Skip words ending in 'ss' (e.g. "bus", "gas" — but "bus" ends in 's' not 'ss'…
  // The heuristic: only strip trailing -s if it doesn't create a stem ending in a vowel
  // that would look wrong. Simple approach: strip and validate length only.
  if (
    word.endsWith('s') &&
    !word.endsWith('ss') &&
    validStem(word.slice(0, -1))
  ) {
    candidates.push(word.slice(0, -1))
  }

  // -ying → -y  (trying → try)
  if (word.endsWith('ying') && validStem(word.slice(0, -4) + 'y')) {
    candidates.push(word.slice(0, -4) + 'y')
  }

  // -ied → -y  (tried → try)
  if (word.endsWith('ied') && validStem(word.slice(0, -3) + 'y')) {
    candidates.push(word.slice(0, -3) + 'y')
  }

  // -ing → base  (jumping → jump; running → run via undouble; dancing → danc → dance via -e restore)
  if (word.endsWith('ing')) {
    const stem = word.slice(0, -3)
    if (validStem(stem)) {
      // Direct stem (e.g. "jump")
      candidates.push(stem)
      // Undoubled consonant (e.g. "runn" → "run")
      for (const u of undoubleConsonant(stem)) {
        if (u !== stem) candidates.push(u)
      }
      // Restore silent -e (e.g. "danc" → "dance", "mak" → "make")
      if (validStem(stem + 'e')) {
        candidates.push(stem + 'e')
      }
    }
  }

  // -ed → base  (jumped → jump; stopped → stop; danced → dance)
  if (word.endsWith('ed')) {
    const stem = word.slice(0, -2)
    if (validStem(stem)) {
      candidates.push(stem)
      for (const u of undoubleConsonant(stem)) {
        if (u !== stem) candidates.push(u)
      }
      if (validStem(stem + 'e')) {
        candidates.push(stem + 'e')
      }
    }
    // -ied is handled above; also handle -ed after dropping 'i' for -y verbs:
    // "tried" handled via -ied above already
  }

  // -er → base  (faster → fast; driver → drive)
  if (word.endsWith('er') && !word.endsWith('eer')) {
    const stem = word.slice(0, -2)
    if (validStem(stem)) {
      candidates.push(stem)
      if (validStem(stem + 'e')) candidates.push(stem + 'e')
    }
    // -ier → -y  (happier → happy)
    if (word.endsWith('ier') && validStem(word.slice(0, -3) + 'y')) {
      candidates.push(word.slice(0, -3) + 'y')
    }
  }

  // -est → base  (fastest → fast; happiest → happy)
  if (word.endsWith('est') && !word.endsWith('eest')) {
    const stem = word.slice(0, -3)
    if (validStem(stem)) {
      candidates.push(stem)
      if (validStem(stem + 'e')) candidates.push(stem + 'e')
    }
    if (word.endsWith('iest') && validStem(word.slice(0, -4) + 'y')) {
      candidates.push(word.slice(0, -4) + 'y')
    }
  }

  // -ly → base  (quickly → quick; simply → simple via restore -e)
  if (word.endsWith('ly')) {
    const stem = word.slice(0, -2)
    if (validStem(stem)) {
      candidates.push(stem)
      if (validStem(stem + 'e')) candidates.push(stem + 'e')
    }
    // -ily → -y  (happily → happy)
    if (word.endsWith('ily') && validStem(word.slice(0, -3) + 'y')) {
      candidates.push(word.slice(0, -3) + 'y')
    }
  }

  return candidates
}

// ── EnglishLemmatizer ──────────────────────────────────────────────────────

export class EnglishLemmatizer implements Lemmatizer {
  readonly language = 'en'

  /**
   * Returns candidate base forms for the given word, most likely first.
   * The original word is always included.
   *
   * Lookup order:
   *   1. Irregular verb table
   *   2. Irregular plural noun table
   *   3. Regular suffix stripping
   *   4. Original word (always appended if not already present)
   */
  lemmas(word: string): string[] {
    const lower = word.toLowerCase()
    const seen = new Set<string>()
    const result: string[] = []

    function add(candidate: string): void {
      if (!seen.has(candidate)) {
        seen.add(candidate)
        result.push(candidate)
      }
    }

    // 1. Irregular verbs
    const verbBase = IRREGULAR_VERBS[lower]
    if (verbBase) add(verbBase)

    // 2. Irregular plurals
    const pluralBase = IRREGULAR_PLURALS[lower]
    if (pluralBase) add(pluralBase)

    // 3. Regular suffix stripping
    for (const candidate of stripSuffixes(lower)) {
      add(candidate)
    }

    // 4. Always include the original (lowercased)
    add(lower)

    return result
  }
}

// Register so getLemmatizer("en") works
registerLemmatizer('en', () => new EnglishLemmatizer())
