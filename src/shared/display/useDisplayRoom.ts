import { useEffect, useState } from 'react'
import { collection, doc, onSnapshot } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, functions } from '../../lib/firebase'
import type { DisplayGame, DisplayRound } from '../../../functions/src/shared/sharedViewModel'
import { applyReactionCounts, combineReactionCounts, type ReactionCounts } from '../reactionCounts'

export interface DisplayPlayer {
  id: string
  name: string
  score: number
}

const open = httpsCallable<{ code: string }, { gameId: string }>(functions, 'openSharedView')

export function useDisplayRoom(code: string, uid: string | null, retry: number) {
  const [game, setGame] = useState<DisplayGame | null>(null)
  const [players, setPlayers] = useState<DisplayPlayer[]>([])
  const [gameId, setGameId] = useState('')
  const [entry, setEntry] = useState<{ round: number; data: DisplayRound } | null>(null)
  const [counts, setCounts] = useState<{ round: number; data: ReactionCounts } | null>(null)
  const [error, setError] = useState('')
  const [online, setOnline] = useState(() => navigator.onLine)
  const roundNumber = game?.status === 'playing' ? game.round : 0
  const round = entry?.round === roundNumber ? entry.data : null
  const liveFowl = round?.kind === 'fowl-words' && round.reactionFeed && (round.phase === 'reveal' || round.phase === 'guess')

  useEffect(() => {
    const connection = () => setOnline(navigator.onLine)
    window.addEventListener('online', connection)
    window.addEventListener('offline', connection)
    return () => {
      window.removeEventListener('online', connection)
      window.removeEventListener('offline', connection)
    }
  }, [])

  useEffect(() => {
    if (!uid || !code) return
    let cancelled = false
    const stops: (() => void)[] = []
    function failed(err: unknown) {
      if (!cancelled) setError(err instanceof Error ? err.message : 'Couldn’t open Shared View.')
    }
    void open({ code }).then(({ data }) => {
      if (cancelled) return
      setGameId(data.gameId)
      setError('')
      stops.push(onSnapshot(doc(db, 'games', data.gameId, 'shared', 'game'), snapshot => {
        if (snapshot.exists()) setGame(snapshot.data() as DisplayGame)
      }, failed))
      stops.push(onSnapshot(collection(db, 'games', data.gameId, 'players'), snapshot => {
        setPlayers(snapshot.docs.flatMap(player => {
          const { name, score } = player.data()
          return typeof name === 'string' && name.trim() ? [{ id: player.id, name, score: score ?? 0 }] : []
        }))
      }, failed))
    }, failed)
    return () => {
      cancelled = true
      for (const stop of stops) stop()
    }
  }, [code, uid, retry])

  useEffect(() => {
    if (!gameId || !roundNumber) return
    return onSnapshot(doc(db, 'games', gameId, 'sharedRounds', String(roundNumber)), snapshot => {
      if (snapshot.exists()) setEntry({ round: roundNumber, data: snapshot.data() as DisplayRound })
    }, err => setError(err.message))
  }, [gameId, roundNumber])

  useEffect(() => {
    if (!gameId || !roundNumber || !liveFowl) return
    return onSnapshot(collection(db, 'games', gameId, 'rounds', String(roundNumber), 'reactionCounts'), shards => {
      setCounts({ round: roundNumber, data: combineReactionCounts(shards.docs.map(shard => shard.data())) })
    }, err => setError(err.message))
  }, [gameId, roundNumber, liveFowl])

  const displayRound = liveFowl && counts?.round === roundNumber
    ? { ...round, clues: applyReactionCounts(round.clues, counts.data) } : round
  return { game, players, round: displayRound, error, online }
}
