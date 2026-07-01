import { describe, it, expect } from 'vitest'
import { EnglishLemmatizer } from '../../../src/core/lemma/english'

describe('EnglishLemmatizer', () => {
  const lemmatizer = new EnglishLemmatizer()

  describe('irregular verbs', () => {
    it('"ran" → lemmas includes "run"', () => {
      expect(lemmatizer.lemmas('ran')).toContain('run')
    })

    it('"went" → lemmas includes "go"', () => {
      expect(lemmatizer.lemmas('went')).toContain('go')
    })

    it('"was" → lemmas includes "be"', () => {
      expect(lemmatizer.lemmas('was')).toContain('be')
    })

    it('"is" → lemmas includes "be"', () => {
      expect(lemmatizer.lemmas('is')).toContain('be')
    })

    it('"were" → lemmas includes "be"', () => {
      expect(lemmatizer.lemmas('were')).toContain('be')
    })

    it('"had" → lemmas includes "have"', () => {
      expect(lemmatizer.lemmas('had')).toContain('have')
    })

    it('"bought" → lemmas includes "buy"', () => {
      expect(lemmatizer.lemmas('bought')).toContain('buy')
    })
  })

  describe('irregular plurals', () => {
    it('"mice" → lemmas includes "mouse"', () => {
      expect(lemmatizer.lemmas('mice')).toContain('mouse')
    })

    it('"children" → lemmas includes "child"', () => {
      expect(lemmatizer.lemmas('children')).toContain('child')
    })
  })

  describe('regular suffix stripping', () => {
    it('"running" → lemmas includes "run"', () => {
      expect(lemmatizer.lemmas('running')).toContain('run')
    })

    it('"flies" → lemmas includes "fly"', () => {
      expect(lemmatizer.lemmas('flies')).toContain('fly')
    })

    it('"cats" → lemmas includes "cat"', () => {
      expect(lemmatizer.lemmas('cats')).toContain('cat')
    })

    it('"happier" → lemmas includes "happy"', () => {
      expect(lemmatizer.lemmas('happier')).toContain('happy')
    })

    it('"quickly" → lemmas includes "quick"', () => {
      expect(lemmatizer.lemmas('quickly')).toContain('quick')
    })

    it('"swimming" → lemmas includes "swim"', () => {
      expect(lemmatizer.lemmas('swimming')).toContain('swim')
    })

    it('"stopped" → lemmas includes "stop"', () => {
      expect(lemmatizer.lemmas('stopped')).toContain('stop')
    })
  })

  describe('always includes original word', () => {
    it('original word is always included in lemmas', () => {
      expect(lemmatizer.lemmas('running')).toContain('running')
      expect(lemmatizer.lemmas('cats')).toContain('cats')
      expect(lemmatizer.lemmas('mouse')).toContain('mouse')
    })
  })

  describe('short word protection', () => {
    it('short words (< 3 chars) are not stripped to empty', () => {
      const result = lemmatizer.lemmas('is')
      // Every lemma should be a non-empty string
      for (const lemma of result) {
        expect(lemma.length).toBeGreaterThan(0)
      }
    })

    it('"bus" stays as "bus" (not stripped to "bu")', () => {
      const result = lemmatizer.lemmas('bus')
      // Should include "bus" itself
      expect(result).toContain('bus')
      // Should NOT include "bu" (too short, below MIN_STEM=3)
      expect(result).not.toContain('bu')
    })
  })
})
