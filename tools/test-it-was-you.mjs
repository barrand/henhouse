import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { setTimeout as wait } from 'node:timers/promises'

const require = createRequire(import.meta.url)
const admin = require('../functions/node_modules/firebase-admin')
const projectId = 'demo-it-was-you'
const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST ?? ''
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? ''
const databaseHost = process.env.FIREBASE_DATABASE_EMULATOR_HOST ?? ''
assert.match(firestoreHost, /^(127\.0\.0\.1|localhost):\d+$/)
assert.match(authHost, /^(127\.0\.0\.1|localhost):\d+$/)
assert.match(databaseHost, /^(127\.0\.0\.1|localhost):\d+$/)
admin.initializeApp({ projectId })
const db = admin.firestore()

async function json(url, options) {
  const response = await fetch(url, {
    method: options.method ?? 'POST',
    headers: { 'content-type': 'application/json', ...options.headers },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  })
  const data = await response.json()
  if (!response.ok) throw Object.assign(new Error(data.error?.message ?? 'Request failed'), { code: response.status })
  return data
}

async function player() {
  return json('http://' + authHost + '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake', {
    body: { returnSecureToken: true },
  })
}

function call(identity, name, data) {
  return json('http://127.0.0.1:5001/' + projectId + '/us-central1/' + name, {
    headers: { authorization: 'Bearer ' + identity.idToken },
    body: { data },
  }).then(result => result.result)
}

function read(identity, path) {
  return json('http://' + firestoreHost + '/v1/projects/' + projectId + '/databases/(default)/documents/games/' + path, {
    method: 'GET', headers: { authorization: 'Bearer ' + identity.idToken },
  })
}

function markConnected(identity, gameId, connected) {
  return json('http://' + databaseHost + '/status/' + gameId + '/' + identity.localId + '.json?ns=' + projectId + '-default-rtdb', {
    method: 'PUT', headers: { authorization: 'Bearer owner' },
    body: { connected, lastSeen: Date.now() },
  })
}

async function until(read, predicate) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const value = await read().catch(error => {
      if (error.code !== 404) throw error
      return {}
    })
    if (predicate(value)) return value
    await wait(150)
  }
  throw new Error('Timed out waiting for synchronized state.')
}

