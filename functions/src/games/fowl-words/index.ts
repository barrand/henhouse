import { onCall, HttpsError } from 'firebase-functions/v2/https'
import * as admin from 'firebase-admin'
import { FieldValue } from 'firebase-admin/firestore'
import { claimRoomCode, releaseRoomCode } from '../../shared/roomCodes'
import { eligibleNonGuesserIds, isRoundEligible } from '../../shared/roundEligibility'
import { runDeduplication, handleGuess, advanceToNextRound, skipToNextAttempt, finalizeWordSelection, beginClueSubmission } from './roundFlow'
import { mostHelpfulSplitPts } from './peerLove'
import { buildFowlWordsDeck } from './deck'
import { addFowlWordCooldownWrites, fetchActiveFowlWordCooldowns } from './cooldowns'
import {
  giverLovesForPlayer,
  giverBooForPlayer,
  guesserMostHelpfulFromRound,
  guesserBooFromRound,
} from './voteHelpers'

const db = admin.firestore

const TOTAL_ROUNDS = 10 // Reduced from 13 after playtest feedback

async function buildCardsRemaining(
  totalRounds: number,
  includePatrioticQuestions: boolean,
  originalHostId: string,
): Promise<string[]> {
  const words = (await import('./data/words.json')).default as string[]
  const patrioticWords = (await import('./data/patrioticWords.json')).default as string[]
  const activeCooldownKeys = await fetchActiveFowlWordCooldowns(originalHostId)
  return buildFowlWordsDeck({
    words,
    patrioticWords,
    totalRounds,
    includePatrioticQuestions,
    activeCooldownKeys,
  })
}

