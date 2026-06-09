// Fowl Words round flow helpers: state machine for the round lifecycle (multi-attempt)
//
// State machine:
//   clue-submission → deduplication → reveal ← ─────┐
//                                       ↓            │
//                                     guess          │
//                                       ↓            │
//                            (wrong + attempts left) ┘
//                                       ↓
//                                  (correct OR out of attempts)
//                                       ↓
//                                     scored

import * as admin from 'firebase-admin'
import { Timestamp, FieldValue } from 'firebase-admin/firestore'
import { detectDuplicateClues, evaluateGuess } from '../../shared/gemini'
import {
  buildClueGroups,
  initialVisibleGroupIndexes,
  computeRoundScores,
  computeTentativePoints,
  selectNextUnlockGroup,
  ATTEMPT_POINTS,
  MAX_ATTEMPTS,
} from './scoring'
import type { ClueGroup } from './types'

const db = admin.firestore
const SECONDS_PER_CLUE_SUBMISSION = 60
const WORD_SELECTION_SECONDS = 15

// Timer decreases with each attempt to keep game paced (shorter time as more clues visible)
function getSecondsForAttempt(attemptNum: number): number {
  if (attemptNum === 1) return 60
  if (attemptNum === 2) return 40
  return 20 // attempt 3+
}

/**
 * Finalize the word-selection vote and transition to clue-submission.
 * Safe to call multiple times — uses a transaction to only process once.
 * Called when: timer expires (frontend) OR all non-guessers have voted.
 */
