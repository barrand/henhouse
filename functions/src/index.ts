import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { onValueWritten } from 'firebase-functions/v2/database'
import * as admin from 'firebase-admin'
import { FieldValue } from 'firebase-admin/firestore'

admin.initializeApp()

const db = admin.firestore()

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
      eggs: 0,
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

    if (!data) return

    try {
      await db
        .collection('games')
        .doc(gameId)
        .collection('players')
        .doc(playerId)
        .set({ connected: data.connected }, { merge: true })

      const gameSnap = await db.collection('games').doc(gameId).get()
      if (!gameSnap.exists) return

      const gameData = gameSnap.data()!

      if (!data.connected && gameData.hostId === playerId) {
        const playersSnap = await db.collection('games').doc(gameId).collection('players').get()
        const connectedPlayers = playersSnap.docs.filter((d) => d.data().connected && d.id !== playerId)
        if (connectedPlayers.length > 0) {
          await db.collection('games').doc(gameId).update({ hostId: connectedPlayers[0].id })
        }
      }

      if (data.connected && gameData.originalHostId === playerId && gameData.hostId !== playerId) {
        await db.collection('games').doc(gameId).update({ hostId: playerId })
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
