import { onCall, HttpsError } from 'firebase-functions/v2/https'
import * as admin from 'firebase-admin'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { scoreRoundAnswers, ScoringResult } from './scoring'
import { groupAnswersWithGemini, generateQuestionsFromCategories, GeminiGroupResult } from '../../shared/gemini'
import { drawQuestion, seedQuestionPool, questionKey } from './questions'
import { claimRoomCode, releaseRoomCode } from '../../shared/roomCodes'
import { normalizeAnswer, fallbackGrouping, validateGeminiGroups } from '../../shared/normalizeAnswer'
import { getRoundEligiblePlayerIds, isRoundEligible } from '../../shared/roundEligibility'

const db = admin.firestore()
const TOTAL_ROUNDS = 10

function shouldDrawPatrioticQuestion(roundNum: number, includePatrioticQuestions: boolean): boolean {
  return includePatrioticQuestions && roundNum % 2 === 1
}

// -- CREATE GAME (Flock Together) --
export const flockCreateGame = onCall(async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Must be signed in')

  const { playerName } = request.data as { playerName: string }
  if (!playerName?.trim()) throw new HttpsError('invalid-argument', 'Name required')

  const gameRef = db.collection('games').doc()
  const gameId = gameRef.id

  let code: string
  try {
    code = await claimRoomCode(gameId, 'flock-together')
  } catch {
    throw new HttpsError('internal', 'Could not generate room code')
  }

  await gameRef.set({
    code,
    gameType: 'flock-together',
    hostId: uid,
    originalHostId: uid,
    status: 'lobby',
    currentRound: 0,
    categories: [],
    playerIds: [uid],
    settings: { totalRounds: TOTAL_ROUNDS, secondsPerRound: 45, autoAdvanceSeconds: 10 },
    includePatrioticQuestions: false,
  })

  await gameRef.collection('players').doc(uid).set({
    name: playerName.trim(),
    score: 0,
    connected: true,
  })

  return { gameId, code }
})

// -- REMATCH (Flock Together) --
export const flockRematch = onCall(async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Must be signed in')

  const { gameId } = request.data as { gameId: string }
  const gameRef = db.collection('games').doc(gameId)
  const gameSnap = await gameRef.get()

  if (!gameSnap.exists) throw new HttpsError('not-found', 'Game not found')
  const game = gameSnap.data()!
  if (game.hostId !== uid) throw new HttpsError('permission-denied', 'Only host can start a rematch')
  if (game.status !== 'finished') throw new HttpsError('failed-precondition', 'Game is not finished')

  // Get all players from the finished game
  const playersSnap = await gameRef.collection('players').get()

  const newGameRef = db.collection('games').doc()
  const newGameId = newGameRef.id

  let newCode: string
  try {
    newCode = await claimRoomCode(newGameId, 'flock-together')
  } catch {
    throw new HttpsError('internal', 'Could not generate room code')
  }

  // Deactivate the old room code so it can't be joined again
  await releaseRoomCode(game.code)

  // Create the new game carrying over Flock-specific settings
  await newGameRef.set({
    code: newCode,
    gameType: 'flock-together',
    hostId: uid,
    originalHostId: uid,
    status: 'lobby',
    currentRound: 0,
    categories: game.categories ?? [],
    playerIds: game.playerIds,
    settings: { ...(game.settings ?? {}), totalRounds: TOTAL_ROUNDS },
    includePatrioticQuestions: game.includePatrioticQuestions ?? false,
  })

  // Copy all players into the new game with reset scores
  const batch = db.batch()
  playersSnap.docs.forEach((playerDoc) => {
    batch.set(newGameRef.collection('players').doc(playerDoc.id), {
      name: playerDoc.data().name,
      score: 0,
      connected: false,
    })
  })
  await batch.commit()

  // Signal all clients — everyone subscribed to the game doc auto-redirects
  await gameRef.update({ rematchCode: newCode })

  return { code: newCode }
})

