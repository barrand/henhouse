import { describe, expect, it } from 'vitest'
import { acceptsJevClue, acceptsJevGuess } from '../jevPolicy'
describe('Jev probability policy shared by live and shadow paths', () => {
  it.each([0.749, 0.75, 0.751])('rejects a negative clue label only at the threshold: %s', p => {
    expect(acceptsJevClue({ singleWord: false, tooCloseToSecret: false, metadata: { provider: 'jev', latencyMs: 0, fallbackUsed: false, probabilities: { joined_words: p } } })).toBe(p < .75)
    expect(acceptsJevClue({ singleWord: true, tooCloseToSecret: true, metadata: { provider: 'jev', latencyMs: 0, fallbackUsed: false, probabilities: { too_close: p } } })).toBe(p < .75)
  })
  it('rejects guesses with insufficient or missing probability', () => {
    const metadata = { provider: 'jev' as const, latencyMs: 0, fallbackUsed: false }
    expect(acceptsJevGuess({ correct: true, metadata })).toBe(false)
    expect(acceptsJevGuess({ correct: true, metadata: { ...metadata, probabilities: { correct: .749 } } })).toBe(false)
    expect(acceptsJevGuess({ correct: true, metadata: { ...metadata, probabilities: { correct: .75 } } })).toBe(true)
    expect(acceptsJevGuess({ correct: false, metadata: { ...metadata, probabilities: { correct: 1 } } })).toBe(false)
  })
})
