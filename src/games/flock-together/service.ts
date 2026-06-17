// Flock Together-specific game service functions

import { httpsCallable } from 'firebase/functions'
import { functions } from '../../lib/firebase'
import type { RoundData, GameData, PlayerData } from './types'
import { doc, onSnapshot, collection, query, where } from 'firebase/firestore'
import { db } from '../../lib/firebase'

// -- Flock Callable Functions --

const flockCreateGameFn = httpsCallable<{ playerName: string }, { gameId: string; code: string }>(functions, 'flockCreateGame')
const flockRematchFn = httpsCallable<{ gameId: string }, { code: string }>(functions, 'flockRematch')
const startGameFn = httpsCallable<{ gameId: string }, void>(functions, 'flockStartGame')
const submitAnswerFn = httpsCallable<{ gameId: string; roundNum: number; answer: string }, void>(functions, 'submitAnswer')
const skipQuestionFn = httpsCallable<{ gameId: string }, void>(functions, 'skipQuestion')
const advanceRoundFn = httpsCallable<{ gameId: string }, void>(functions, 'flockAdvanceRound')
const forceEndRoundFn = httpsCallable<{ gameId: string }, void>(functions, 'forceEndRound')
const updateCategoriesFn = httpsCallable<{ gameId: string; categories: string[] }, void>(functions, 'updateCategories')
const setPatrioticModeFn = httpsCallable<{ gameId: string; enabled: boolean }, void>(functions, 'setPatrioticMode')
const resetQuestionCooldownsFn = httpsCallable<{ gameId: string }, void>(functions, 'resetQuestionCooldowns')
const submitCustomQuestionFn = httpsCallable<{ gameId: string; text: string }, void>(functions, 'submitCustomQuestion')

export async function flockCreateGame(playerName: string) {
  const result = await flockCreateGameFn({ playerName })
  return result.data
}

export async function flockRematch(gameId: string) {
  const result = await flockRematchFn({ gameId })
  return result.data
}

export async function startGame(gameId: string) {
  await startGameFn({ gameId })
}

export async function submitAnswer(gameId: string, roundNum: number, answer: string) {
  await submitAnswerFn({ gameId, roundNum, answer })
}

export async function skipQuestion(gameId: string) {
  await skipQuestionFn({ gameId })
}

export async function advanceRound(gameId: string) {
  await advanceRoundFn({ gameId })
}

export async function forceEndRound(gameId: string) {
  await forceEndRoundFn({ gameId })
}

export async function updateCategories(gameId: string, categories: string[]) {
  await updateCategoriesFn({ gameId, categories })
}

export async function setPatrioticMode(gameId: string, enabled: boolean) {
  await setPatrioticModeFn({ gameId, enabled })
}

export async function resetQuestionCooldowns(gameId: string) {
  await resetQuestionCooldownsFn({ gameId })
}

export async function submitCustomQuestion(gameId: string, text: string) {
  await submitCustomQuestionFn({ gameId, text })
}

// -- Flock Real-time Listeners --

// Override shared listeners with Flock-specific types
import { onGameUpdate as sharedOnGameUpdate, onPlayersUpdate as sharedOnPlayersUpdate } from '@shared/gameService'

export function onGameUpdate(gameId: string, callback: (data: GameData | null) => void) {
  return sharedOnGameUpdate<GameData>(gameId, callback)
}

export function onPlayersUpdate(gameId: string, callback: (players: PlayerData[]) => void) {
  // Cast the shared player data to Flock PlayerData
  return sharedOnPlayersUpdate(gameId, (players) => {
    callback(players as unknown as PlayerData[])
  })
}

export function onRoundUpdate(gameId: string, roundNum: number, callback: (data: RoundData | null) => void) {
  return onSnapshot(doc(db, 'games', gameId, 'rounds', String(roundNum)), (snap) => {
    callback(snap.exists() ? ({ id: snap.id, ...snap.data() } as RoundData) : null)
  })
}

const flockAbandonGameFn = httpsCallable<{ gameId: string }, void>(functions, 'flockAbandonGame')
export async function flockAbandonGame(gameId: string) {
  await flockAbandonGameFn({ gameId })
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
