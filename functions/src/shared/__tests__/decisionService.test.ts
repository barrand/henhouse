import { describe, expect, it } from 'vitest'
import { DecisionService } from '../decisionService'

function serviceFor(answers: Record<string, unknown>) {
  return new DecisionService(() => ({
    systemOne: () => ({
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
})
