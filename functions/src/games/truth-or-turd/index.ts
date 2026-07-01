import { onCall, HttpsError } from 'firebase-functions/v2/https'
import * as admin from 'firebase-admin'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { claimRoomCode, releaseRoomCode } from '../../shared/roomCodes'
import { getRoundEligiblePlayerIds, isRoundEligible } from '../../shared/roundEligibility'
import {
  drawTruthOrTurdQuestion,
  findTruthOrTurdQuestion,
  selectTruthOrTurdQuestions,
  TruthOrTurdAnswer,
  TruthOrTurdChoice,
  TruthOrTurdQuestion,
} from './deck'
import { scoreTruthOrTurdRound } from './scoring'
import questions from './data/questions.json'

const db = admin.firestore()
const TOTAL_ROUNDS = 15
const SECONDS_PER_ROUND = 30

function loadQuestionBank(includePatrioticQuestions: boolean): TruthOrTurdQuestion[] {
  return selectTruthOrTurdQuestions(questions as TruthOrTurdQuestion[], includePatrioticQuestions)
}

function isSubmittedAnswer(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 64
}

function isBinaryAnswer(value: unknown): value is TruthOrTurdAnswer {
  return value === 'truth' || value === 'turd'
}

function shuffledChoices(choices: TruthOrTurdChoice[]): TruthOrTurdChoice[] {
  const shuffled = choices.map((choice) => ({ ...choice }))
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

function visibleRoundData(question: NonNullable<Awaited<ReturnType<typeof drawQuestionForGame>>>) {
  if (question.kind === 'multiple-choice') {
    return {
      kind: question.kind,
      prompt: question.prompt,
      choices: shuffledChoices(question.choices),
      tags: question.tags,
      questionKey: question.questionKey,
    }
  }
  return {
    kind: 'binary',
    statement: question.statement,
    tags: question.tags,
    questionKey: question.questionKey,
  }
}

function secretRoundData(question: NonNullable<Awaited<ReturnType<typeof drawQuestionForGame>>>) {
  if (question.kind === 'multiple-choice') {
    const correctChoiceText = question.choices.find((choice) => choice.id === question.correctChoiceId)?.text ?? ''
    return {
      kind: question.kind,
      correctChoiceId: question.correctChoiceId,
      correctChoiceText,
      explanation: question.explanation,
      sourceRefs: question.sourceRefs,
    }
  }
  return {
    kind: 'binary',
    correctAnswer: question.answer,
    explanation: question.explanation,
    sourceRefs: question.sourceRefs ?? [],
  }
}

function validAnswerForRound(round: FirebaseFirestore.DocumentData, answer: string) {
  if ((round.kind ?? 'binary') === 'multiple-choice') {
    return (round.choices ?? []).some((choice: { id?: unknown }) => choice.id === answer)
  }
  return isBinaryAnswer(answer)
}

async function drawQuestionForGame(game: FirebaseFirestore.DocumentData) {
  const questionBank = loadQuestionBank(game.includePatrioticQuestions ?? false)
  return drawTruthOrTurdQuestion(questionBank, game.usedTruthOrTurdQuestionKeys ?? [])
}

async function createRound(
  gameRef: FirebaseFirestore.DocumentReference,
  game: FirebaseFirestore.DocumentData,
  roundNum: number,
  question: NonNullable<Awaited<ReturnType<typeof drawQuestionForGame>>>,
) {
  const deadline = Timestamp.fromMillis(Date.now() + (game.settings?.secondsPerRound ?? SECONDS_PER_ROUND) * 1000)
  const eligiblePlayerIds = [...(game.playerIds ?? [])]

  const roundRef = gameRef.collection('rounds').doc(String(roundNum))
  const batch = db.batch()

  batch.set(roundRef, {
    ...visibleRoundData(question),
    status: 'answering',
    deadline,
    answerCount: 0,
    answeredPlayerIds: [],
    eligiblePlayerIds,
    eligiblePlayerCount: eligiblePlayerIds.length,
    results: {},
    pointsThisRound: {},
    playerAnswers: {},
  })

  batch.set(roundRef.collection('secrets').doc('answer'), secretRoundData(question))
  batch.update(gameRef, {
    currentRound: roundNum,
    usedTruthOrTurdQuestionKeys: FieldValue.arrayUnion(question.questionKey),
  })
  await batch.commit()
}

// -- CREATE GAME (Truth or Turd) --
export const truthOrTurdCreateGame = onCall(async (request) => {
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

  const gameRef = db.collection('games').doc()
  const gameId = gameRef.id

  let code: string
  try {
    code = await claimRoomCode(gameId, 'truth-or-turd')
  } catch {
    throw new HttpsError('internal', 'Could not generate room code')
  }

  await gameRef.set({
    code,
    gameType: 'truth-or-turd',
    hostId: uid,
    originalHostId: uid,
    status: 'lobby',
    currentRound: 0,
    playerIds: [uid],
    settings: { totalRounds: TOTAL_ROUNDS, secondsPerRound: SECONDS_PER_ROUND, autoAdvanceSeconds: 10 },
    includePatrioticQuestions,
    usedTruthOrTurdQuestionKeys: [],
  })

  await gameRef.collection('players').doc(uid).set({
    name: playerName.trim(),
    score: 0,
    connected: true,
  })

  return { gameId, code }
})

// -- REMATCH (Truth or Turd) --
export const truthOrTurdRematch = onCall(async (request) => {
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
    newCode = await claimRoomCode(newGameId, 'truth-or-turd')
  } catch {
    throw new HttpsError('internal', 'Could not generate room code')
  }

  await releaseRoomCode(game.code)

  await newGameRef.set({
    code: newCode,
    gameType: 'truth-or-turd',
    hostId: uid,
    originalHostId: game.originalHostId ?? uid,
    status: 'lobby',
    currentRound: 0,
    playerIds: game.playerIds ?? [],
    settings: { ...(game.settings ?? {}), totalRounds: TOTAL_ROUNDS, secondsPerRound: SECONDS_PER_ROUND },
    includePatrioticQuestions: game.includePatrioticQuestions ?? false,
    usedTruthOrTurdQuestionKeys: [],
  })

  const batch = db.batch()
  playersSnap.docs.forEach((playerDoc) => {
    batch.set(newGameRef.collection('players').doc(playerDoc.id), {
      name: playerDoc.data().name,
      score: 0,
      connected: false,
    })
  })
  await batch.commit()

  await gameRef.update({ rematchCode: newCode })
  return { code: newCode }
})

