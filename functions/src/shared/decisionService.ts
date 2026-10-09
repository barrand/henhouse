import { choice, TypeSafeClient } from '@typesafe-ai/sdk'

export const JEV_MODEL = 'jev-1.13.0'
export interface DecisionMetadata { provider: 'legacy' | 'jev' | 'deterministic'; model?: string; requestId?: string; latencyMs: number; confidence?: number; fallbackUsed: boolean }
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
  return new TypeSafeClient({ apiKey, defaultModel: process.env.JEV_DEFAULT_MODEL?.trim() || JEV_MODEL, timeout: 1500, retry: { maxRetries: 1, httpStatuses: new Set([429, 529]), apiTimeoutError: false }, logLevel: 'off' })
}

function validate(answer: { type: string; choice: string; confidence: number; probabilities: Record<string, number> }, labels: string[]) {
  return answer.type === 'choice' && labels.includes(answer.choice) && Number.isFinite(answer.confidence) && answer.confidence >= 0 && answer.confidence <= 1 && Object.keys(answer.probabilities).length === labels.length && Object.values(answer.probabilities).every((value) => Number.isFinite(value) && value >= 0 && value <= 1)
}

export class DecisionService {
  constructor(private readonly clientFactory: () => Client = getClient) {}
  async classifyFowlWordsClue(input: { clue: string; secretWord: string }): Promise<ClueDecision> {
    const started = Date.now()
    const response = await this.clientFactory().systemOne({ model: JEV_MODEL, state: input, questions: { singleWord: choice('Is the clue normally one standalone word?', { single_word: 'One word.', joined_words: 'Joined phrase.' }), tooClose: choice('Is clue only a disguised form of secret?', { too_close: 'Same word disguised.', acceptable: 'Different word.' }) } }).withResponse()
    const a = response.data.answers.singleWord; const b = response.data.answers.tooClose
    if (!validate(a, ['single_word', 'joined_words']) || !validate(b, ['too_close', 'acceptable'])) throw new Error('Malformed Jev clue response')
    return { singleWord: a.choice === 'single_word', tooCloseToSecret: b.choice === 'too_close', metadata: { provider: 'jev', model: response.data.model, requestId: response.requestId, latencyMs: Date.now() - started, confidence: Math.min(a.confidence, b.confidence), fallbackUsed: false } }
  }
  async evaluateFowlWordsGuess(input: { secretWord: string; guess: string }): Promise<GuessDecision> {
    const started = Date.now()
    const response = await this.clientFactory().systemOne({ model: JEV_MODEL, state: input, questions: { correct: choice('Do guess and secret mean the same thing? Reject merely related words.', { correct: 'Same.', incorrect: 'Different.' }) } }).withResponse()
    const a = response.data.answers.correct
    if (!validate(a, ['correct', 'incorrect'])) throw new Error('Malformed Jev guess response')
    return { correct: a.choice === 'correct', metadata: { provider: 'jev', model: response.data.model, requestId: response.requestId, latencyMs: Date.now() - started, confidence: a.confidence, fallbackUsed: false } }
  }
  async compareFlockAnswers(inputs: AnswerPairInput[]): Promise<AnswerPairDecision[]> {
    return Promise.all(inputs.map(async (input) => {
      const started = Date.now(); const response = await this.clientFactory().systemOne({ model: JEV_MODEL, state: { id: input.id, question: input.question, left: input.left, right: input.right }, questions: { same: choice('Do left and right mean the same answer?', { same: 'Equivalent.', different: 'Different.' }) } }).withResponse(); const a = response.data.answers.same
      if (!validate(a, ['same', 'different'])) throw new Error('Malformed Jev pair response')
      return { id: input.id, sameMeaning: a.choice === 'same', metadata: { provider: 'jev', model: response.data.model, requestId: response.requestId, latencyMs: Date.now() - started, confidence: a.confidence, fallbackUsed: false } }
    }))
  }
}
