// Just One scoring logic.
// Phase 3A: single-attempt scoring (10 if correct, 0 if wrong)
// Phase 3B will add ATTEMPT_POINTS = [10, 5, 2, 1] and unlock priority

import type { ClueGroup } from './types'

// Phase 3A: single attempt, always 10 points if correct
export const ATTEMPT_POINTS = [10, 5, 2, 1]

/**
 * Compute final scores for the round.
 * Phase 3A: any player in a visible group (i.e., a unique-clue player) gets points if guesser correct.
 * Locked groups (duplicates) get 0 in Phase 3A since there are no further attempts.
 */
export function computeRoundScores(
  clueGroups: ClueGroup[],
  visibleGroupIndexes: number[],
  guesserId: string,
  isCorrect: boolean,
  currentAttempt: number,
): Record<string, number> {
  const scores: Record<string, number> = {}

  if (!isCorrect) {
    // All players get 0 if guesser failed
    for (const group of clueGroups) {
      for (const playerId of group.playerIds) {
        scores[playerId] = 0
      }
    }
    scores[guesserId] = 0
    return scores
  }

  const pointValue = ATTEMPT_POINTS[currentAttempt - 1] ?? 0

  // Visible groups get the attempt's point value
  for (const group of clueGroups) {
    for (const playerId of group.playerIds) {
      scores[playerId] = 0 // default to 0
    }
  }

  for (const idx of visibleGroupIndexes) {
    const group = clueGroups[idx]
    if (!group) continue
    for (const playerId of group.playerIds) {
      scores[playerId] = pointValue
    }
  }

  // Guesser gets points too
  scores[guesserId] = pointValue

  return scores
}

/**
 * Build ClueGroup objects from Gemini's grouped output + clue texts.
 * Returns groups sorted with unique groups first.
 */
export function buildClueGroups(
  geminiGroups: string[][],
  cluesByPlayer: Record<string, string>,
): ClueGroup[] {
  const groups: ClueGroup[] = geminiGroups.map((playerIds) => ({
    playerIds,
    clueText: cluesByPlayer[playerIds[0]] ?? '',
    isDuplicate: playerIds.length >= 2,
  }))

  // Sort: unique groups first (for stable display ordering)
  return groups.sort((a, b) => {
    if (a.isDuplicate === b.isDuplicate) return 0
    return a.isDuplicate ? 1 : -1
  })
}

/**
 * Compute which group indexes are initially visible.
 * Returns indexes of all unique (size-1) groups.
 * Edge case: if there are NO unique groups (everyone duped), reveal the first duplicate group.
 */
export function initialVisibleGroupIndexes(clueGroups: ClueGroup[]): number[] {
  const uniqueIndexes = clueGroups
    .map((g, i) => (g.isDuplicate ? -1 : i))
    .filter((i) => i >= 0)

  if (uniqueIndexes.length > 0) return uniqueIndexes

  // No unique clues — show the first dupe group so guesser always has something
  if (clueGroups.length > 0) return [0]
  return []
}
