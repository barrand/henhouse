import { describe, expect, it } from 'vitest'
import { runJevLiveContractCheck } from '../jevLiveContract'

describe('runJevLiveContractCheck', () => {
  it('uses synthetic input and returns metadata without a decision payload', async () => {
    const result = await runJevLiveContractCheck({
      classifyFowlWordsClue: async () => ({
        singleWord: true,
        tooCloseToSecret: false,
        metadata: { provider: 'jev', model: 'jev-1.13.0', requestId: 'request-123', latencyMs: 42, fallbackUsed: false },
      }),
    } as never)
    expect(result).toEqual({ model: 'jev-1.13.0', requestId: 'request-123', latencyMs: 42 })
  })
})
