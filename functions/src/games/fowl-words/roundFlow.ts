// Fowl Words round flow helpers: state machine for the round lifecycle (multi-attempt)
//
// State machine:
//   word-selection → word-selected → clue-submission → deduplication → reveal ← ─────┐
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
import { createHash } from 'node:crypto'
import { detectDuplicateClues, deterministicGuess, evaluateGuess } from '../../shared/gemini'
import { DecisionService, JEV_GUESS_ACCEPTANCE_THRESHOLD } from '../../shared/decisionService'
import { jevOperationEnabled } from '../../shared/aiExperiment'
import { eligibleNonGuesserIds, getRoundEligiblePlayerIds } from '../../shared/roundEligibility'
import {
  buildClueGroups,
  initialVisibleGroupIndexes,
  computeRoundScores,
  computeTentativePoints,
  selectNextUnlockGroup,
  ATTEMPT_POINTS,
  MAX_ATTEMPTS,
} from './scoring'
import { applyPeerLoveVotes, effectivePeerLoveVotesFromRound } from './peerLove'
import { addFowlWordCooldownWrites } from './cooldowns'
import type { ClueGroup } from './types'

const db = admin.firestore
const SECONDS_PER_CLUE_SUBMISSION = 60
export const WORD_SELECTION_SECONDS = 15
export const WORD_SELECTION_PRIVACY_SECONDS = 4
const WORD_SELECTED_SPOTLIGHT_MS = 2500
const GUESS_CLAIM_LEASE_MS = 10_000

function timestampMillis(timestamp: unknown): number | undefined {
  if (!timestamp || typeof timestamp !== 'object') return undefined
  const value = timestamp as { toMillis?: () => number; seconds?: number }
  if (typeof value.toMillis === 'function') return value.toMillis()
  return typeof value.seconds === 'number' ? value.seconds * 1000 : undefined
}

// Timer decreases with each attempt to keep game paced (shorter time as more clues visible)
function getSecondsForAttempt(attemptNum: number): number {
  if (attemptNum === 1) return 60
  if (attemptNum === 2) return 40
  return 20 // attempt 3+
}

/**
 * Finalize the word-selection vote and transition to a short selected-word spotlight.
 * Safe to call multiple times — uses a transaction to only process once.
 * Called when: timer expires (frontend) OR all non-guessers have voted.
 *
 * All vote tallying and the secretWord write happen inside the transaction so
 * clients never see the selected-word spotlight without the secret word present.
 */
export async function finalizeWordSelection(
  gameId: string,
  roundNum: number,
  options: { allowEarly?: boolean } = {},
): Promise<void> {
  const firestore = db()
  const gameRef = firestore.collection('games').doc(gameId)
  const roundRef = firestore
    .collection('games').doc(gameId)
    .collection('rounds')
    .doc(String(roundNum))

  await firestore.runTransaction(async (tx) => {
    const [gameSnap, snap] = await Promise.all([tx.get(gameRef), tx.get(roundRef)])
    if (!snap.exists) return
    if (!gameSnap.exists) return
    const game = gameSnap.data()!
    const data = snap.data()!
    if (data.status !== 'word-selection') return // already finalized

    const wordOptions: string[] = data.wordOptions ?? []
    const wordVotes: Record<string, number> = data.wordVotes ?? {}
    const eligibleVoterSet = new Set(eligibleNonGuesserIds(data, game))
    const wordSelectionStartsAt = timestampMillis(data.wordSelectionStartsAt)
    const wordSelectionDeadline = timestampMillis(data.wordSelectionDeadline)
    if (wordSelectionStartsAt && Date.now() < wordSelectionStartsAt) return

    const eligibleVoteCount = Object.keys(wordVotes)
      .filter((playerId) => eligibleVoterSet.has(playerId))
      .length
    const allEligibleVoted = eligibleVoterSet.size > 0 && eligibleVoteCount >= eligibleVoterSet.size
    const deadlinePassed = !wordSelectionDeadline || Date.now() >= wordSelectionDeadline
    if (!options.allowEarly && !allEligibleVoted && !deadlinePassed) return

    // Tally votes
    const tally = [0, 0, 0]
    for (const [playerId, idx] of Object.entries(wordVotes)) {
      if (!eligibleVoterSet.has(playerId)) continue
      if (idx >= 0 && idx <= 2) tally[idx]++
    }

    // Pick winner: most votes; tiebreaker: random among tied
    let winnerIdx = 0
    let maxVotes = -1
    for (let i = 0; i < 3; i++) {
      if (tally[i] > maxVotes) { maxVotes = tally[i]; winnerIdx = i }
    }
    if (maxVotes === 0 && wordOptions.length > 0) winnerIdx = Math.floor(Math.random() * wordOptions.length)

    const secretWord = wordOptions[winnerIdx] ?? wordOptions[0] ?? ''
    const wordSelectedDeadline = Timestamp.fromMillis(Date.now() + WORD_SELECTED_SPOTLIGHT_MS)

    tx.update(roundRef, {
      status: 'word-selected',
      secretWord,
      selectedWordIndex: winnerIdx,
      wordSelectedDeadline,
      cluesByPlayer: {},
      clueTimestamps: {},
      clueSubmissionDeadline: FieldValue.delete(),
    })
  })
}

