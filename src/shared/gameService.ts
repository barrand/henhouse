// Shared game service functions used by all games

import { httpsCallable } from 'firebase/functions'
import {
  doc,
  collection,
  query,
  where,
  onSnapshot,
} from 'firebase/firestore'
import { db, functions } from '../lib/firebase'
import type { BaseGameData, PlayerData } from './types'

// -- Shared Callable Functions --

const joinGameFn = httpsCallable<{ code: string; playerName: string }, { gameId: string; gameType: string }>(functions, 'joinGame')

export async function joinGame(code: string, playerName: string) {
  const result = await joinGameFn({ code: code.toUpperCase(), playerName })
  return result.data
}

// -- Shared Real-time Listeners --

export function onGameUpdate<T extends BaseGameData>(gameId: string, callback: (data: T | null) => void) {
  return onSnapshot(doc(db, 'games', gameId), (snap) => {
    callback(snap.exists() ? ({ id: snap.id, ...snap.data() } as T) : null)
  })
}

export function onPlayersUpdate(gameId: string, callback: (players: PlayerData[]) => void) {
  const playersRef = collection(db, 'games', gameId, 'players')
  return onSnapshot(playersRef, (snap) => {
    const players = snap.docs.map((d) => ({ id: d.id, ...d.data() } as PlayerData))
    callback(players)
  })
}

export function onCustomQuestionsUpdate(gameId: string, callback: (questions: string[]) => void) {
  const q = query(
    collection(db, 'games', gameId, 'questionPool'),
    where('source', '==', 'custom'),
  )
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => d.data().text as string))
  })
}