// -- START GAME --
export const flockStartGame = onCall(async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Must be signed in')

  const { gameId } = request.data as { gameId: string }
  const gameRef = db.collection('games').doc(gameId)
  const gameSnap = await gameRef.get()

  if (!gameSnap.exists) throw new HttpsError('not-found', 'Game not found')
  const game = gameSnap.data()!
  if (game.hostId !== uid) throw new HttpsError('permission-denied', 'Only host can start')
  if (game.status !== 'lobby') throw new HttpsError('failed-precondition', 'Game already started')

  // Seed the question pool with the current patriotic setting
  await seedQuestionPool(gameId, game.includePatrioticQuestions ?? false)

  if (game.categories?.length > 0) {
    try {
      const aiQuestions = await generateQuestionsFromCategories(game.categories)
      for (const q of aiQuestions) {
        const type = q.type === 'multiple_choice' ? 'multiple_choice' : 'open'
        await gameRef.collection('questionPool').add({
          text: q.text,
          source: 'ai-generated',
          tag: null,
          type,
          options: type === 'multiple_choice' ? q.options ?? null : null,
          used: false,
          submittedBy: null,
          category: q.category,
          questionKey: questionKey(q.text),
        })
      }
    } catch (err) {
      console.error('AI question generation failed, continuing with preset bank:', err)
    }
  }

  const question = await drawQuestion(
    gameId,
    [],
    shouldDrawPatrioticQuestion(1, game.includePatrioticQuestions ?? false),
  )
  if (!question) throw new HttpsError('internal', 'No questions available in pool')

  const deadline = new Date(Date.now() + game.settings.secondsPerRound * 1000)

  const eligiblePlayerIds = [...game.playerIds]

  await gameRef.collection('rounds').doc('1').set({
    question: question.text,
    source: question.source,
    tag: question.tag ?? null,
    submittedBy: question.submittedBy ?? null,
    questionPoolId: question.poolDocId,
    type: question.type,
    options: question.options,
    status: 'answering',
    deadline: Timestamp.fromDate(deadline),
    answerCount: 0,
    answeredPlayerIds: [],
    answerGroups: [],
    flockAnswer: [],
    results: {},
    pointsThisRound: {},
    eligiblePlayerIds,
    eligiblePlayerCount: eligiblePlayerIds.length,
  })

  await gameRef.update({ status: 'playing', currentRound: 1 })
})

// -- SUBMIT ANSWER --
export const submitAnswer = onCall(async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Must be signed in')

  const { gameId, roundNum, answer } = request.data as { gameId: string; roundNum: number; answer: string }
  if (!answer?.trim()) throw new HttpsError('invalid-argument', 'Answer required')

  const gameRef = db.collection('games').doc(gameId)
  const roundRef = gameRef.collection('rounds').doc(String(roundNum))
  const [gameSnap, roundSnap] = await Promise.all([gameRef.get(), roundRef.get()])
  if (!roundSnap.exists) throw new HttpsError('not-found', 'Round not found')
  if (!gameSnap.exists) throw new HttpsError('not-found', 'Game not found')
  const game = gameSnap.data()!
  const roundData = roundSnap.data()!
  if (roundData.status !== 'answering') throw new HttpsError('failed-precondition', 'Round not accepting answers')
  if (!isRoundEligible(roundData, game, uid)) throw new HttpsError('permission-denied', 'You will join next round')

  const deadline = roundData.deadline?.toDate()
  if (deadline && Date.now() > deadline.getTime()) {
    throw new HttpsError('deadline-exceeded', 'Time is up')
  }

  const trimmed = answer.trim()

  // Multiple-choice rounds only accept answers that exactly match one of the server-side options.
  if (roundData.type === 'multiple_choice') {
    const validOptions: string[] = Array.isArray(roundData.options) ? roundData.options : []
    if (!validOptions.includes(trimmed)) {
      throw new HttpsError('invalid-argument', 'Answer must match one of the provided options')
    }
  }

  const answerRef = roundRef.collection('answers').doc(uid)
  try {
    await answerRef.create({
      text: trimmed,
      submittedAt: FieldValue.serverTimestamp(),
    })
  } catch (err: unknown) {
    const code = typeof err === 'object' && err !== null && 'code' in err
      ? (err as { code?: unknown }).code
      : undefined
    if (code !== 6 && code !== 'already-exists') throw err
  }

  const eligiblePlayerIds = getRoundEligiblePlayerIds(roundData, game)
  const answerState = await syncRoundAnswerState(roundRef, eligiblePlayerIds)
  const playerCount = eligiblePlayerIds.length

  if (answerState.count >= playerCount) {
    await triggerScoring(gameId, roundNum)
  }
})