export async function skipWordSelectionPrivacyHandoff(gameId: string, roundNum: number): Promise<void> {
  const firestore = db()
  const roundRef = firestore.collection('games').doc(gameId).collection('rounds').doc(String(roundNum))

  await firestore.runTransaction(async (tx) => {
    const snap = await tx.get(roundRef)
    if (!snap.exists || snap.data()?.status !== 'word-selection') return

    const now = Date.now()
    const wordSelectionStartsAt = timestampMillis(snap.data()?.wordSelectionStartsAt)
    if (wordSelectionStartsAt && now >= wordSelectionStartsAt) return

    tx.update(roundRef, {
      wordSelectionStartsAt: Timestamp.fromMillis(now),
      wordSelectionDeadline: Timestamp.fromMillis(now + WORD_SELECTION_SECONDS * 1000),
    })
  })
}

/**
 * Transition from the selected-word spotlight into clue submission.
 * Safe to call from multiple clients after the spotlight deadline.
 */
export async function beginClueSubmission(gameId: string, roundNum: number): Promise<void> {
  const firestore = db()
  const roundRef = firestore
    .collection('games').doc(gameId)
    .collection('rounds')
    .doc(String(roundNum))

  await firestore.runTransaction(async (tx) => {
    const snap = await tx.get(roundRef)
    if (!snap.exists) return
    const data = snap.data()!
    if (data.status !== 'word-selected') return

    const deadline = data.wordSelectedDeadline?.toMillis?.()
      ?? ((data.wordSelectedDeadline?.seconds ?? 0) * 1000)
    if (deadline && Date.now() < deadline) return

    tx.update(roundRef, {
      status: 'clue-submission',
      clueSubmissionDeadline: Timestamp.fromMillis(Date.now() + SECONDS_PER_CLUE_SUBMISSION * 1000),
    })
  })
}

/**
 * Called after all clues are submitted. Runs deterministic deduplication and transitions
 * the round to 'reveal' status with grouped clues + initial visible groups.
 */
