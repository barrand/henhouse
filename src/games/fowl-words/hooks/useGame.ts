import { useRoomState, useRoundState } from '@shared/useRoomState'
import { onGameUpdate, onPlayersUpdate, onRoundUpdate } from '../service'

export function useGame(gameId: string | null) {
  const game = useRoomState(gameId, onGameUpdate)
  const players = useRoomState(gameId, onPlayersUpdate)
  return { game: game?.data ?? null, players: players?.data ?? [], loading: !game }
}

export function useRound(gameId: string | null, roundNum: number | null) {
  return useRoundState(gameId, roundNum, onRoundUpdate)
}
