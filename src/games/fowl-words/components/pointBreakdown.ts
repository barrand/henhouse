/** Reconstruct per-player point chips from round data (must sum to pointsThisRound). */

import type { RoundData } from '../types'
import { ATTEMPT_POINTS } from '../types'
import {
  countGroupPeerLoves,
  effectiveMostHelpfulVote,
  effectivePeerLoveVotes,
  mostHelpfulSplitPts,
} from './clueVoteUi'

export type PointChipKind = 'guess' | 'used' | 'fast' | 'dup' | 'love' | 'helpful'

/** Mirrors backend fastBonusPrizes — max single prize is +3 */
function fastBonusPrizes(giverCount: number): number[] {
  if (giverCount >= 5) return [3, 2, 1]
  return [3]
}

function computeFastBonuses(
  round: RoundData,
): Record<string, number> {
  const bonuses: Record<string, number> = {}
  if (!round.isCorrect) return bonuses

  const visiblePlayerIds: string[] = []
  for (const idx of round.visibleGroupIndexes) {
    const group = round.clueGroups[idx]
    if (!group) continue
    for (const pid of group.playerIds) visiblePlayerIds.push(pid)
  }
  if (visiblePlayerIds.length === 0) return bonuses

  const giverCount = Object.keys(round.cluesByPlayer).length
  const prizes = fastBonusPrizes(giverCount)
  const timestamps = round.clueTimestamps ?? {}
  const sorted = [...visiblePlayerIds].sort(
    (a, b) => (timestamps[a] ?? Number.MAX_SAFE_INTEGER) - (timestamps[b] ?? Number.MAX_SAFE_INTEGER),
  )

  for (let i = 0; i < Math.min(prizes.length, sorted.length); i++) {
    bonuses[sorted[i]] = prizes[i]
  }
  return bonuses
}

export interface PointChip {
  kind: PointChipKind
  pts: number
}

function mergeChip(map: Record<string, PointChip[]>, pid: string, kind: PointChipKind, pts: number) {
  if (pts === 0) return
  if (!map[pid]) map[pid] = []
  const existing = map[pid].find((c) => c.kind === kind)
  if (existing) existing.pts += pts
  else map[pid].push({ kind, pts })
}

const CHIP_ORDER: PointChipKind[] = ['guess', 'used', 'fast', 'love', 'helpful', 'dup']

export function sortPointChips(chips: PointChip[]): PointChip[] {
  return [...chips].sort(
    (a, b) => CHIP_ORDER.indexOf(a.kind) - CHIP_ORDER.indexOf(b.kind),
  )
}

export function computeRoundPointBreakdown(
  round: RoundData,
  guesserId: string,
): Record<string, PointChip[]> {
  const chips: Record<string, PointChip[]> = {}
  const peerLoveVotes = effectivePeerLoveVotes(round.cluePeerLoveVotes, round.clueStarVotes)
  const mostHelpfulIdx = effectiveMostHelpfulVote(round.guesserMostHelpfulVote, round.guesserStarVote)

  for (const group of round.clueGroups) {
    for (const pid of group.playerIds) {
      if (group.isDuplicate) mergeChip(chips, pid, 'dup', -1)
    }
  }

  if (!round.isCorrect) return chips

  const attemptPts = ATTEMPT_POINTS[round.currentAttempt - 1] ?? 0
  mergeChip(chips, guesserId, 'guess', attemptPts)

  for (const idx of round.visibleGroupIndexes) {
    const group = round.clueGroups[idx]
    if (!group) continue
    for (const pid of group.playerIds) {
      mergeChip(chips, pid, 'used', attemptPts)
    }
    const loveCount = countGroupPeerLoves(peerLoveVotes, idx)
    if (loveCount > 0) {
      for (const pid of group.playerIds) {
        mergeChip(chips, pid, 'love', loveCount)
      }
    }
  }

  const fastBonuses = computeFastBonuses(round)
  for (const [pid, pts] of Object.entries(fastBonuses)) {
    mergeChip(chips, pid, 'fast', pts)
  }

  if (mostHelpfulIdx !== null) {
    const group = round.clueGroups[mostHelpfulIdx]
    if (group && round.visibleGroupIndexes.includes(mostHelpfulIdx)) {
      const helpfulPts = mostHelpfulSplitPts(group.playerIds.length)
      for (const pid of group.playerIds) {
        mergeChip(chips, pid, 'helpful', helpfulPts)
      }
    }
  }

  // Sort and drop empty
  for (const pid of Object.keys(chips)) {
    chips[pid] = sortPointChips(chips[pid].filter((c) => c.pts !== 0))
    if (chips[pid].length === 0) delete chips[pid]
  }

  return chips
}
