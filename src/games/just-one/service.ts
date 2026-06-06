// Just One-specific game service functions

import { httpsCallable } from 'firebase/functions'
import { functions } from '../../lib/firebase'
import type { RoundData, GameData, PlayerData } from './types'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../../lib/firebase'

// -- Just One Callable Functions --

const justOneCreateGameFn = httpsCallable<{ playerName: string }, { gameId: string; code: string }>(functions, 'justOneCreateGame')
const justOneRematchFn = httpsCallable<{ gameId: string }, { code: string }>(functions, 'justOneRematch')
const justOneStartGameFn = httpsCallable<{ gameId: string }, void>(functions, 'justOneStartGame')
const submitClueFn = httpsCallable<{ gameId: string; roundNum: number; clue: string }, void>(functions, 'submitClue')
const submitGuessFn = httpsCallable<{ gameId: string; roundNum: number; guess: string }, void>(functions, 'submitGuess')
const justOneAdvanceRoundFn = httpsCallable<{ gameId: string }, void>(functions, 'justOneAdvanceRound')

export async function justOneCreateGame(playerName: string) {
  const result = await justOneCreateGameFn({ playerName })
  return result.data
}

export async function justOneRematch(gameId: string) {
  const result = await justOneRematchFn({ gameId })
  return result.data
}

export async function startGame(gameId: string) {
  await justOneStartGameFn({ gameId })
}

export async function submitClue(gameId: string, roundNum: number, clue: string) {
  await submitClueFn({ gameId, roundNum, clue })
}

export async function submitGuess(gameId: string, roundNum: number, guess: string) {
  await submitGuessFn({ gameId, roundNum, guess })
}

export async function advanceRound(gameId: string) {
  await justOneAdvanceRoundFn({ gameId })
}

// -- Just One Real-time Listeners --

import { onGameUpdate as sharedOnGameUpdate, onPlayersUpdate as sharedOnPlayersUpdate } from '@shared/gameService'

export function onGameUpdate(gameId: string, callback: (data: GameData | null) => void) {
  return sharedOnGameUpdate<GameData>(gameId, callback)
}

export function onPlayersUpdate(gameId: string, callback: (players: PlayerData[]) => void) {
  return sharedOnPlayersUpdate(gameId, (players) => {
    callback(players as unknown as PlayerData[])
  })
}

export function onRoundUpdate(gameId: string, roundNum: number, callback: (data: RoundData | null) => void) {
  return onSnapshot(doc(db, 'games', gameId, 'rounds', String(roundNum)), (snap) => {
    callback(snap.exists() ? ({ id: snap.id, ...snap.data() } as RoundData) : null)
  })
}
