import { useEffect, useState } from 'react'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../../../lib/firebase'
import { onGameUpdate, onPlayersUpdate, onRoundUpdate } from '../service'
import type { GameData, PlayerData, RoundData } from '../types'

export function useGame(gameId: string | null) {
  const [game, setGame] = useState<GameData | null>(null)
  const [players, setPlayers] = useState<PlayerData[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!gameId) return

    const unsubGame = onGameUpdate(gameId, (data) => {
      setGame(data)
      setLoading(false)
    })
    const unsubPlayers = onPlayersUpdate(gameId, setPlayers)

    async function handleVisibility() {
      if (document.visibilityState === 'visible') {
        const snap = await getDoc(doc(db, 'games', gameId!))
        if (snap.exists()) setGame({ id: snap.id, ...snap.data() } as GameData)
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      unsubGame()
      unsubPlayers()
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [gameId])

  return { game, players, loading }
}

export function useRound(gameId: string | null, roundNum: number | null) {
  const [round, setRound] = useState<RoundData | null>(null)

  useEffect(() => {
    if (!gameId || !roundNum) return

    const unsub = onRoundUpdate(gameId, roundNum, setRound)
    return () => unsub()
  }, [gameId, roundNum])

  return round
}
