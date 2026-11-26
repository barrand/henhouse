import { useEffect, useState } from 'react'

export function useRoomState<T>(
  gameId: string | null,
  subscribe: (gameId: string, update: (data: T) => void) => () => void,
) {
  const [entry, setEntry] = useState<{ gameId: string; data: T } | null>(null)
  useEffect(() => {
    if (!gameId) return
    return subscribe(gameId, data => setEntry({ gameId, data }))
  }, [gameId, subscribe])
  return entry?.gameId === gameId ? entry : null
}

export function useRoundState<T>(
  gameId: string | null,
  roundNum: number | null,
  subscribe: (gameId: string, roundNum: number, update: (round: T | null) => void) => () => void,
) {
  const [entry, setEntry] = useState<{ gameId: string; roundNum: number; data: T | null } | null>(null)
  useEffect(() => {
    if (!gameId || !roundNum) return
    return subscribe(gameId, roundNum, data => setEntry({ gameId, roundNum, data }))
  }, [gameId, roundNum, subscribe])
  return entry?.gameId === gameId && entry.roundNum === roundNum ? entry.data : null
}
