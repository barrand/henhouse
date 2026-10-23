import { describe, expect, it } from 'vitest'
import { recommendedRules, validateRules, revealCounts, calculateScores, secondsForAttempt } from '../rules'
import type { ScoringGroup } from '../rules'
import { projectScoringView } from '../scoringProtocol'
import type { ScoringState } from '../scoringProtocol'

describe('versioned scoring rules', () => {
  it('preserves Classic defaults and isolates relay awards', () => {
    expect(validateRules(recommendedRules()).payouts).toEqual([10, 5, 2, 1])
    const relay = validateRules(recommendedRules('best-clues-first'))
    expect(relay.payouts).toEqual([10, 7, 4, 1])
    expect([relay.peerLovePoints, relay.mostHelpfulPoints, relay.fastPrizes.length]).toEqual([0, 0, 0])
  })
  it('rejects inconsistent ladders, ranges, attempts and relay awards', () => {
    for (const change of [{ payouts: [10, 0] }, { payouts: [5, 10, 2, 1] }, { payouts: [10, NaN, 2, 1] },
      { revealAllBy: 5 }, { minimumOpening: 0 }, { openingPercent: 101 }, { hearts: 0 }, { votingSeconds: 1 },
      { automaticAttempts: true }, { peerLovePoints: 1 }]) {
      expect(() => validateRules({ ...recommendedRules('best-clues-first'), ...change })).toThrow()
    }
  })
  it('opens uniques only and shows every group by attempt three', () => {
    const r = recommendedRules('best-clues-first')
    expect(revealCounts(r, 10, 14)).toEqual([3, 9, 14, 14])
    expect(revealCounts(r, 49, 49)).toEqual([10, 30, 49, 49])
    expect(revealCounts(r, 4, 4)).toEqual([3, 4, 4, 4])
    expect(revealCounts(r, 0, 4)).toEqual([0, 2, 4, 4])
    expect(revealCounts(r, 1, 1)).toEqual([1, 1, 1, 1])
    expect(revealCounts(r, 0, 0)).toEqual([0, 0, 0, 0])
  })
  it('handles configured attempts and reveal deadline without changing timer policy', () => {
    const r = validateRules({ ...recommendedRules('best-clues-first'), payouts: [10, 8, 6, 4, 2, 1], revealAllBy: 4 })
    expect(revealCounts(r, 10, 14)).toEqual([3, 7, 11, 14, 14, 14])
    expect(secondsForAttempt(6)).toBe(20)
    expect(revealCounts(recommendedRules(), 2, 4)).toEqual([2, 3, 4, 4])
  })
  it('schedules arbitrary room sizes monotonically and reaches all groups', () => {
    for (let groups = 1; groups <= 60; groups++) for (let unique = 0; unique <= groups; unique++) {
      const schedule = revealCounts(recommendedRules('best-clues-first'), unique, groups)
      expect(schedule[0]).toBeLessThanOrEqual(unique)
      expect(schedule[2]).toBe(groups)
      expect(schedule.every((n, i) => Number.isInteger(n) && n <= groups && (!i || n >= schedule[i - 1]))).toBe(true)
    }
  })
})

const groups: ScoringGroup[] = [
  { id: 'unique', authorIds: ['a'], texts: ['lava'], duplicate: false },
  { id: 'dup', authorIds: ['b', 'c'], texts: ['rock', 'rocks'], duplicate: true },
]
const input = { rules: recommendedRules(), groups, shown: ['unique'], guesser: 'g', correct: true, attempt: 1,
  timestamps: { a: 100, b: 1, c: 2 }, love: { b: ['unique'], c: ['unique'] }, helpful: 'unique', giverCount: 3 }

