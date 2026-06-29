import { describe, expect, it } from 'vitest'
import { scoreRoundAnswers } from '../scoring'

describe('Flock Together scoring', () => {
  const players = ['A', 'B', 'C', 'D']

  it('awards +1 point to players in the flock', () => {
    const scored = scoreRoundAnswers(
      { A: 'gift', B: 'gift', C: 'gift', D: 'drinks' },
      [['gift'], ['drinks']],
      players,
    )

    expect(scored.results).toMatchObject({ A: 'flock', B: 'flock', C: 'flock', D: 'rotten' })
    expect(scored.pointsThisRound).toEqual({ A: 1, B: 1, C: 1, D: -1 })
  })

  it('penalizes a single lone odd one out with -1 point', () => {
    const scored = scoreRoundAnswers(
      { A: 'gift', B: 'gift', C: 'gift', D: 'snacks' },
      [['gift'], ['snacks']],
      players,
    )

    expect(scored.results['D']).toBe('rotten')
    expect(scored.pointsThisRound['D']).toBe(-1)
  })

  it('does not penalize multiple outliers', () => {
    const scored = scoreRoundAnswers(
      { A: 'gift', B: 'gift', C: 'snacks', D: 'drinks' },
      [['gift'], ['snacks'], ['drinks']],
      ['A', 'B', 'C', 'D', 'E'],
    )

    expect(scored.results).toMatchObject({ A: 'flock', B: 'flock', C: 'outlier', D: 'outlier', E: 'no-answer' })
    expect(scored.pointsThisRound).toEqual({ A: 1, B: 1, C: 0, D: 0, E: 0 })
  })

  it('scores everyone zero when there is no majority', () => {
    const scored = scoreRoundAnswers(
      { A: 'gift', B: 'gift', C: 'snacks', D: 'snacks' },
      [['gift'], ['snacks']],
      players,
    )

    expect(scored.results).toEqual({ A: 'outlier', B: 'outlier', C: 'outlier', D: 'outlier' })
    expect(scored.pointsThisRound).toEqual({ A: 0, B: 0, C: 0, D: 0 })
  })

  it('scores no-answer players zero', () => {
    const scored = scoreRoundAnswers(
      { A: 'gift', B: 'gift', C: 'snacks' },
      [['gift'], ['snacks']],
      players,
    )

    expect(scored.results['D']).toBe('no-answer')
    expect(scored.pointsThisRound['D']).toBe(0)
  })
})
