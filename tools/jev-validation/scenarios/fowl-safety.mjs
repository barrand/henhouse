import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
const require = createRequire(new URL('../../../functions/package.json', import.meta.url))
assert.match(process.env.FIRESTORE_EMULATOR_HOST ?? '', /^(127\.0\.0\.1|localhost):\d+$/)
const admin = require('firebase-admin')
admin.initializeApp({ projectId: 'demo-jev-safety' })
const { Timestamp } = require('firebase-admin/firestore')
const { DecisionService } = require('./lib/shared/decisionService.js')
const { handleGuess, recoverExpiredGuess } = require('./lib/games/fowl-words/roundFlow.js')
const { submitClue } = require('./lib/games/fowl-words/index.js')
const { enqueueFowlWordsShadow, evaluateShadowJob, expireJevShadowInputs } = require('./lib/shared/jevShadow.js')
const db = admin.firestore()
const checks = []
let calls = 0
let gate
DecisionService.prototype.evaluateFowlWordsGuess = async () => { calls++; if (gate) await gate; return { correct: true, metadata: { probabilities: { correct: .99 }, latencyMs: 10, fallbackUsed: false } } }
DecisionService.prototype.classifyFowlWordsClue = async () => { calls++; if (gate) await gate; return { singleWord: true, tooCloseToSecret: false, metadata: { probabilities: { joined_words: .1, too_close: .1 }, latencyMs: 10, fallbackUsed: false } } }
await db.doc('aiExperimentConfig/jev').set({ admissionEnabled: true, approvedConfigVersion: 'jev-playtest-v2', mode: 'jev', allowedHostUids: ['host'], enabledOperations: { clue: true, guess: true } })
let serial = 0
async function room() {
  const gameId = `safety-${++serial}`
  const gameRef = db.doc(`games/${gameId}`)
  const roundRef = gameRef.collection('rounds').doc('1')
  await gameRef.set({ hostId: 'host', originalHostId: 'host', status: 'playing', currentRound: 1, currentGuesser: 'host', playerIds: ['host', 'giver', 'other'], aiExperiment: { mode: 'jev', configVersion: 'jev-playtest-v2' } })
  for (const uid of ['host', 'giver', 'other']) await gameRef.collection('players').doc(uid).set({ score: 0 })
  await roundRef.set({ status: 'reveal', currentAttempt: 1, maxAttempts: 3, secretWord: 'house', eligiblePlayerIds: ['host', 'giver', 'other'], clueGroups: [{ playerIds: ['giver'], clueTexts: ['shelter'], isDuplicate: false }], visibleGroupIndexes: [0], clueTimestamps: { giver: Timestamp.fromMillis(1) }, cluePeerLoveVotes: {}, attemptInProgress: false })
  return { gameId, gameRef, roundRef }
}
async function check(name, fn) { await fn(); checks.push(name); process.stdout.write(`PASS ${name}\n`) }
try {
  await check('playtest unequal-length synonyms reach the provider and use the 0.64 policy', async () => {
    const {gameId,roundRef}=await room()
    await roundRef.update({secretWord:'car'})
    const before=calls
    await handleGuess(gameId,1,'host','automobile',1)
    assert.equal(calls,before+1)
    assert.equal((await roundRef.get()).data().isCorrect,true)
  })
  await check('concurrent correct guesses score once, and stale retry does not consume next attempt', async () => {
    const { gameId, roundRef, gameRef } = await room()
    await Promise.all(Array.from({ length: 8 }, () => handleGuess(gameId, 1, 'host', 'casa', 1)))
    assert.equal((await roundRef.get()).data().status, 'scored')
    assert.equal((await gameRef.collection('players').doc('host').get()).data().score, 10)
    await handleGuess(gameId, 1, 'host', 'casa', 1)
    assert.equal((await gameRef.collection('players').doc('host').get()).data().score, 10)
  })
  await check('expired claim recovery unlocks next clue, refreshes points, and rejects late provider result', async () => {
    const { gameId, roundRef, gameRef } = await room()
    await roundRef.update({ clueGroups: [{ playerIds: ['giver', 'other'], clueTexts: ['home', 'homes'], isDuplicate: true }], visibleGroupIndexes: [] })
    let release
    gate = new Promise(resolve => { release = resolve })
    const pending = handleGuess(gameId, 1, 'host', 'casa', 1)
    while (!(await roundRef.get()).data().guessClaimId) await new Promise(resolve => setTimeout(resolve, 10))
    await roundRef.update({ guessClaimExpiresAt: Timestamp.fromMillis(Date.now() - 1) })
    await recoverExpiredGuess(gameId, 1)
    release(); gate = undefined; await pending
    const state = (await roundRef.get()).data()
    assert.equal(state.status, 'reveal'); assert.equal(state.currentAttempt, 2)
    assert.deepEqual(state.visibleGroupIndexes, [0]); assert.ok(state.tentativePoints)
    assert.equal((await gameRef.collection('players').doc('host').get()).data().score, 0)
    await handleGuess(gameId, 1, 'host', 'casa', 1)
    assert.equal((await roundRef.get()).data().currentAttempt, 2)
  })
  await check('disabled semantic operation fails closed; local exact matches still succeed', async () => {
    const { gameId, roundRef } = await room()
    await db.doc('aiExperimentConfig/jev').update({ 'enabledOperations.guess': false })
    const before = calls
    await handleGuess(gameId, 1, 'host', 'casa', 1)
    assert.equal(calls, before); assert.equal((await roundRef.get()).data().currentAttempt, 2)
    await handleGuess(gameId, 1, 'host', 'HOUSE', 2)
    assert.equal(calls, before); assert.equal((await roundRef.get()).data().isCorrect, true)
    await db.doc('aiExperimentConfig/jev').update({ 'enabledOperations.guess': true })
  })
  await check('parallel clue submissions cannot overwrite; existing submissions spend no request', async () => {
    const { gameId, roundRef } = await room()
    await roundRef.update({ status: 'clue-submission', cluesByPlayer: {}, clueSubmissionDeadline: Timestamp.fromMillis(Date.now() + 60000) })
    const submit = clue => submitClue.run({ auth: { uid: 'giver' }, data: { gameId, roundNum: 1, clue } })
    const results = await Promise.allSettled([submit('shelter'), submit('dwelling')])
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1)
    const saved = (await roundRef.get()).data().cluesByPlayer.giver
    assert.ok(['shelter', 'dwelling'].includes(saved))
    const before = calls
    await assert.rejects(submit('roof'))
    assert.equal(calls, before)
  })
  await check('final wrong guess applies duplicate penalties exactly once and no Peer love payout', async () => {
    const { gameId, gameRef, roundRef } = await room()
    await roundRef.update({ currentAttempt: 3, clueGroups: [{ playerIds: ['giver', 'other'], clueTexts: ['home', 'homes'], isDuplicate: true }], visibleGroupIndexes: [0], cluePeerLoveVotes: { host: { '0': true } } })
    await Promise.all(Array.from({ length: 6 }, () => handleGuess(gameId, 1, 'host', 'extremelylongwronganswer', 3)))
    const result = (await roundRef.get()).data()
    assert.equal(result.status, 'scored'); assert.equal(result.isCorrect, false)
    assert.deepEqual(result.pointsThisRound, { giver: -1, other: -1, host: 0 })
    assert.equal((await gameRef.collection('players').doc('giver').get()).data().score, -1)
  })
  await check('correct guess commits Peer love and cumulative scores together exactly once', async () => {
    const { gameId, gameRef, roundRef } = await room()
    await roundRef.update({ cluePeerLoveVotes: { other: { '0': true } } })
    await Promise.all(Array.from({ length: 6 }, () => handleGuess(gameId, 1, 'host', 'house', 1)))
    const result = (await roundRef.get()).data()
    assert.deepEqual(result.pointsThisRound, { giver: 14, host: 10 })
    assert.equal((await gameRef.collection('players').doc('giver').get()).data().score, 14)
  })
  await check('late clue response cannot write after phase advances', async () => {
    const { gameId, roundRef } = await room()
    await roundRef.update({ status: 'clue-submission', cluesByPlayer: {}, clueSubmissionDeadline: Timestamp.fromMillis(Date.now() + 60000) })
    let release
    gate = new Promise(resolve => { release = resolve })
    const pending = submitClue.run({ auth: { uid: 'giver' }, data: { gameId, roundNum: 1, clue: 'shelter' } })
    const outcome = pending.then(() => true, () => false)
    await new Promise(resolve => setTimeout(resolve, 100))
    await roundRef.update({ status: 'deduplication' })
    release(); gate = undefined
    assert.equal(await outcome, false)
    assert.deepEqual((await roundRef.get()).data().cluesByPlayer, {})
  })
  await check('duplicate shadow delivery counts once and leaves game state unchanged', async () => {
    process.env.JEV_SHADOW_SAMPLE_RATE = '1'
    const { gameId, roundRef } = await room()
    const before = JSON.stringify((await roundRef.get()).data())
    const input = { gameId, roundNum: 1, actorUid: 'giver', hostUid: 'host', operation: 'clue', clue: 'shelter', secretWord: 'house', expected: { accepted: true } }
    await enqueueFowlWordsShadow(input); await enqueueFowlWordsShadow(input)
    const jobs = await db.collection('aiShadowJobs').get()
    assert.equal(jobs.size, 1)
    await Promise.all([evaluateShadowJob(jobs.docs[0]), evaluateShadowJob(jobs.docs[0])])
    await evaluateShadowJob(jobs.docs[0])
    const result = (await jobs.docs[0].ref.get()).data()
    assert.equal(result.status, 'complete'); assert.equal(result.input, undefined)
    const aggregates = await db.collection('aiShadowAggregates').get()
    assert.equal(aggregates.docs[0].data().categories.agreement, 1)
    assert.equal(JSON.stringify((await roundRef.get()).data()), before)
  })
  await check('shadow provider failure removes raw input and changes no scores or round state', async () => {
    const { gameId, roundRef } = await room()
    const before = JSON.stringify((await roundRef.get()).data())
    await enqueueFowlWordsShadow({ gameId, roundNum: 1, actorUid: 'host', operation: 'guess', guess: 'casa', secretWord: 'house', expected: { correct: true } })
    const jobs = await db.collection('aiShadowJobs').where('gameId', '==', gameId).get()
    await evaluateShadowJob(jobs.docs[0], { evaluateFowlWordsGuess: async () => { throw new Error('synthetic provider outage') } })
    const result = (await jobs.docs[0].ref.get()).data()
    assert.equal(result.status, 'failed'); assert.equal(result.input, undefined)
    assert.equal(result.errorCategory, 'provider_error')
    assert.equal(JSON.stringify((await roundRef.get()).data()), before)
  })
  await check('cleanup drains more than one page without starving later expired inputs', async () => {
    const batch = db.batch()
    for (let i = 0; i < 205; i++) batch.set(db.doc(`aiShadowJobs/expired-${i}`), { status: 'failed', input: { secretWord: 'synthetic' }, inputExpiresAt: Timestamp.fromMillis(1) })
    await batch.commit()
    await expireJevShadowInputs.run({}); await expireJevShadowInputs.run({})
    const remaining = await db.collection('aiShadowJobs').where('inputExpiresAt', '<=', Timestamp.now()).get()
    assert.equal(remaining.size, 0)
  })
  process.stdout.write(JSON.stringify({ status: 'pass', checks, providerCalls: calls }) + '\n')
} finally { await admin.app().delete() }
