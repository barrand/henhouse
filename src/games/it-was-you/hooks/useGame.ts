import { useEffect, useState } from 'react'
import { collection, doc } from 'firebase/firestore'
import { db } from '../../../lib/firebase'
import { onGameUpdate, onPlayersUpdate } from '@shared/gameService'
import { watchRoomCollection, watchRoomDocument } from '@shared/roomSync'
import { useRoomState, useRoundState } from '@shared/useRoomState'
import type { GameData, Player, PlayerView, Round, VoteCounts } from '../types'

function watchRound(gameId: string, roundNum: number, receive: (round: Round | null) => void) {
  return watchRoomDocument<Round>(doc(db, 'games', gameId, 'rounds', String(roundNum)), { feed: 'round', gameId, round: roundNum },
    snapshot => receive((snapshot.data() as Round | undefined) ?? null),
    round => ({ phase: round.phase, revision: round.revision }))
}

export function useGame(gameId: string | null, uid: string | null) {
  const game = useRoomState(gameId, onGameUpdate<GameData>)
  const players = useRoomState(gameId, onPlayersUpdate)
  const member = !!uid && game?.data?.gameType === 'it-was-you' && game.data.playerIds.includes(uid)
  const roundNum = game?.data?.status === 'playing' ? game.data.currentRound : null
  const round = useRoundState(member ? gameId : null, roundNum, watchRound)
  return { game: game?.data, players: (players?.data ?? []) as Player[], member, round, loading: !game }
}

export function usePlayerView(gameId: string, roundNum: number, uid: string) {
  const [entry, setEntry] = useState<{ key: string; data: PlayerView } | null>(null)
  const key = gameId + ':' + roundNum + ':' + uid
  useEffect(() => {
    if (!roundNum) return
    return watchRoomDocument<PlayerView>(doc(db, 'games', gameId, 'rounds', String(roundNum), 'views', uid),
      { feed: 'player-view', gameId, round: roundNum },
      snapshot => setEntry({ key, data: (snapshot.data() as PlayerView | undefined) ?? {} }))
  }, [gameId, key, roundNum, uid])
  return entry?.key === key ? entry.data : null
}

const emptyTotals = { counts: {} as VoteCounts, voted: 0, voters: {} as Record<string, boolean> }

export function useVoteTotals(gameId: string, roundNum: number, answerId?: string) {
  const [entry, setEntry] = useState<{ key: string; totals: typeof emptyTotals } | null>(null)
  const key = gameId + ':' + roundNum + ':' + answerId
  useEffect(() => {
    if (!gameId || !roundNum || !answerId) return
    const shards = collection(db, 'games', gameId, 'rounds', String(roundNum), 'voteFeeds', answerId, 'shards')
    return watchRoomCollection(shards, { feed: 'reactions', gameId, round: roundNum }, snapshot => {
      const totals: typeof emptyTotals = { counts: {}, voted: 0, voters: {} }
      for (const shard of snapshot.docs) {
        const data = shard.data() as typeof emptyTotals
        totals.voted += data.voted ?? 0
        Object.assign(totals.voters, data.voters ?? {})
        for (const [id, count] of Object.entries(data.counts ?? {})) {
          totals.counts[id] = (totals.counts[id] ?? 0) + count
        }
      }
      setEntry({ key, totals })
    })
  }, [gameId, roundNum, answerId, key])
  return answerId && entry?.key === key ? entry.totals : emptyTotals
}
