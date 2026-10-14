import type { ClueDecision, GuessDecision } from './decisionService'

// Provisional until the documented development sweep freezes a semantic config.
export const JEV_CLUE_THRESHOLD = 0.75
export const JEV_GUESS_THRESHOLD = 0.75
export function acceptsJevClue(decision: ClueDecision): boolean {
  const p = decision.metadata.probabilities ?? {}
  return !(!decision.singleWord && (p.joined_words ?? 0) >= JEV_CLUE_THRESHOLD)
    && !(decision.tooCloseToSecret && (p.too_close ?? 0) >= JEV_CLUE_THRESHOLD)
}
export function acceptsJevGuess(decision: GuessDecision): boolean {
  return decision.correct && (decision.metadata.probabilities?.correct ?? 0) >= JEV_GUESS_THRESHOLD
}