// -- START GAME --
export const truthOrTurdStartGame = onCall(async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Must be signed in')

  const { gameId } = request.data as { gameId: string }
  const gameRef = db.collection('games').doc(gameId)
  const gameSnap = await gameRef.get()

  if (!gameSnap.exists) throw new HttpsError('not-found', 'Game not found')
  const game = gameSnap.data()!
  if (game.hostId !== uid) throw new HttpsError('permission-denied', 'Only host can start')
  if (game.status !== 'lobby') throw new HttpsError('failed-precondition', 'Game already started')
  if ((game.playerIds ?? []).length < 1) throw new HttpsError('failed-precondition', 'Need at least 1 player')

  const question = await drawQuestionForGame(game)
  if (!question) throw new HttpsError('internal', 'No questions available')

  await gameRef.update({ status: 'playing' })
  await createRound(gameRef, game, 1, question)
})

// -- SUBMIT ANSWER --
export const truthOrTurdSubmitAnswer = onCall(async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Must be signed in')

  const { gameId, roundNum, answer } = request.data as { gameId: string; roundNum: number; answer: unknown }
  if (!isSubmittedAnswer(answer)) throw new HttpsError('invalid-argument', 'Answer required')

  const gameRef = db.collection('games').doc(gameId)
  const roundRef = gameRef.collection('rounds').doc(String(roundNum))
  const [gameSnap, roundSnap] = await Promise.all([gameRef.get(), roundRef.get()])
  if (!gameSnap.exists) throw new HttpsError('not-found', 'Game not found')
  if (!roundSnap.exists) throw new HttpsError('not-found', 'Round not found')

  const game = gameSnap.data()!
  const round = roundSnap.data()!
  if (game.gameType !== 'truth-or-turd') throw new HttpsError('failed-precondition', 'Wrong game type')
  if (round.status !== 'answering') throw new HttpsError('failed-precondition', 'Round not accepting answers')
  if (!isRoundEligible(round, game, uid)) throw new HttpsError('permission-denied', 'You will join next round')
  if (!validAnswerForRound(round, answer)) throw new HttpsError('invalid-argument', 'Invalid answer choice')

  const deadline = round.deadline?.toDate()
  if (deadline && Date.now() > deadline.getTime()) {
    throw new HttpsError('deadline-exceeded', 'Time is up')
  }

  const answerRef = roundRef.collection('answers').doc(uid)
  try {
    await answerRef.create({
      answer,
      submittedAt: FieldValue.serverTimestamp(),
    })
  } catch (err: unknown) {
    const code = typeof err === 'object' && err !== null && 'code' in err
      ? (err as { code?: unknown }).code
      : undefined
    if (code !== 6 && code !== 'already-exists') throw err
  }

  const answerState = await syncRoundAnswerState(roundRef, getRoundEligiblePlayerIds(round, game))
  if (answerState.count >= answerState.eligibleCount) {
    await triggerReveal(gameId, roundNum)
  }
})

