import { onCall, HttpsError } from 'firebase-functions/v2/https'
import * as admin from 'firebase-admin'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { detectDuplicateClues } from '../../shared/gemini'
import { claimRoomCode, releaseRoomCode } from '../../shared/roomCodes'

const db = admin.firestore()

// -- CREATE GAME (Just One) --
export const justOneCreateGame = onCall(async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Must be signed in')

  const { playerName } = request.data as { playerName: string }
  if (!playerName?.trim()) throw new HttpsError('invalid-argument', 'Name required')

  const gameRef = db.collection('games').doc()
  const gameId = gameRef.id

  let code: string
  try {
    code = await claimRoomCode(gameId, 'just-one')
  } catch {
    throw new HttpsError('internal', 'Could not generate room code')
  }

  // Load word list
  const words = (await import('./data/words.json')).default as string[]
  const shuffledWords = [...words].sort(() => Math.random() - 0.5)

  await gameRef.set({
    code,
    gameType: 'just-one',
    hostId: uid,
    originalHostId: uid,
    status: 'lobby',
    currentRound: 0,
    currentGuesser: null, // Will be set to first player when game starts
    teamScore: 0,
    cardsRemaining: shuffledWords.slice(0, Math.min(13, shuffledWords.length)), // Typically 13 words
    currentCard: '',
    playerIds: [uid],
    settings: { totalRounds: 13, secondsPerRound: 45, autoAdvanceSeconds: 10 },
  })

  await gameRef.collection('players').doc(uid).set({
    name: playerName.trim(),
    connected: true,
  })

  return { gameId, code }
})

// -- REMATCH (Just One) --
export const justOneRematch = onCall(async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Must be signed in')

  const { gameId } = request.data as { gameId: string }
  const gameRef = db.collection('games').doc(gameId)
  const gameSnap = await gameRef.get()

  if (!gameSnap.exists) throw new HttpsError('not-found', 'Game not found')
  const game = gameSnap.data()!
  if (game.hostId !== uid) throw new HttpsError('permission-denied', 'Only host can start a rematch')
  if (game.status !== 'finished') throw new HttpsError('failed-precondition', 'Game is not finished')

  const playersSnap = await gameRef.collection('players').get()

  const newGameRef = db.collection('games').doc()
  const newGameId = newGameRef.id

  let newCode: string
  try {
    newCode = await claimRoomCode(newGameId, 'just-one')
  } catch {
    throw new HttpsError('internal', 'Could not generate room code')
  }

  await releaseRoomCode(game.code)

  // Reshuffle words
  const words = (await import('./data/words.json')).default as string[]
  const shuffledWords = [...words].sort(() => Math.random() - 0.5)

  await newGameRef.set({
    code: newCode,
    gameType: 'just-one',
    hostId: uid,
    originalHostId: uid,
    status: 'lobby',
    currentRound: 0,
    currentGuesser: null,
    teamScore: 0,
    cardsRemaining: shuffledWords.slice(0, Math.min(13, shuffledWords.length)),
    currentCard: '',
    playerIds: game.playerIds,
    settings: game.settings,
  })

  const batch = db.batch()
  playersSnap.docs.forEach((playerDoc) => {
    batch.set(newGameRef.collection('players').doc(playerDoc.id), {
      name: playerDoc.data().name,
      connected: false,
    })
  })
  await batch.commit()

  await gameRef.update({ rematchCode: newCode })
  return { code: newCode }
})

// -- START GAME --
export const startGame = onCall(async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Must be signed in')

  const { gameId } = request.data as { gameId: string }
  const gameRef = db.collection('games').doc(gameId)
  const gameSnap = await gameRef.get()

  if (!gameSnap.exists) throw new HttpsError('not-found', 'Game not found')
  const game = gameSnap.data()!
  if (game.hostId !== uid) throw new HttpsError('permission-denied', 'Only host can start')
  if (game.status !== 'lobby') throw new HttpsError('failed-precondition', 'Game already started')

  // First guesser is the first player in the list
  const firstGuesser = game.playerIds[0]
  const secretWord = game.cardsRemaining[0]

  const deadline = new Date(Date.now() + game.settings.secondsPerRound * 1000)

  await gameRef.collection('rounds').doc('1').set({
    secretWord,
    status: 'clue-submission',
    deadline: Timestamp.fromDate(deadline),
    cluesByPlayer: {},
    eliminatedPlayerIds: [],
    eliminationReason: '',
    score: 0,
  })

  await gameRef.update({ status: 'playing', currentRound: 1, currentGuesser: firstGuesser })
})

