// Just One round flow helpers: state machine for the round lifecycle

import * as admin from 'firebase-admin'
import { Timestamp, FieldValue } from 'firebase-admin/firestore'
import { detectDuplicateClues, evaluateGuess } from '../../shared/gemini'
import { buildClueGroups, initialVisibleGroupIndexes, computeRoundScores, ATTEMPT_POINTS } from './scoring'

const db = admin.firestore

const SECONDS_PER_ATTEMPT = 60 // Generous timer per attempt (can tighten later)

/**
 * Called after all clues are submitted. Runs Gemini dedup and transitions
 * the round to 'reveal' status with grouped clues + initial visible groups.
 */
export async function runDeduplication(gameId: string, roundNum: number): Promise<void> {
  const firestore = db()
  const roundRef = firestore
    .collection('games')
    .doc(gameId)
    .collection('rounds')
    .doc(String(roundNum))

  // Mark as deduplicating (so UI can show spinner)
  await roundRef.update({ status: 'deduplication' })

  const roundSnap = await roundRef.get()
  const roundData = roundSnap.data()!
  const cluesByPlayer: Record<string, string> = roundData.cluesByPlayer ?? {}
  const secretWord: string = roundData.secretWord

  const result = await detectDuplicateClues(secretWord, cluesByPlayer)
  const clueGroups = buildClueGroups(result.groups, cluesByPlayer)
  const visibleGroupIndexes = initialVisibleGroupIndexes(clueGroups)

  // Phase 3A: single-attempt only
  const maxAttempts = 1
  const currentAttempt = 1

  // Tentative points: visible-group members get the attempt's value; locked = 0
  const tentativePoints: Record<string, number> = {}
  const pointValue = ATTEMPT_POINTS[currentAttempt - 1]
  for (const group of clueGroups) {
    for (const playerId of group.playerIds) {
      tentativePoints[playerId] = 0
    }
  }
  for (const idx of visibleGroupIndexes) {
    const group = clueGroups[idx]
    if (!group) continue
    for (const playerId of group.playerIds) {
      tentativePoints[playerId] = pointValue
    }
  }

  const attemptDeadline = Timestamp.fromMillis(Date.now() + SECONDS_PER_ATTEMPT * 1000)

  await roundRef.update({
    status: 'reveal',
    clueGroups,
    visibleGroupIndexes,
    currentAttempt,
    maxAttempts,
    attemptDeadline,
    eliminationReason: result.reason,
    tentativePoints,
  })
}

/**
 * Called when the guesser submits a guess.
 * Phase 3A: single attempt only — score immediately based on correct/wrong.
 */
export async function handleGuess(
  gameId: string,
  roundNum: number,
  guesserId: string,
  guess: string,
): Promise<void> {
  const firestore = db()
  const roundRef = firestore
    .collection('games')
    .doc(gameId)
    .collection('rounds')
    .doc(String(roundNum))

  // Atomically claim "guess in progress" to prevent double-submit
  const claimed = await firestore.runTransaction(async (tx) => {
    const snap = await tx.get(roundRef)
    if (!snap.exists) return false
    const data = snap.data()!
    if (data.status !== 'guess' && data.status !== 'reveal') return false
    if (data.attemptInProgress === true) return false
    tx.update(roundRef, {
      attemptInProgress: true,
      status: 'guess',
      guessAttempts: FieldValue.arrayUnion(guess.trim()),
    })
    return true
  })
  if (!claimed) return

  const roundSnap = await roundRef.get()
  const roundData = roundSnap.data()!
  const secretWord: string = roundData.secretWord
  const clueGroups = (roundData.clueGroups ?? []) as Array<{ playerIds: string[]; clueTexts: string[]; isDuplicate: boolean }>
  const visibleGroupIndexes: number[] = roundData.visibleGroupIndexes ?? []
  const currentAttempt: number = roundData.currentAttempt ?? 1

  const isCorrect = await evaluateGuess(secretWord, guess)

  if (isCorrect) {
    const scores = computeRoundScores(clueGroups, visibleGroupIndexes, guesserId, true, currentAttempt)

    // Persist scores: write to round + bump player score
    const batch = firestore.batch()
    batch.update(roundRef, {
      status: 'scored',
      isCorrect: true,
      guesserAnswer: guess.trim(),
      pointsThisRound: scores,
      attemptInProgress: false,
    })
    for (const [playerId, pts] of Object.entries(scores)) {
      if (pts > 0) {
        const playerRef = firestore.collection('games').doc(gameId).collection('players').doc(playerId)
        batch.update(playerRef, { score: FieldValue.increment(pts) })
      }
    }
    await batch.commit()
    return
  }

  // Wrong guess. Phase 3A: single attempt, so this ends the round with 0 points.
  const scores = computeRoundScores(clueGroups, visibleGroupIndexes, guesserId, false, currentAttempt)
  await roundRef.update({
    status: 'scored',
    isCorrect: false,
    guesserAnswer: guess.trim(),
    pointsThisRound: scores,
    attemptInProgress: false,
  })
}

/**
 * Move to the next round (or end the game).
 */
export async function advanceToNextRound(gameId: string): Promise<void> {
  const firestore = db()
  const gameRef = firestore.collection('games').doc(gameId)
  const gameSnap = await gameRef.get()
  const game = gameSnap.data()!

  const totalRounds: number = game.settings?.totalRounds ?? 13
  const currentRound: number = game.currentRound ?? 0

  if (currentRound >= totalRounds) {
    await gameRef.update({ status: 'finished' })
    return
  }

  const cardsRemaining: string[] = [...(game.cardsRemaining ?? [])]
  const nextWord = cardsRemaining.shift()
  if (!nextWord) {
    await gameRef.update({ status: 'finished' })
    return
  }

  const nextRoundNum = currentRound + 1

  // Rotate guesser
  const playerIds: string[] = game.playerIds ?? []
  const currentGuesserIdx = playerIds.indexOf(game.currentGuesser)
  const nextGuesserIdx = (currentGuesserIdx + 1) % playerIds.length
  const nextGuesser = playerIds[nextGuesserIdx]

  // Create new round doc
  await gameRef.collection('rounds').doc(String(nextRoundNum)).set({
    secretWord: nextWord,
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
    currentRound: nextRoundNum,
    currentGuesser: nextGuesser,
    cardsRemaining,
  })
}