// -- FORCE REVEAL --
export const truthOrTurdForceReveal = onCall(async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Must be signed in')

  const { gameId } = request.data as { gameId: string }
  const gameRef = db.collection('games').doc(gameId)
  const gameSnap = await gameRef.get()
  if (!gameSnap.exists) throw new HttpsError('not-found', 'Game not found')
  const game = gameSnap.data()!
  if (game.hostId !== uid) throw new HttpsError('permission-denied', 'Only host can reveal')

  const roundNum = game.currentRound
  const roundRef = gameRef.collection('rounds').doc(String(roundNum))
  const roundSnap = await roundRef.get()
  if (!roundSnap.exists || roundSnap.data()?.status !== 'answering') return

  const round = roundSnap.data()!
  const answerCount = round.answerCount ?? 0
  const deadline = round.deadline?.toDate()
  const deadlinePassed = !!deadline && Date.now() > deadline.getTime()
  if (answerCount <= 0 && !deadlinePassed) {
    throw new HttpsError('failed-precondition', 'Wait for at least one answer or the timer')
  }

  await triggerReveal(gameId, roundNum)
})

// -- ADVANCE ROUND --
export const truthOrTurdAdvanceRound = onCall(async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Must be signed in')

  const { gameId } = request.data as { gameId: string }
  const gameSnap = await db.collection('games').doc(gameId).get()
  if (!gameSnap.exists) throw new HttpsError('not-found', 'Game not found')
  if (gameSnap.data()!.hostId !== uid) throw new HttpsError('permission-denied', 'Only host can advance')

  await doAdvanceRound(gameId)
})

// -- ABANDON GAME --
export const truthOrTurdAbandonGame = onCall(async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Must be signed in')

  const { gameId } = request.data as { gameId: string }
  const gameRef = db.collection('games').doc(gameId)
  const gameSnap = await gameRef.get()
  if (!gameSnap.exists) throw new HttpsError('not-found', 'Game not found')
  const game = gameSnap.data()!
  if (game.hostId !== uid) throw new HttpsError('permission-denied', 'Only host can end the game')

  await gameRef.update({ status: 'abandoned' })
  try { await releaseRoomCode(game.code) } catch { /* best effort */ }
})

async function syncRoundAnswerState(
  roundRef: FirebaseFirestore.DocumentReference,
  eligiblePlayerIds: string[],
) {
  const answersSnap = await roundRef.collection('answers').get()
  const eligibleSet = new Set(eligiblePlayerIds)
  const answeredPlayerIds = answersSnap.docs.map((doc) => doc.id).filter((id) => eligibleSet.has(id))
  await roundRef.update({
    answerCount: answeredPlayerIds.length,
    answeredPlayerIds,
  })
  return {
    count: answeredPlayerIds.length,
    eligibleCount: eligiblePlayerIds.length,
  }
}

