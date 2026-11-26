import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { onValueWritten } from 'firebase-functions/v2/database'
import { defineSecret } from 'firebase-functions/params'
import * as admin from 'firebase-admin'
import { FieldValue } from 'firebase-admin/firestore'
import { requireJevOperation, sanitizedExperimentCapabilities } from './shared/aiExperiment'
import { runJevLiveContractCheck } from './shared/jevLiveContract'

admin.initializeApp()

const db = admin.firestore()
const typesafeApiKey = defineSecret('TYPESAFE_API_KEY')

export const jevExperimentCapabilities = onCall(async (request) => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Must be signed in')
  return sanitizedExperimentCapabilities(request.auth.uid)
})

// Not used by gameplay. This can only be invoked by an admitted host while the
// clue operation is enabled, and its only response is redacted request metadata.
export const jevLiveContractCheck = onCall({ secrets: [typesafeApiKey] }, async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Must be signed in')
  await requireJevOperation(uid, 'clue')
  try {
    return await runJevLiveContractCheck()
  } catch (error) {
    console.error('Jev live contract check failed', { message: error instanceof Error ? error.message : 'unknown error' })
    throw new HttpsError('unavailable', 'Jev contract check could not complete')
  }
})

export * from './shared/jevShadow'
export * from './shared/sharedView'
// ── Shared: Join Game ─────────────────────────────────────────────────────────
// joinGame is shared across all games — it looks up the room, adds the player,
// and returns gameType so the frontend routes to the correct game module.

export const joinGame = onCall(async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Must be signed in')

  const { code, playerName } = request.data as { code: string; playerName: string }
  if (!code?.trim()) throw new HttpsError('invalid-argument', 'Room code required')
  if (!playerName?.trim()) throw new HttpsError('invalid-argument', 'Name required')

  const upperCode = code.toUpperCase()
  const roomSnap = await db.collection('rooms').doc(upperCode).get()
  if (!roomSnap.exists || !roomSnap.data()?.active) {
    throw new HttpsError('not-found', 'Room not found')
  }

  const { gameId, gameType } = roomSnap.data()!
  const gameRef = db.collection('games').doc(gameId)
  if (gameType === 'it-was-you') {
    return db.runTransaction(async tx => {
      const room = (await tx.get(roomSnap.ref)).data()
      if (!room?.active || room.gameId !== gameId) {
        throw new HttpsError('not-found', 'Room not found')
      }

      const game = (await tx.get(gameRef)).data()
      if (!game) throw new HttpsError('not-found', 'Game not found')
      if (game.status === 'finished') throw new HttpsError('failed-precondition', 'This game has already ended')
      if (game.status === 'abandoned') throw new HttpsError('failed-precondition', 'This game was abandoned')

      const playerRef = gameRef.collection('players').doc(uid)
      const player = await tx.get(playerRef)
      let uniqueName = playerName.trim()
      if (!player.exists) {
        const baseName = uniqueName
        for (let suffix = 2; ; suffix++) {
          const matches = await tx.get(gameRef.collection('players').where('nameKey', '==', uniqueName.toLowerCase()).limit(1))
          if (matches.empty) break
          uniqueName = baseName + ' (' + suffix + ')'
        }
      }
      if (!game.playerIds.includes(uid)) {
        tx.update(gameRef, { playerIds: FieldValue.arrayUnion(uid) })
      }
      if (!player.exists) {
        tx.create(playerRef, {
          name: uniqueName, nameKey: uniqueName.toLowerCase(), score: 0, connected: true, writingOpportunities: 0,
        })
      }
      return { gameId, gameType }
    })
  }

  const gameSnap = await gameRef.get()

  if (!gameSnap.exists) throw new HttpsError('not-found', 'Game not found')
  const gameStatus = gameSnap.data()!.status
  if (gameStatus === 'finished') throw new HttpsError('failed-precondition', 'This game has already ended')
  if (gameStatus === 'abandoned') throw new HttpsError('failed-precondition', 'This game was abandoned')

  // If the player already has a doc in this game, they're reconnecting — don't overwrite their score
  const playerDocRef = gameRef.collection('players').doc(uid)
  const playerDocSnap = await playerDocRef.get()
  if (playerDocSnap.exists) {
    return { gameId, gameType: gameType ?? 'flock-together' }
  }

  await gameRef.update({ playerIds: FieldValue.arrayUnion(uid) })

  // Player doc shape varies by game type
  if (gameType === 'flock-together') {
    await playerDocRef.set({
      name: playerName.trim(),
      score: 0,
      connected: true,
    })
  } else {
    await playerDocRef.set({
      name: playerName.trim(),
      score: 0,
      connected: true,
    })
  }

  return { gameId, gameType: gameType ?? 'flock-together' }
})

// ── Shared: Presence Sync ─────────────────────────────────────────────────────
// Syncs Realtime Database presence to Firestore player docs.
// Game-agnostic — works for any game in the games/{gameId}/players subcollection.

export const onPresenceChange = onValueWritten(
  { ref: 'status/{gameId}/{playerId}', region: 'us-central1' },
  async (event) => {
    const { gameId, playerId } = event.params
    const data = event.data.after.val() as { connected: boolean } | null

    if (!data || typeof data.connected !== 'boolean') return

    const gameRef = db.collection('games').doc(gameId)

    try {
      const before = (await gameRef.get()).data()
      if (!before || (before.gameType === 'it-was-you' && !before.playerIds.includes(playerId))) return

      await gameRef.collection('players').doc(playerId).set({ connected: data.connected }, { merge: true })

      const game = (await gameRef.get()).data()
      if (!game) return

      if (!data.connected && game.hostId === playerId) {
        const players = await gameRef.collection('players').get()
        const replacement = players.docs.find(player => player.id !== playerId && player.data().connected)
        if (replacement) await gameRef.update({ hostId: replacement.id })
      }

      if (data.connected && game.originalHostId === playerId && game.hostId !== playerId) {
        await gameRef.update({ hostId: playerId })
      }
    } catch (err) {
      console.error('Presence sync failed:', err)
    }
  },
)

// ── Flock Together ────────────────────────────────────────────────────────────
export * from './games/flock-together/index'

// ── Fowl Words ────────────────────────────────────────────────────────────────
export * from './games/fowl-words/index'

// ── Truth or Turd ─────────────────────────────────────────────────────────────
export * from './games/truth-or-turd/index'

export * from './games/it-was-you/index'