async function run() {
  const [host, sam, otherSam, playerFour, playerFive, playerSix, viewer] = await Promise.all(Array.from({ length: 7 }, player))
  const { gameId, code } = await call(host, 'itWasYouCreateGame', { playerName: 'Host' })
  const game = db.doc('games/' + gameId)
  const roundRef = game.collection('rounds').doc('1')
  const secret = roundRef.collection('private').doc('state')
  const names = ['Sam', 'sam', 'Four', 'Five', 'Six']
  const participants = [host, sam, otherSam, playerFour, playerFive, playerSix]
  for (const [index, identity] of participants.slice(1).entries()) {
    assert.equal((await call(identity, 'joinGame', { code, playerName: names[index] })).gameType, 'it-was-you')
  }
  assert.equal((await game.collection('players').doc(otherSam.localId).get()).data().name, 'sam (2)')
  await assert.rejects(call(host, 'truthOrTurdStartGame', { gameId }), /Wrong game type/)
  await call(viewer, 'openSharedView', { code })
  const readRound = () => roundRef.get().then(snapshot => snapshot.data())
  const action = (identity, round, action, extra = {}, roundNum = 1) =>
    call(identity, 'itWasYouRoundAction', { gameId, roundNum, revision: round.revision, action, ...extra })
  await action(host, { revision: 0 }, 'preview', {}, 0)
  const original = await readRound()
  await action(host, original, 'swap')
  assert.notEqual((await readRound()).prompt, original.prompt)
  await action(host, await readRound(), 'write')
  const writing = await readRound()
  assert.equal(writing.writerIds.length, 6)
  await action(host, writing, 'submit', { text: 'A trapdoor' })
  await assert.rejects(action(sam, writing, 'submit', { text: ' a TRAPDOOR ' }), { code: 409 })
  for (const [index, identity] of participants.slice(1).entries()) {
    await action(identity, writing, 'submit', { text: 'Answer ' + index })
  }

  const voting = await readRound()
  const queue = (await secret.get()).data().answers
  assert.equal(voting.phase, 'voting')
  assert.equal(voting.answer.text, queue[0].text)
  assert.equal(voting.answer.authorId, undefined)
  assert.equal(voting.reveal, null)
  await markConnected(host, gameId, false)
  await until(() => game.get(), snapshot => snapshot.data().hostId !== host.localId)
  await markConnected(host, gameId, true)
  await until(() => game.get(), snapshot => snapshot.data().hostId === host.localId)
  await assert.rejects(read(viewer, gameId + '/rounds/1'), { code: 403 })
  await assert.rejects(read(sam, gameId + '/rounds/1/private/state'), { code: 403 })
  const projected = await until(() => read(viewer, gameId + '/sharedRounds/1'), value => value.fields?.phase?.stringValue === 'voting')
  assert.equal(projected.fields.kind.stringValue, 'it-was-you')
  assert.equal(projected.fields.answer.mapValue.fields.authorId, undefined)
  assert.equal(projected.fields.writerIds, undefined)

  const author = queue[0].authorId
  const other = voting.candidateIds.find(id => id !== author)
  const extra = { answerId: voting.answer.id, candidateId: author }
  const late = await player()
  await call(late, 'joinGame', { code, playerName: 'Late guest' })
  await assert.rejects(action(late, voting, 'vote', extra), { code: 403 })
  await action(sam, voting, 'vote', { ...extra, candidateId: other })
  await action(sam, voting, 'vote', extra)
  for (const identity of participants.filter(identity => identity.localId !== sam.localId)) await action(identity, voting, 'vote', extra)
  const shards = await roundRef.collection('voteFeeds').doc(voting.answer.id).collection('shards').get()
  assert.equal(shards.docs.reduce((sum, shard) => sum + shard.data().voted, 0), participants.length)
  assert.equal(shards.docs.reduce((sum, shard) => sum + (shard.data().counts[other] ?? 0), 0), 0)
  await assert.rejects(read(viewer, gameId + '/rounds/1/views/' + sam.localId), { code: 403 })
  await assert.rejects(read(otherSam, gameId + '/rounds/1/views/' + sam.localId), { code: 403 })
  assert.equal((await read(sam, gameId + '/rounds/1/views/' + sam.localId)).fields.candidateId.stringValue, author)
  await call(sam, 'joinGame', { code, playerName: 'New name' })
  assert.equal((await read(sam, gameId + '/rounds/1/views/' + sam.localId)).fields.candidateId.stringValue, author)
  await assert.rejects(action(sam, voting, 'close', { early: true }), { code: 403 })
  assert.equal((await readRound()).phase, 'voting')

  await roundRef.update({ deadline: Date.now() - 1 })
  await Promise.all([action(host, voting, 'close', { early: true }), action(sam, voting, 'close')])
  let current = await readRound()
  assert.equal(current.reveal.authorId, author)
  assert.equal(current.reveal.counts[author], participants.length)
  const scored = (await game.collection('players').get()).docs
  for (const item of scored) assert.equal(item.data().score, (item.id === author || item.id === late.localId) ? 0 : 2)
  await assert.rejects(action(sam, voting, 'vote', extra), { code: 400 })

  for (let index = 1; index < queue.length; index++) {
    await roundRef.update({ 'reveal.revealAt': 0 })
    await action(host, current, 'advance')
    current = await readRound()
    assert.equal(current.answer.text, queue[index].text)
    if (index === queue.length - 1) {
      assert.equal(current.reveal.automatic, true)
      break
    }
    assert.equal(current.candidateIds.length, queue.length - index)
    await roundRef.update({ deadline: Date.now() - 1 })
    await action(sam, current, 'close')
    current = await readRound()
    assert.deepEqual(current.reveal.leaders, [])
  }
  await action(host, current, 'advance')
  current = await readRound()
  assert.equal(current.phase, 'standings')
  assert.equal(Object.keys(current.pointsThisRound).length, 5)
  console.log('PASS: six-player round, mutable private votes, TV projection, concurrent close, and final reveal')

  const newcomers = await Promise.all(Array.from({ length: 29 }, player))
  for (let index = 0; index < newcomers.length; index += 5) {
    await Promise.all(newcomers.slice(index, index + 5).map((identity, offset) =>
      call(identity, 'joinGame', { code, playerName: 'Guest ' + (index + offset) })))
  }
  assert.equal((await game.get()).data().playerIds.length, 36)
  await action(host, current, 'preview')
  const second = game.collection('rounds').doc('2')
  await action(host, (await second.get()).data(), 'write', {}, 2)
  const secondWriting = (await second.get()).data()
  assert.equal(secondWriting.writerIds.length, 6)
  assert.ok(newcomers.some(identity => secondWriting.writerIds.includes(identity.localId)))
  assert.ok(participants.every(identity => !secondWriting.writerIds.includes(identity.localId)))
  assert.ok(secondWriting.eligiblePlayerIds.includes(late.localId))
  const writers = [...newcomers, late].filter(identity => secondWriting.writerIds.includes(identity.localId))
  for (const [index, identity] of writers.entries()) await action(identity, secondWriting, 'submit', { text: 'Large room ' + index }, 2)
  const secondVoting = (await second.get()).data()
  const candidateId = secondVoting.candidateIds[0]
  await Promise.all([...participants, ...newcomers, late].slice(0, 35).map(identity =>
    action(identity, secondVoting, 'vote', { answerId: secondVoting.answer.id, candidateId }, 2)))
  const largeFeed = await second.collection('voteFeeds').doc(secondVoting.answer.id).collection('shards').get()
  assert.equal(largeFeed.docs.reduce((count, shard) => count + (shard.data().counts[candidateId] ?? 0), 0), 35)
  console.log('PASS: uncapped 36-player admission, writer rotation and 35 simultaneous votes')

  await game.update({ status: 'finished' })
  const rematch = await call(host, 'itWasYouRematch', { gameId })
  const next = (await db.doc('rooms/' + rematch.code).get()).data().gameId
  const roster = await db.collection('games/' + next + '/players').get()
  assert.equal(roster.size, 36)
  assert.ok(roster.docs.every(doc => doc.data().score === 0 && doc.data().writingOpportunities === 0))
  assert.equal((await game.get()).data().rematchCode, rematch.code)
  console.log('PASS: rematch keeps the roster and resets scores and writer opportunities')
}

run().then(() => process.exit(0), error => {
  console.error(error)
  process.exit(1)
})