async function triggerReveal(gameId: string, roundNum: number) {
  const gameRef = db.collection('games').doc(gameId)
  const roundRef = gameRef.collection('rounds').doc(String(roundNum))
  const secretRef = roundRef.collection('secrets').doc('answer')

  const claimed = await db.runTransaction(async (tx) => {
    const roundSnap = await tx.get(roundRef)
    if (roundSnap.data()?.status !== 'answering') return false
    tx.update(roundRef, { status: 'revealing' })
    return true
  })
  if (!claimed) return

  const [gameSnap, roundSnap, secretSnap] = await Promise.all([gameRef.get(), roundRef.get(), secretRef.get()])
  if (!gameSnap.exists || !roundSnap.exists) throw new HttpsError('not-found', 'Game or round not found')
  const game = gameSnap.data()!
  const round = roundSnap.data()!
  const questionKey = round.questionKey as string | undefined
  if (!questionKey) throw new HttpsError('internal', 'Round is missing question key')

  let secret = secretSnap.exists ? secretSnap.data()! : null
  if (!secret) {
    const bank = loadQuestionBank(game.includePatrioticQuestions ?? false)
    const question = findTruthOrTurdQuestion(bank, questionKey)
    if (!question) throw new HttpsError('internal', 'Question not found')
    secret = secretRoundData(question)
  }

  const kind = (secret.kind ?? round.kind ?? 'binary') as 'binary' | 'multiple-choice'
  const correctAnswer = kind === 'multiple-choice'
    ? secret.correctChoiceId as string | undefined
    : secret.correctAnswer as string | undefined
  if (!correctAnswer) throw new HttpsError('internal', 'Round is missing correct answer')

  const eligiblePlayerIds = getRoundEligiblePlayerIds(round, game)
  const eligibleSet = new Set(eligiblePlayerIds)
  const answersSnap = await roundRef.collection('answers').get()
  const playerAnswers: Record<string, string> = {}
  answersSnap.docs.forEach((doc) => {
    if (!eligibleSet.has(doc.id)) return
    const answer = doc.data().answer
    if (isSubmittedAnswer(answer) && validAnswerForRound(round, answer)) playerAnswers[doc.id] = answer
  })

  const scoring = scoreTruthOrTurdRound(playerAnswers, correctAnswer, eligiblePlayerIds)
  const answeredPlayerIds = Object.keys(playerAnswers)

  const revealData = kind === 'multiple-choice'
    ? {
        correctChoiceId: correctAnswer,
        correctChoiceText: secret.correctChoiceText ?? '',
      }
    : {
        correctAnswer: correctAnswer as TruthOrTurdAnswer,
      }

  await roundRef.update({
    status: 'revealed',
    answerCount: answeredPlayerIds.length,
    answeredPlayerIds,
    ...revealData,
    explanation: secret.explanation ?? '',
    sourceRefs: secret.sourceRefs ?? [],
    results: scoring.results,
    pointsThisRound: scoring.pointsThisRound,
    playerAnswers,
  })

  const batch = db.batch()
  for (const [playerId, points] of Object.entries(scoring.pointsThisRound)) {
    if (points !== 0) {
      batch.update(gameRef.collection('players').doc(playerId), { score: FieldValue.increment(points) })
    }
  }
  await batch.commit()
}

async function doAdvanceRound(gameId: string) {
  const gameRef = db.collection('games').doc(gameId)
  const claimed = await db.runTransaction(async (tx) => {
    const gameSnap = await tx.get(gameRef)
    if (!gameSnap.exists) return false
    const game = gameSnap.data()!
    const currentRound = game.currentRound ?? 0
    if (game.status !== 'playing') return false
    if (game.advanceInProgress === currentRound) return false
    const roundRef = gameRef.collection('rounds').doc(String(currentRound))
    const roundSnap = await tx.get(roundRef)
    if (!roundSnap.exists || roundSnap.data()?.status !== 'revealed') return false
    tx.update(gameRef, { advanceInProgress: currentRound })
    return true
  })
  if (!claimed) return

  try {
    const gameSnap = await gameRef.get()
    if (!gameSnap.exists) return
    const game = gameSnap.data()!
    const nextRound = (game.currentRound ?? 0) + 1

    if (nextRound > (game.settings?.totalRounds ?? TOTAL_ROUNDS)) {
      await gameRef.update({ status: 'finished', advanceInProgress: FieldValue.delete() })
      return
    }

    const question = await drawQuestionForGame(game)
    if (!question) {
      await gameRef.update({ status: 'finished', advanceInProgress: FieldValue.delete() })
      return
    }

    await createRound(gameRef, game, nextRound, question)
    await gameRef.update({ advanceInProgress: FieldValue.delete() })
  } catch (err) {
    await gameRef.update({ advanceInProgress: FieldValue.delete() }).catch(() => {})
    throw err
  }
}
