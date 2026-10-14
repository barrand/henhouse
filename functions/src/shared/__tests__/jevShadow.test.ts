import { describe, expect, it } from 'vitest'
import { shadowJobId, shouldSampleShadow } from '../jevShadow'

describe('Jev shadow sampling', () => {
  it('uses stable sampling for the same decision identity', () => {
    expect(shouldSampleShadow('game/round/guess/one', 1)).toBe(true)
    expect(shouldSampleShadow('game/round/guess/one', 0)).toBe(false)
    expect(shouldSampleShadow('game/round/guess/one', 0.5)).toBe(shouldSampleShadow('game/round/guess/one', 0.5))
  })

  it('creates deterministic, distinct job IDs for distinct decisions', () => {
    const base = { gameId: 'game-1', roundNum: 2, actorUid: 'player-1', operation: 'guess' as const, guess: 'squash', secretWord: 'pumpkin', expected: { correct: false } }
    expect(shadowJobId(base)).toBe(shadowJobId({ ...base }))
    expect(shadowJobId(base)).not.toBe(shadowJobId({ ...base, guess: 'orange' }))
  })
})
