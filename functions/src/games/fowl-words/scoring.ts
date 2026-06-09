// Fowl Words scoring logic.
//
// Scoring (post-playtest rebalance):
// - Attempt 1: 10 pts if correct
// - Attempt 2: 5 pts
// - Attempt 3: 2 pts
// - Attempt 4: 1 pt
// - All fail: 0 pts for everyone
//
// Giver bonuses (on top of attempt points):
//   USED:      +attemptPts if your group is visible when guesser succeeds
//   FAST:      Tiered bonus for fastest clue submitters among USED clues.
//              Number of winners scales with giver count (total players - 1):
//                ≤5 givers: 1st place → +3
//                6–8 givers: 1st → +3, 2nd → +2
//                9+ givers:  1st → +3, 2nd → +2, 3rd → +1
//   DUPLICATE: -1 always, for every player in an isDuplicate group
//              (even if their group was later unlocked / shown)
//
// On wrong guess, server picks the next group to unlock using priority:
//   priority = lowestScoreInGroup + (groupSize * 2)
//   lower priority unlocks first
//   tiebreaker: earliest submission timestamp

import type { ClueGroup } from './types'

export const ATTEMPT_POINTS = [10, 5, 2, 1]
export const MAX_ATTEMPTS = 4

/**
 * Returns the fast-bonus prizes for a given giver count.
 * Prizes are awarded to the top N fastest submitters among USED clues.
 *   ≤5 givers: [+3]
 *   6–8 givers: [+3, +2]
 *   9+ givers:  [+3, +2, +1]
 */
export function fastBonusPrizes(giverCount: number): number[] {
  if (giverCount >= 9) return [3, 2, 1]
  if (giverCount >= 6) return [3, 2]
  return [3]
}

/**
 * Compute final scores for the round.
 *
 * Scoring rules:
 *  - DUPLICATE penalty: -1 for every player in an isDuplicate group (always applied)
 *  - USED bonus: +attemptPts for players whose group is visible when guesser succeeds
 *  - FAST bonus: tiered bonus for fastest submitters among USED players (see fastBonusPrizes)
 *  - Guesser: +attemptPts if correct, +0 if not
 *  - All fail: giver scores = only penalty points (duplicates get -1, others 0)
 */
export function computeRoundScores(
  clueGroups: ClueGroup[],
  visibleGroupIndexes: number[],
  guesserId: string,
  isCorrect: boolean,
  currentAttempt: number,
  clueTimestamps: Record<string, number> = {},
  giverCount: number = 0,
): Record<string, number> {
  const scores: Record<string, number> = {}

  // Initialize all to 0
  for (const group of clueGroups) {
    for (const playerId of group.playerIds) {
      scores[playerId] = 0
    }
  }
  scores[guesserId] = 0

  // Step 1: Duplicate penalty — always applied regardless of outcome
  for (const group of clueGroups) {
    if (group.isDuplicate) {
      for (const playerId of group.playerIds) {
        scores[playerId] = -1
      }
    }
  }

  if (!isCorrect) return scores

  // Step 2: Used bonus — players in visible groups get attempt points
  const pointValue = ATTEMPT_POINTS[currentAttempt - 1] ?? 0
  const visiblePlayerIds: string[] = []

  for (const idx of visibleGroupIndexes) {
    const group = clueGroups[idx]
    if (!group) continue
    for (const playerId of group.playerIds) {
      // Add to existing (-1 for duplicates, 0 for uniques)
      scores[playerId] = (scores[playerId] ?? 0) + pointValue
      visiblePlayerIds.push(playerId)
    }
  }

  // Guesser always gets attempt pts if correct
  scores[guesserId] = pointValue

  // Step 3: Fast bonus — tiered prizes for fastest submitters among USED (visible) clues
  if (visiblePlayerIds.length > 0) {
    const prizes = fastBonusPrizes(giverCount)
    const sorted = [...visiblePlayerIds].sort((a, b) => {
      const tA = clueTimestamps[a] ?? Number.MAX_SAFE_INTEGER
      const tB = clueTimestamps[b] ?? Number.MAX_SAFE_INTEGER
      return tA - tB
    })
    for (let i = 0; i < Math.min(prizes.length, sorted.length); i++) {
      scores[sorted[i]] = (scores[sorted[i]] ?? 0) + prizes[i]
    }
  }

  return scores
}

/**
 * Compute "tentative" points the players would receive if the guesser nailed
 * the CURRENT attempt right now. Written to the round doc and used purely for
 * client display — no scoring math on the client.
 */
export function computeTentativePoints(
  clueGroups: ClueGroup[],
  visibleGroupIndexes: number[],
  guesserId: string,
  currentAttempt: number,
  clueTimestamps: Record<string, number> = {},
  giverCount: number = 0,
): Record<string, number> {
  return computeRoundScores(clueGroups, visibleGroupIndexes, guesserId, true, currentAttempt, clueTimestamps, giverCount)
}

/**
 * Pick which locked group to unlock next, based on the priority formula:
 *   priority = lowestScoreInGroup + (groupSize * 2)
 *   lower priority wins; tiebreaker = earliest submission timestamp
 *
 * Returns the INDEX into clueGroups of the group to unlock, or -1 if no
 * locked groups remain.
 */
export function selectNextUnlockGroup(
  clueGroups: ClueGroup[],
  visibleGroupIndexes: number[],
  playerScores: Record<string, number>,
  clueTimestamps: Record<string, number>,
): number {
  const visibleSet = new Set(visibleGroupIndexes)
  const candidates: { index: number; priority: number; earliestSubmittedAt: number }[] = []

  for (let i = 0; i < clueGroups.length; i++) {
    if (visibleSet.has(i)) continue
    const group = clueGroups[i]
    if (group.playerIds.length === 0) continue

    const lowestScore = Math.min(
      ...group.playerIds.map((id) => playerScores[id] ?? 0),
    )
    const priority = lowestScore + group.playerIds.length * 2

    const earliestSubmittedAt = Math.min(
      ...group.playerIds.map((id) => clueTimestamps[id] ?? Number.MAX_SAFE_INTEGER),
    )

    candidates.push({ index: i, priority, earliestSubmittedAt })
  }

  if (candidates.length === 0) return -1

  candidates.sort((a, b) =>
    a.priority - b.priority || a.earliestSubmittedAt - b.earliestSubmittedAt,
  )
  return candidates[0].index
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
    // Preserve ALL clue texts — same order as playerIds — so we don't lose
    // variant info like "cat" vs "cats" when grouped together.
    clueTexts: playerIds.map((id) => cluesByPlayer[id] ?? ''),
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
 * Returns indexes of all unique (size-1) groups ONLY.
 *
 * Duplicate groups are ALWAYS locked initially, even if there are no unique groups.
 * If all clues are duplicates, guesser starts with zero visible clues and must guess wrong
 * to unlock the first duplicate group. This maintains the multi-attempt mechanic and scoring.
 */
export function initialVisibleGroupIndexes(clueGroups: ClueGroup[]): number[] {
  const uniqueIndexes = clueGroups
    .map((g, i) => (g.isDuplicate ? -1 : i))
    .filter((i) => i >= 0)

  return uniqueIndexes
}