export async function finalizeWordSelection(gameId: string, roundNum: number): Promise<void> {
  const firestore = db()
  const roundRef = firestore
    .collection('games')
    .doc(gameId)
    .collection('rounds')
    .doc(String(roundNum))

  // Transaction: only finalize once
  const finalized = await firestore.runTransaction(async (tx) => {
    const snap = await tx.get(roundRef)
    if (!snap.exists) return false
    const data = snap.data()!
    if (data.status !== 'word-selection') return false // already finalized
    tx.update(roundRef, { status: 'clue-submission' }) // placeholder to claim the transition
    return true
  })
  if (!finalized) return

  const roundSnap = await roundRef.get()
  const data = roundSnap.data()!
  const wordOptions: string[] = data.wordOptions ?? []
  const wordVotes: Record<string, number> = data.wordVotes ?? {}

  // Tally votes
  const tally = [0, 0, 0]
  const firstVoteTime: Record<number, number> = {}
  for (const [, idx] of Object.entries(wordVotes)) {
    if (idx >= 0 && idx <= 2) {
      tally[idx]++
    }
  }

  // Pick winner: most votes; tiebreaker: random among tied (simple for now)
  let winnerIdx = 0
  let maxVotes = -1
  for (let i = 0; i < 3; i++) {
    if (tally[i] > maxVotes) {
      maxVotes = tally[i]
      winnerIdx = i
    }
  }
  // If no votes at all, pick random
  if (maxVotes === 0) winnerIdx = Math.floor(Math.random() * wordOptions.length)

  const secretWord = wordOptions[winnerIdx] ?? wordOptions[0] ?? ''

  const clueSubmissionDeadline = Timestamp.fromMillis(Date.now() + SECONDS_PER_CLUE_SUBMISSION * 1000)

  await roundRef.update({
    status: 'clue-submission',
    secretWord,
    cluesByPlayer: {},
    clueTimestamps: {},
    clueSubmissionDeadline,
  })
}

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

  console.log('[runDeduplication] Game:', gameId, 'Round:', roundNum, 'Secret word:', secretWord)
  console.log('[runDeduplication] Clues by player:', JSON.stringify(cluesByPlayer))

  const result = await detectDuplicateClues(secretWord, cluesByPlayer)
  console.log('[runDeduplication] detectDuplicateClues returned:', JSON.stringify(result))

  const clueGroups = buildClueGroups(result.groups, cluesByPlayer)
  console.log('[runDeduplication] Built clue groups:', JSON.stringify(clueGroups))

  const visibleGroupIndexes = initialVisibleGroupIndexes(clueGroups)
  console.log('[runDeduplication] Initial visible group indexes:', visibleGroupIndexes)

  // Guarantee minimum 3 attempts always, but allow more if there are many unique clues
  // (which rewards less duplication). Capped at MAX_ATTEMPTS.
  const maxAttempts = Math.max(3, Math.min(MAX_ATTEMPTS, Math.max(1, clueGroups.length)))
  const currentAttempt = 1
  const guesserId: string = await getGuesserId(gameId)
  const giverCount: number = await getGiverCount(gameId)

  const rawTimestamps = roundSnap.data()?.clueTimestamps ?? {}
  const clueTimestamps = normalizeTimestamps(rawTimestamps)

  const tentativePoints = computeTentativePoints(
    clueGroups,
    visibleGroupIndexes,
    guesserId,
    currentAttempt,
    clueTimestamps,
    giverCount,
  )

  const attemptDeadline = Timestamp.fromMillis(Date.now() + getSecondsForAttempt(currentAttempt) * 1000)

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
 *
 * Multi-attempt flow:
 *   - Correct: write final scores, status → 'scored'
 *   - Wrong + attempts left: unlock next group, status → 'reveal', refresh timer
 *   - Wrong + no attempts left: zero scores, status → 'scored'
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
  const clueGroups = (roundData.clueGroups ?? []) as ClueGroup[]
  const visibleGroupIndexes: number[] = roundData.visibleGroupIndexes ?? []
  const currentAttempt: number = roundData.currentAttempt ?? 1
  const maxAttempts: number = roundData.maxAttempts ?? 1

  const isCorrect = await evaluateGuess(secretWord, guess)
  const clueTimestamps = normalizeTimestamps(roundData.clueTimestamps ?? {})
  const giverCount = await getGiverCount(gameId)

  // ── Path 1: Correct ─────────────────────────────────────────────
  if (isCorrect) {
    const scores = computeRoundScores(
      clueGroups,
      visibleGroupIndexes,
      guesserId,
      true,
      currentAttempt,
      clueTimestamps,
      giverCount,
    )

    const batch = firestore.batch()
    batch.update(roundRef, {
      status: 'scored',
      isCorrect: true,
      guesserAnswer: guess.trim(),
      pointsThisRound: scores,
      tentativePoints: scores,
      attemptInProgress: false,
    })
    for (const [playerId, pts] of Object.entries(scores)) {
      if (pts !== 0) {
        const playerRef = firestore.collection('games').doc(gameId).collection('players').doc(playerId)
        batch.update(playerRef, { score: FieldValue.increment(pts) })
      }
    }
    await batch.commit()
    return
  }

  // ── Path 2: Wrong, no attempts left → round over ────────────────
  if (currentAttempt >= maxAttempts) {
    const scores = computeRoundScores(
      clueGroups,
      visibleGroupIndexes,
      guesserId,
      false,
      currentAttempt,
      clueTimestamps,
      giverCount,
    )
    const batch = firestore.batch()
    batch.update(roundRef, {
      status: 'scored',
      isCorrect: false,
      guesserAnswer: guess.trim(),
      pointsThisRound: scores,
      tentativePoints: scores,
      attemptInProgress: false,
    })
    // Apply penalties (e.g. duplicate -1) even on failure
    for (const [playerId, pts] of Object.entries(scores)) {
      if (pts !== 0) {
        const playerRef = firestore.collection('games').doc(gameId).collection('players').doc(playerId)
        batch.update(playerRef, { score: FieldValue.increment(pts) })
      }
    }
    await batch.commit()
    return
  }

  // ── Path 3: Wrong, attempts left → unlock next group, retry ─────
  const playerScores = await fetchPlayerScores(gameId)

  const nextUnlockIdx = selectNextUnlockGroup(
    clueGroups,
    visibleGroupIndexes,
    playerScores,
    clueTimestamps,
  )

  // If nothing to unlock (shouldn't happen if maxAttempts is consistent), end round
  if (nextUnlockIdx < 0) {
    const scores = computeRoundScores(clueGroups, visibleGroupIndexes, guesserId, false, currentAttempt, clueTimestamps, giverCount)
    await roundRef.update({
      status: 'scored',
      isCorrect: false,
      guesserAnswer: guess.trim(),
      pointsThisRound: scores,
      tentativePoints: scores,
      attemptInProgress: false,
    })
    return
  }

  const newVisible = [...visibleGroupIndexes, nextUnlockIdx]
  const newAttempt = currentAttempt + 1
  const newTentative = computeTentativePoints(clueGroups, newVisible, guesserId, newAttempt, clueTimestamps, giverCount)
  const newDeadline = Timestamp.fromMillis(Date.now() + SECONDS_PER_ATTEMPT * 1000)

  await roundRef.update({
    status: 'reveal',
    currentAttempt: newAttempt,
    visibleGroupIndexes: newVisible,
    tentativePoints: newTentative,
    attemptDeadline: newDeadline,
    attemptInProgress: false,
    lastUnlockedGroupIndex: nextUnlockIdx, // for UI to highlight what just changed
  })
}

/**
 * Skip the current attempt when there are no visible clues (all duplicates).
 * Unlocks the first duplicate group and drops to the next point tier.
 * Only valid when visibleGroupIndexes is empty.
 */
