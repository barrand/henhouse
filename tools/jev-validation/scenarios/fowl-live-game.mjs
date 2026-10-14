import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import path from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'
const require = createRequire(new URL('../../../functions/package.json', import.meta.url))
assert.match(process.env.FIRESTORE_EMULATOR_HOST ?? '', /^(localhost|127\.0\.0\.1):\d+$/)
process.loadEnvFile(path.resolve(import.meta.dirname, '../../../functions/.env'))
const api = require('./lib/index.js')
const admin = require('firebase-admin')
const { Timestamp } = require('firebase-admin/firestore')
const gemini = require('./lib/shared/gemini.js')
let geminiCalls = 0
gemini.evaluateGuess = async () => { geminiCalls++; throw new Error('Gemini blocked by integration harness') }
gemini.classifyFowlWordsClue = async () => { geminiCalls++; throw new Error('Gemini blocked by integration harness') }
const db = admin.firestore()
const players = ['live-host', 'live-giver-1', 'live-giver-2']
const call = (name, uid, data) => api[name].run({ auth: { uid }, data })
const rounds = []
const started = Date.now()
try {
  await db.doc('aiExperimentConfig/jev').set({ admissionEnabled: true, approvedConfigVersion: 'jev-playtest-v2', mode: 'jev', allowedHostUids: [players[0]], enabledOperations: { clue: true, guess: true } })
  const created = await call('fowlWordsCreateGame', players[0], { playerName: 'Synthetic host', experimental: true })
  for (const uid of players.slice(1)) await call('joinGame', uid, { code: created.code, playerName: uid })
  await call('fowlWordsStartGame', players[0], { gameId: created.gameId })
  const gameRef = db.doc(`games/${created.gameId}`)
  // Synthetic word fixture and clock acceleration; all phase transitions,
  // submissions, score commits, and round advancement use callable handlers.
  await gameRef.update({ cardsRemaining: Array.from({ length: 27 }, () => 'house') })
  const totals = Object.fromEntries(players.map(uid => [uid, 0]))
  for (let roundNum = 1; roundNum <= 10; roundNum++) {
    const roundRef = gameRef.collection('rounds').doc(String(roundNum))
    await roundRef.update({ wordOptions: ['house', 'table', 'chair'] })
    await call('fowlWordsSkipWordSelectionPrivacyHandoff', players[0], { gameId: created.gameId, roundNum })
    const game = (await gameRef.get()).data()
    const giverIds = players.filter(uid => uid !== game.currentGuesser)
    for (const uid of giverIds) await call('fowlWordsSubmitWordVote', uid, { gameId: created.gameId, roundNum, wordIndex: 0 })
    assert.equal((await roundRef.get()).data().status, 'word-selected')
    await roundRef.update({ wordSelectedDeadline: Timestamp.fromMillis(Date.now() - 1) })
    await call('fowlWordsBeginClueSubmission', players[0], { gameId: created.gameId, roundNum })
    for (const [i, uid] of giverIds.entries()) await call('submitClue', uid, { gameId: created.gameId, roundNum, clue: i ? 'roof' : 'shelter' })
    assert.equal((await roundRef.get()).data().status, 'reveal')
    await call('submitGuess', game.currentGuesser, { gameId: created.gameId, roundNum, guess: 'casa', expectedAttempt: 1 })
    const result = (await roundRef.get()).data()
    assert.equal(result.status, 'scored'); assert.equal(result.isCorrect, true)
    // Independent hand-computable oracle: 10 guesser, 10 each visible giver,
    // plus 3 FAST for the first giver (three-player game); no peer awards cast.
    const expected = { [game.currentGuesser]: 10, [giverIds[0]]: 13, [giverIds[1]]: 10 }
    assert.deepEqual(result.pointsThisRound, expected)
    for (const uid of players) totals[uid] += expected[uid]
    await call('submitGuess', game.currentGuesser, { gameId: created.gameId, roundNum, guess: 'casa', expectedAttempt: 1 })
    for (const uid of players) assert.equal((await gameRef.collection('players').doc(uid).get()).data().score, totals[uid])
    rounds.push({ roundNum, expected, status: result.status })
    await call('fowlWordsAdvanceRound', players[0], { gameId: created.gameId })
  }
  assert.equal((await gameRef.get()).data().status, 'finished')
  assert.equal(geminiCalls, 0)
  const directory = path.resolve(import.meta.dirname, '../../../validation-runs/jev', new Date().toISOString().replace(/[-:.TZ]/g, '') + '-live-game')
  await mkdir(directory, { recursive: true })
  const report = { status: 'pass', scope: 'Three-player ten-round Firestore emulator integration through callable handlers, synthetic clock/word fixtures; HTTP transport and browser UI not exercised.', gameId: created.gameId, rounds, geminiCalls, elapsedMs: Date.now() - started }
  await writeFile(path.join(directory, 'report.json'), JSON.stringify(report, null, 2))
  process.stdout.write(JSON.stringify({ directory, ...report }) + '\n')
} finally { await admin.app().delete() }
