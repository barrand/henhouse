import type { ClueGroup } from './types'

export type PeerLoveVotes = Record<string, Record<string, true>>

/** +5 split among co-authors; floor of +1 each (matches UI). */
export function mostHelpfulSplitPts(authorCount: number): number {
  return Math.max(1, Math.floor(5 / authorCount))
}

/** Merge new map-of-maps with legacy single-vote map (legacy fills unmigrated voters). */
export function effectivePeerLoveVotes(
  cluePeerLoveVotes: PeerLoveVotes | undefined,
  clueStarVotes: Record<string, number> | undefined,
): PeerLoveVotes {
  const result: PeerLoveVotes = { ...(cluePeerLoveVotes ?? {}) }
  if (!clueStarVotes) return result
  for (const [voterId, groupIdx] of Object.entries(clueStarVotes)) {
    const existing = result[voterId]
    if (!existing || Object.keys(existing).length === 0) {
      result[voterId] = { [String(groupIdx)]: true }
    }
  }
  return result
}

export function effectivePeerLoveVotesFromRound(round: {
  cluePeerLoveVotes?: PeerLoveVotes
  clueStarVotes?: Record<string, number>
}): PeerLoveVotes {
  return effectivePeerLoveVotes(round.cluePeerLoveVotes, round.clueStarVotes)
}

/**
 * +1 per author in a visible group for each peer-love vote targeting that group.
 * Includes visible duplicates. Mutates `scores` in place.
 */
export function applyPeerLoveVotes(
  cluePeerLoveVotes: PeerLoveVotes,
  clueGroups: ClueGroup[],
  visibleGroupIndexes: number[],
  scores: Record<string, number>,
): void {
  const visibleSet = new Set(visibleGroupIndexes)
  for (const loves of Object.values(cluePeerLoveVotes)) {
    for (const groupIdxStr of Object.keys(loves)) {
      const groupIdx = Number(groupIdxStr)
      if (!visibleSet.has(groupIdx)) continue
      const group = clueGroups[groupIdx]
      if (!group) continue
      for (const pid of group.playerIds) {
        scores[pid] = (scores[pid] ?? 0) + 1
      }
    }
  }
}
