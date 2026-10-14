import { describe, expect, it } from 'vitest'
import { deterministicGuess } from '../gemini'

describe('deterministicGuess', () => {
  it.each([
    ['pumpkin', 'pumpkin'],
    ['pumpkin', 'PUMPKIN'],
    ['berry', 'berries'],
    ['surfboard', 'surfboarded'],
  ])('accepts local equivalent %j / %j', (secret, guess) => {
    expect(deterministicGuess(secret, guess)).toBe(true)
  })

  it('rejects empty and wildly different guesses locally', () => {
    expect(deterministicGuess('pumpkin', '')).toBe(false)
    expect(deterministicGuess('cat', 'thisisfarbeyondtheanswer')).toBe(false)
  })

  it('returns unresolved only for the semantic provider path', () => {
    expect(deterministicGuess('pumpkin', 'squash')).toBeNull()
  })
})
