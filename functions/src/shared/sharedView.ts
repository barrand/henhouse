import { itWasYouDisplay } from '../games/it-was-you/display'
import type { Round as ItWasYouRound } from '../games/it-was-you/model'
import { getFirestore, type DocumentReference, type Transaction } from 'firebase-admin/firestore'
import { onDocumentWritten } from 'firebase-functions/v2/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { displayRoundRef, flockDisplay, gameDisplay, legacyFowlDisplay, versionedFowlDisplay } from './sharedViewProjection'
import type { ScoringState } from '../games/fowl-words/scoringProtocol'
import type { DisplayGame } from './sharedViewModel'

async function readRound(tx: Transaction, ref: DocumentReference, kind: DisplayGame['kind'], eligible: number) {
  const round = (await tx.get(ref)).data()
  if (!round) return null
  if (kind === 'flock-together') return flockDisplay(round, eligible)
  if (kind === 'it-was-you') return itWasYouDisplay(round as ItWasYouRound)
  if (round.scoringVersion !== 1) return legacyFowlDisplay(round, eligible)
  const state = (await tx.get(ref.collection('private').doc('state'))).data() as ScoringState | undefined
  return state ? versionedFowlDisplay(state) : null
}

export const openSharedView = onCall(async request => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in to open Shared View.')
  const code = typeof request.data?.code === 'string' ? request.data.code.trim().toUpperCase() : ''
  if (!/^[A-Z0-9]{1,10}$/.test(code)) throw new HttpsError('invalid-argument', 'Enter a room code.')
  const db = getFirestore()
  return db.runTransaction(async tx => {
    const room = (await tx.get(db.collection('rooms').doc(code))).data()
    if (!room?.active) throw new HttpsError('not-found', 'Room not found. Check the code and try again.')
    const gameRef = db.collection('games').doc(room.gameId)
    const game = (await tx.get(gameRef)).data()
    if (!game || game.status === 'abandoned') throw new HttpsError('not-found', 'This room is closed.')
    const summary = gameDisplay(game)
    if (!summary) throw new HttpsError('failed-precondition', 'Shared View is available for Flock Together, Fowl Words, and It Was You!')
    const roundRef = summary.status === 'playing' ? gameRef.collection('rounds').doc(String(summary.round)) : null
    const round = roundRef && await readRound(tx, roundRef, summary.kind, game.playerIds?.length ?? 0)
    // Backfill active rooms created before the display feed existed.
    tx.set(gameRef.collection('shared').doc('game'), summary)
    if (roundRef && round) tx.set(displayRoundRef(roundRef), round)
    tx.set(gameRef.collection('sharedViewers').doc(uid), { openedAt: Date.now() })
    return { gameId: gameRef.id }
  })
})

export const syncSharedGame = onDocumentWritten({ document: 'games/{gameId}', retry: true }, async event => {
  const after = event.data?.after
  if (!after?.exists) return
  const game = gameDisplay(after.data()!)
  const before = event.data?.before.data()
  if (!game || (before && JSON.stringify(game) === JSON.stringify(gameDisplay(before)))) return
  await getFirestore().runTransaction(async tx => {
    const current = (await tx.get(after.ref)).data()
    const summary = current && gameDisplay(current)
    if (summary) tx.set(after.ref.collection('shared').doc('game'), summary)
  })
})

export const syncSharedRound = onDocumentWritten({ document: 'games/{gameId}/rounds/{roundNum}', retry: true }, async event => {
  const after = event.data?.after
  if (!after?.exists || after.data()?.scoringVersion === 1) return
  const gameRef = after.ref.parent.parent!
  // Read the current round inside the transaction so out-of-order events cannot
  // replace a newer clue unlock, score, or reaction with an older snapshot.
  await getFirestore().runTransaction(async tx => {
    const game = (await tx.get(gameRef)).data()
    const summary = game && gameDisplay(game)
    if (!summary) return
    const round = await readRound(tx, after.ref, summary.kind, game?.playerIds?.length ?? 0)
    if (round) tx.set(displayRoundRef(after.ref), round)
  })
})
