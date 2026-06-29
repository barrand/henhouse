import { describe, expect, it } from 'vitest'
import {
  eligibleNonGuesserIds,
  getRoundEligiblePlayerIds,
  isRoundEligible,
} from '../roundEligibility'

describe('round eligibility helpers', () => {
  it('uses the frozen round eligibility snapshot when present', () => {
    const game = { playerIds: ['host', 'p1', 'late'] }
    const round = { eligiblePlayerIds: ['host', 'p1'], eligiblePlayerCount: 2 }

    expect(getRoundEligiblePlayerIds(round, game)).toEqual(['host', 'p1'])
    expect(isRoundEligible(round, game, 'p1')).toBe(true)
    expect(isRoundEligible(round, game, 'late')).toBe(false)
  })

  it('falls back to game player IDs for older rounds without a snapshot', () => {
    const game = { playerIds: ['host', 'p1', 'p2'] }

    expect(getRoundEligiblePlayerIds({}, game)).toEqual(['host', 'p1', 'p2'])
    expect(isRoundEligible({}, game, 'p2')).toBe(true)
  })

  it('excludes the current guesser from eligible giver IDs', () => {
    const game = { playerIds: ['host', 'p1', 'late'], currentGuesser: 'host' }
    const round = { eligiblePlayerIds: ['host', 'p1'] }

    expect(eligibleNonGuesserIds(round, game)).toEqual(['p1'])
  })
})
