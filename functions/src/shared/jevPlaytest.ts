import { DecisionService } from './decisionService'
import meanings from './jevMeanings.json'

export const JEV_PLAYTEST_VERSION = 'jev-playtest-v2'
export const JEV_PLAYTEST_GUESS_THRESHOLD = .64
export function playtestGuessOptions(secret: string): { rubric: 'grounded' | 'simple'; definition?: string } {
  const definition = (meanings as Record<string, string>)[secret.trim().toLowerCase()]
  return definition ? { rubric: 'grounded', definition } : { rubric: 'simple' }
}
export async function evaluatePlaytestGuess(secretWord: string, guess: string, service = new DecisionService()) {
  return service.evaluateFowlWordsGuess({ secretWord, guess }, playtestGuessOptions(secretWord))
}