// -- SKIP QUESTION --
export const skipQuestion = onCall(async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Must be signed in')

  const { gameId } = request.data as { gameId: string }
  const gameRef = db.collection('games').doc(gameId)
  const gameSnap = await gameRef.get()
  const game = gameSnap.data()!

  if (game.hostId !== uid) throw new HttpsError('permission-denied', 'Only host can skip')

  const roundNum = game.currentRound
  const roundRef = gameRef.collection('rounds').doc(String(roundNum))
  const roundSnap = await roundRef.get()
  if (!roundSnap.exists) throw new HttpsError('not-found', 'Round not found')
  if (roundSnap.data()!.status !== 'answering') {
    throw new HttpsError('failed-precondition', 'Can only skip during the answering phase')
  }

  const recentTags: string[] = []
  for (let r = Math.max(1, roundNum - 4); r <= roundNum; r++) {
    const roundDoc = await gameRef.collection('rounds').doc(String(r)).get()
    const tag = roundDoc.data()?.tag
    if (tag) recentTags.push(tag)
  }

  const answersSnap = await roundRef.collection('answers').get()
  const delBatch = db.batch()
  answersSnap.docs.forEach((doc) => delBatch.delete(doc.ref))
  await delBatch.commit()

  // Skipped questions are intentionally left as "used" — they count against the 48hr cooldown
  const newQuestion = await drawQuestion(
    gameId,
    recentTags,
    shouldDrawPatrioticQuestion(roundNum, game.includePatrioticQuestions ?? false),
  )
  if (!newQuestion) throw new HttpsError('internal', 'No more questions available')

  const deadline = new Date(Date.now() + game.settings.secondsPerRound * 1000)

  await roundRef.update({
    question: newQuestion.text,
    source: newQuestion.source,
    tag: newQuestion.tag ?? null,
    submittedBy: newQuestion.submittedBy ?? null,
    questionPoolId: newQuestion.poolDocId,
    type: newQuestion.type,
    options: newQuestion.options,
    status: 'answering',
    deadline: Timestamp.fromDate(deadline),
    answerCount: 0,
    answeredPlayerIds: [],
    answerGroups: [],
    flockAnswer: [],
    results: {},
    pointsThisRound: {},
    playerAnswers: {},
    commentary: FieldValue.delete(),
  })
})

// -- UPDATE CATEGORIES (host-only) --
export const updateCategories = onCall(async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Must be signed in')

  const { gameId, categories } = request.data as { gameId: string; categories: string[] }
  if (!Array.isArray(categories)) throw new HttpsError('invalid-argument', 'Categories must be an array')
  if (categories.length > 10) throw new HttpsError('invalid-argument', 'Max 10 categories')

  const gameRef = db.collection('games').doc(gameId)
  const gameSnap = await gameRef.get()

  if (!gameSnap.exists) throw new HttpsError('not-found', 'Game not found')
  if (gameSnap.data()!.hostId !== uid) throw new HttpsError('permission-denied', 'Only host can update categories')
  if (gameSnap.data()!.status !== 'lobby') throw new HttpsError('failed-precondition', 'Game already started')

  await gameRef.update({ categories })
})

