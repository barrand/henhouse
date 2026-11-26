import { describe, expect, it } from 'vitest'
import { prompts } from '../prompts'
import { chooseWriters, tallyVotes } from '../rules'

describe('It Was You!', () => {
  it('has at least 60 distinct prompts', () => {
    expect(prompts.length).toBeGreaterThanOrEqual(60)
    expect(new Set(prompts).size).toBe(prompts.length)
  })

  it('chooses up to six writers with the fewest chances', () => {
    const ids = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']
    expect(new Set(chooseWriters(ids, { A: 1, B: 2 }))).toEqual(new Set(ids.slice(2)))
    expect(chooseWriters(ids.slice(0, 4), {})).toHaveLength(4)
  })

  it('gives the room bonus to correct voters, except the author', () => {
    const result = tallyVotes([
      { voterId: 'author', candidateId: 'author' },
      { voterId: 'fan', candidateId: 'author' },
      { voterId: 'wrong', candidateId: 'wrong' },
    ], 'author')
    expect(result).toEqual({ counts: { author: 2, wrong: 1 }, leaders: ['author'], points: { fan: 2 } })
  })

  it('keeps the individual point when a vote ties or the room guesses wrong', () => {
    const votes = [
      { voterId: 'fan', candidateId: 'author' },
      { voterId: 'author', candidateId: 'wrong' },
    ]
    expect(tallyVotes(votes, 'author')).toMatchObject({ leaders: ['author', 'wrong'], points: { fan: 1 } })
    expect(tallyVotes([...votes, { voterId: 'wrong', candidateId: 'wrong' }], 'author'))
      .toMatchObject({ leaders: ['wrong'], points: { fan: 1 } })
    expect(tallyVotes([], 'author')).toEqual({ counts: {}, leaders: [], points: {} })
  })
})
