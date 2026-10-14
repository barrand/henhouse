import { choice, TypeSafeClient } from '@typesafe-ai/sdk'

export const JEV_MODEL = 'jev-1.13.0'
export const JEV_ATTEMPT_TIMEOUT_MS = 1500
export const JEV_TOTAL_DEADLINE_MS = 2000
export interface DecisionMetadata { provider: 'legacy' | 'jev' | 'deterministic'; model?: string; requestId?: string; latencyMs: number; confidence?: number; probabilities?: Record<string, number>; fallbackUsed: boolean }
export interface ClueDecision { singleWord: boolean; tooCloseToSecret: boolean; metadata: DecisionMetadata }
export interface GuessDecision { correct: boolean; metadata: DecisionMetadata }
export interface AnswerPairInput { id: string; question: string; left: string; right: string }
export interface AnswerPairDecision { id: string; sameMeaning: boolean; metadata: DecisionMetadata }
type Client = Pick<TypeSafeClient, 'systemOne'>

export function requireTypesafeApiKey(environment: NodeJS.ProcessEnv = process.env): string {
  const apiKey = environment.TYPESAFE_API_KEY?.trim()
  if (!apiKey) throw new Error('TYPESAFE_API_KEY is not configured on the server')
  return apiKey
}

function getClient(): Client {
  const apiKey = requireTypesafeApiKey()
  return new TypeSafeClient({ apiKey, defaultModel: process.env.JEV_DEFAULT_MODEL?.trim() || JEV_MODEL, timeout: JEV_ATTEMPT_TIMEOUT_MS, retry: { maxRetries: 1, httpStatuses: new Set([429, 529]), apiTimeoutError: false }, logLevel: 'off' })
}

function validate(answer: unknown, labels: string[]): answer is { type: 'choice'; choice: string; confidence: number; probabilities: Record<string, number> } {
  if (!answer || typeof answer !== 'object') return false
  const candidate = answer as Partial<{ type: string; choice: string; confidence: number; probabilities: Record<string, number> }>
  const confidence = candidate.confidence
  if (candidate.type !== 'choice' || !labels.includes(candidate.choice ?? '') || typeof confidence !== 'number' || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) return false
  const probabilities = candidate.probabilities
  if (!probabilities || Object.keys(probabilities).length !== labels.length || labels.some((label) => !Object.prototype.hasOwnProperty.call(probabilities, label))) return false
  if (Object.values(probabilities).some((value) => !Number.isFinite(value) || value < 0 || value > 1)) return false
  const total = Object.values(probabilities).reduce((sum, value) => sum + value, 0)
  return Math.abs(total - 1) <= 0.001
}

async function withTotalDeadline<T>(operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController()
  let deadlineTimer: ReturnType<typeof setTimeout> | undefined
  let expired = false
  const deadline = new Promise<never>((_, reject) => {
    deadlineTimer = setTimeout(() => {
      expired = true
      controller.abort()
      reject(new Error('Jev total deadline exceeded'))
    }, JEV_TOTAL_DEADLINE_MS)
  })
  try {
    return await Promise.race([operation(controller.signal), deadline])
  } catch (error) {
    if (expired) throw new Error('Jev total deadline exceeded')
    throw error
  } finally {
    if (deadlineTimer) clearTimeout(deadlineTimer)
  }
}

export class DecisionService {
  constructor(private readonly clientFactory: () => Client = getClient) {}
  async classifyFowlWordsClue(input: { clue: string; secretWord: string }): Promise<ClueDecision> {
    const started = Date.now()
    const response = await withTotalDeadline((signal) => this.clientFactory().systemOne({ model: JEV_MODEL, state: input, questions: { singleWord: choice('Is the clue normally one standalone word?', { single_word: 'One word.', joined_words: 'Joined phrase.' }), tooClose: choice('Is clue only a disguised form of secret?', { too_close: 'Same word disguised.', acceptable: 'Different word.' }) } }, { signal, timeout: JEV_ATTEMPT_TIMEOUT_MS, retry: { maxRetries: 1, httpStatuses: new Set([429, 529]), apiTimeoutError: false } }).withResponse())
    if (response.data.model !== JEV_MODEL || !Number.isInteger(response.data.usage?.input_tokens) || response.data.usage.input_tokens < 0 || !Number.isInteger(response.data.usage?.output_tokens) || response.data.usage.output_tokens < 0) throw new Error('Malformed Jev response metadata')
    const a = response.data.answers.singleWord; const b = response.data.answers.tooClose
    if (!validate(a, ['single_word', 'joined_words']) || !validate(b, ['too_close', 'acceptable'])) throw new Error('Malformed Jev clue response')
    return { singleWord: a.choice === 'single_word', tooCloseToSecret: b.choice === 'too_close', metadata: { provider: 'jev', model: response.data.model, requestId: response.requestId, latencyMs: Date.now() - started, confidence: Math.min(a.confidence, b.confidence), probabilities: { ...a.probabilities, ...b.probabilities }, fallbackUsed: false } }
  }
  async evaluateFowlWordsGuess(input: { secretWord: string; guess: string }): Promise<GuessDecision> {
    const started = Date.now()
    const response = await withTotalDeadline((signal) => this.clientFactory().systemOne({ model: JEV_MODEL, state: input, questions: { correct: choice('Do guess and secret mean the same thing? Reject merely related words.', { correct: 'Same.', incorrect: 'Different.' }) } }, { signal, timeout: JEV_ATTEMPT_TIMEOUT_MS, retry: { maxRetries: 1, httpStatuses: new Set([429, 529]), apiTimeoutError: false } }).withResponse())
    if (response.data.model !== JEV_MODEL || !Number.isInteger(response.data.usage?.input_tokens) || response.data.usage.input_tokens < 0 || !Number.isInteger(response.data.usage?.output_tokens) || response.data.usage.output_tokens < 0) throw new Error('Malformed Jev response metadata')
    const a = response.data.answers.correct
    if (!validate(a, ['correct', 'incorrect'])) throw new Error('Malformed Jev guess response')
    return { correct: a.choice === 'correct', metadata: { provider: 'jev', model: response.data.model, requestId: response.requestId, latencyMs: Date.now() - started, confidence: a.confidence, fallbackUsed: false } }
  }
  async compareFlockAnswers(inputs: AnswerPairInput[]): Promise<AnswerPairDecision[]> {
    return Promise.all(inputs.map(async (input) => {
      const started = Date.now(); const response = await withTotalDeadline((signal) => this.clientFactory().systemOne({ model: JEV_MODEL, state: { id: input.id, question: input.question, left: input.left, right: input.right }, questions: { same: choice('Do left and right mean the same answer?', { same: 'Equivalent.', different: 'Different.' }) } }, { signal, timeout: JEV_ATTEMPT_TIMEOUT_MS, retry: { maxRetries: 1, httpStatuses: new Set([429, 529]), apiTimeoutError: false } }).withResponse()); if (response.data.model !== JEV_MODEL || !Number.isInteger(response.data.usage?.input_tokens) || response.data.usage.input_tokens < 0 || !Number.isInteger(response.data.usage?.output_tokens) || response.data.usage.output_tokens < 0) throw new Error('Malformed Jev response metadata'); const a = response.data.answers.same
      if (!validate(a, ['same', 'different'])) throw new Error('Malformed Jev pair response')
      return { id: input.id, sameMeaning: a.choice === 'same', metadata: { provider: 'jev', model: response.data.model, requestId: response.requestId, latencyMs: Date.now() - started, confidence: a.confidence, fallbackUsed: false } }
    }))
  }
}
