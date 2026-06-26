import { describe, it, expect } from 'vitest'
import {
  applyPeerLoveVotes,
  effectivePeerLoveVotes,
  mostHelpfulSplitPts,
  type PeerLoveVotes,
} from '../peerLove'
import type { ClueGroup } from '../types'

const unique = (playerIds: string[]): ClueGroup => ({
  playerIds,
  clueTexts: playerIds.map(() => 'clue'),
  isDuplicate: false,
})
const dup = (playerIds: string[]): ClueGroup => ({
  playerIds,
  clueTexts: playerIds.map(() => 'clue'),
  isDuplicate: true,
})

describe('mostHelpfulSplitPts', () => {
  it('floors at +1 per author', () => {
    expect(mostHelpfulSplitPts(1)).toBe(5)
    expect(mostHelpfulSplitPts(2)).toBe(2)
    expect(mostHelpfulSplitPts(3)).toBe(1)
    expect(mostHelpfulSplitPts(5)).toBe(1)
    expect(mostHelpfulSplitPts(10)).toBe(1)
  })
})

describe('effectivePeerLoveVotes', () => {
  it('prefers new map-of-maps field over legacy for same voter', () => {
    const loves: PeerLoveVotes = { p1: { '0': true, '2': true } }
    expect(effectivePeerLoveVotes(loves, { p1: 1 })).toEqual(loves)
  })

  it('projects legacy single-vote map', () => {
    expect(effectivePeerLoveVotes(undefined, { p1: 2, p3: 0 })).toEqual({
      p1: { '2': true },
      p3: { '0': true },
    })
  })
})

describe('applyPeerLoveVotes', () => {
  const groups = [unique(['A']), unique(['B']), dup(['C', 'D'])]

  it('adds +1 per love per author on visible groups', () => {
    const scores: Record<string, number> = { G: 10 }
    applyPeerLoveVotes(
      { p1: { '0': true }, p2: { '0': true, '1': true } },
      groups,
      [0, 1],
      scores,
    )
    expect(scores['A']).toBe(2) // two loves on group 0
    expect(scores['B']).toBe(1)
    expect(scores['G']).toBe(10)
  })

  it('counts loves on visible duplicate groups', () => {
    const scores: Record<string, number> = {}
    applyPeerLoveVotes({ p1: { '2': true } }, groups, [2], scores)
    expect(scores['C']).toBe(1)
    expect(scores['D']).toBe(1)
  })

  it('ignores loves targeting hidden groups', () => {
    const scores: Record<string, number> = {}
    applyPeerLoveVotes({ p1: { '2': true } }, groups, [0, 1], scores)
    expect(scores).toEqual({})
  })

  it('is a no-op on empty votes', () => {
    const scores = { A: 5 }
    applyPeerLoveVotes({}, groups, [0], scores)
    expect(scores).toEqual({ A: 5 })
  })
})
