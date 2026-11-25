import { randomUUID } from 'node:crypto'
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import * as admin from 'firebase-admin'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { scoreRoundAnswers, ScoringResult } from './scoring'
import { groupAnswersWithGemini, generateQuestionsFromCategories, GeminiGroupResult } from '../../shared/gemini'
import { drawQuestion, seedQuestionPool, questionKey } from './questions'
import { claimRoomCode, releaseRoomCode } from '../../shared/roomCodes'
import { normalizeAnswer, fallbackGrouping, validateGeminiGroups } from '../../shared/normalizeAnswer'
import { getRoundEligiblePlayerIds, isRoundEligible } from '../../shared/roundEligibility'
import { experimentForCreation, requireExperimentRematch } from '../../shared/aiExperiment'
import { typesafeApiKey } from '../../shared/secrets'
import { scoreJevRound } from './jevScoring'
import { publishFlockScore } from './publishScore'
import { scoreMap } from '../../shared/sharedViewProjection'
import { FLOCK_REVEAL_MS } from '../../shared/sharedViewModel'

const db = admin.firestore()
const TOTAL_ROUNDS = 10

export { flockSetCuratedQuestions } from './curatedMode'

function shouldDrawPatrioticQuestion(roundNum: number, includePatrioticQuestions: boolean): boolean {
  return includePatrioticQuestions && roundNum % 2 === 1
}