// -- CREATE GAME (Fowl Words) --
export const fowlWordsCreateGame = onCall(async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Must be signed in')

  const { playerName, includePatrioticQuestions = false } = request.data as {
    playerName: string
    includePatrioticQuestions?: boolean
  }
  if (!playerName?.trim()) throw new HttpsError('invalid-argument', 'Name required')
  if (typeof includePatrioticQuestions !== 'boolean') {
    throw new HttpsError('invalid-argument', 'includePatrioticQuestions must be a boolean')
  }

  const firestore = db()
  const gameRef = firestore.collection('games').doc()
  const gameId = gameRef.id

  let code: string
  try {
    code = await claimRoomCode(gameId, 'fowl-words')
  } catch {
    throw new HttpsError('internal', 'Could not generate room code')
  }

  await gameRef.set({
    code,
    gameType: 'fowl-words',
    hostId: uid,
    originalHostId: uid,
    status: 'lobby',
    currentRound: 0,
    currentGuesser: null,
    cardsRemaining: [],
    playerIds: [uid],
    settings: { totalRounds: TOTAL_ROUNDS, secondsPerRound: 60, autoAdvanceSeconds: 10 },
    includePatrioticQuestions,
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

  const includePatrioticQuestions = game.includePatrioticQuestions ?? false

  await newGameRef.set({
    code: newCode,
    gameType: 'fowl-words',
    hostId: uid,
    originalHostId: game.originalHostId ?? uid,
    status: 'lobby',
    currentRound: 0,
    currentGuesser: null,
    cardsRemaining: [],
    playerIds: game.playerIds,
    settings: game.settings,
    includePatrioticQuestions,
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
  const totalRounds: number = game.settings?.totalRounds ?? TOTAL_ROUNDS
  const originalHostId: string = game.originalHostId ?? game.hostId
  const includePatrioticQuestions = game.includePatrioticQuestions ?? false
  const cardsRemaining = await buildCardsRemaining(totalRounds, includePatrioticQuestions, originalHostId)

  // Draw 3 words for the first word-selection vote
  const wordOptions: string[] = []
  for (let i = 0; i < 3 && cardsRemaining.length > 0; i++) {
    wordOptions.push(cardsRemaining.shift()!)
  }
  if (wordOptions.length === 0) throw new HttpsError('internal', 'No words available')

  const { Timestamp } = await import('firebase-admin/firestore')
  const wordSelectionDeadline = Timestamp.fromMillis(Date.now() + 15 * 1000)

  // Batch write so round doc and game status change are atomic — clients can't
  // see game.status === 'playing' without the round document already existing.
  const eligiblePlayerIds = [...game.playerIds]
  const batch = firestore.batch()
  batch.set(gameRef.collection('rounds').doc('1'), {
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
    cluePeerLoveVotes: {},
    cluePeerBooVotes: {},
    guesserMostHelpfulVote: null,
    guesserBooVote: null,
    eligiblePlayerIds,
    eligiblePlayerCount: eligiblePlayerIds.length,
  })
  batch.update(gameRef, {
    status: 'playing',
    currentRound: 1,
    currentGuesser: firstGuesser,
    cardsRemaining,
  })
  addFowlWordCooldownWrites(batch, originalHostId, wordOptions)
  await batch.commit()
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

  if (!gameSnap.exists) throw new HttpsError('not-found', 'Game not found')
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
  if (!isRoundEligible(roundData, game, uid)) {
    throw new HttpsError('permission-denied', 'You will join next round')
  }
  const secretWord = roundData.secretWord?.toLowerCase().trim() ?? ''
  const normalizedClue = clue.trim().toLowerCase()

  const clueDeadline = roundData.clueSubmissionDeadline?.toDate?.()
  if (clueDeadline && Date.now() > clueDeadline.getTime()) {
    await runDeduplication(gameId, roundNum).catch((err) => {
      console.error('submitClue deadline dedup trigger failed:', err)
    })
    throw new HttpsError('deadline-exceeded', 'Time is up')
  }

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

  // Check if all eligible non-guesser players have submitted
  // Use eligiblePlayerCount snapshotted at round creation so late joiners don't block dedup
  const eligibleGiverIds = eligibleNonGuesserIds(roundData, game)
  const eligibleGiverSet = new Set(eligibleGiverIds)
  const nonGuesserCount = eligibleGiverIds.length
  const updatedRound = await roundRef.get()
  const cluesCount = Object.keys(updatedRound.data()!.cluesByPlayer ?? {})
    .filter((playerId) => eligibleGiverSet.has(playerId))
    .length

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
  const gameRef = firestore.collection('games').doc(gameId)
  const roundRef = gameRef.collection('rounds').doc(String(roundNum))
  const [gameSnap, roundSnap] = await Promise.all([gameRef.get(), roundRef.get()])
  if (!gameSnap.exists) throw new HttpsError('not-found', 'Game not found')
  if (!roundSnap.exists) throw new HttpsError('not-found', 'Round not found')
  const game = gameSnap.data()!
  const round = roundSnap.data()!

  if (game.currentGuesser !== uid) {
    throw new HttpsError('permission-denied', 'Only the guesser can submit a guess')
  }
  if (!isRoundEligible(round, game, uid)) {
    throw new HttpsError('permission-denied', 'You will join next round')
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
  if (!gameSnap.exists) throw new HttpsError('not-found', 'Game not found')
  const game = gameSnap.data()!

  // Guessers can't vote
  if (game.currentGuesser === uid) throw new HttpsError('permission-denied', 'Guesser cannot vote on the word')

  const roundRef = firestore.collection('games').doc(gameId).collection('rounds').doc(String(roundNum))
  const roundSnap = await roundRef.get()
  if (!roundSnap.exists) throw new HttpsError('not-found', 'Round not found')
  const round = roundSnap.data()!
  if (!isRoundEligible(round, game, uid)) throw new HttpsError('permission-denied', 'You will join next round')
  if (round.status !== 'word-selection') throw new HttpsError('failed-precondition', 'Not in word-selection phase')

  await roundRef.update({ [`wordVotes.${uid}`]: wordIndex })

  // Auto-finalize if all eligible non-guessers have voted
  // Use eligiblePlayerCount snapshotted at round creation so late joiners don't block finalization
  const eligibleGiverIds = eligibleNonGuesserIds(round, game)
  const eligibleGiverSet = new Set(eligibleGiverIds)
  const nonGuesserCount = eligibleGiverIds.length
  const updatedRound = await roundRef.get()
  const voteCount = Object.keys(updatedRound.data()!.wordVotes ?? {})
    .filter((playerId) => eligibleGiverSet.has(playerId))
    .length

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

// -- BEGIN CLUE SUBMISSION (after selected-word spotlight) --
export const fowlWordsBeginClueSubmission = onCall(async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Must be signed in')

  const { gameId, roundNum } = request.data as { gameId: string; roundNum: number }
  const firestore = db()
  const gameSnap = await firestore.collection('games').doc(gameId).get()
  if (!gameSnap.exists) throw new HttpsError('not-found', 'Game not found')
  const game = gameSnap.data()!

  const roundRef = firestore.collection('games').doc(gameId).collection('rounds').doc(String(roundNum))
  const roundSnap = await roundRef.get()
  if (!roundSnap.exists) throw new HttpsError('not-found', 'Round not found')
  const round = roundSnap.data()!
  const isJoinedPlayer = Array.isArray(game.playerIds) && game.playerIds.includes(uid)
  if (!isRoundEligible(round, game, uid) && !isJoinedPlayer) {
    throw new HttpsError('permission-denied', 'You will join next round')
  }

  await beginClueSubmission(gameId, roundNum)
})

// -- UNLOCK FIRST CLUE (when all clues are duplicates, guesser has no visible clues) --
export const fowlWordsUnlockFirst = onCall(async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Must be signed in')

  const { gameId, roundNum } = request.data as { gameId: string; roundNum: number }
  const firestore = db()
  const gameSnap = await firestore.collection('games').doc(gameId).get()
  const game = gameSnap.data()!
  const roundRef = firestore.collection('games').doc(gameId).collection('rounds').doc(String(roundNum))
  const roundSnap = await roundRef.get()
  if (!roundSnap.exists) throw new HttpsError('not-found', 'Round not found')
  const round = roundSnap.data()!

  if (game.currentGuesser !== uid) {
    throw new HttpsError('permission-denied', 'Only the guesser can unlock the first clue')
  }
  if (!isRoundEligible(round, game, uid)) throw new HttpsError('permission-denied', 'You will join next round')

  await skipToNextAttempt(gameId, roundNum)
})

// -- SUBMIT CLUE PEER LOVE (multi-toggle per giver) --
// TODO(remove ~2026-07): fowlWordsSubmitClueStarVote is a legacy alias for one release.
export const fowlWordsSubmitCluePeerLove = onCall(async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Must be signed in')

  const { gameId, roundNum, groupIndex } = request.data as { gameId: string; roundNum: number; groupIndex: number }
  if (typeof groupIndex !== 'number') throw new HttpsError('invalid-argument', 'groupIndex required')

  const firestore = db()
  const gameSnap = await firestore.collection('games').doc(gameId).get()
  if (!gameSnap.exists) throw new HttpsError('not-found', 'Game not found')
  const game = gameSnap.data()!

  if (game.currentGuesser === uid) throw new HttpsError('permission-denied', 'Guesser cannot love clues during reveal')

  const roundRef = firestore.collection('games').doc(gameId).collection('rounds').doc(String(roundNum))
  const roundSnap = await roundRef.get()
  if (!roundSnap.exists) throw new HttpsError('not-found', 'Round not found')
  const round = roundSnap.data()!
  if (!isRoundEligible(round, game, uid)) throw new HttpsError('permission-denied', 'You will join next round')

  if (round.status !== 'reveal' && round.status !== 'guess') {
    throw new HttpsError('failed-precondition', 'Peer love can only be given during reveal/guess phase')
  }

  const visibleGroupIndexes: number[] = round.visibleGroupIndexes ?? []
  if (!visibleGroupIndexes.includes(groupIndex)) {
    throw new HttpsError('invalid-argument', 'Can only love visible clue groups')
  }

  const clueGroups = round.clueGroups ?? []
  const group = clueGroups[groupIndex]
  if (!group) throw new HttpsError('invalid-argument', 'Invalid group index')
  if ((group.playerIds as string[]).includes(uid)) {
    throw new HttpsError('permission-denied', 'Cannot love your own clue')
  }

  const loves = giverLovesForPlayer(round, uid)
  const key = String(groupIndex)
  const nextLoves = { ...loves }
  const isAdding = !nextLoves[key]
  if (isAdding) {
    nextLoves[key] = true
  } else {
    delete nextLoves[key]
  }

  const update: Record<string, unknown> = {
    [`clueStarVotes.${uid}`]: FieldValue.delete(),
  }
  if (Object.keys(nextLoves).length === 0) {
    update[`cluePeerLoveVotes.${uid}`] = FieldValue.delete()
  } else {
    update[`cluePeerLoveVotes.${uid}`] = nextLoves
  }

  const existingBoo = giverBooForPlayer(round, uid)
  if (isAdding && existingBoo === groupIndex) {
    update[`cluePeerBooVotes.${uid}`] = FieldValue.delete()
    update[`clueThumbsDownVotes.${uid}`] = FieldValue.delete()
  }

  await roundRef.update(update)
})

export const fowlWordsSubmitClueStarVote = fowlWordsSubmitCluePeerLove

// -- SUBMIT GUESSER MOST HELPFUL VOTE --
// TODO(remove ~2026-07): fowlWordsSubmitGuesserStarVote is a legacy alias for one release.
export const fowlWordsSubmitGuesserMostHelpful = onCall(async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Must be signed in')

  const { gameId, roundNum, groupIndex } = request.data as { gameId: string; roundNum: number; groupIndex: number }
  if (typeof groupIndex !== 'number') throw new HttpsError('invalid-argument', 'groupIndex required')

  const firestore = db()
  const gameSnap = await firestore.collection('games').doc(gameId).get()
  if (!gameSnap.exists) throw new HttpsError('not-found', 'Game not found')
  const game = gameSnap.data()!

  if (game.currentGuesser !== uid) throw new HttpsError('permission-denied', 'Only the guesser can award Most Helpful')

  const roundRef = firestore.collection('games').doc(gameId).collection('rounds').doc(String(roundNum))

  await firestore.runTransaction(async (tx) => {
    const roundSnap = await tx.get(roundRef)
    if (!roundSnap.exists) throw new HttpsError('not-found', 'Round not found')
    const round = roundSnap.data()!
    if (!isRoundEligible(round, game, uid)) throw new HttpsError('permission-denied', 'You will join next round')

    if (round.status !== 'scored') throw new HttpsError('failed-precondition', 'Round not yet scored')
    if (!round.isCorrect) throw new HttpsError('failed-precondition', 'Most Helpful only available after a correct guess')

    const visibleGroupIndexes: number[] = round.visibleGroupIndexes ?? []
    if (!visibleGroupIndexes.includes(groupIndex)) {
      throw new HttpsError('invalid-argument', 'Can only award visible clue groups')
    }

    const clueGroups = round.clueGroups ?? []
    const group = clueGroups[groupIndex]
    if (!group) throw new HttpsError('invalid-argument', 'Invalid group index')

    const previousVote = guesserMostHelpfulFromRound(round)
    const roundUpdate: Record<string, unknown> = {
      guesserStarVote: FieldValue.delete(),
    }

    if (previousVote === groupIndex) {
      roundUpdate.guesserMostHelpfulVote = null
      const pts = mostHelpfulSplitPts((group.playerIds as string[]).length)
      for (const pid of group.playerIds as string[]) {
        roundUpdate[`pointsThisRound.${pid}`] = FieldValue.increment(-pts)
        tx.update(firestore.collection('games').doc(gameId).collection('players').doc(pid), { score: FieldValue.increment(-pts) })
      }
    } else {
      if (previousVote !== null) {
        const prevGroup = clueGroups[previousVote]
        if (prevGroup) {
          const pts = mostHelpfulSplitPts((prevGroup.playerIds as string[]).length)
          for (const pid of prevGroup.playerIds as string[]) {
            roundUpdate[`pointsThisRound.${pid}`] = FieldValue.increment(-pts)
            tx.update(firestore.collection('games').doc(gameId).collection('players').doc(pid), { score: FieldValue.increment(-pts) })
          }
        }
      }
      roundUpdate.guesserMostHelpfulVote = groupIndex
      const pts = mostHelpfulSplitPts((group.playerIds as string[]).length)
      for (const pid of group.playerIds as string[]) {
        roundUpdate[`pointsThisRound.${pid}`] = FieldValue.increment(pts)
        tx.update(firestore.collection('games').doc(gameId).collection('players').doc(pid), { score: FieldValue.increment(pts) })
      }
    }

    tx.update(roundRef, roundUpdate)
  })
})

export const fowlWordsSubmitGuesserStarVote = fowlWordsSubmitGuesserMostHelpful

// -- SUBMIT CLUE PEER BOO (display only, one per giver) --
// TODO(remove ~2026-07): fowlWordsSubmitClueThumbsDown is a legacy alias for one release.
export const fowlWordsSubmitCluePeerBoo = onCall(async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Must be signed in')

  const { gameId, roundNum, groupIndex } = request.data as { gameId: string; roundNum: number; groupIndex: number }
  if (typeof groupIndex !== 'number') throw new HttpsError('invalid-argument', 'groupIndex required')

  const firestore = db()
  const gameSnap = await firestore.collection('games').doc(gameId).get()
  if (!gameSnap.exists) throw new HttpsError('not-found', 'Game not found')
  const game = gameSnap.data()!

  if (game.currentGuesser === uid) throw new HttpsError('permission-denied', 'Guesser cannot boo clues during reveal')

  const roundRef = firestore.collection('games').doc(gameId).collection('rounds').doc(String(roundNum))
  const roundSnap = await roundRef.get()
  if (!roundSnap.exists) throw new HttpsError('not-found', 'Round not found')
  const round = roundSnap.data()!
  if (!isRoundEligible(round, game, uid)) throw new HttpsError('permission-denied', 'You will join next round')

  if (round.status !== 'reveal' && round.status !== 'guess') {
    throw new HttpsError('failed-precondition', 'Boo can only be given during reveal/guess phase')
  }

  const visibleGroupIndexes: number[] = round.visibleGroupIndexes ?? []
  if (!visibleGroupIndexes.includes(groupIndex)) {
    throw new HttpsError('invalid-argument', 'Can only boo visible clue groups')
  }

  const clueGroups = round.clueGroups ?? []
  const group = clueGroups[groupIndex]
  if (!group) throw new HttpsError('invalid-argument', 'Invalid group index')
  if ((group.playerIds as string[]).includes(uid)) {
    throw new HttpsError('permission-denied', 'Cannot boo your own clue')
  }

  const existingDown = giverBooForPlayer(round, uid)
  const update: Record<string, unknown> = {
    [`clueThumbsDownVotes.${uid}`]: FieldValue.delete(),
  }

  if (existingDown === groupIndex) {
    update[`cluePeerBooVotes.${uid}`] = FieldValue.delete()
  } else {
    update[`cluePeerBooVotes.${uid}`] = groupIndex
    const loves = giverLovesForPlayer(round, uid)
    const key = String(groupIndex)
    if (loves[key]) {
      const nextLoves = { ...loves }
      delete nextLoves[key]
      if (Object.keys(nextLoves).length === 0) {
        update[`cluePeerLoveVotes.${uid}`] = FieldValue.delete()
      } else {
        update[`cluePeerLoveVotes.${uid}`] = nextLoves
      }
      update[`clueStarVotes.${uid}`] = FieldValue.delete()
    }
  }

  await roundRef.update(update)
})

export const fowlWordsSubmitClueThumbsDown = fowlWordsSubmitCluePeerBoo

// -- SUBMIT GUESSER BOO (display only, no points) --
// TODO(remove ~2026-07): fowlWordsSubmitGuesserThumbsDown is a legacy alias for one release.
export const fowlWordsSubmitGuesserBoo = onCall(async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Must be signed in')

  const { gameId, roundNum, groupIndex } = request.data as { gameId: string; roundNum: number; groupIndex: number }
  if (typeof groupIndex !== 'number') throw new HttpsError('invalid-argument', 'groupIndex required')

  const firestore = db()
  const gameSnap = await firestore.collection('games').doc(gameId).get()
  if (!gameSnap.exists) throw new HttpsError('not-found', 'Game not found')
  const game = gameSnap.data()!

  if (game.currentGuesser !== uid) throw new HttpsError('permission-denied', 'Only the guesser can boo a clue on the result screen')

  const roundRef = firestore.collection('games').doc(gameId).collection('rounds').doc(String(roundNum))
  const roundSnap = await roundRef.get()
  if (!roundSnap.exists) throw new HttpsError('not-found', 'Round not found')
  const round = roundSnap.data()!
  if (!isRoundEligible(round, game, uid)) throw new HttpsError('permission-denied', 'You will join next round')

  if (round.status !== 'scored') throw new HttpsError('failed-precondition', 'Round not yet scored')

  const visibleGroupIndexes: number[] = round.visibleGroupIndexes ?? []
  if (!visibleGroupIndexes.includes(groupIndex)) {
    throw new HttpsError('invalid-argument', 'Can only boo visible clue groups')
  }

  const clueGroups = round.clueGroups ?? []
  const group = clueGroups[groupIndex]
  if (!group) throw new HttpsError('invalid-argument', 'Invalid group index')

  const previousVote = guesserBooFromRound(round)
  if (previousVote === groupIndex) {
    await roundRef.update({
      guesserBooVote: null,
      guesserThumbsDownVote: FieldValue.delete(),
    })
  } else {
    await roundRef.update({
      guesserBooVote: groupIndex,
      guesserThumbsDownVote: FieldValue.delete(),
    })
  }
})

