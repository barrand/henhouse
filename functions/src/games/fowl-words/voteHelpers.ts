import type { PeerLoveVotes } from './peerLove'

type RoundVoteFields = {
  cluePeerLoveVotes?: PeerLoveVotes
  clueStarVotes?: Record<string, number>
  cluePeerBooVotes?: Record<string, number>
  clueThumbsDownVotes?: Record<string, number>
  guesserMostHelpfulVote?: number | null
  guesserStarVote?: number | null
  guesserBooVote?: number | null
  guesserThumbsDownVote?: number | null
}

export function giverLovesForPlayer(round: RoundVoteFields, uid: string): Record<string, true> {
  const fromNew = round.cluePeerLoveVotes?.[uid]
  if (fromNew && Object.keys(fromNew).length > 0) return { ...fromNew }
  const legacy = round.clueStarVotes?.[uid]
  if (legacy !== undefined) return { [String(legacy)]: true }
  return {}
}

export function giverBooForPlayer(round: RoundVoteFields, uid: string): number | undefined {
  return round.cluePeerBooVotes?.[uid] ?? round.clueThumbsDownVotes?.[uid]
}

export function guesserMostHelpfulFromRound(round: RoundVoteFields): number | null {
  return round.guesserMostHelpfulVote ?? round.guesserStarVote ?? null
}

export function guesserBooFromRound(round: RoundVoteFields): number | null {
  return round.guesserBooVote ?? round.guesserThumbsDownVote ?? null
}
