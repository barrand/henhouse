import { describe, expect, it } from 'vitest'
import { deterministicGuess, experimentalGuessLocal } from '../gemini'

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

describe('experiment routing', () => {
  it.each([['car', 'automobile'], ['automobile', 'car'], ['TV', 'television'], ['television', 'TV']])('routes %s/%s to semantics', (secret, guess) => {
    expect(experimentalGuessLocal(secret, guess).decision).toBeNull()
  })
  it('keeps legacy length behavior isolated while enforcing input limits', () => {
    expect(deterministicGuess('car', 'automobile')).toBe(false)
    expect(experimentalGuessLocal('car', '')).toEqual({ decision: false, reason: 'empty' })
    expect(experimentalGuessLocal('car', 'a'.repeat(101)).decision).toBe(false)
    expect(experimentalGuessLocal('car', 'CARS').decision).toBe(true)
  })
})
