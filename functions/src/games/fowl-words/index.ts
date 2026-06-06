import { onCall, HttpsError } from 'firebase-functions/v2/https'
import * as admin from 'firebase-admin'
import { FieldValue } from 'firebase-admin/firestore'
import { claimRoomCode, releaseRoomCode } from '../../shared/roomCodes'
import { runDeduplication, handleGuess, advanceToNextRound } from './roundFlow'

const db = admin.firestore

const TOTAL_ROUNDS = 13 // Phase 3A: fixed length

// -- CREATE GAME (Fowl Words) --
export const fowlWordsCreateGame = onCall(async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Must be signed in')

  const { playerName } = request.data as { playerName: string }
  if (!playerName?.trim()) throw new HttpsError('invalid-argument', 'Name required')

  const firestore = db()
  const gameRef = firestore.collection('games').doc()
  const gameId = gameRef.id

  let code: string
  try {
    code = await claimRoomCode(gameId, 'fowl-words')
  } catch {
    throw new HttpsError('internal', 'Could not generate room code')
  }

  // Load and shuffle word list, take first 13 as the game's word stack
  const words = (await import('./data/words.json')).default as string[]
  const shuffled = [...words].sort(() => Math.random() - 0.5)
  const cardsRemaining = shuffled.slice(0, TOTAL_ROUNDS)

  await gameRef.set({
    code,
    gameType: 'fowl-words',
    hostId: uid,
    originalHostId: uid,
    status: 'lobby',
    currentRound: 0,
    currentGuesser: null,
    cardsRemaining,
    playerIds: [uid],
    settings: { totalRounds: TOTAL_ROUNDS, secondsPerRound: 60, autoAdvanceSeconds: 10 },
  })

  await gameRef.collection('players').doc(uid).set({
    name: playerName.trim(),
    score: 0,
    connected: true,
  })

  return { gameId, code }
})

// -- REMATCH (Fowl Words) --
export const fowlWordsRematch = onCall(async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Must be signed in')

  const { gameId } = request.data as { gameId: string }
  const firestore = db()
  const gameRef = firestore.collection('games').doc(gameId)
  const gameSnap = await gameRef.get()

  if (!gameSnap.exists) throw new HttpsError('not-found', 'Game not found')
  const game = gameSnap.data()!
  if (game.hostId !== uid) throw new HttpsError('permission-denied', 'Only host can start a rematch')
  if (game.status !== 'finished') throw new HttpsError('failed-precondition', 'Game is not finished')

  const playersSnap = await gameRef.collection('players').get()

  const newGameRef = firestore.collection('games').doc()
  const newGameId = newGameRef.id

  let newCode: string
  try {
    newCode = await claimRoomCode(newGameId, 'fowl-words')
  } catch {
    throw new HttpsError('internal', 'Could not generate room code')
  }

  await releaseRoomCode(game.code)

  const words = (await import('./data/words.json')).default as string[]
  const shuffled = [...words].sort(() => Math.random() - 0.5)
  const cardsRemaining = shuffled.slice(0, TOTAL_ROUNDS)

  await newGameRef.set({
    code: newCode,
    gameType: 'fowl-words',
    hostId: uid,
    originalHostId: uid,
    status: 'lobby',
    currentRound: 0,
    currentGuesser: null,
    cardsRemaining,
    playerIds: game.playerIds,
    settings: game.settings,
  })

  const batch = firestore.batch()
  playersSnap.docs.forEach((playerDoc) => {
    batch.set(newGameRef.collection('players').doc(playerDoc.id), {
      name: playerDoc.data().name,
      score: 0, // reset score for new game
      connected: false,
    })
  })
  await batch.commit()

  await gameRef.update({ rematchCode: newCode })
  return { code: newCode }
})

// -- START GAME --
export const fowlWordsStartGame = onCall(async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Must be signed in')

  const { gameId } = request.data as { gameId: string }
  const firestore = db()
  const gameRef = firestore.collection('games').doc(gameId)
  const gameSnap = await gameRef.get()

  if (!gameSnap.exists) throw new HttpsError('not-found', 'Game not found')
  const game = gameSnap.data()!
  if (game.hostId !== uid) throw new HttpsError('permission-denied', 'Only host can start')
  if (game.status !== 'lobby') throw new HttpsError('failed-precondition', 'Game already started')
  if (game.playerIds.length < 2) throw new HttpsError('failed-precondition', 'Need at least 2 players')

  // First guesser = host (originalHostId)
  const firstGuesser = uid
  const cardsRemaining = [...(game.cardsRemaining ?? [])]
  const firstWord = cardsRemaining.shift()
  if (!firstWord) throw new HttpsError('internal', 'No words available')

  await gameRef.collection('rounds').doc('1').set({
    secretWord: firstWord,
    status: 'clue-submission',
    currentAttempt: 1,
    maxAttempts: 1, // Phase 3A
    attemptInProgress: false,
    cluesByPlayer: {},
    clueTimestamps: {},
    clueGroups: [],
    visibleGroupIndexes: [],
    guessAttempts: [],
    tentativePoints: {},
    pointsThisRound: {},
    eliminationReason: '',
  })

  await gameRef.update({
    status: 'playing',
    currentRound: 1,
    currentGuesser: firstGuesser,
    cardsRemaining,
  })
})

