import { DecisionService, type DecisionMetadata } from './decisionService'

export interface JevLiveContractResult {
  model?: string
  requestId?: string
  latencyMs: number
}

// This intentionally uses synthetic input and returns metadata only. It is a
// credential and response-shape probe, not a gameplay decision path.
export async function runJevLiveContractCheck(service = new DecisionService()): Promise<JevLiveContractResult> {
  const result = await service.classifyFowlWordsClue({ clue: 'cabin', secretWord: 'candle' })
  return sanitizeMetadata(result.metadata)
}

function sanitizeMetadata(metadata: DecisionMetadata): JevLiveContractResult {
  return {
    model: metadata.model,
    requestId: metadata.requestId,
    latencyMs: metadata.latencyMs,
  }
}
