// Fowl Words-specific game service functions

import { httpsCallable } from 'firebase/functions'
import { functions, db } from '../../lib/firebase'
import type { RoundData, GameData, PlayerData } from './types'
import { doc, onSnapshot } from 'firebase/firestore'

// -- Fowl Words Callable Functions --

const fowlWordsCreateGameFn = httpsCallable<{ playerName: string }, { gameId: string; code: string }>(functions, 'fowlWordsCreateGame')
const fowlWordsRematchFn = httpsCallable<{ gameId: string }, { code: string }>(functions, 'fowlWordsRematch')
const fowlWordsStartGameFn = httpsCallable<{ gameId: string }, void>(functions, 'fowlWordsStartGame')
const submitClueFn = httpsCallable<{ gameId: string; roundNum: number; clue: string }, void>(functions, 'submitClue')
const submitGuessFn = httpsCallable<{ gameId: string; roundNum: number; guess: string }, void>(functions, 'submitGuess')
const fowlWordsAdvanceRoundFn = httpsCallable<{ gameId: string }, void>(functions, 'fowlWordsAdvanceRound')
const fowlWordsForceDedupFn = httpsCallable<{ gameId: string; roundNum: number }, void>(functions, 'fowlWordsForceDedup')
const fowlWordsUnlockFirstFn = httpsCallable<{ gameId: string; roundNum: number }, void>(functions, 'fowlWordsUnlockFirst')

export async function fowlWordsCreateGame(playerName: string) {
  const result = await fowlWordsCreateGameFn({ playerName })
  return result.data
}

export async function fowlWordsRematch(gameId: string) {
  const result = await fowlWordsRematchFn({ gameId })
  return result.data
}

export async function startGame(gameId: string) {
  await fowlWordsStartGameFn({ gameId })
}

export async function submitClue(gameId: string, roundNum: number, clue: string) {
  await submitClueFn({ gameId, roundNum, clue })
}

export async function submitGuess(gameId: string, roundNum: number, guess: string) {
  await submitGuessFn({ gameId, roundNum, guess })
}

export async function advanceRound(gameId: string) {
  await fowlWordsAdvanceRoundFn({ gameId })
}

export async function forceDedup(gameId: string, roundNum: number) {
  await fowlWordsForceDedupFn({ gameId, roundNum })
}

export async function unlockFirst(gameId: string, roundNum: number) {
  await fowlWordsUnlockFirstFn({ gameId, roundNum })
}

// -- Fowl Words Real-time Listeners --

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
