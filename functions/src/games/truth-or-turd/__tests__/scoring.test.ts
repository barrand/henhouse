import { describe, expect, it } from 'vitest'
import { scoreTruthOrTurdRound } from '../scoring'

describe('Truth or Turd scoring', () => {
  it('gives one point for correct answers and zero otherwise', () => {
    const result = scoreTruthOrTurdRound(
      { A: 'truth', B: 'turd' },
      'truth',
      ['A', 'B', 'C'],
    )

    expect(result.results).toEqual({
      A: 'correct',
      B: 'incorrect',
      C: 'no-answer',
    })
    expect(result.pointsThisRound).toEqual({
      A: 1,
      B: 0,
      C: 0,
    })
  })
})
