export type RoundEligibility = {
  eligiblePlayerIds?: string[]
}

export type PlayerLike = {
  id: string
}

export function getEligiblePlayers<P extends PlayerLike>(
  round: RoundEligibility | null | undefined,
  players: P[],
): P[] {
  const eligibleIds = round?.eligiblePlayerIds
  if (!Array.isArray(eligibleIds) || eligibleIds.length === 0) return players
  const eligibleSet = new Set(eligibleIds)
  return players.filter((player) => eligibleSet.has(player.id))
}

export function isCurrentPlayerWaiting(
  round: RoundEligibility | null | undefined,
  currentPlayerId: string | null | undefined,
): boolean {
  const eligibleIds = round?.eligiblePlayerIds
  if (!currentPlayerId || !Array.isArray(eligibleIds) || eligibleIds.length === 0) return false
  return !eligibleIds.includes(currentPlayerId)
}