export async function runDeduplication(gameId: string, roundNum: number): Promise<void> {
  const firestore = db()
  const roundRef = firestore
    .collection('games')
    .doc(gameId)
    .collection('rounds')
    .doc(String(roundNum))

  const claimed = await firestore.runTransaction(async (tx) => {
    const snap = await tx.get(roundRef)
    if (!snap.exists) return false
    if (snap.data()?.status !== 'clue-submission') return false
    tx.update(roundRef, { status: 'deduplication' })
    return true
  })
  if (!claimed) return

  const roundSnap = await roundRef.get()
  const roundData = roundSnap.data()!
  const gameSnap = await firestore.collection('games').doc(gameId).get()
  const game = gameSnap.data() ?? {}
  const eligibleClueSet = new Set(getRoundEligiblePlayerIds(roundData, game))
  if (game.currentGuesser) eligibleClueSet.delete(game.currentGuesser)
  const cluesByPlayer = Object.fromEntries(
    Object.entries(roundData.cluesByPlayer ?? {})
      .filter(([playerId]) => eligibleClueSet.has(playerId)),
  ) as Record<string, string>
  const secretWord: string = roundData.secretWord

  console.log('[runDeduplication] Game:', gameId, 'Round:', roundNum, 'Secret word:', secretWord)
  console.log('[runDeduplication] Clues by player:', JSON.stringify(cluesByPlayer))

  const result = await detectDuplicateClues(secretWord, cluesByPlayer)
  console.log('[runDeduplication] detectDuplicateClues returned:', JSON.stringify(result))

  const clueGroups = buildClueGroups(result.groups, cluesByPlayer)
  console.log('[runDeduplication] Built clue groups:', JSON.stringify(clueGroups))

  // Fast-path: no clues submitted — jump straight to scored
  if (clueGroups.length === 0) {
    console.log('[runDeduplication] No clue groups — fast-pathing to scored')
    await roundRef.update({
      status: 'scored',
      clueGroups: [],
      visibleGroupIndexes: [],
      currentAttempt: 1,
      maxAttempts: 1,
      isCorrect: false,
      guesserAnswer: '',
      guessAttempts: [],
      pointsThisRound: {},
      eliminationReason: result.reason,
    })
    return
  }

  const visibleGroupIndexes = initialVisibleGroupIndexes(clueGroups)
  console.log('[runDeduplication] Initial visible group indexes:', visibleGroupIndexes)

  // Guarantee minimum 3 attempts always, but allow more if there are many unique clues
  // (which rewards less duplication). Capped at MAX_ATTEMPTS.
  const maxAttempts = Math.max(3, Math.min(MAX_ATTEMPTS, Math.max(1, clueGroups.length)))
  const currentAttempt = 1
  const guesserId: string = await getGuesserId(gameId)
  const giverCount: number = await getGiverCount(gameId, roundNum)

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

async function commitScoredGuess(
  firestore: FirebaseFirestore.Firestore,
  roundRef: FirebaseFirestore.DocumentReference,
  gameId: string,
  claimId: string,
  guesserId: string,
  guess: string,
  isCorrect: boolean,
  giverCount: number,
): Promise<boolean> {
  return firestore.runTransaction(async (tx) => {
    const latestSnap = await tx.get(roundRef)
    if (!latestSnap.exists) return false
    const latest = latestSnap.data()!
    if (latest.attemptInProgress !== true || latest.guessClaimId !== claimId || latest.status !== 'guess') return false
    const claimExpiresAt = timestampMillis(latest.guessClaimExpiresAt)
    if (claimExpiresAt && Date.now() > claimExpiresAt) return false
    const clueGroups = (latest.clueGroups ?? []) as ClueGroup[]
    const visibleGroupIndexes: number[] = latest.visibleGroupIndexes ?? []
    const currentAttempt: number = latest.currentAttempt ?? 1
    const clueTimestamps = normalizeTimestamps(latest.clueTimestamps ?? {})
    const scores = computeRoundScores(clueGroups, visibleGroupIndexes, guesserId, isCorrect, currentAttempt, clueTimestamps, giverCount)
    if (isCorrect) {
      const loveVotes = effectivePeerLoveVotesFromRound(latest)
      applyPeerLoveVotes(loveVotes, clueGroups, visibleGroupIndexes, scores)
    }
    const playerRefs = Object.entries(scores)
      .filter(([, points]) => points !== 0)
      .map(([playerId]) => firestore.collection('games').doc(gameId).collection('players').doc(playerId))
    await Promise.all(playerRefs.map((playerRef) => tx.get(playerRef)))
    tx.update(roundRef, {
      status: 'scored',
      isCorrect,
      guesserAnswer: guess.trim(),
      pointsThisRound: scores,
      tentativePoints: scores,
      attemptInProgress: false,
      guessClaimId: FieldValue.delete(),
      guessClaimExpiresAt: FieldValue.delete(),
    })
    for (const [playerId, points] of Object.entries(scores)) {
      if (points !== 0) {
        const playerRef = firestore.collection('games').doc(gameId).collection('players').doc(playerId)
        tx.update(playerRef, { score: FieldValue.increment(points) })
      }
    }
    return true
  })
}

async function commitWrongGuessProgress(
  firestore: FirebaseFirestore.Firestore,
  roundRef: FirebaseFirestore.DocumentReference,
  gameId: string,
  claimId: string,
  guesserId: string,
  giverCount: number,
): Promise<boolean> {
  const playerScores = await fetchPlayerScores(gameId)
  return firestore.runTransaction(async (tx) => {
    const latestSnap = await tx.get(roundRef)
    if (!latestSnap.exists) return false
    const latest = latestSnap.data()!
    if (latest.attemptInProgress !== true || latest.guessClaimId !== claimId || latest.status !== 'guess') return false
    const claimExpiresAt = timestampMillis(latest.guessClaimExpiresAt)
    if (claimExpiresAt && Date.now() > claimExpiresAt) return false
    const clueGroups = (latest.clueGroups ?? []) as ClueGroup[]
    const visibleGroupIndexes: number[] = latest.visibleGroupIndexes ?? []
    const currentAttempt: number = latest.currentAttempt ?? 1
    const clueTimestamps = normalizeTimestamps(latest.clueTimestamps ?? {})
    const nextUnlockIdx = selectNextUnlockGroup(clueGroups, visibleGroupIndexes, playerScores, clueTimestamps)
    const newAttempt = currentAttempt + 1
    if (nextUnlockIdx < 0) {
      const newTentative = computeTentativePoints(clueGroups, visibleGroupIndexes, guesserId, newAttempt, clueTimestamps, giverCount)
      tx.update(roundRef, {
        status: 'reveal',
        currentAttempt: newAttempt,
        tentativePoints: newTentative,
        attemptDeadline: Timestamp.fromMillis(Date.now() + getSecondsForAttempt(newAttempt) * 1000),
        attemptInProgress: false,
        guessClaimId: FieldValue.delete(),
        guessClaimExpiresAt: FieldValue.delete(),
        lastUnlockedGroupIndex: FieldValue.delete(),
      })
      return true
    }
    const newVisible = [...visibleGroupIndexes, nextUnlockIdx]
    const newTentative = computeTentativePoints(clueGroups, newVisible, guesserId, newAttempt, clueTimestamps, giverCount)
    tx.update(roundRef, {
      status: 'reveal',
      currentAttempt: newAttempt,
      visibleGroupIndexes: newVisible,
      tentativePoints: newTentative,
      attemptDeadline: Timestamp.fromMillis(Date.now() + getSecondsForAttempt(newAttempt) * 1000),
      attemptInProgress: false,
      guessClaimId: FieldValue.delete(),
      guessClaimExpiresAt: FieldValue.delete(),
      lastUnlockedGroupIndex: nextUnlockIdx,
    })
    return true
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
  const gameRef = firestore.collection('games').doc(gameId)
  const roundRef = firestore
    .collection('games')
    .doc(gameId)
    .collection('rounds')
    .doc(String(roundNum))

  // Atomically claim "guess in progress" to prevent double-submit
  let claimId = ''
  let claimedAttempt = 1
  const claimed = await firestore.runTransaction(async (tx) => {
    const snap = await tx.get(roundRef)
    if (!snap.exists) return false
    const data = snap.data()!
    if (data.status !== 'guess' && data.status !== 'reveal') return false
    if (data.attemptInProgress === true) return false
    claimedAttempt = data.currentAttempt ?? 1
    claimId = createHash('sha256')
      .update(`${gameId}/${roundNum}/guess/${claimedAttempt}/${guess.trim().normalize('NFC').toLocaleLowerCase('en-US')}`)
      .digest('hex')
      .slice(0, 32)
    tx.update(roundRef, {
      attemptInProgress: true,
      status: 'guess',
      guessAttempts: FieldValue.arrayUnion(guess.trim()),
      guessClaimId: claimId,
      guessClaimExpiresAt: Timestamp.fromMillis(Date.now() + GUESS_CLAIM_LEASE_MS),
    })
    return true
  })
  if (!claimed) return

  const gameSnap = await gameRef.get()
  const roundSnap = await roundRef.get()
  if (!gameSnap.exists || !roundSnap.exists) return
  const game = gameSnap.data()!
  const roundData = roundSnap.data()!
  const secretWord: string = roundData.secretWord
  const clueGroups = (roundData.clueGroups ?? []) as ClueGroup[]
  const visibleGroupIndexes: number[] = roundData.visibleGroupIndexes ?? []
  const currentAttempt: number = roundData.currentAttempt ?? 1
  const maxAttempts: number = roundData.maxAttempts ?? 1

  const deterministic = deterministicGuess(secretWord, guess)
  let isCorrect: boolean
  if (deterministic !== null) {
    isCorrect = deterministic
  } else if (game.aiExperiment?.mode === 'jev') {
    try {
      if (!await jevOperationEnabled(guesserId, 'guess')) {
        isCorrect = false
      } else {
        const decision = await new DecisionService().evaluateFowlWordsGuess({ secretWord, guess })
        isCorrect = decision.correct && (decision.metadata.probabilities?.correct ?? 0) >= JEV_GUESS_ACCEPTANCE_THRESHOLD
      }
    } catch (error) {
      console.error('Jev guess evaluation unavailable; rejecting guess', error instanceof Error ? error.message : 'unknown error')
      isCorrect = false
    }
  } else {
    isCorrect = await evaluateGuess(secretWord, guess)
  }
  const clueTimestamps = normalizeTimestamps(roundData.clueTimestamps ?? {})
  const giverCount = await getGiverCount(gameId, roundNum)

  // ── Path 1: Correct ─────────────────────────────────────────────
  if (isCorrect) {
    await commitScoredGuess(firestore, roundRef, gameId, claimId, guesserId, guess, true, giverCount)
    return
  }

  // ── Path 2: Wrong, no attempts left → round over ────────────────
  if (currentAttempt >= maxAttempts) {
    await commitScoredGuess(firestore, roundRef, gameId, claimId, guesserId, guess, false, giverCount)
    return
  }

  // ── Path 3: Wrong, attempts left → unlock next group, retry ─────
  await commitWrongGuessProgress(firestore, roundRef, gameId, claimId, guesserId, giverCount)
}

/**
 * Finishes a guess whose provider claim lease expired. Recovery is deliberately
 * fail-closed: an unresolved guess is treated as wrong and never awards points.
 */
export async function recoverExpiredGuess(gameId: string, roundNum: number): Promise<void> {
  const firestore = db()
  const roundRef = firestore.collection('games').doc(gameId).collection('rounds').doc(String(roundNum))
  const giverCount = await getGiverCount(gameId, roundNum)
  const gameSnap = await firestore.collection('games').doc(gameId).get()
  const guesserId: string = gameSnap.data()?.currentGuesser ?? ''
  await firestore.runTransaction(async (tx) => {
    const snap = await tx.get(roundRef)
    if (!snap.exists) return
    const data = snap.data()!
    const expiresAt = timestampMillis(data.guessClaimExpiresAt)
    if (data.attemptInProgress !== true || data.status !== 'guess' || !expiresAt || Date.now() <= expiresAt) return

    const currentAttempt: number = data.currentAttempt ?? 1
    const maxAttempts: number = data.maxAttempts ?? 1
    const clueGroups = (data.clueGroups ?? []) as ClueGroup[]
    const visibleGroupIndexes: number[] = data.visibleGroupIndexes ?? []
    const clueTimestamps = normalizeTimestamps(data.clueTimestamps ?? {})
    if (currentAttempt >= maxAttempts) {
      const scores = computeRoundScores(clueGroups, visibleGroupIndexes, guesserId, false, currentAttempt, clueTimestamps, giverCount)
      const playerRefs = Object.entries(scores)
        .filter(([, points]) => points !== 0)
        .map(([playerId]) => firestore.collection('games').doc(gameId).collection('players').doc(playerId))
      await Promise.all(playerRefs.map((playerRef) => tx.get(playerRef)))
      tx.update(roundRef, {
        status: 'scored',
        isCorrect: false,
        pointsThisRound: scores,
        tentativePoints: scores,
        attemptInProgress: false,
        guessClaimId: FieldValue.delete(),
        guessClaimExpiresAt: FieldValue.delete(),
      })
      for (const [playerId, points] of Object.entries(scores)) {
        if (points !== 0) tx.update(firestore.collection('games').doc(gameId).collection('players').doc(playerId), { score: FieldValue.increment(points) })
      }
      return
    }

    const nextAttempt = currentAttempt + 1
    tx.update(roundRef, {
      status: 'reveal',
      currentAttempt: nextAttempt,
      attemptDeadline: Timestamp.fromMillis(Date.now() + getSecondsForAttempt(nextAttempt) * 1000),
      attemptInProgress: false,
      guessClaimId: FieldValue.delete(),
      guessClaimExpiresAt: FieldValue.delete(),
    })
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

  const claimed = await firestore.runTransaction(async (tx) => {
    const snap = await tx.get(roundRef)
    if (!snap.exists) return false
    const data = snap.data()!
    if (data.status !== 'reveal' && data.status !== 'guess') return false
    if (data.attemptInProgress === true) return false
    const visibleGroupIndexes: number[] = data.visibleGroupIndexes ?? []
    if (visibleGroupIndexes.length > 0) return false
    tx.update(roundRef, { attemptInProgress: true })
    return true
  })
  if (!claimed) return

  try {
    const roundSnap = await roundRef.get()
    if (!roundSnap.exists) {
      await roundRef.update({ attemptInProgress: false }).catch(() => {})
      return
    }
    const roundData = roundSnap.data()!

    // Only allowed when there are no visible clues
    const visibleGroupIndexes: number[] = roundData.visibleGroupIndexes ?? []
    if (visibleGroupIndexes.length > 0) {
      await roundRef.update({ attemptInProgress: false })
      return
    }

    const clueGroups = (roundData.clueGroups ?? []) as ClueGroup[]
    const currentAttempt: number = roundData.currentAttempt ?? 1
    const maxAttempts: number = roundData.maxAttempts ?? 1
    const guesserId: string = await getGuesserId(gameId)
    const giverCount: number = await getGiverCount(gameId, roundNum)
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
        attemptInProgress: false,
      })
      return
    }

    const newVisible = [nextUnlockIdx]
    const newAttempt = currentAttempt + 1
    const newTentative = computeTentativePoints(clueGroups, newVisible, guesserId, newAttempt, clueTimestamps, giverCount)
    const newDeadline = Timestamp.fromMillis(Date.now() + getSecondsForAttempt(newAttempt) * 1000)

    await roundRef.update({
      status: 'reveal',
      currentAttempt: Math.min(newAttempt, maxAttempts),
      visibleGroupIndexes: newVisible,
      tentativePoints: newTentative,
      attemptDeadline: newDeadline,
      lastUnlockedGroupIndex: nextUnlockIdx,
      attemptInProgress: false,
    })
  } catch (err) {
    await roundRef.update({ attemptInProgress: false }).catch(() => {})
    throw err
  }
}

/**
 * Move to the next round (or end the game).
 */
export async function advanceToNextRound(gameId: string): Promise<void> {
  const firestore = db()
  const gameRef = firestore.collection('games').doc(gameId)
  const claimed = await firestore.runTransaction(async (tx) => {
    const gameSnap = await tx.get(gameRef)
    if (!gameSnap.exists) return false
    const game = gameSnap.data()!
    const currentRound: number = game.currentRound ?? 0
    if (game.status !== 'playing') return false
    if (game.advanceInProgress === currentRound) return false
    const roundRef = gameRef.collection('rounds').doc(String(currentRound))
    const roundSnap = await tx.get(roundRef)
    if (!roundSnap.exists || roundSnap.data()?.status !== 'scored') return false
    tx.update(gameRef, { advanceInProgress: currentRound })
    return true
  })
  if (!claimed) return

  try {
    const gameSnap = await gameRef.get()
    const game = gameSnap.data()!

    const totalRounds: number = game.settings?.totalRounds ?? 10
    const currentRound: number = game.currentRound ?? 0

    if (currentRound >= totalRounds) {
      await gameRef.update({ status: 'finished', advanceInProgress: FieldValue.delete() })
      return
    }

    const cardsRemaining: string[] = [...(game.cardsRemaining ?? [])]

    // Draw 3 words for voting; if fewer than 3 remain, use what we have
    const wordOptions: string[] = []
    for (let i = 0; i < 3 && cardsRemaining.length > 0; i++) {
      wordOptions.push(cardsRemaining.shift()!)
    }

    if (wordOptions.length === 0) {
      await gameRef.update({ status: 'finished', advanceInProgress: FieldValue.delete() })
      return
    }

    const nextRoundNum = currentRound + 1

    // Rotate guesser
    const playerIds: string[] = [...(game.playerIds ?? [])]
    const currentGuesserIdx = playerIds.indexOf(game.currentGuesser)
    const nextGuesserIdx = currentGuesserIdx >= 0
      ? (currentGuesserIdx + 1) % playerIds.length
      : 0
    const nextGuesser = playerIds[nextGuesserIdx]

    const wordSelectionStartsAt = Timestamp.fromMillis(Date.now() + WORD_SELECTION_PRIVACY_SECONDS * 1000)
    const wordSelectionDeadline = Timestamp.fromMillis(
      wordSelectionStartsAt.toMillis() + WORD_SELECTION_SECONDS * 1000,
    )

    const batch = firestore.batch()
    batch.set(gameRef.collection('rounds').doc(String(nextRoundNum)), {
      secretWord: '',           // set after word selection
      wordOptions,
      wordVotes: {},
      wordSelectionStartsAt,
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
      eligiblePlayerIds: playerIds,
      eligiblePlayerCount: playerIds.length,
    })

    batch.update(gameRef, {
      currentRound: nextRoundNum,
      currentGuesser: nextGuesser,
      cardsRemaining,
      advanceInProgress: FieldValue.delete(),
    })
    addFowlWordCooldownWrites(batch, game.originalHostId ?? game.hostId, wordOptions)
    await batch.commit()
  } catch (err) {
    await gameRef.update({ advanceInProgress: FieldValue.delete() }).catch(() => {})
    throw err
  }
}

// ── helpers ────────────────────────────────────────────────────────

async function getGuesserId(gameId: string): Promise<string> {
  const firestore = db()
  const gameSnap = await firestore.collection('games').doc(gameId).get()
  return (gameSnap.data()?.currentGuesser as string) ?? ''
}

async function getGiverCount(gameId: string, roundNum: number): Promise<number> {
  const firestore = db()
  const gameRef = firestore.collection('games').doc(gameId)
  const [gameSnap, roundSnap] = await Promise.all([
    gameRef.get(),
    gameRef.collection('rounds').doc(String(roundNum)).get(),
  ])
  const game = gameSnap.data() ?? {}
  const round = roundSnap.data() ?? {}
  return Math.max(0, getRoundEligiblePlayerIds(round, game).length - 1)
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
