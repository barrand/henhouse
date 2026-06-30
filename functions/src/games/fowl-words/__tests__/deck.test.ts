import { describe, expect, it } from 'vitest'
import { buildFowlWordsDeck, wordKey } from '../deck'
import { isFowlWordCooldownActive } from '../cooldowns'
import patrioticWords from '../data/patrioticWords.json'

const normalWords = Array.from({ length: 60 }, (_, i) => `NORMAL${i + 1}`)
const themedWords = Array.from({ length: 30 }, (_, i) => `THEMED${i + 1}`)
const stableRng = () => 0

describe('buildFowlWordsDeck', () => {
  it('keeps normal mode as a 3-card-per-round normal deck', () => {
    const deck = buildFowlWordsDeck({
      words: normalWords,
      patrioticWords: themedWords,
      totalRounds: 10,
      includePatrioticQuestions: false,
      rng: stableRng,
    })

    expect(deck).toHaveLength(30)
    expect(deck.every((word) => word.startsWith('NORMAL'))).toBe(true)
  })

  it('places patriotic cards into odd-round batches when available', () => {
    const deck = buildFowlWordsDeck({
      words: normalWords,
      patrioticWords: themedWords,
      totalRounds: 10,
      includePatrioticQuestions: true,
      rng: stableRng,
    })

    expect(deck).toHaveLength(30)

    for (let round = 1; round <= 10; round++) {
      const batch = deck.slice((round - 1) * 3, round * 3)
      const expectedPrefix = round % 2 === 1 ? 'THEMED' : 'NORMAL'
      expect(batch.every((word) => word.startsWith(expectedPrefix))).toBe(true)
    }
  })

  it('fills patriotic batches with normal cards if patriotic cards run short', () => {
    const deck = buildFowlWordsDeck({
      words: normalWords,
      patrioticWords: ['THEMED1', 'THEMED2'],
      totalRounds: 2,
      includePatrioticQuestions: true,
      rng: stableRng,
    })

    expect(deck).toHaveLength(6)
    expect(deck.filter((word) => word.startsWith('THEMED'))).toHaveLength(2)
    expect(deck.filter((word) => word.startsWith('NORMAL'))).toHaveLength(4)
  })

  it('avoids cooled words when enough fresh words exist', () => {
    const deck = buildFowlWordsDeck({
      words: ['COOLED1', 'FRESH1', 'FRESH2', 'FRESH3', 'FRESH4', 'FRESH5', 'FRESH6'],
      patrioticWords: [],
      totalRounds: 2,
      includePatrioticQuestions: false,
      activeCooldownKeys: new Set(['COOLED1']),
      rng: stableRng,
    })

    expect(deck).toHaveLength(6)
    expect(deck).not.toContain('COOLED1')
  })

  it('uses cooled words only when fresh words are insufficient', () => {
    const deck = buildFowlWordsDeck({
      words: ['FRESH1', 'FRESH2', 'COOLED1'],
      patrioticWords: [],
      totalRounds: 1,
      includePatrioticQuestions: false,
      activeCooldownKeys: new Set(['COOLED1']),
      rng: stableRng,
    })

    expect(deck).toHaveLength(3)
    expect(deck).toContain('COOLED1')
  })

  it('uses fresh normal words before cooled patriotic repeats when fresh patriotic words run out', () => {
    const deck = buildFowlWordsDeck({
      words: ['NORMAL1', 'NORMAL2', 'NORMAL3'],
      patrioticWords: ['PATRIOTIC1', 'PATRIOTIC2'],
      totalRounds: 1,
      includePatrioticQuestions: true,
      activeCooldownKeys: new Set(['PATRIOTIC2']),
      rng: stableRng,
    })

    expect(deck).toHaveLength(3)
    expect(deck).toContain('PATRIOTIC1')
    expect(deck).not.toContain('PATRIOTIC2')
    expect(deck.filter((word) => word.startsWith('NORMAL'))).toHaveLength(2)
  })

  it('does not include duplicate words within one deck', () => {
    const deck = buildFowlWordsDeck({
      words: ['DUPLICATE', 'NORMAL1', 'NORMAL2', 'NORMAL3', 'NORMAL4', 'NORMAL5'],
      patrioticWords: ['DUPLICATE', 'PATRIOTIC1', 'PATRIOTIC2'],
      totalRounds: 2,
      includePatrioticQuestions: true,
      rng: stableRng,
    })

    expect(new Set(deck.map(wordKey)).size).toBe(deck.length)
  })
})

describe('fowl word cooldown helpers', () => {
  it('normalizes word keys to uppercase single-token ids', () => {
    expect(wordKey(' eagle ')).toBe('EAGLE')
  })

  it('treats expired cooldowns as available again', () => {
    expect(isFowlWordCooldownActive(1_000, 999)).toBe(true)
    expect(isFowlWordCooldownActive(1_000, 1_000)).toBe(false)
    expect(isFowlWordCooldownActive(1_000, 1_001)).toBe(false)
  })
})

describe('patrioticWords', () => {
  it('contains only one-token words for manual review', () => {
    expect(patrioticWords).not.toHaveLength(0)
    expect(new Set(patrioticWords).size).toBe(patrioticWords.length)

    for (const word of patrioticWords) {
      expect(word).toMatch(/^[A-Z0-9]+$/)
      expect(word).not.toMatch(/\s|-/)
    }
  })

  it('excludes known phrase mashups and harder rejected entries', () => {
    expect(patrioticWords).not.toContain('UNCLESAM')
    expect(patrioticWords).not.toContain('VALLEYFORGE')
    expect(patrioticWords).not.toContain('LIBERTYBELL')
    expect(patrioticWords).not.toContain('APPALACHIA')
    expect(patrioticWords).not.toContain('SUFFRAGE')
    expect(patrioticWords).not.toContain('GOLDRUSH')
    expect(patrioticWords).not.toContain('HOTDOG')
  })
})