export const fowlWordsSubmitGuesserThumbsDown = fowlWordsSubmitGuesserBoo

// -- FORCE START DEDUP (manual escalation if a player is AFK) --
export const fowlWordsForceDedup = onCall(async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Must be signed in')

  const { gameId, roundNum } = request.data as { gameId: string; roundNum: number }
  const firestore = db()
  const gameSnap = await firestore.collection('games').doc(gameId).get()
  if (!gameSnap.exists) throw new HttpsError('not-found', 'Game not found')
  const game = gameSnap.data()!

  const roundRef = firestore.collection('games').doc(gameId).collection('rounds').doc(String(roundNum))
  const roundSnap = await roundRef.get()
  if (!roundSnap.exists) throw new HttpsError('not-found', 'Round not found')
  const round = roundSnap.data()!
  if (round.status !== 'clue-submission') {
    throw new HttpsError('failed-precondition', 'Already past clue submission')
  }
  const clueDeadline = round.clueSubmissionDeadline?.toDate?.()
  const deadlinePassed = !!clueDeadline && Date.now() > clueDeadline.getTime()
  const isJoinedPlayer = Array.isArray(game.playerIds) && game.playerIds.includes(uid)

  if (game.hostId !== uid && !(deadlinePassed && isJoinedPlayer)) {
    throw new HttpsError('permission-denied', 'Only host can force dedup before time runs out')
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