export async function skipToNextAttempt(gameId: string, roundNum: number): Promise<void> {
  const firestore = db()
  const roundRef = firestore
    .collection('games')
    .doc(gameId)
    .collection('rounds')
    .doc(String(roundNum))

  const roundSnap = await roundRef.get()
  if (!roundSnap.exists) throw new Error('Round not found')
  const roundData = roundSnap.data()!

  // Only allowed when there are no visible clues
  const visibleGroupIndexes: number[] = roundData.visibleGroupIndexes ?? []
  if (visibleGroupIndexes.length > 0) throw new Error('Cannot skip — there are visible clues')

  const clueGroups = (roundData.clueGroups ?? []) as ClueGroup[]
  const currentAttempt: number = roundData.currentAttempt ?? 1
  const maxAttempts: number = roundData.maxAttempts ?? 1
  const guesserId: string = await getGuesserId(gameId)
  const giverCount: number = await getGiverCount(gameId)
  const clueTimestamps = normalizeTimestamps(roundData.clueTimestamps ?? {})
  const playerScores = await fetchPlayerScores(gameId)

  const nextUnlockIdx = selectNextUnlockGroup(
    clueGroups,
    visibleGroupIndexes,
    playerScores,
    clueTimestamps,
  )

  if (nextUnlockIdx < 0) {
    // Nothing to unlock — end the round with zero scores
    const scores = computeRoundScores(clueGroups, visibleGroupIndexes, guesserId, false, currentAttempt, clueTimestamps, giverCount)
    await roundRef.update({
      status: 'scored',
      isCorrect: false,
      pointsThisRound: scores,
      tentativePoints: scores,
    })
    return
  }

  const newVisible = [nextUnlockIdx]
  const newAttempt = currentAttempt + 1
  const newTentative = computeTentativePoints(clueGroups, newVisible, guesserId, newAttempt, clueTimestamps, giverCount)
  const newDeadline = Timestamp.fromMillis(Date.now() + SECONDS_PER_ATTEMPT * 1000)

  await roundRef.update({
    status: 'reveal',
    currentAttempt: Math.min(newAttempt, maxAttempts),
    visibleGroupIndexes: newVisible,
    tentativePoints: newTentative,
    attemptDeadline: newDeadline,
    lastUnlockedGroupIndex: nextUnlockIdx,
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

  const totalRounds: number = game.settings?.totalRounds ?? 10
  const currentRound: number = game.currentRound ?? 0

  if (currentRound >= totalRounds) {
    await gameRef.update({ status: 'finished' })
    return
  }

  const cardsRemaining: string[] = [...(game.cardsRemaining ?? [])]

  // Draw 3 words for voting; if fewer than 3 remain, use what we have
  const wordOptions: string[] = []
  for (let i = 0; i < 3 && cardsRemaining.length > 0; i++) {
    wordOptions.push(cardsRemaining.shift()!)
  }

  if (wordOptions.length === 0) {
    await gameRef.update({ status: 'finished' })
    return
  }

  const nextRoundNum = currentRound + 1

  // Rotate guesser
  const playerIds: string[] = game.playerIds ?? []
  const currentGuesserIdx = playerIds.indexOf(game.currentGuesser)
  const nextGuesserIdx = (currentGuesserIdx + 1) % playerIds.length
  const nextGuesser = playerIds[nextGuesserIdx]

  const wordSelectionDeadline = Timestamp.fromMillis(Date.now() + WORD_SELECTION_SECONDS * 1000)

  await gameRef.collection('rounds').doc(String(nextRoundNum)).set({
    secretWord: '',           // set after word selection
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
  })

  await gameRef.update({
    currentRound: nextRoundNum,
    currentGuesser: nextGuesser,
    cardsRemaining,
  })
}

// ── helpers ────────────────────────────────────────────────────────

async function getGuesserId(gameId: string): Promise<string> {
  const firestore = db()
  const gameSnap = await firestore.collection('games').doc(gameId).get()
  return (gameSnap.data()?.currentGuesser as string) ?? ''
}

async function getGiverCount(gameId: string): Promise<number> {
  const firestore = db()
  const gameSnap = await firestore.collection('games').doc(gameId).get()
  const playerIds: string[] = gameSnap.data()?.playerIds ?? []
  return Math.max(0, playerIds.length - 1) // total players minus the guesser
}

async function fetchPlayerScores(gameId: string): Promise<Record<string, number>> {
  const firestore = db()
  const playersSnap = await firestore.collection('games').doc(gameId).collection('players').get()
  const scores: Record<string, number> = {}
  playersSnap.docs.forEach((d) => {
    scores[d.id] = (d.data().score as number) ?? 0
  })
  return scores
}

/**
 * Normalize Firestore Timestamps (or any timestamp-shaped value) to plain
 * millisecond numbers for the priority tiebreaker.
 */
function normalizeTimestamps(raw: Record<string, unknown>): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [k, v] of Object.entries(raw)) {
    if (v instanceof Timestamp) {
      out[k] = v.toMillis()
    } else if (
      typeof v === 'object' &&
      v !== null &&
      'seconds' in v &&
      typeof (v as { seconds: number }).seconds === 'number'
    ) {
      // serialized Firestore Timestamp shape
      const s = (v as { seconds: number; nanoseconds?: number })
      out[k] = s.seconds * 1000 + Math.floor((s.nanoseconds ?? 0) / 1e6)
    } else if (typeof v === 'number') {
      out[k] = v
    }
  }
  return out
}

// Suppress unused warnings if any export becomes optional during refactor
void ATTEMPT_POINTS
