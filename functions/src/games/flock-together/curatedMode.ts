import * as admin from 'firebase-admin'
import { HttpsError, onCall } from 'firebase-functions/v2/https'

export const flockSetCuratedQuestions = onCall(async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Must be signed in')
  const { gameId, enabled } = (request.data ?? {}) as { gameId: string; enabled: boolean }
  if (typeof gameId !== 'string' || !gameId || gameId.includes('/') || typeof enabled !== 'boolean') {
    throw new HttpsError('invalid-argument', 'Game and enabled flag are required')
  }
  const db = admin.firestore()
  const gameRef = db.collection('games').doc(gameId)
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(gameRef)
    if (!snap.exists) throw new HttpsError('not-found', 'Game not found')
    const game = snap.data()!
    if (game.gameType !== 'flock-together') throw new HttpsError('failed-precondition', 'Flock Together only')
    if (game.hostId !== uid) throw new HttpsError('permission-denied', 'Only host can choose curated questions')
    if (game.status !== 'lobby' || (game.questionSelectionLockedUntil ?? 0) > Date.now()) throw new HttpsError('failed-precondition', 'Game already starting or started')
    tx.update(gameRef, { curatedQuestions: enabled })
  })
})
