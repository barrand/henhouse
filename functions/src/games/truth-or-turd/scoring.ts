export type TruthOrTurdRoundResult = 'correct' | 'incorrect' | 'no-answer'

export interface TruthOrTurdScoringResult {
  results: Record<string, TruthOrTurdRoundResult>
  pointsThisRound: Record<string, number>
}

export function scoreTruthOrTurdRound(
  playerAnswers: Record<string, string>,
  correctAnswer: string,
  eligiblePlayerIds: string[],
): TruthOrTurdScoringResult {
  const results: Record<string, TruthOrTurdRoundResult> = {}
  const pointsThisRound: Record<string, number> = {}

  for (const playerId of eligiblePlayerIds) {
    const answer = playerAnswers[playerId]
    if (!answer) {
      results[playerId] = 'no-answer'
      pointsThisRound[playerId] = 0
      continue
    }

    const correct = answer === correctAnswer
    results[playerId] = correct ? 'correct' : 'incorrect'
    pointsThisRound[playerId] = correct ? 1 : 0
  }

  return { results, pointsThisRound }
}
