import { useState, useEffect } from 'react'
import { onGameUpdate, onPlayersUpdate, onRoundUpdate } from '../service'
import type { GameData, PlayerData, RoundData } from '../types'

export function useGame(gameId: string | null) {
  const [game, setGame] = useState<GameData | null>(null)
  const [players, setPlayers] = useState<PlayerData[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!gameId) return

    setLoading(true)
    const unsubGame = onGameUpdate(gameId, (data) => {
      setGame(data)
      setLoading(false)
    })
    const unsubPlayers = onPlayersUpdate(gameId, setPlayers)

    return () => {
      unsubGame()
      unsubPlayers()
    }
  }, [gameId])

  return { game, players, loading }
}

export function useRound(gameId: string | null, roundNum: number | null) {
  const [round, setRound] = useState<RoundData | null>(null)

  useEffect(() => {
    if (!gameId || !roundNum) {
      setRound(null)
      return
    }
    const unsub = onRoundUpdate(gameId, roundNum, setRound)
    return () => unsub()
  }, [gameId, roundNum])

  return round
}