// -- SUBMIT CLUE --
export const submitClue = onCall(async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Must be signed in')

  const { gameId, roundNum, clue } = request.data as { gameId: string; roundNum: number; clue: string }
  if (!clue?.trim()) throw new HttpsError('invalid-argument', 'Clue required')
  if (clue.trim().length > 50) throw new HttpsError('invalid-argument', 'Clue too long (max 50 chars)')
  if (clue.trim().split(/\s+/).length > 3) throw new HttpsError('invalid-argument', 'Clue must be 1-3 words')

  const firestore = db()
  const gameRef = firestore.collection('games').doc(gameId)
  const roundRef = gameRef.collection('rounds').doc(String(roundNum))

  const [gameSnap, roundSnap] = await Promise.all([gameRef.get(), roundRef.get()])

  if (!roundSnap.exists) throw new HttpsError('not-found', 'Round not found')
  if (roundSnap.data()!.status !== 'clue-submission') {
    throw new HttpsError('failed-precondition', 'Round not accepting clues')
  }

  const game = gameSnap.data()!
  if (game.currentGuesser === uid) {
    throw new HttpsError('failed-precondition', 'Guesser cannot submit clues')
  }

  const existing = roundSnap.data()!.cluesByPlayer ?? {}
  if (existing[uid]) {
    throw new HttpsError('already-exists', 'Already submitted a clue')
  }

  await roundRef.update({
    [`cluesByPlayer.${uid}`]: clue.trim(),
    [`clueTimestamps.${uid}`]: FieldValue.serverTimestamp(),
  })

  // Check if all non-guesser players have submitted
  const playersSnap = await gameRef.collection('players').get()
  const nonGuesserCount = playersSnap.docs.length - 1
  const updatedRound = await roundRef.get()
  const cluesCount = Object.keys(updatedRound.data()!.cluesByPlayer ?? {}).length

  if (cluesCount >= nonGuesserCount && nonGuesserCount > 0) {
    // All clues in — run dedup
    await runDeduplication(gameId, roundNum)
  }
})

// -- SUBMIT GUESS --
export const submitGuess = onCall(async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Must be signed in')

  const { gameId, roundNum, guess } = request.data as { gameId: string; roundNum: number; guess: string }
  if (!guess?.trim()) throw new HttpsError('invalid-argument', 'Guess required')
  if (guess.trim().length > 100) throw new HttpsError('invalid-argument', 'Guess too long')

  const firestore = db()
  const gameSnap = await firestore.collection('games').doc(gameId).get()
  const game = gameSnap.data()!

  if (game.currentGuesser !== uid) {
    throw new HttpsError('permission-denied', 'Only the guesser can submit a guess')
  }

  await handleGuess(gameId, roundNum, uid, guess)
})

// -- ADVANCE ROUND --
export const fowlWordsAdvanceRound = onCall(async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Must be signed in')

  const { gameId } = request.data as { gameId: string }
  const firestore = db()
  const gameSnap = await firestore.collection('games').doc(gameId).get()
  if (gameSnap.data()!.hostId !== uid) {
    throw new HttpsError('permission-denied', 'Only host can advance')
  }

  await advanceToNextRound(gameId)
})

// -- FORCE START DEDUP (manual escalation if a player is AFK) --
export const fowlWordsForceDedup = onCall(async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Must be signed in')

  const { gameId, roundNum } = request.data as { gameId: string; roundNum: number }
  const firestore = db()
  const gameSnap = await firestore.collection('games').doc(gameId).get()
  const game = gameSnap.data()!
  if (game.hostId !== uid) throw new HttpsError('permission-denied', 'Only host can force dedup')

  const roundRef = firestore.collection('games').doc(gameId).collection('rounds').doc(String(roundNum))
  const roundSnap = await roundRef.get()
  if (!roundSnap.exists) throw new HttpsError('not-found', 'Round not found')
  if (roundSnap.data()!.status !== 'clue-submission') {
    throw new HttpsError('failed-precondition', 'Already past clue submission')
  }

  const clues = roundSnap.data()!.cluesByPlayer ?? {}
  if (Object.keys(clues).length === 0) {
    throw new HttpsError('failed-precondition', 'No clues submitted yet')
  }

  await runDeduplication(gameId, roundNum)
})
