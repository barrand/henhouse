import { onCall, HttpsError } from 'firebase-functions/v2/https'
import * as admin from 'firebase-admin'
import { FieldValue } from 'firebase-admin/firestore'
import { claimRoomCode, releaseRoomCode } from '../../shared/roomCodes'
import { runDeduplication, handleGuess, advanceToNextRound, skipToNextAttempt, finalizeWordSelection } from './roundFlow'

const db = admin.firestore

const TOTAL_ROUNDS = 10 // Reduced from 13 after playtest feedback

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

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

  // Load and shuffle word list — draw 3 words per round (2 burned after voting)
  const words = (await import('./data/words.json')).default as string[]
  const shuffled = shuffle(words)
  const cardsRemaining = shuffled.slice(0, TOTAL_ROUNDS * 3)

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
  const shuffled = shuffle(words)
  const cardsRemaining = shuffled.slice(0, TOTAL_ROUNDS * 3)

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

  // Draw 3 words for the first word-selection vote
  const wordOptions: string[] = []
  for (let i = 0; i < 3 && cardsRemaining.length > 0; i++) {
    wordOptions.push(cardsRemaining.shift()!)
  }
  if (wordOptions.length === 0) throw new HttpsError('internal', 'No words available')

  const { Timestamp } = await import('firebase-admin/firestore')
  const wordSelectionDeadline = Timestamp.fromMillis(Date.now() + 15 * 1000)

  await gameRef.collection('rounds').doc('1').set({
    secretWord: '',
    wordOptions,
    wordVotes: {},
    wordSelectionDeadline,
    status: 'word-selection',
    currentAttempt: 1,
    maxAttempts: 1,
    attemptInProgress: false,
    cluesByPlayer: {},
    clueTimestamps: {},
    clueGroups: [],
    visibleGroupIndexes: [],
    guessAttempts: [],
    tentativePoints: {},
    pointsThisRound: {},
    eliminationReason: '',
    clueStarVotes: {},
    guesserStarVote: null,
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

  const firestore = db()
  const gameRef = firestore.collection('games').doc(gameId)
  const roundRef = gameRef.collection('rounds').doc(String(roundNum))

  const [gameSnap, roundSnap] = await Promise.all([gameRef.get(), roundRef.get()])

  if (!roundSnap.exists) throw new HttpsError('not-found', 'Round not found')
  const game = gameSnap.data()!
  if (game.status === 'abandoned') throw new HttpsError('failed-precondition', 'Game has ended')
  if (roundSnap.data()!.status !== 'clue-submission') {
    throw new HttpsError('failed-precondition', 'Round not accepting clues')
  }
  if (game.currentGuesser === uid) {
    throw new HttpsError('failed-precondition', 'Guesser cannot submit clues')
  }

  const roundData = roundSnap.data()!
  const secretWord = roundData.secretWord?.toLowerCase().trim() ?? ''
  const normalizedClue = clue.trim().toLowerCase()

  // Check if clue is a substring of the secret word
  if (secretWord && secretWord.includes(normalizedClue)) {
    throw new HttpsError('invalid-argument', `Clue cannot be part of the secret word`)
  }

  const existing = roundData.cluesByPlayer ?? {}
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

// -- SUBMIT WORD VOTE --
export const fowlWordsSubmitWordVote = onCall(async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Must be signed in')

  const { gameId, roundNum, wordIndex } = request.data as { gameId: string; roundNum: number; wordIndex: number }
  if (wordIndex < 0 || wordIndex > 2) throw new HttpsError('invalid-argument', 'wordIndex must be 0, 1, or 2')

  const firestore = db()
  const gameSnap = await firestore.collection('games').doc(gameId).get()
  const game = gameSnap.data()!

  // Guessers can't vote
  if (game.currentGuesser === uid) throw new HttpsError('permission-denied', 'Guesser cannot vote on the word')

  const roundRef = firestore.collection('games').doc(gameId).collection('rounds').doc(String(roundNum))
  const roundSnap = await roundRef.get()
  if (!roundSnap.exists) throw new HttpsError('not-found', 'Round not found')
  if (roundSnap.data()!.status !== 'word-selection') throw new HttpsError('failed-precondition', 'Not in word-selection phase')

  await roundRef.update({ [`wordVotes.${uid}`]: wordIndex })

  // Auto-finalize if all non-guessers have voted
  const playersSnap = await firestore.collection('games').doc(gameId).collection('players').get()
  const nonGuesserCount = playersSnap.docs.length - 1
  const updatedRound = await roundRef.get()
  const voteCount = Object.keys(updatedRound.data()!.wordVotes ?? {}).length

  if (voteCount >= nonGuesserCount && nonGuesserCount > 0) {
    await finalizeWordSelection(gameId, roundNum)
  }
})

// -- FINALIZE WORD SELECTION (called by frontend when timer expires) --
export const fowlWordsFinalizeWordSelection = onCall(async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Must be signed in')

  const { gameId, roundNum } = request.data as { gameId: string; roundNum: number }
  await finalizeWordSelection(gameId, roundNum)
})