// -- SET PATRIOTIC MODE --
export const setPatrioticMode = onCall(async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Must be signed in')

  const { gameId, enabled } = request.data as { gameId: string; enabled: boolean }
  if (typeof enabled !== 'boolean') throw new HttpsError('invalid-argument', 'Enabled must be a boolean')

  const gameRef = db.collection('games').doc(gameId)
  const gameSnap = await gameRef.get()

  if (!gameSnap.exists) throw new HttpsError('not-found', 'Game not found')
  if (gameSnap.data()!.hostId !== uid) throw new HttpsError('permission-denied', 'Only host can set patriotic mode')
  if (gameSnap.data()!.status !== 'lobby') throw new HttpsError('failed-precondition', 'Game already started')

  await gameRef.update({ includePatrioticQuestions: enabled })
})

// -- RESET QUESTION COOLDOWNS --
export const resetQuestionCooldowns = onCall(async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Must be signed in')

  const { gameId } = request.data as { gameId: string }
  const gameRef = db.collection('games').doc(gameId)
  const gameSnap = await gameRef.get()

  if (!gameSnap.exists) throw new HttpsError('not-found', 'Game not found')
  if (gameSnap.data()!.hostId !== uid) throw new HttpsError('permission-denied', 'Only host can reset cooldowns')

  // Nuke all global Flock cooldowns
  const cooldownSnap = await db.collection('flockQuestionCooldowns').get()
  const batch = db.batch()
  cooldownSnap.docs.forEach((doc) => batch.delete(doc.ref))
  await batch.commit()

  // Reset the used flag on this game's pool so questions are immediately drawable again
  const poolSnap = await gameRef.collection('questionPool').get()
  const resetBatch = db.batch()
  poolSnap.docs.forEach((doc) => resetBatch.update(doc.ref, { used: false }))
  await resetBatch.commit()
})

// -- SUBMIT CUSTOM QUESTION --
export const submitCustomQuestion = onCall(async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Must be signed in')

  const { gameId, text } = request.data as { gameId: string; text: string }
  if (!text?.trim()) throw new HttpsError('invalid-argument', 'Question text required')
  if (text.length > 200) throw new HttpsError('invalid-argument', 'Question too long')

  const gameRef = db.collection('games').doc(gameId)
  const gameSnap = await gameRef.get()

  if (!gameSnap.exists) throw new HttpsError('not-found', 'Game not found')
  if (gameSnap.data()!.status !== 'lobby') throw new HttpsError('failed-precondition', 'Game already started')
  if (!gameSnap.data()!.playerIds.includes(uid)) throw new HttpsError('permission-denied', 'Not in this game')

  await gameRef.collection('questionPool').add({
    text: text.trim(),
    source: 'custom',
    tag: null,
    type: 'open',
    options: null,
    used: false,
    submittedBy: uid,
    category: null,
  })
})

// -- ADVANCE ROUND (callable by host) --
export const flockAdvanceRound = onCall(async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Must be signed in')

  const { gameId } = request.data as { gameId: string }
  const gameSnap = await db.collection('games').doc(gameId).get()
  if (!gameSnap.exists) throw new HttpsError('not-found', 'Game not found')
  if (gameSnap.data()!.hostId !== uid) throw new HttpsError('permission-denied', 'Only host can advance')

  await doAdvanceRound(gameId)
})

// -- FORCE END ROUND (when timer expires) --
export const forceEndRound = onCall(async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Must be signed in')

  const { gameId } = request.data as { gameId: string }
  const gameSnap = await db.collection('games').doc(gameId).get()
  if (!gameSnap.exists) throw new HttpsError('not-found', 'Game not found')
  if (gameSnap.data()!.hostId !== uid) throw new HttpsError('permission-denied', 'Only host can end round')

  const roundNum = gameSnap.data()!.currentRound
  const roundRef = db.collection('games').doc(gameId).collection('rounds').doc(String(roundNum))
  const roundSnap = await roundRef.get()

  if (!roundSnap.exists || roundSnap.data()!.status !== 'answering') return

  await triggerScoring(gameId, roundNum)
})

