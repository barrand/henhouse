import { afterEach, describe, expect, it, vi } from 'vitest'
import { TypeSafeClient } from '@typesafe-ai/sdk'
import { DecisionService } from '../decisionService'

const good = { model: 'jev-1.13.0', usage: { input_tokens: 1, output_tokens: 1 }, answers: { correct: { type: 'choice', choice: 'correct', confidence: .9, probabilities: { correct: .9, incorrect: .1 } } } }
afterEach(() => vi.useRealTimers())
describe('real SDK transport with controlled HTTP responses', () => {
  it.each([401, 422])('does not retry HTTP %s', async status => {
    const fetch = vi.fn(async () => new Response('{}', { status }))
    const client = new TypeSafeClient({ apiKey: 'synthetic-unit-test', fetch, logLevel: 'off' })
    await expect(new DecisionService(() => client).evaluateFowlWordsGuess({ secretWord: 'house', guess: 'casa' })).rejects.toMatchObject({ status })
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it.each([429, 529])('retries HTTP %s exactly once, honoring Retry-After', async status => {
    vi.useFakeTimers()
    const fetch = vi.fn().mockResolvedValueOnce(new Response('{}', { status, headers: { 'retry-after': '1' } })).mockResolvedValue(new Response(JSON.stringify(good)))
    const client = new TypeSafeClient({ apiKey: 'synthetic-unit-test', fetch, logLevel: 'off' })
    const pending = new DecisionService(() => client).evaluateFowlWordsGuess({ secretWord: 'house', guess: 'casa' })
    await vi.advanceTimersByTimeAsync(999)
    expect(fetch).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    await expect(pending).resolves.toMatchObject({ correct: true })
    expect(fetch).toHaveBeenCalledTimes(2)
  })
  it('total deadline cancels retry backoff before an extra HTTP request', async () => {
    vi.useFakeTimers()
    const fetch = vi.fn(async () => new Response('{}', { status: 429, headers: { 'retry-after': '30' } }))
    const client = new TypeSafeClient({ apiKey: 'synthetic-unit-test', fetch, logLevel: 'off' })
    const pending = new DecisionService(() => client).evaluateFowlWordsGuess({ secretWord: 'house', guess: 'casa' })
    const assertion = expect(pending).rejects.toThrow('Jev total deadline exceeded')
    await vi.advanceTimersByTimeAsync(2000)
    await assertion
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it.each([{}, { correct: null }, { correct: { type: 'choice', choice: 'correct', confidence: 1, probabilities: { correct: 2, incorrect: -1 } } }])('rejects missing or malformed answers through SDK parsing', async answers => {
    const client = new TypeSafeClient({ apiKey: 'synthetic-unit-test', logLevel: 'off', fetch: async () => new Response(JSON.stringify({ ...good, answers })) })
    await expect(new DecisionService(() => client).evaluateFowlWordsGuess({ secretWord: 'house', guess: 'casa' })).rejects.toThrow()
  })
})
