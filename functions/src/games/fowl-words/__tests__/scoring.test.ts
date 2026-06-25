import { describe, it, expect } from 'vitest'
import { computeRoundScores, fastBonusPrizes } from '../scoring'
import type { ClueGroup } from '../types'

// Helpers
const unique = (playerIds: string[]): ClueGroup => ({ playerIds, clueTexts: playerIds.map(() => 'clue'), isDuplicate: false })
const dup = (playerIds: string[]): ClueGroup => ({ playerIds, clueTexts: playerIds.map(() => 'clue'), isDuplicate: true })

describe('fastBonusPrizes', () => {
  it('returns [3] for ≤4 givers (≤5 players)', () => {
    expect(fastBonusPrizes(0)).toEqual([3])
    expect(fastBonusPrizes(3)).toEqual([3])
    expect(fastBonusPrizes(4)).toEqual([3])
  })
  it('returns [3, 2, 1] for 5+ givers (6+ players)', () => {
    expect(fastBonusPrizes(5)).toEqual([3, 2, 1])
    expect(fastBonusPrizes(9)).toEqual([3, 2, 1])
    expect(fastBonusPrizes(15)).toEqual([3, 2, 1])
  })
})

describe('computeRoundScores', () => {
  // ── Used Bonus ─────────────────────────────────────────────────────────────

  describe('Used bonus (attempt points for visible clue givers)', () => {
    it('gives 10 pts to visible unique givers on attempt 1', () => {
      const groups = [unique(['A']), unique(['B'])]
      const scores = computeRoundScores(groups, [0, 1], 'G', true, 1, { A: 100, B: 200 })
      expect(scores['A']).toBe(13) // 10 used + 3 fast (earliest)
      expect(scores['B']).toBe(10)
      expect(scores['G']).toBe(10)
    })

    it('gives 5 pts on attempt 2', () => {
      const groups = [unique(['A']), unique(['B'])]
      const scores = computeRoundScores(groups, [0, 1], 'G', true, 2, { A: 100, B: 200 })
      expect(scores['A']).toBe(8) // 5 + 3 fast
      expect(scores['B']).toBe(5)
      expect(scores['G']).toBe(5)
    })

    it('gives 2 pts on attempt 3', () => {
      const groups = [unique(['A'])]
      const scores = computeRoundScores(groups, [0], 'G', true, 3, { A: 100 })
      expect(scores['A']).toBe(5) // 2 + 3 fast (only visible player)
      expect(scores['G']).toBe(2)
    })

    it('gives 1 pt on attempt 4', () => {
      const groups = [unique(['A'])]
      const scores = computeRoundScores(groups, [0], 'G', true, 4, { A: 100 })
      expect(scores['A']).toBe(4) // 1 + 3 fast
      expect(scores['G']).toBe(1)
    })

    it('gives 0 to players in locked groups when correct', () => {
      const groups = [unique(['A']), dup(['C', 'D'])]
      const scores = computeRoundScores(groups, [0], 'G', true, 1, { A: 100, C: 200, D: 300 })
      expect(scores['A']).toBe(13) // 10 + 3 fast
      expect(scores['C']).toBe(-1) // dup penalty, not visible
      expect(scores['D']).toBe(-1) // dup penalty, not visible
    })
  })

  // ── Fast Bonus ─────────────────────────────────────────────────────────────

  describe('Fast bonus (tiered by giver count)', () => {
    it('awards +3 to earliest submitted among visible players (≤4 givers)', () => {
      const groups = [unique(['A']), unique(['B'])]
      const scores = computeRoundScores(groups, [0, 1], 'G', true, 1, { A: 100, B: 200 })
      expect(scores['A']).toBe(13) // 10 + 3 fast
      expect(scores['B']).toBe(10)
    })

    it('awards +3 to second giver if they submitted first among visible clues', () => {
      // B submitted earlier (t=50), even though C is globally fastest, C is locked
      const groups = [unique(['A']), unique(['B']), dup(['C', 'D'])]
      const scores = computeRoundScores(groups, [0, 1], 'G', true, 1, { A: 200, B: 50, C: 10, D: 60 })
      expect(scores['B']).toBe(13) // 10 + 3 fast (first among visible: A=200, B=50)
      expect(scores['A']).toBe(10)
      expect(scores['C']).toBe(-1) // locked dup, no fast bonus
      expect(scores['D']).toBe(-1) // locked dup
    })

    it('does not award fast bonus on failed guess', () => {
      const groups = [unique(['A']), unique(['B'])]
      const scores = computeRoundScores(groups, [0, 1], 'G', false, 1, { A: 100, B: 200 })
      expect(scores['A']).toBe(0)
      expect(scores['B']).toBe(0)
      expect(scores['G']).toBe(0)
    })

    it('does not award fast bonus if clue was globally first but locked (not used)', () => {
      const groups = [unique(['A']), unique(['B']), dup(['C', 'D'])]
      const scores = computeRoundScores(groups, [0, 1], 'G', true, 1, { A: 100, B: 200, C: 10, D: 150 })
      expect(scores['A']).toBe(13) // 10 + 3 fast (A is first among visible: A=100, B=200)
      expect(scores['C']).toBe(-1) // globally fastest but locked → no bonus
    })

    it('awards fast bonus to duplicate group member if their group is unlocked and they submitted first', () => {
      const groups = [unique(['A']), dup(['C', 'D'])]
      const scores = computeRoundScores(groups, [0, 1], 'G', true, 2, { A: 300, C: 100, D: 200 })
      expect(scores['C']).toBe(5 - 1 + 3) // 5 used - 1 dup + 3 fast = 7
      expect(scores['D']).toBe(5 - 1)      // 5 used - 1 dup = 4
      expect(scores['A']).toBe(5)           // 5 used, no fast bonus
    })

    it('awards +3/+2/+1 to top 3 for 5+ givers (6+ players)', () => {
      // 6 givers: A, B, C, D, E, F (+ guesser G = 7 players total)
      const groups = [unique(['A']), unique(['B']), unique(['C']), unique(['D']), unique(['E']), unique(['F'])]
      const scores = computeRoundScores(groups, [0, 1, 2, 3, 4, 5], 'G', true, 1,
        { A: 300, B: 100, C: 200, D: 400, E: 500, F: 600 }, 6)
      expect(scores['B']).toBe(10 + 3) // fastest → +3
      expect(scores['C']).toBe(10 + 2) // 2nd fastest → +2
      expect(scores['A']).toBe(10 + 1) // 3rd fastest → +1
      expect(scores['D']).toBe(10)     // 4th → no bonus
    })

    it('awards +3/+2/+1 to top 3 for 9+ givers', () => {
      // 9 givers: A–I (+ guesser G = 10 players total)
      const groups = [
        unique(['A']), unique(['B']), unique(['C']),
        unique(['D']), unique(['E']), unique(['F']),
        unique(['H']), unique(['I']), unique(['J']),
      ]
      const scores = computeRoundScores(groups, [0, 1, 2, 3, 4, 5, 6, 7, 8], 'G', true, 1,
        { A: 500, B: 100, C: 200, D: 300, E: 400, F: 600, H: 700, I: 800, J: 900 }, 9)
      expect(scores['B']).toBe(10 + 3) // fastest → +3
      expect(scores['C']).toBe(10 + 2) // 2nd → +2
      expect(scores['D']).toBe(10 + 1) // 3rd → +1
      expect(scores['A']).toBe(10)     // 4th → no bonus
    })

    it('caps winners at number of visible players (fewer visible than prize slots)', () => {
      // 9 givers but only 1 visible clue — can only award 1st place
      const groups = [unique(['A']), dup(['B', 'C']), dup(['D', 'E'])]
      const scores = computeRoundScores(groups, [0], 'G', true, 1,
        { A: 100, B: 50, C: 60, D: 70, E: 80 }, 9)
      expect(scores['A']).toBe(10 + 3) // only visible player gets 1st prize
      expect(scores['B']).toBe(-1)     // locked dup
    })
  })

  // ── Duplicate Penalty ──────────────────────────────────────────────────────

  describe('Duplicate penalty (-1 for isDuplicate groups)', () => {
    it('applies -1 to duplicate groups even when guess succeeds', () => {
      const groups = [unique(['A']), dup(['C', 'D'])]
      const scores = computeRoundScores(groups, [0], 'G', true, 1, { A: 100, C: 200, D: 300 })
      expect(scores['C']).toBe(-1)
      expect(scores['D']).toBe(-1)
    })

    it('applies -1 to duplicate groups when guess fails', () => {
      const groups = [unique(['A']), dup(['C', 'D'])]
      const scores = computeRoundScores(groups, [0], 'G', false, 1, { A: 100, C: 200, D: 300 })
      expect(scores['A']).toBe(0)
      expect(scores['C']).toBe(-1)
      expect(scores['D']).toBe(-1)
      expect(scores['G']).toBe(0)
    })

    it('applies -1 to duplicate members even when their group is unlocked and shown', () => {
      const groups = [unique(['A']), dup(['C', 'D'])]
      const scores = computeRoundScores(groups, [0, 1], 'G', true, 2, { A: 100, C: 200, D: 300 })
      expect(scores['C']).toBe(5 - 1) // used + dup penalty
      expect(scores['D']).toBe(5 - 1)
    })

    it('allows negative scores (dup penalty on failed guess)', () => {
      const groups = [dup(['A', 'B'])]
      const scores = computeRoundScores(groups, [], 'G', false, 1, { A: 100, B: 200 })
      expect(scores['A']).toBe(-1)
      expect(scores['B']).toBe(-1)
    })
  })

  // ── Failed Guess ───────────────────────────────────────────────────────────

  describe('Failed guess', () => {
    it('gives 0 to guesser when all attempts fail', () => {
      const groups = [unique(['A'])]
      const scores = computeRoundScores(groups, [0], 'G', false, 4, { A: 100 })
      expect(scores['G']).toBe(0)
    })

    it('gives 0 to unique givers when guess fails', () => {
      const groups = [unique(['A']), unique(['B'])]
      const scores = computeRoundScores(groups, [0, 1], 'G', false, 1, { A: 100, B: 200 })
      expect(scores['A']).toBe(0)
      expect(scores['B']).toBe(0)
    })

    it('gives -1 to duplicate givers even when guess fails', () => {
      const groups = [unique(['A']), dup(['C', 'D'])]
      const scores = computeRoundScores(groups, [0], 'G', false, 1, { A: 100, C: 200, D: 300 })
      expect(scores['A']).toBe(0)
      expect(scores['C']).toBe(-1)
      expect(scores['D']).toBe(-1)
    })
  })

  // ── Edge Cases ─────────────────────────────────────────────────────────────

  describe('Edge cases', () => {
    it('handles all-duplicate round (no visible clues on attempt 1)', () => {
      const groups = [dup(['A', 'B']), dup(['C', 'D'])]
      const scores = computeRoundScores(groups, [], 'G', false, 1, { A: 100, B: 200, C: 300, D: 400 })
      expect(scores['A']).toBe(-1)
      expect(scores['B']).toBe(-1)
      expect(scores['C']).toBe(-1)
      expect(scores['D']).toBe(-1)
      expect(scores['G']).toBe(0)
    })

    it('handles large group (8 givers): 2 unique + 3 dup pairs, success on attempt 4', () => {
      // 8 givers → 5+ tier → top 3 get +3/+2/+1
      // A, B unique; C&D pair1; E&F pair2; P&H pair3 (all eventually visible)
      // Visible sorted by timestamp: A(100), B(200), C(300), D(400), ...
      const groups = [
        unique(['A']),
        unique(['B']),
        dup(['C', 'D']),
        dup(['E', 'F']),
        dup(['P', 'H']),
      ]
      const timestamps = { A: 100, B: 200, C: 300, D: 400, E: 500, F: 600, P: 700, H: 800 }
      const scores = computeRoundScores(groups, [0, 1, 2, 3, 4], 'G', true, 4, timestamps, 8)

      expect(scores['G']).toBe(1)           // guesser: 1 pt (attempt 4)
      expect(scores['A']).toBe(1 + 3)       // 1 used + 3 fast (1st place)
      expect(scores['B']).toBe(1 + 2)       // 1 used + 2 fast (2nd place)
      expect(scores['C']).toBe(1 - 1 + 1)   // 1 used - 1 dup + 1 fast (3rd place) = 1
      expect(scores['D']).toBe(1 - 1)       // 1 used - 1 dup = 0
      expect(scores['E']).toBe(1 - 1)       // 0
      expect(scores['F']).toBe(1 - 1)       // 0
      expect(scores['H']).toBe(1 - 1)       // 0
    })

    it('uses no timestamps (defaults) — fast bonus goes to first array element among visible', () => {
      const groups = [unique(['A']), unique(['B'])]
      const scores = computeRoundScores(groups, [0, 1], 'G', true, 1) // no timestamps
      // Without timestamps, all get MAX_SAFE_INTEGER — first in array wins tiebreaker
      expect(scores['A']).toBe(13) // 10 + 3 fast
      expect(scores['B']).toBe(10)
    })
  })
})
