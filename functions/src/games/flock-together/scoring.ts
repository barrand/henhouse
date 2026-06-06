type RoundResult = 'flock' | 'outlier' | 'rotten' | 'no-answer'

export interface ScoringResult {
  results: Record<string, RoundResult>
  rottenEggHolder: string | null
  flockGroupIndex: number
}

/**
 * Groups contain unique normalized answer strings (from Gemini or fallback).
 * `answers` maps playerId -> normalized answer.
 * We count PLAYERS per group to determine the flock, not unique string count.
 */
export function scoreRoundAnswers(
  answers: Record<string, string>,
  groups: string[][],
  currentRottenEggHolder: string | null,
  allPlayerIds: string[],
): ScoringResult {
  const results: Record<string, RoundResult> = {}

  for (const playerId of allPlayerIds) {
    if (!(playerId in answers)) {
      results[playerId] = 'no-answer'
    }
  }

  if (groups.length === 0) {
    return { results, rottenEggHolder: currentRottenEggHolder, flockGroupIndex: -1 }
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
    return { results, rottenEggHolder: currentRottenEggHolder, flockGroupIndex: -1 }
  }

  const flockIdx = indicesWithMax[0].i
  const flockSet = groupSets[flockIdx]

  for (const [playerId, answer] of Object.entries(answers)) {
    if (playerId in results) continue
    results[playerId] = flockSet.has(answer) ? 'flock' : 'outlier'
  }

  let newRottenEggHolder = currentRottenEggHolder
  const soloIndices = playerCountPerGroup
    .map((count, i) => ({ count, i }))
    .filter(({ count }) => count === 1)

  if (soloIndices.length === 1) {
    const soloSet = groupSets[soloIndices[0].i]
    const soloPlayerId = Object.entries(answers).find(([, a]) => soloSet.has(a))?.[0]
    if (soloPlayerId) {
      results[soloPlayerId] = 'rotten'
      newRottenEggHolder = soloPlayerId
    }
  }

  return { results, rottenEggHolder: newRottenEggHolder, flockGroupIndex: flockIdx }
}
