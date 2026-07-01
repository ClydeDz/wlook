import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { SQLiteDictionaryProvider } from '../../../src/core/dictionary/sqlite-provider'
import path from 'path'

const FIXTURE = path.join(process.cwd(), 'tests/fixtures/en-test.wlpack')

describe('SQLiteDictionaryProvider', () => {
  let provider: SQLiteDictionaryProvider

  beforeAll(() => {
    provider = new SQLiteDictionaryProvider(FIXTURE, 'en-GB', 'English (UK) Test')
    provider.open()
  })

  afterAll(async () => {
    await provider.close()
  })

  it('opens without error', () => {
    // If we get here, open() did not throw
    expect(provider).toBeDefined()
  })

  it('lookup("cat") returns non-null DictionaryEntry with headword "cat"', async () => {
    const entry = await provider.lookup('cat')
    expect(entry).not.toBeNull()
    expect(entry!.headword.toLowerCase()).toBe('cat')
  })

  it('lookup("cat").senses[0].definition is a non-empty string', async () => {
    const entry = await provider.lookup('cat')
    expect(entry).not.toBeNull()
    expect(entry!.senses.length).toBeGreaterThan(0)
    expect(typeof entry!.senses[0].definition).toBe('string')
    expect(entry!.senses[0].definition.length).toBeGreaterThan(0)
  })

  it('lookup("nonexistent_xyz_abc_123") returns null', async () => {
    const entry = await provider.lookup('nonexistent_xyz_abc_123')
    expect(entry).toBeNull()
  })

  it('lookup returns ipa field when available', async () => {
    // Try several words that should have IPA in the fixture
    const words = ['cat', 'dog', 'water', 'house', 'run', 'think']
    let foundIpa = false
    for (const word of words) {
      const entry = await provider.lookup(word)
      if (entry && entry.ipa) {
        foundIpa = true
        expect(typeof entry.ipa).toBe('object')
        break
      }
    }
    // At least one word in the fixture should have IPA
    expect(foundIpa).toBe(true)
  })

  it('lookup returns pos field when available', async () => {
    // Try several words; at least one should have a POS
    const words = ['cat', 'dog', 'run', 'beautiful', 'happy']
    let foundPos = false
    for (const word of words) {
      const entry = await provider.lookup(word)
      if (entry && entry.pos) {
        foundPos = true
        expect(typeof entry.pos).toBe('string')
        break
      }
    }
    expect(foundPos).toBe(true)
  })

  it('closes without error', async () => {
    const provider2 = new SQLiteDictionaryProvider(FIXTURE, 'en-GB', 'English (UK) Test 2')
    provider2.open()
    await expect(provider2.close()).resolves.toBeUndefined()
  })

  it('lookup("run") OR lookup("ran") returns an entry (lemma-aware lookup)', async () => {
    const runEntry = await provider.lookup('run')
    const ranEntry = await provider.lookup('ran')
    // At least one form should be found
    expect(runEntry !== null || ranEntry !== null).toBe(true)
  })
})
