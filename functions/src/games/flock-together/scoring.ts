type RoundResult = 'flock' | 'outlier' | 'rotten' | 'no-answer'

export interface ScoringResult {
  results: Record<string, RoundResult>
  flockGroupIndex: number
  pointsThisRound: Record<string, number>
}

/**
 * Groups contain unique normalized answer strings (from Gemini or fallback).
 * `answers` maps playerId -> normalized answer.
 * We count PLAYERS per group to determine the flock, not unique string count.
 */
export function scoreRoundAnswers(
  answers: Record<string, string>,
  groups: string[][],
  allPlayerIds: string[],
): ScoringResult {
  const results: Record<string, RoundResult> = {}
  const pointsThisRound: Record<string, number> = {}

  for (const playerId of allPlayerIds) {
    pointsThisRound[playerId] = 0
    if (!(playerId in answers)) {
      results[playerId] = 'no-answer'
    }
  }

  if (groups.length === 0) {
    return { results, flockGroupIndex: -1, pointsThisRound }
  }

  const groupSets = groups.map((g) => new Set(g))

  const playerCountPerGroup = groupSets.map((groupSet) =>
    Object.values(answers).filter((a) => groupSet.has(a)).length,
  )

  const maxPlayerCount = Math.max(...playerCountPerGroup)
  const indicesWithMax = playerCountPerGroup
    .map((count, i) => ({ count, i }))
    .filter(({ count }) => count === maxPlayerCount)

  if (indicesWithMax.length > 1 || maxPlayerCount < 2) {
    for (const playerId of Object.keys(answers)) {
      if (!(playerId in results)) {
        results[playerId] = 'outlier'
      }
    }
    return { results, flockGroupIndex: -1, pointsThisRound }
  }

  const flockIdx = indicesWithMax[0].i
  const flockSet = groupSets[flockIdx]

  for (const [playerId, answer] of Object.entries(answers)) {
    if (playerId in results) continue
    if (flockSet.has(answer)) {
      results[playerId] = 'flock'
      pointsThisRound[playerId] = 1
    } else {
      results[playerId] = 'outlier'
    }
  }

  const soloIndices = playerCountPerGroup
    .map((count, i) => ({ count, i }))
    .filter(({ count }) => count === 1)

  if (soloIndices.length === 1) {
    const soloSet = groupSets[soloIndices[0].i]
    const soloPlayerId = Object.entries(answers).find(([, a]) => soloSet.has(a))?.[0]
    if (soloPlayerId) {
      results[soloPlayerId] = 'rotten'
      pointsThisRound[soloPlayerId] = -1
    }
  }

  return { results, flockGroupIndex: flockIdx, pointsThisRound }
}
