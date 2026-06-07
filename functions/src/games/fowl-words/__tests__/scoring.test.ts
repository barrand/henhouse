import { describe, it, expect } from 'vitest'
import { computeRoundScores } from '../scoring'
import type { ClueGroup } from '../types'

// Helpers
const unique = (playerIds: string[]): ClueGroup => ({ playerIds, clueTexts: playerIds.map(() => 'clue'), isDuplicate: false })
const dup = (playerIds: string[]): ClueGroup => ({ playerIds, clueTexts: playerIds.map(() => 'clue'), isDuplicate: true })

describe('computeRoundScores', () => {
  // ── Used Bonus ─────────────────────────────────────────────────────────────

  describe('Used bonus (attempt points for visible clue givers)', () => {
    it('gives 10 pts to visible unique givers on attempt 1', () => {
      const groups = [unique(['A']), unique(['B'])]
      const scores = computeRoundScores(groups, [0, 1], 'G', true, 1, { A: 100, B: 200 })
      expect(scores['A']).toBe(12) // 10 used + 2 fast (earliest)
      expect(scores['B']).toBe(10)
      expect(scores['G']).toBe(10)
    })

    it('gives 5 pts on attempt 2', () => {
      const groups = [unique(['A']), unique(['B'])]
      const scores = computeRoundScores(groups, [0, 1], 'G', true, 2, { A: 100, B: 200 })
      expect(scores['A']).toBe(7) // 5 + 2 fast
      expect(scores['B']).toBe(5)
      expect(scores['G']).toBe(5)
    })

    it('gives 2 pts on attempt 3', () => {
      const groups = [unique(['A'])]
      const scores = computeRoundScores(groups, [0], 'G', true, 3, { A: 100 })
      expect(scores['A']).toBe(4) // 2 + 2 fast (only visible player)
      expect(scores['G']).toBe(2)
    })

    it('gives 1 pt on attempt 4', () => {
      const groups = [unique(['A'])]
      const scores = computeRoundScores(groups, [0], 'G', true, 4, { A: 100 })
      expect(scores['A']).toBe(3) // 1 + 2 fast
      expect(scores['G']).toBe(1)
    })

    it('gives 0 to players in locked groups when correct', () => {
      // Unique players are always visible. Duplicate players in locked groups get -1 (dup penalty).
      const groups = [unique(['A']), dup(['C', 'D'])]
      const scores = computeRoundScores(groups, [0], 'G', true, 1, { A: 100, C: 200, D: 300 })
      expect(scores['A']).toBe(12) // 10 + 2 fast
      expect(scores['C']).toBe(-1) // dup penalty, not visible
      expect(scores['D']).toBe(-1) // dup penalty, not visible
    })
  })

  // ── Fast Bonus ─────────────────────────────────────────────────────────────

  describe('Fast bonus (+2 for first submitted among USED clues)', () => {
    it('awards +2 to earliest submitted among visible players', () => {
      // A submitted at t=100 (first), B at t=200
      const groups = [unique(['A']), unique(['B'])]
      const scores = computeRoundScores(groups, [0, 1], 'G', true, 1, { A: 100, B: 200 })
      expect(scores['A']).toBe(12) // 10 + 2 fast
      expect(scores['B']).toBe(10)
    })

    it('awards +2 to second giver if they submitted first among visible clues', () => {
      // B submitted earlier (t=50), A submitted later (t=200)
      // A = unique, B = unique, C & D = dup pair (locked, never shown)
      // Even though C submitted at t=10 (globally fastest), they're locked → no fast bonus
      const groups = [unique(['A']), unique(['B']), dup(['C', 'D'])]
      const scores = computeRoundScores(groups, [0, 1], 'G', true, 1, { A: 200, B: 50, C: 10, D: 60 })
      expect(scores['B']).toBe(12) // 10 + 2 fast (first among visible: A=200, B=50)
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
      // C submitted at t=10 (fastest globally), but their clue is a dup and stays locked
      // A at t=100, B at t=200
      const groups = [unique(['A']), unique(['B']), dup(['C', 'D'])]
      const scores = computeRoundScores(groups, [0, 1], 'G', true, 1, { A: 100, B: 200, C: 10, D: 150 })
      expect(scores['A']).toBe(12) // 10 + 2 fast (A is first among visible: A=100, B=200)
      expect(scores['C']).toBe(-1) // globally fastest but locked → no bonus
    })

    it('awards fast bonus to duplicate group member if their group is unlocked and they submitted first among visible', () => {
      // Groups: A (unique), [C, D] (dup). C&D unlocked on attempt 2. Guess correct on attempt 2.
      // Among visible players (A, C, D), C submitted first.
      const groups = [unique(['A']), dup(['C', 'D'])]
      const scores = computeRoundScores(groups, [0, 1], 'G', true, 2, { A: 300, C: 100, D: 200 })
      expect(scores['C']).toBe(5 - 1 + 2) // 5 used - 1 dup + 2 fast = 6
      expect(scores['D']).toBe(5 - 1)      // 5 used - 1 dup = 4
      expect(scores['A']).toBe(5)           // 5 used, no fast bonus
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
      // C&D pair unlocked on attempt 2 → visible, so they get 5 pts used, but still -1 dup penalty
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

    it('handles large group (Example 4): 8 givers, 2 unique + 3 dup pairs, success on attempt 4', () => {
      // A, B unique; C&D pair1; E&F pair2; G&H pair3
      // All 4 groups eventually visible (pairs unlocked on attempts 2, 3, 4)
      const groups = [
        unique(['A']),
        unique(['B']),
        dup(['C', 'D']),
        dup(['E', 'F']),
        dup(['G', 'H']),
      ]
      const timestamps = { A: 100, B: 200, C: 300, D: 400, E: 500, F: 600, G: 700, H: 800 }
      const scores = computeRoundScores(groups, [0, 1, 2, 3, 4], 'G', true, 4, timestamps)

      expect(scores['G']).toBe(1)           // guesser: 1 pt (attempt 4)
      expect(scores['A']).toBe(1 + 2)       // 1 used + 2 fast (earliest of all visible)
      expect(scores['B']).toBe(1)            // 1 used
      expect(scores['C']).toBe(1 - 1)       // 1 used - 1 dup = 0
      expect(scores['D']).toBe(1 - 1)       // 0
      expect(scores['E']).toBe(1 - 1)       // 0
      expect(scores['F']).toBe(1 - 1)       // 0
      expect(scores['G']).toBe(1)           // guesser = 1 (overwrites any group calc)
      expect(scores['H']).toBe(1 - 1)       // 0
    })

    it('uses no timestamps (defaults) — fast bonus goes to first array element among visible', () => {
      const groups = [unique(['A']), unique(['B'])]
      const scores = computeRoundScores(groups, [0, 1], 'G', true, 1) // no timestamps
      // Without timestamps, all get MAX_SAFE_INTEGER — first in array wins tiebreaker
      expect(scores['A']).toBe(12) // 10 + 2 fast
      expect(scores['B']).toBe(10)
    })
  })
})