// -- CREATE GAME (Flock Together) --
export const flockCreateGame = onCall(async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Must be signed in')

  const { playerName, includePatrioticQuestions = false, experimental = false } = request.data as {
    playerName: string
    includePatrioticQuestions?: boolean
    experimental?: boolean
  }
  if (!playerName?.trim()) throw new HttpsError('invalid-argument', 'Name required')
  if (typeof includePatrioticQuestions !== 'boolean') {
    throw new HttpsError('invalid-argument', 'includePatrioticQuestions must be a boolean')
  }
  if (typeof experimental !== 'boolean') throw new HttpsError('invalid-argument', 'experimental must be a boolean')
  const aiExperiment = await experimentForCreation(uid, experimental)

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
    includePatrioticQuestions,
    curatedQuestions: false,
    aiExperiment,
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
  const aiExperiment = await requireExperimentRematch(uid, game.aiExperiment)

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
    curatedQuestions: game.curatedQuestions ?? false,
    aiExperiment,
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
  const game = await db.runTransaction(async (tx) => {
    const gameSnap = await tx.get(gameRef)
    if (!gameSnap.exists) throw new HttpsError('not-found', 'Game not found')
    const game = gameSnap.data()!
    if (game.hostId !== uid) throw new HttpsError('permission-denied', 'Only host can start')
    if (game.status !== 'lobby' || (game.questionSelectionLockedUntil ?? 0) > Date.now()) throw new HttpsError('failed-precondition', 'Game already starting or started')
    if (!game.curatedQuestions && game.aiExperiment?.mode !== undefined && game.aiExperiment.mode !== 'legacy' && game.categories?.length) throw new HttpsError('failed-precondition', 'AI categories are unavailable in Jev playtest rooms. Use preset or manually submitted questions.')
    // Freeze question selection while seeding; the lease permits recovery after a timeout.
    tx.update(gameRef, { questionSelectionLockedUntil: Date.now() + 120_000 })
    return game
  })

  try {
    // Seed only the selected question set.
    await seedQuestionPool(gameId, game.includePatrioticQuestions ?? false, game.curatedQuestions ?? false)

    if (!game.curatedQuestions && game.categories?.length > 0) {
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
      game.curatedQuestions ?? false,
    )
    if (!question) throw new HttpsError('internal', 'No questions available in pool')

    const deadline = new Date(Date.now() + game.settings.secondsPerRound * 1000)

    const eligiblePlayerIds = [...game.playerIds]

    await gameRef.collection('rounds').doc('1').set({
      question: question.text,
      questionInstance: randomUUID(),
      scoresBefore: scoreMap(await gameRef.collection('players').get()),
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
  } finally {
    await gameRef.update({ questionSelectionLockedUntil: FieldValue.delete() })
  }
})

// -- SUBMIT ANSWER --
export const submitAnswer = onCall({ secrets: [typesafeApiKey] }, async (request) => {
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
  if (game.aiExperiment?.mode === 'jev' && trimmed.length > 500) throw new HttpsError('invalid-argument', 'Answer must be at most 500 characters')

  // Multiple-choice rounds only accept answers that exactly match one of the server-side options.
  if (roundData.type === 'multiple_choice') {
    const validOptions: string[] = Array.isArray(roundData.options) ? roundData.options : []
    if (!validOptions.includes(trimmed)) {
      throw new HttpsError('invalid-argument', 'Answer must match one of the provided options')
    }
  }

  const answerRef = roundRef.collection('answers').doc(uid)
  try {
    const answerData = {
      text: trimmed,
      submittedAt: FieldValue.serverTimestamp(),
    }
    await db.runTransaction(async tx => {
      const [freshGame, freshRound, saved] = await Promise.all([tx.get(gameRef), tx.get(roundRef), tx.get(answerRef)])
      const liveGame = freshGame.data()
      const live = freshRound.data()
      if (liveGame?.status !== 'playing' || liveGame.currentRound !== roundNum || live?.status !== 'answering'
        || !sameQuestion(live, roundData) || live.deadline.toMillis() < Date.now() || !isRoundEligible(live, liveGame, uid)) {
        throw new HttpsError('failed-precondition', 'Round no longer accepts answers')
      }
      if (!saved.exists) tx.create(answerRef, answerData)
    })
  } catch (err: unknown) {
    const code = typeof err === 'object' && err !== null && 'code' in err
      ? (err as { code?: unknown }).code
      : undefined
    if (code !== 6 && code !== 'already-exists') throw err
  }

  const eligiblePlayerIds = getRoundEligiblePlayerIds(roundData, game)
  const completed = await syncRoundAnswerState(roundRef, eligiblePlayerIds, roundData)
  if (completed) {
    await triggerScoring(gameId, roundNum, roundData)
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
  await db.runTransaction(async tx => {
    const current = (await tx.get(roundRef)).data()
    if (current?.status !== 'answering' || !sameQuestion(current, roundSnap.data()!)) {
      throw new HttpsError('failed-precondition', 'Round already changed')
    }
    tx.update(roundRef, { status: 'skipped' })
  })

  try {
    const recentTags: string[] = []
    for (let r = Math.max(1, roundNum - 4); r <= roundNum; r++) {
      const roundDoc = await gameRef.collection('rounds').doc(String(r)).get()
      const tag = roundDoc.data()?.tag
      if (tag) recentTags.push(tag)
    }

    const answersSnap = await roundRef.collection('answers').get()
    // Skipped questions remain used for the cooldown.
    const newQuestion = await drawQuestion(
      gameId,
      recentTags,
      shouldDrawPatrioticQuestion(roundNum, game.includePatrioticQuestions ?? false),
      game.curatedQuestions ?? false,
    )
    if (!newQuestion) throw new HttpsError('internal', 'No more questions available')

    const deadline = new Date(Date.now() + game.settings.secondsPerRound * 1000)
    const replace = db.batch()
    answersSnap.docs.forEach(answer => replace.delete(answer.ref))
    replace.update(roundRef, {
      question: newQuestion.text,
      questionInstance: randomUUID(),
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
    await replace.commit()
  } catch (err) {
    await db.runTransaction(async tx => {
      const current = (await tx.get(roundRef)).data()
      if (current?.status === 'skipped' && sameQuestion(current, roundSnap.data()!)) {
        tx.update(roundRef, { status: 'answering' })
      }
    }).catch(() => {})
    throw err
  }
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
  if (gameSnap.data()!.aiExperiment?.mode && gameSnap.data()!.aiExperiment.mode !== 'legacy' && categories.length) throw new HttpsError('failed-precondition','AI categories are unavailable in Jev playtest rooms')
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
export const forceEndRound = onCall({ secrets: [typesafeApiKey] }, async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Must be signed in')

  const { gameId } = request.data as { gameId: string }
  const gameSnap = await db.collection('games').doc(gameId).get()
  if (!gameSnap.exists) throw new HttpsError('not-found', 'Game not found')
  if (gameSnap.data()!.hostId !== uid) throw new HttpsError('permission-denied', 'Only host can end round')

  const roundNum = gameSnap.data()!.currentRound
  const roundRef = db.collection('games').doc(gameId).collection('rounds').doc(String(roundNum))
  const roundSnap = await roundRef.get()

  if (!roundSnap.exists) return
  if (gameSnap.data()!.aiExperiment?.mode === 'jev') { await scoreJevRound(gameId, roundNum, roundSnap.data()!.deadline.toMillis()); return }
  if (roundSnap.data()!.status !== 'answering') return

  await triggerScoring(gameId, roundNum, roundSnap.data()!)
})

// -- INTERNAL HELPERS --

function sameQuestion(a: FirebaseFirestore.DocumentData, b: FirebaseFirestore.DocumentData) {
  return a.questionInstance === b.questionInstance && a.deadline.toMillis() === b.deadline.toMillis()
}

async function syncRoundAnswerState(roundRef: FirebaseFirestore.DocumentReference, eligiblePlayerIds: string[], expected: FirebaseFirestore.DocumentData) {
  const answersSnap = await roundRef.collection('answers').get()
  const eligible = new Set(eligiblePlayerIds)
  const answeredPlayerIds = answersSnap.docs.map(doc => doc.id).filter(id => eligible.has(id))
  const count = answeredPlayerIds.length
  // A burst of submissions often observes the same total. Let one write it
  // and let the others see the newer snapshot without locking the round.
  for (let attempt = 0; ; attempt++) {
    const snapshot = await roundRef.get()
    const live = snapshot.data()
    if (live?.status !== 'answering' || !sameQuestion(live, expected) || count <= (live.answerCount ?? 0)) return false
    try {
      await roundRef.update({ answerCount: count, answeredPlayerIds }, { lastUpdateTime: snapshot.updateTime! })
      return count >= eligible.size
    } catch (error) {
      const code = (error as { code?: number }).code
      if (code !== 9 || attempt >= 4) throw error
    }
  }
}

async function triggerScoring(gameId: string, roundNum: number, expected: FirebaseFirestore.DocumentData) {
  const experimentGame = await db.doc(`games/${gameId}`).get()
  if (experimentGame.data()?.aiExperiment?.mode === 'jev') { await scoreJevRound(gameId, roundNum, expected.deadline.toMillis()); return }
  const roundRef = db.collection('games').doc(gameId).collection('rounds').doc(String(roundNum))

  const claimed = await db.runTransaction(async (tx) => {
    const live = (await tx.get(roundRef)).data()
    if (live?.status !== 'answering' || !sameQuestion(live, expected)) return false
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

  await db.runTransaction(async tx => {
    const [currentGame, currentRound] = await Promise.all([tx.get(gameSnap.ref), tx.get(roundRef)])
    const live = currentRound.data()
    if (currentGame.data()?.status !== 'playing' || currentGame.data()?.currentRound !== roundNum
      || live?.status !== 'revealing' || !sameQuestion(live, roundData)) return
    await publishFlockScore(tx, roundRef, live, {
      answerGroups: groups.map(group => JSON.stringify(group)), flockAnswer: flockDisplayAnswer,
      results: scoring.results, pointsThisRound: scoring.pointsThisRound,
      playerAnswers: rawAnswers, commentary,
    })
  })
}

async function doAdvanceRound(gameId: string) {
  const startedAt = Date.now()
  let phase = 'claim'
  const timings: Record<string, number> = {}
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
    const revealAt = roundSnap.data()?.revealAt ?? 0
    if (revealAt && Date.now() < revealAt + FLOCK_REVEAL_MS) {
      throw new HttpsError('failed-precondition', 'Wait for the reveal to finish.')
    }
    tx.update(gameRef, { advanceInProgress: currentRound })
    return true
  })
  timings.claimMs = Date.now() - startedAt
  if (!claimed) return

  try {
    phase = 'read-game'
    const gameSnap = await gameRef.get()
    const game = gameSnap.data()!

    const nextRound = game.currentRound + 1
    if (nextRound > game.settings.totalRounds) {
      await gameRef.update({ status: 'finished', advanceInProgress: FieldValue.delete() })
      return
    }

    phase = 'recent-rounds'
    const historyStartedAt = Date.now()
    const recentRoundNumbers = Array.from(
      { length: Math.min(5, game.currentRound) },
      (_, index) => Math.max(1, game.currentRound - 4) + index,
    )
    const recentRounds = await Promise.all(recentRoundNumbers.map((r) => gameRef.collection('rounds').doc(String(r)).get()))
    const recentTags = recentRounds.map((doc) => doc.data()?.tag).filter((tag): tag is string => typeof tag === 'string' && !!tag)
    timings.historyMs = Date.now() - historyStartedAt

    phase = 'draw-question'
    const drawStartedAt = Date.now()
    const question = await drawQuestion(
      gameId,
      recentTags,
      shouldDrawPatrioticQuestion(nextRound, game.includePatrioticQuestions ?? false),
      game.curatedQuestions ?? false,
    )
    timings.drawMs = Date.now() - drawStartedAt
    if (!question) {
      await gameRef.update({ status: 'finished', advanceInProgress: FieldValue.delete() })
      return
    }

    const deadline = new Date(Date.now() + game.settings.secondsPerRound * 1000)

    const eligiblePlayerIds = [...(game.playerIds ?? [])]

    phase = 'publish-round'
    const publishStartedAt = Date.now()
    await gameRef.collection('rounds').doc(String(nextRound)).set({
      question: question.text,
      questionInstance: randomUUID(),
      scoresBefore: scoreMap(await gameRef.collection('players').get()),
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
    timings.publishMs = Date.now() - publishStartedAt
  } catch (err) {
    console.error('Flock advance round failed', { gameId, phase, ...timings, totalMs: Date.now() - startedAt })
    await gameRef.update({ advanceInProgress: FieldValue.delete() }).catch(() => {})
    throw err
  } finally {
    console.info('Flock advance round timing', { gameId, phase, ...timings, totalMs: Date.now() - startedAt })
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
