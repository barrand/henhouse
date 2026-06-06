import { httpsCallable } from 'firebase/functions'
import {
  doc,
  collection,
  query,
  where,
  onSnapshot,
} from 'firebase/firestore'
import { db, functions } from './firebase'
import type { GameData, PlayerData, RoundData } from '../types'

// -- Callable Cloud Functions --

const createGameFn = httpsCallable<{ playerName: string }, { gameId: string; code: string }>(functions, 'createGame')
const joinGameFn = httpsCallable<{ code: string; playerName: string }, { gameId: string }>(functions, 'joinGame')
const startGameFn = httpsCallable<{ gameId: string }, void>(functions, 'startGame')
const submitAnswerFn = httpsCallable<{ gameId: string; roundNum: number; answer: string }, void>(functions, 'submitAnswer')
const skipQuestionFn = httpsCallable<{ gameId: string }, void>(functions, 'skipQuestion')
const advanceRoundFn = httpsCallable<{ gameId: string }, void>(functions, 'advanceRound')
const forceEndRoundFn = httpsCallable<{ gameId: string }, void>(functions, 'forceEndRound')
const updateCategoriesFn = httpsCallable<{ gameId: string; categories: string[] }, void>(functions, 'updateCategories')
const setPatrioticModeFn = httpsCallable<{ gameId: string; enabled: boolean }, void>(functions, 'setPatrioticMode')
const rematchFn = httpsCallable<{ gameId: string }, { code: string }>(functions, 'rematch')
const resetQuestionCooldownsFn = httpsCallable<{ gameId: string }, void>(functions, 'resetQuestionCooldowns')
const submitCustomQuestionFn = httpsCallable<{ gameId: string; text: string }, void>(functions, 'submitCustomQuestion')

export async function createGame(playerName: string) {
  const result = await createGameFn({ playerName })
  return result.data
}

export async function joinGame(code: string, playerName: string) {
  const result = await joinGameFn({ code: code.toUpperCase(), playerName })
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

export async function rematch(gameId: string) {
  const result = await rematchFn({ gameId })
  return result.data
}

export async function resetQuestionCooldowns(gameId: string) {
  await resetQuestionCooldownsFn({ gameId })
}

export async function submitCustomQuestion(gameId: string, text: string) {
  await submitCustomQuestionFn({ gameId, text })
}

// -- Real-time Listeners --

export function onGameUpdate(gameId: string, callback: (data: GameData | null) => void) {
  return onSnapshot(doc(db, 'games', gameId), (snap) => {
    callback(snap.exists() ? ({ id: snap.id, ...snap.data() } as GameData) : null)
  })
}

export function onPlayersUpdate(gameId: string, callback: (players: PlayerData[]) => void) {
  const playersRef = collection(db, 'games', gameId, 'players')
  return onSnapshot(playersRef, (snap) => {
    const players = snap.docs.map((d) => ({ id: d.id, ...d.data() } as PlayerData))
    callback(players)
  })
}

export function onRoundUpdate(gameId: string, roundNum: number, callback: (data: RoundData | null) => void) {
  return onSnapshot(doc(db, 'games', gameId, 'rounds', String(roundNum)), (snap) => {
    callback(snap.exists() ? ({ id: snap.id, ...snap.data() } as RoundData) : null)
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
