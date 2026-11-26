import { getFirestore } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { claimRoomCode } from '../../shared/roomCodes'
import { WRITING_MS } from './model'

export { itWasYouRoundAction } from './round'

export const itWasYouCreateGame = onCall(async request => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Must be signed in')

  const name = typeof request.data?.playerName === 'string' ? request.data.playerName.trim() : ''
  if (!name) throw new HttpsError('invalid-argument', 'Name required')

  const gameRef = getFirestore().collection('games').doc()
  const code = await claimRoomCode(gameRef.id, 'it-was-you', (transaction, roomCode) => {
    transaction.create(gameRef, {
      code: roomCode,
      gameType: 'it-was-you',
      hostId: uid,
      originalHostId: uid,
      status: 'lobby',
      currentRound: 0,
      playerIds: [uid],
      settings: { totalRounds: 0, secondsPerRound: WRITING_MS / 1000 },
    })
    transaction.create(gameRef.collection('players').doc(uid), {
      name, nameKey: name.toLowerCase(), score: 0, connected: true, writingOpportunities: 0,
    })
  })

  return { gameId: gameRef.id, code }
})

export const itWasYouRematch = onCall(async request => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Must be signed in')
  const gameId: unknown = request.data?.gameId
  if (typeof gameId !== 'string' || !/^[A-Za-z0-9]+$/.test(gameId)) {
    throw new HttpsError('invalid-argument', 'Room required')
  }

  const db = getFirestore()
  const previous = db.collection('games').doc(gameId)
  const next = db.collection('games').doc()
  const code = await claimRoomCode(next.id, 'it-was-you', async (tx, roomCode) => {
    const game = (await tx.get(previous)).data()
    if (game?.gameType !== 'it-was-you' || game.status !== 'finished') {
      throw new HttpsError('failed-precondition', 'Finish the game before starting a rematch.')
    }
    if (game.hostId !== uid) throw new HttpsError('permission-denied', 'Only the host can start a rematch.')
    if (game.rematchCode) throw new HttpsError('already-exists', 'A rematch already started.')

    const players = await tx.get(previous.collection('players'))
    const oldRoom = db.collection('rooms').doc(game.code)
    const room = (await tx.get(oldRoom)).data()

    tx.create(next, {
      code: roomCode, gameType: 'it-was-you', hostId: uid, originalHostId: uid,
      status: 'lobby', currentRound: 0, playerIds: game.playerIds,
      settings: { totalRounds: 0, secondsPerRound: WRITING_MS / 1000 },
    })
    for (const player of players.docs) {
      const name = player.data().name as string
      tx.create(next.collection('players').doc(player.id), {
        name, nameKey: name.toLowerCase(), score: 0, connected: false, writingOpportunities: 0,
      })
    }
    if (room?.gameId === gameId) tx.update(oldRoom, { active: false })
    tx.update(previous, { rematchCode: roomCode })
  })
  return { code }
})
