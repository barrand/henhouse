import { describe, it, expect } from 'vitest'
import { normalizeGuess, fuzzyMatch } from '../gemini'

describe('normalizeGuess', () => {
  it('lowercases the string', () => {
    expect(normalizeGuess('HELLO')).toBe('hello')
    expect(normalizeGuess('CaFé')).toBe('cafe')
  })

  it('strips diacritics', () => {
    expect(normalizeGuess('café')).toBe('cafe')
    expect(normalizeGuess('naïve')).toBe('naive')
    expect(normalizeGuess('résumé')).toBe('resume')
  })

  it('removes spaces, hyphens, and apostrophes', () => {
    expect(normalizeGuess('fire truck')).toBe('firetruck')
    expect(normalizeGuess('fire-truck')).toBe('firetruck')
    expect(normalizeGuess("don't")).toBe('dont')
    expect(normalizeGuess("mother-in-law")).toBe('motherinlaw')
  })

  it('combines all normalizations', () => {
    expect(normalizeGuess("Café-Au-Lait")).toBe('cafeaulait')
  })
})

describe('fuzzyMatch', () => {
  it('matches after normalization alone (accents, spacing, hyphens)', () => {
    expect(fuzzyMatch('café', 'cafe')).toBe(true)
    expect(fuzzyMatch('Café', 'CAFE')).toBe(true)
    expect(fuzzyMatch('fire truck', 'firetruck')).toBe(true)
    expect(fuzzyMatch('fire-truck', 'firetruck')).toBe(true)
    expect(fuzzyMatch("don't", 'dont')).toBe(true)
  })

  it('matches simple plurals (dog/dogs)', () => {
    expect(fuzzyMatch('dog', 'dogs')).toBe(true)
    expect(fuzzyMatch('dogs', 'dog')).toBe(true)
    expect(fuzzyMatch('cat', 'cats')).toBe(true)
    expect(fuzzyMatch('hat', 'hats')).toBe(true)
  })

  it('matches -es plurals (beach/beaches)', () => {
    expect(fuzzyMatch('beach', 'beaches')).toBe(true)
    expect(fuzzyMatch('beaches', 'beach')).toBe(true)
    expect(fuzzyMatch('class', 'classes')).toBe(true)
    expect(fuzzyMatch('box', 'boxes')).toBe(true)
  })

  it('matches -ies plurals (berry/berries)', () => {
    expect(fuzzyMatch('berry', 'berries')).toBe(true)
    expect(fuzzyMatch('berries', 'berry')).toBe(true)
    expect(fuzzyMatch('party', 'parties')).toBe(true)
    expect(fuzzyMatch('city', 'cities')).toBe(true)
  })

  it('matches simple base words with -ing and -ed endings', () => {
    expect(fuzzyMatch('surfboarding', 'surfboard')).toBe(true)
    expect(fuzzyMatch('surfboard', 'surfboarding')).toBe(true)
    expect(fuzzyMatch('snowboarded', 'snowboard')).toBe(true)
    expect(fuzzyMatch('snowboard', 'snowboarded')).toBe(true)
  })

  it('does not match different words', () => {
    expect(fuzzyMatch('happy', 'joy')).toBe(false)
    expect(fuzzyMatch('ocean', 'beach')).toBe(false)
    expect(fuzzyMatch('dog', 'cat')).toBe(false)
  })

  it('does not match verb inflections (left to Gemini)', () => {
    expect(fuzzyMatch('running', 'run')).toBe(false)
    expect(fuzzyMatch('run', 'running')).toBe(false)
    expect(fuzzyMatch('baking', 'bake')).toBe(false)
    expect(fuzzyMatch('bake', 'baking')).toBe(false)
  })

  it('handles edge cases', () => {
    // Empty strings
    expect(fuzzyMatch('', '')).toBe(true)

    // Single characters
    expect(fuzzyMatch('a', 'a')).toBe(true)
    expect(fuzzyMatch('a', 'b')).toBe(false)

    // Words that are substrings
    expect(fuzzyMatch('cat', 'catalog')).toBe(false)
  })
})