// -- SUBMIT CLUE --
export const submitClue = onCall(async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Must be signed in')

  const { gameId, roundNum, clue } = request.data as { gameId: string; roundNum: number; clue: string }
  if (!clue?.trim()) throw new HttpsError('invalid-argument', 'Clue required')
  if (clue.trim().length > 50) throw new HttpsError('invalid-argument', 'Clue too long')

  const roundRef = db.collection('games').doc(gameId).collection('rounds').doc(String(roundNum))
  const roundSnap = await roundRef.get()

  if (!roundSnap.exists) throw new HttpsError('not-found', 'Round not found')
  if (roundSnap.data()!.status !== 'clue-submission') {
    throw new HttpsError('failed-precondition', 'Round not accepting clues')
  }

  const gameSnap = await db.collection('games').doc(gameId).get()
  const game = gameSnap.data()!

  // Can't submit a clue if you're the guesser
  if (game.currentGuesser === uid) {
    throw new HttpsError('failed-precondition', 'Guesser cannot submit clues')
  }

  // Can't submit a clue if you already did
  const cluesByPlayer = roundSnap.data()!.cluesByPlayer || {}
  if (cluesByPlayer[uid]) {
    throw new HttpsError('already-exists', 'Already submitted a clue')
  }

  // Add the clue
  await roundRef.update({
    [`cluesByPlayer.${uid}`]: clue.trim(),
  })

  // Check if all non-guesser players have submitted
  const playersSnap = await db.collection('games').doc(gameId).collection('players').get()
  const nonGuesserCount = playersSnap.docs.length - 1
  const updatedRound = await roundRef.get()
  const cluesCount = Object.keys(updatedRound.data()!.cluesByPlayer || {}).length

  if (cluesCount === nonGuesserCount) {
    // All clues in — detect duplicates
    await detectAndEliminateDuplicates(gameId, roundNum)
  }
})

// -- SUBMIT GUESS --
export const submitGuess = onCall(async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Must be signed in')

  const { gameId, roundNum, guess } = request.data as { gameId: string; roundNum: number; guess: string }
  if (!guess?.trim()) throw new HttpsError('invalid-argument', 'Guess required')

  const gameSnap = await db.collection('games').doc(gameId).get()
  const game = gameSnap.data()!

  if (game.currentGuesser !== uid) {
    throw new HttpsError('permission-denied', 'Only the guesser can submit a guess')
  }

  const roundRef = db.collection('games').doc(gameId).collection('rounds').doc(String(roundNum))
  const roundSnap = await roundRef.get()

  if (!roundSnap.exists) throw new HttpsError('not-found', 'Round not found')
  if (roundSnap.data()!.status !== 'guess') {
    throw new HttpsError('failed-precondition', 'Round not accepting guesses')
  }

  const secretWord = roundSnap.data()!.secretWord
  const isCorrect = guess.trim().toUpperCase() === secretWord.toUpperCase()

  const roundData = roundSnap.data()!
  const newScore = isCorrect ? roundData.score || 0 : (roundData.score || 0) - 1

  await roundRef.update({
    guesserAnswer: guess.trim(),
    isCorrect,
    score: newScore,
    status: 'scored',
  })

  // Update game score
  await db.collection('games').doc(gameId).update({ teamScore: newScore })
})

// -- ADVANCE ROUND --
export const advanceRound = onCall(async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Must be signed in')

  const { gameId } = request.data as { gameId: string }
  const gameSnap = await db.collection('games').doc(gameId).get()
  if (gameSnap.data()!.hostId !== uid) throw new HttpsError('permission-denied', 'Only host can advance')

  await doAdvanceRound(gameId)
})

// -- INTERNAL HELPERS --

async function detectAndEliminateDuplicates(gameId: string, roundNum: number) {
  const roundRef = db.collection('games').doc(gameId).collection('rounds').doc(String(roundNum))
  const roundSnap = await roundRef.get()
  const roundData = roundSnap.data()!

  const secretWord = roundData.secretWord
  const cluesByPlayer = roundData.cluesByPlayer || {}

  try {
    const result = await detectDuplicateClues(secretWord, cluesByPlayer)
    await roundRef.update({
      eliminatedPlayerIds: result.eliminatedPlayerIds,
      eliminationReason: result.reason,
      status: 'reveal',
    })
  } catch (err) {
    console.error('Duplicate detection failed:', err)
    // Continue with no eliminations if Gemini fails
    await roundRef.update({
      eliminatedPlayerIds: [],
      eliminationReason: 'Duplicate detection unavailable',
      status: 'reveal',
    })
  }
}

async function doAdvanceRound(gameId: string) {
  const gameRef = db.collection('games').doc(gameId)
  const gameSnap = await gameRef.get()
  const game = gameSnap.data()!

  // Check if game is over
  const roundNum = game.currentRound
  if (roundNum >= game.settings.totalRounds) {
    await gameRef.update({ status: 'finished' })
    return
  }

  const nextRound = roundNum + 1
  const playerIds = game.playerIds

  // Rotate guesser: next player in the list
  const currentGuesserIndex = playerIds.indexOf(game.currentGuesser)
  const nextGuesserIndex = (currentGuesserIndex + 1) % playerIds.length
  const nextGuesser = playerIds[nextGuesserIndex]

  // Pop a word from remaining cards
  const cardsRemaining = [...(game.cardsRemaining || [])]
  const secretWord = cardsRemaining.shift()

  if (!secretWord) {
    await gameRef.update({ status: 'finished' })
    return
  }

  const deadline = new Date(Date.now() + game.settings.secondsPerRound * 1000)

  await gameRef.collection('rounds').doc(String(nextRound)).set({
    secretWord,
    status: 'clue-submission',
    deadline: Timestamp.fromDate(deadline),
    cluesByPlayer: {},
    eliminatedPlayerIds: [],
    eliminationReason: '',
    score: 0,
  })

  await gameRef.update({
    currentRound: nextRound,
    currentGuesser: nextGuesser,
    cardsRemaining,
  })
}
