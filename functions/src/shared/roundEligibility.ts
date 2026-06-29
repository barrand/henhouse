type GameLike = {
  playerIds?: string[]
  currentGuesser?: string | null
}

type RoundLike = {
  eligiblePlayerIds?: string[]
  eligiblePlayerCount?: number
}

export function getRoundEligiblePlayerIds(round: RoundLike, game: GameLike): string[] {
  if (Array.isArray(round.eligiblePlayerIds) && round.eligiblePlayerIds.length > 0) {
    return round.eligiblePlayerIds
  }

  return Array.isArray(game.playerIds) ? game.playerIds : []
}

export function isRoundEligible(round: RoundLike, game: GameLike, uid: string): boolean {
  return getRoundEligiblePlayerIds(round, game).includes(uid)
}

export function eligibleCount(round: RoundLike, game: GameLike): number {
  return getRoundEligiblePlayerIds(round, game).length
}

export function eligibleNonGuesserIds(round: RoundLike, game: GameLike): string[] {
  const guesser = game.currentGuesser ?? null
  return getRoundEligiblePlayerIds(round, game).filter((id) => id !== guesser)
}