// -- UNLOCK FIRST CLUE (when all clues are duplicates, guesser has no visible clues) --
export const fowlWordsUnlockFirst = onCall(async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Must be signed in')

  const { gameId, roundNum } = request.data as { gameId: string; roundNum: number }
  const firestore = db()
  const gameSnap = await firestore.collection('games').doc(gameId).get()
  const game = gameSnap.data()!

  if (game.currentGuesser !== uid) {
    throw new HttpsError('permission-denied', 'Only the guesser can unlock the first clue')
  }

  await skipToNextAttempt(gameId, roundNum)
})

// -- SUBMIT CLUE STAR VOTE --
export const fowlWordsSubmitClueStarVote = onCall(async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Must be signed in')

  const { gameId, roundNum, groupIndex } = request.data as { gameId: string; roundNum: number; groupIndex: number }
  if (typeof groupIndex !== 'number') throw new HttpsError('invalid-argument', 'groupIndex required')

  const firestore = db()
  const gameSnap = await firestore.collection('games').doc(gameId).get()
  if (!gameSnap.exists) throw new HttpsError('not-found', 'Game not found')
  const game = gameSnap.data()!

  if (game.currentGuesser === uid) throw new HttpsError('permission-denied', 'Guesser cannot star clues during reveal')

  const roundRef = firestore.collection('games').doc(gameId).collection('rounds').doc(String(roundNum))
  const roundSnap = await roundRef.get()
  if (!roundSnap.exists) throw new HttpsError('not-found', 'Round not found')
  const round = roundSnap.data()!

  if (round.status !== 'reveal' && round.status !== 'guess') {
    throw new HttpsError('failed-precondition', 'Stars can only be given during reveal/guess phase')
  }

  const visibleGroupIndexes: number[] = round.visibleGroupIndexes ?? []
  if (!visibleGroupIndexes.includes(groupIndex)) {
    throw new HttpsError('invalid-argument', 'Can only star visible clue groups')
  }

  const clueGroups = round.clueGroups ?? []
  const group = clueGroups[groupIndex]
  if (!group) throw new HttpsError('invalid-argument', 'Invalid group index')
  if ((group.playerIds as string[]).includes(uid)) {
    throw new HttpsError('permission-denied', 'Cannot star your own clue')
  }

  const existingVote = (round.clueStarVotes ?? {})[uid]
  if (existingVote === groupIndex) {
    // Toggle off
    await roundRef.update({ [`clueStarVotes.${uid}`]: FieldValue.delete() })
  } else {
    await roundRef.update({ [`clueStarVotes.${uid}`]: groupIndex })
  }
})

// -- SUBMIT GUESSER STAR VOTE --
export const fowlWordsSubmitGuesserStarVote = onCall(async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Must be signed in')

  const { gameId, roundNum, groupIndex } = request.data as { gameId: string; roundNum: number; groupIndex: number }
  if (typeof groupIndex !== 'number') throw new HttpsError('invalid-argument', 'groupIndex required')

  const firestore = db()
  const gameSnap = await firestore.collection('games').doc(gameId).get()
  if (!gameSnap.exists) throw new HttpsError('not-found', 'Game not found')
  const game = gameSnap.data()!

  if (game.currentGuesser !== uid) throw new HttpsError('permission-denied', 'Only the guesser can give a guesser star')

  const roundRef = firestore.collection('games').doc(gameId).collection('rounds').doc(String(roundNum))

  await firestore.runTransaction(async (tx) => {
    const roundSnap = await tx.get(roundRef)
    if (!roundSnap.exists) throw new HttpsError('not-found', 'Round not found')
    const round = roundSnap.data()!

    if (round.status !== 'scored') throw new HttpsError('failed-precondition', 'Round not yet scored')
    if (!round.isCorrect) throw new HttpsError('failed-precondition', 'Guesser star only available after a correct guess')
    if (round.guesserStarVote != null) throw new HttpsError('already-exists', 'Already gave a guesser star this round')

    const visibleGroupIndexes: number[] = round.visibleGroupIndexes ?? []
    if (!visibleGroupIndexes.includes(groupIndex)) {
      throw new HttpsError('invalid-argument', 'Can only star visible clue groups')
    }

    const clueGroups = round.clueGroups ?? []
    const group = clueGroups[groupIndex]
    if (!group) throw new HttpsError('invalid-argument', 'Invalid group index')

    // Mark star on round doc and update pointsThisRound for accurate result screen display
    const roundUpdate: Record<string, unknown> = { guesserStarVote: groupIndex }
    for (const pid of group.playerIds as string[]) {
      roundUpdate[`pointsThisRound.${pid}`] = FieldValue.increment(5)
      const playerRef = firestore.collection('games').doc(gameId).collection('players').doc(pid)
      tx.update(playerRef, { score: FieldValue.increment(5) })
    }
    tx.update(roundRef, roundUpdate)
  })
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

// -- ABANDON GAME (Fowl Words) --
export const fowlWordsAbandonGame = onCall(async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Must be signed in')

  const { gameId } = request.data as { gameId: string }
  const firestore = db()
  const gameRef = firestore.collection('games').doc(gameId)
  const gameSnap = await gameRef.get()
  if (!gameSnap.exists) throw new HttpsError('not-found', 'Game not found')

  const game = gameSnap.data()!
  if (game.hostId !== uid) throw new HttpsError('permission-denied', 'Only the host can end the game')

  await gameRef.update({ status: 'abandoned' })
  try { await releaseRoomCode(game.code) } catch { /* ignore — code expiry is fine */ }
})
