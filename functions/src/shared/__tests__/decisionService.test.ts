import { describe, expect, it } from 'vitest'
import { DecisionService, JEV_ATTEMPT_TIMEOUT_MS, JEV_TOTAL_DEADLINE_MS, requireTypesafeApiKey } from '../decisionService'

function serviceFor(answers: Record<string, unknown>) {
  return new DecisionService(() => ({
    systemOne: (_request: unknown, _options: unknown) => ({
      withResponse: async () => ({
        data: { model: 'jev-1.13.0', usage: { input_tokens: 1, output_tokens: 1 }, answers },
        requestId: 'req-test',
      }),
    }),
  }) as never)
}

describe('DecisionService', () => {
  it('maps a valid clue response without exposing credentials', async () => {
    const service = serviceFor({
      singleWord: { type: 'choice', choice: 'single_word', confidence: 0.9, probabilities: { single_word: 0.9, joined_words: 0.1 } },
      tooClose: { type: 'choice', choice: 'acceptable', confidence: 0.8, probabilities: { too_close: 0.2, acceptable: 0.8 } },
    })
    await expect(service.classifyFowlWordsClue({ clue: 'rainbow', secretWord: 'pumpkin' })).resolves.toMatchObject({
      singleWord: true, tooCloseToSecret: false, metadata: { provider: 'jev', model: 'jev-1.13.0', requestId: 'req-test', fallbackUsed: false },
    })
  })

  it('rejects malformed choice labels', async () => {
    const service = serviceFor({
      correct: { type: 'choice', choice: 'unknown', confidence: 0.9, probabilities: { correct: 0.9, incorrect: 0.1 } },
    })
    await expect(service.evaluateFowlWordsGuess({ secretWord: 'pumpkin', guess: 'squash' })).rejects.toThrow('Malformed Jev guess response')
  })

  it('rejects malformed probability distributions and metadata', async () => {
    const service = serviceFor({
      correct: { type: 'choice', choice: 'correct', confidence: 0.9, probabilities: { correct: 0.9, incorrect: 0.9 } },
    })
    await expect(service.evaluateFowlWordsGuess({ secretWord: 'pumpkin', guess: 'pumpkin' })).rejects.toThrow('Malformed Jev guess response')

    const badMetadata = new DecisionService(() => ({
      systemOne: () => ({ withResponse: async () => ({ data: { model: 'jev-latest', usage: { input_tokens: -1, output_tokens: 1 }, answers: { correct: { type: 'choice', choice: 'correct', confidence: 1, probabilities: { correct: 1, incorrect: 0 } } } }, requestId: undefined }) }),
    }) as never)
    await expect(badMetadata.evaluateFowlWordsGuess({ secretWord: 'pumpkin', guess: 'pumpkin' })).rejects.toThrow('Malformed Jev response metadata')
  })

  it.each([401, 422, 429, 529])('propagates provider status %s without an adapter retry', async (status) => {
    let calls = 0
    const service = new DecisionService(() => ({
      systemOne: () => {
        calls += 1
        const error = Object.assign(new Error(`provider ${status}`), { status })
        return { withResponse: async () => { throw error } }
      },
    }) as never)
    await expect(service.evaluateFowlWordsGuess({ secretWord: 'pumpkin', guess: 'pumpkin' })).rejects.toMatchObject({ status })
    expect(calls).toBe(1)
  })

  it('enforces the total deadline and aborts the in-flight request', async () => {
    let aborted = false
    const service = new DecisionService(() => ({
      systemOne: (_request: unknown, options: { signal?: AbortSignal }) => ({
        withResponse: () => new Promise((_, reject) => {
          options.signal?.addEventListener('abort', () => { aborted = true; reject(new Error('aborted')) })
        }),
      }),
    }) as never)
    const started = Date.now()
    await expect(service.evaluateFowlWordsGuess({ secretWord: 'pumpkin', guess: 'pumpkin' })).rejects.toThrow('Jev total deadline exceeded')
    expect(Date.now() - started).toBeGreaterThanOrEqual(JEV_TOTAL_DEADLINE_MS - 100)
    expect(Date.now() - started).toBeLessThan(JEV_TOTAL_DEADLINE_MS + 500)
    expect(aborted).toBe(true)
  }, 5000)

  it('passes one bounded retry policy and per-attempt timeout to the SDK', async () => {
    let options: { timeout?: number; retry?: { maxRetries?: number; httpStatuses?: Set<number> } } | undefined
    const service = new DecisionService(() => ({
      systemOne: (_request: unknown, requestOptions: unknown) => {
        options = requestOptions as typeof options
        return { withResponse: async () => ({ data: { model: 'jev-1.13.0', usage: { input_tokens: 1, output_tokens: 1 }, answers: { correct: { type: 'choice', choice: 'correct', confidence: 1, probabilities: { correct: 1, incorrect: 0 } } } }, requestId: 'req' }) }
      },
    }) as never)
    await service.evaluateFowlWordsGuess({ secretWord: 'pumpkin', guess: 'pumpkin' })
    expect(options?.timeout).toBe(JEV_ATTEMPT_TIMEOUT_MS)
    expect(options?.retry).toMatchObject({ maxRetries: 1 })
    expect([...((options?.retry?.httpStatuses) ?? new Set())]).toEqual([429, 529])
  })

  it('fails before any request when the TypeSafe key is missing', () => {
    expect(() => requireTypesafeApiKey({})).toThrow('TYPESAFE_API_KEY is not configured on the server')
  })
})