// -- INTERNAL HELPERS --

async function syncRoundAnswerState(roundRef: FirebaseFirestore.DocumentReference, eligiblePlayerIds?: string[]) {
  const answersSnap = await roundRef.collection('answers').get()
  const eligibleSet = eligiblePlayerIds ? new Set(eligiblePlayerIds) : null
  const answeredPlayerIds = answersSnap.docs
    .map((doc) => doc.id)
    .filter((id) => !eligibleSet || eligibleSet.has(id))
  await roundRef.update({
    answerCount: answeredPlayerIds.length,
    answeredPlayerIds,
  })
  return { count: answeredPlayerIds.length, answeredPlayerIds }
}

async function triggerScoring(gameId: string, roundNum: number) {
  const roundRef = db.collection('games').doc(gameId).collection('rounds').doc(String(roundNum))

  const claimed = await db.runTransaction(async (tx) => {
    const snap = await tx.get(roundRef)
    if (snap.data()?.status !== 'answering') return false
    tx.update(roundRef, { status: 'revealing' })
    return true
  })
  if (!claimed) return

  const roundSnap = await roundRef.get()
  const roundData = roundSnap.data()!
  const questionText = roundData.question
  const roundType: 'open' | 'multiple_choice' = roundData.type === 'multiple_choice' ? 'multiple_choice' : 'open'
  const gameSnap = await db.collection('games').doc(gameId).get()
  const game = gameSnap.data()!
  const eligiblePlayerIds = getRoundEligiblePlayerIds(roundData, game)
  const eligibleSet = new Set(eligiblePlayerIds)

  const answersSnap = await roundRef.collection('answers').get()
  const rawAnswers: Record<string, string> = {}
  const normalizedAnswers: Record<string, string> = {}
  answersSnap.docs.forEach((d) => {
    if (!eligibleSet.has(d.id)) return
    rawAnswers[d.id] = d.data().text
    normalizedAnswers[d.id] = normalizeAnswer(d.data().text)
  })

  const normalizedValues = Object.values(normalizedAnswers)
  const uniqueNormalized = [...new Set(normalizedValues)]
  let groups: string[][]
  let commentary = ''
  let groupSource = 'fallback'

  if (roundType === 'multiple_choice') {
    groups = fallbackGrouping(uniqueNormalized)
    groupSource = 'multiple-choice'
  } else {
    const quickGroups = fallbackGrouping(uniqueNormalized)
    if (quickGroups.length <= 1) {
      groups = quickGroups
      groupSource = 'normalization-match'
    } else {
      try {
        const geminiResult: GeminiGroupResult = await groupAnswersWithGemini(questionText, uniqueNormalized)
        groups = validateGeminiGroups(geminiResult.groups, uniqueNormalized)
        commentary = geminiResult.commentary
        groupSource = 'gemini'
      } catch (err) {
        console.error('Gemini failed, using fallback:', err)
        groups = quickGroups
      }
    }
  }

  const scoring: ScoringResult = scoreRoundAnswers(
    normalizedAnswers,
    groups,
    eligiblePlayerIds,
  )

  const hasFlock = Object.values(scoring.results).some((r) => r === 'flock')

  let flockDisplayAnswer: string[] = []
  if (hasFlock && scoring.flockGroupIndex >= 0) {
    const flockSet = new Set(groups[scoring.flockGroupIndex])
    const rawFlockEntry = Object.entries(rawAnswers).find(
      ([pid]) => flockSet.has(normalizedAnswers[pid]),
    )
    if (rawFlockEntry) {
      flockDisplayAnswer = [rawFlockEntry[1]]
    }
  }

  const playerCountPerGroup = groups.map((g) => {
    const s = new Set(g)
    return Object.values(normalizedAnswers).filter((a) => s.has(a)).length
  })

  console.log(JSON.stringify({
    event: 'scoring',
    gameId,
    roundNum,
    groupSource,
    rawAnswers,
    normalizedAnswers,
    uniqueNormalized,
    groups,
    playerCountPerGroup,
    results: scoring.results,
    pointsThisRound: scoring.pointsThisRound,
    hasFlock,
    flockDisplayAnswer,
    commentary,
  }))

  await roundRef.update({
    status: 'scored',
    answerGroups: groups.map((g) => JSON.stringify(g)),
    flockAnswer: flockDisplayAnswer,
    results: scoring.results,
    pointsThisRound: scoring.pointsThisRound,
    playerAnswers: rawAnswers,
    commentary,
  })

  const batch = db.batch()

  for (const [playerId, pts] of Object.entries(scoring.pointsThisRound)) {
    if (pts !== 0) {
      const playerRef = db.collection('games').doc(gameId).collection('players').doc(playerId)
      batch.update(playerRef, { score: FieldValue.increment(pts) })
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
    if (!roundSnap.exists || roundSnap.data()?.status !== 'scored') return false
    tx.update(gameRef, { advanceInProgress: currentRound })
    return true
  })
  if (!claimed) return

  try {
    const gameSnap = await gameRef.get()
    const game = gameSnap.data()!

    const nextRound = game.currentRound + 1
    if (nextRound > game.settings.totalRounds) {
      await gameRef.update({ status: 'finished', advanceInProgress: FieldValue.delete() })
      return
    }

    const recentTags: string[] = []
    for (let r = Math.max(1, game.currentRound - 4); r <= game.currentRound; r++) {
      const roundDoc = await gameRef.collection('rounds').doc(String(r)).get()
      const tag = roundDoc.data()?.tag
      if (tag) recentTags.push(tag)
    }

    const question = await drawQuestion(
      gameId,
      recentTags,
      shouldDrawPatrioticQuestion(nextRound, game.includePatrioticQuestions ?? false),
    )
    if (!question) {
      await gameRef.update({ status: 'finished', advanceInProgress: FieldValue.delete() })
      return
    }

    const deadline = new Date(Date.now() + game.settings.secondsPerRound * 1000)

    const eligiblePlayerIds = [...(game.playerIds ?? [])]

    await gameRef.collection('rounds').doc(String(nextRound)).set({
      question: question.text,
      source: question.source,
      tag: question.tag ?? null,
      submittedBy: question.submittedBy ?? null,
      questionPoolId: question.poolDocId,
      type: question.type,
      options: question.options,
      status: 'answering',
      deadline: Timestamp.fromDate(deadline),
      answerCount: 0,
      answeredPlayerIds: [],
      answerGroups: [],
      flockAnswer: [],
      results: {},
      pointsThisRound: {},
      eligiblePlayerIds,
      eligiblePlayerCount: eligiblePlayerIds.length,
    })

    await gameRef.update({
      currentRound: nextRound,
      advanceInProgress: FieldValue.delete(),
    })
  } catch (err) {
    await gameRef.update({ advanceInProgress: FieldValue.delete() }).catch(() => {})
    throw err
  }
}

// -- ABANDON GAME (Flock Together) --
export const flockAbandonGame = onCall(async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Must be signed in')

  const { gameId } = request.data as { gameId: string }
  const gameRef = db.collection('games').doc(gameId)
  const gameSnap = await gameRef.get()
  if (!gameSnap.exists) throw new HttpsError('not-found', 'Game not found')

  const game = gameSnap.data()!
  if (game.hostId !== uid) throw new HttpsError('permission-denied', 'Only the host can end the game')

  await gameRef.update({ status: 'abandoned' })
  try { await releaseRoomCode(game.code) } catch { /* ignore — code expiry is fine */ }
})