describe('configured score accounting', () => {
  it('keeps Classic speed, win-only Peer love and Most Helpful', () => {
    const result = calculateScores(input)
    expect(result.scores).toEqual({ g: 10, a: 20, b: -1, c: -1 })
    for (const [pid, points] of Object.entries(result.scores)) expect(result.breakdown[pid].reduce((n, p) => n + p.points, 0)).toBe(points)
    expect(calculateScores({ ...input, correct: false }).scores).toEqual({ g: 0, a: 0, b: -1, c: -1 })
  })
  it('pays only shown authors and never speed or votes in Best Clues First', () => {
    expect(calculateScores({ ...input, rules: recommendedRules('best-clues-first'), attempt: 2 }).scores).toEqual({ g: 7, a: 7, b: -1, c: -1 })
    expect(calculateScores({ ...input, rules: recommendedRules('best-clues-first'), shown: ['unique', 'dup'], attempt: 3 }).scores).toEqual({ g: 4, a: 4, b: 3, c: 3 })
  })
  it('honors configured awards and keeps Most Helpful at least one per co-author', () => {
    const result = calculateScores({ ...input, shown: ['dup'], helpful: 'dup', rules: { ...input.rules, mostHelpfulPoints: 1 } })
    expect(result.scores.b).toBe(13)
    expect(result.scores.c).toBe(10)
  })
})

describe('role projections', () => {
  const state: ScoringState = {
    version: 1, roundNum: 1, rules: recommendedRules('best-clues-first'), eligible: ['g','a','b','c'], guesser: 'g',
    phase: 'clue-submission', startedAt: 1, deadline: 999999, selectionOpensAt: 1,
    wordOptions: ['volcano','ocean','forest'], wordVotes: { a: 0 }, secretWord: 'volcano',
    clues: [{ id:'opaque-a', text:'lava', author:'a', at:1 }, { id:'opaque-b', text:'rock', author:'b', at:2 }],
    rankingVotes: { a:['opaque-b'] }, love: {}, boo: {}, helpful: null, groups, queue: ['unique','dup'],
    schedule: [1,2,2,2], attempt: 1, maxAttempts: 4, shown: ['unique'], newlyShown: ['unique'],
    history: [], scores:{}, breakdown:{}, correct:false, playerScores:{},
  }
  it('hides secrets, unrevealed texts, authors and private votes from guesser', () => {
    const view = projectScoringView(state, 'g', { g:10, a:10 })
    expect(view.secretWord).toBe('')
    expect(view.wordOptions).toEqual([])
    expect(view.board).toEqual([])
    expect(view.groups.map(g=>g.text)).toEqual(['lava'])
    expect(view.groups[0].authors).toEqual([])
    expect(view.ownRankingVotes).toEqual([])
    expect(view.tentative).toEqual({g:10})
    expect(JSON.stringify(view)).not.toContain('volcano')
    expect(JSON.stringify(view)).not.toContain('rocks')
  })
  it('does not project candidate words after the vote closes', () => {
    const selected = projectScoringView({ ...state, phase: 'word-selected' }, 'a', {})
    const guesser = projectScoringView({ ...state, phase: 'word-selected' }, 'g', {})
    expect(selected.wordOptions).toEqual([])
    expect(guesser.wordOptions).toEqual([])
  })
  it('requires a locked clue before accessing the board or all groups', () => {
    expect(projectScoringView(state, 'c', {}).board).toEqual([])
    const board = projectScoringView(state, 'a', {}).board
    expect(board).toEqual([{id:'opaque-b',text:'rock',backed:true}])
    expect(board[0]).not.toHaveProperty('author')
  })
  it('reveals all clues and authors after an early win', () => {
    const result = projectScoringView({ ...state, phase:'scored', correct:true }, 'g', {})
    expect(result.secretWord).toBe('volcano')
    expect(result.groups).toHaveLength(2)
    expect(result.groups[1].authors).toEqual(['b','c'])
    expect(result.groups[1].shown).toBe(false)
  })
  it('keeps the frozen reveal order as new groups arrive and withholds backing totals until results', () => {
    const reordered = { ...state, queue: ['dup', 'unique'], shown: ['dup', 'unique'] }
    const view = projectScoringView(reordered, 'g', {})
    expect(view.groups.map(g => g.id)).toEqual(['dup', 'unique'])
    expect(view.groups[0].loves).toBe(0)
    expect(projectScoringView({ ...reordered, phase: 'scored' }, 'g', {}).groups[0].loves).toBe(1)
  })
})
