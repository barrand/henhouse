import { httpsCallable } from 'firebase/functions'
import { doc, onSnapshot } from 'firebase/firestore'
import { db, functions } from '../../lib/firebase'
import { onGameUpdate as sharedOnGameUpdate, onPlayersUpdate as sharedOnPlayersUpdate } from '@shared/gameService'
import type { GameData, PlayerData, RoundData, TruthOrTurdAnswer } from './types'

const truthOrTurdCreateGameFn = httpsCallable<{ playerName: string; includePatrioticQuestions?: boolean }, { gameId: string; code: string }>(functions, 'truthOrTurdCreateGame')
const truthOrTurdRematchFn = httpsCallable<{ gameId: string }, { code: string }>(functions, 'truthOrTurdRematch')
const truthOrTurdStartGameFn = httpsCallable<{ gameId: string }, void>(functions, 'truthOrTurdStartGame')
const truthOrTurdSubmitAnswerFn = httpsCallable<{ gameId: string; roundNum: number; answer: TruthOrTurdAnswer }, void>(functions, 'truthOrTurdSubmitAnswer')
const truthOrTurdForceRevealFn = httpsCallable<{ gameId: string }, void>(functions, 'truthOrTurdForceReveal')
const truthOrTurdAdvanceRoundFn = httpsCallable<{ gameId: string }, void>(functions, 'truthOrTurdAdvanceRound')
const truthOrTurdAbandonGameFn = httpsCallable<{ gameId: string }, void>(functions, 'truthOrTurdAbandonGame')

export async function truthOrTurdCreateGame(playerName: string, includePatrioticQuestions: boolean = false) {
  const result = await truthOrTurdCreateGameFn({ playerName, includePatrioticQuestions })
  return result.data
}

export async function truthOrTurdRematch(gameId: string) {
  const result = await truthOrTurdRematchFn({ gameId })
  return result.data
}

export async function startGame(gameId: string) {
  await truthOrTurdStartGameFn({ gameId })
}

export async function submitAnswer(gameId: string, roundNum: number, answer: TruthOrTurdAnswer) {
  await truthOrTurdSubmitAnswerFn({ gameId, roundNum, answer })
}

export async function forceReveal(gameId: string) {
  await truthOrTurdForceRevealFn({ gameId })
}

export async function advanceRound(gameId: string) {
  await truthOrTurdAdvanceRoundFn({ gameId })
}

export async function truthOrTurdAbandonGame(gameId: string) {
  await truthOrTurdAbandonGameFn({ gameId })
}

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
