// Run against Firestore Emulator with the project's rules:
// firebase emulators:exec --only auth,firestore --project demo-room-sync "node tools/test-room-sync.mjs"
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { setTimeout as delay } from 'node:timers/promises'
import { deleteApp, initializeApp } from 'firebase/app'
import { connectAuthEmulator, getAuth, signInAnonymously } from 'firebase/auth'
import { connectFirestoreEmulator, disableNetwork, doc, enableNetwork, getFirestore, terminate } from 'firebase/firestore'

const emulator = process.env.FIRESTORE_EMULATOR_HOST ?? ''
const authEmulator = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? ''
assert.match(emulator, /^(localhost|127\.0\.0\.1):\d+$/)
assert.match(authEmulator, /^(localhost|127\.0\.0\.1):\d+$/)
const [host, port] = emulator.split(':')
const projectId = 'demo-room-sync'
const require = createRequire(new URL('../functions/package.json', import.meta.url))
const admin = require('firebase-admin')
const adminApp = admin.initializeApp({ projectId })
const store = admin.firestore()
const game = store.doc('games/sync-test')
const round = game.collection('rounds').doc('1')
const app = initializeApp({ projectId, apiKey: 'fake-key' })
const auth = getAuth(app)
connectAuthEmulator(auth, `http://${authEmulator}`, { disableWarnings: true })
const db = getFirestore(app)
connectFirestoreEmulator(db, host, Number(port))

globalThis.window = new EventTarget()
globalThis.document = Object.assign(new EventTarget(), { hidden: false })
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true })
const storage = new Map()
Object.defineProperty(globalThis, 'sessionStorage', {
  value: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
  configurable: true,
})

const { getRoomSyncLog, hasRoomSyncError, retryRoomSync, watchRoomDocument } = await import('../src/shared/roomSync.ts')
const log = () => JSON.parse(getRoomSyncLog())
const phases = []
const serverPhase = phase => log().some(entry => entry.source === 'server' && entry.phase === phase)
async function waitFor(predicate, message) {
  for (let remaining = 150; remaining > 0; remaining--) {
    if (predicate()) return
    await delay(100)
  }
  assert.fail(message)
}

let stop
try {
  const { user } = await signInAnonymously(auth)
  await game.set({ playerIds: [] })
  await round.set({ status: 'answering', question: 'diagnostic-test-secret' })
  stop = watchRoomDocument(doc(db, round.path), { feed: 'round', gameId: game.id, round: 1 },
    snapshot => phases.push(snapshot.data()?.status), data => ({ phase: data.status }))
  await waitFor(() => hasRoomSyncError(), 'A terminal listener error should be surfaced')
  assert.ok(log().some(entry => entry.event === 'listener-error' && entry.reason === 'permission-denied'))

  await game.update({ playerIds: [user.uid] })
  await waitFor(() => serverPhase('answering'), 'A failed listener should recover automatically when access is restored')
  assert.ok(log().some(entry => entry.event === 'listen' && entry.reason === 'listener-error'))
  assert.equal(hasRoomSyncError(), false)
  assert.equal(phases.at(-1), 'answering')

  await disableNetwork(db)
  navigator.onLine = false
  document.hidden = true
  document.dispatchEvent(new Event('visibilitychange'))
  window.dispatchEvent(new Event('offline'))
  await round.update({ status: 'revealing' })
  await delay(1100)
  assert.equal(phases.at(-1), 'answering')
  navigator.onLine = true
  document.hidden = false
  document.dispatchEvent(new Event('visibilitychange'))
  await enableNetwork(db)
  await waitFor(() => serverPhase('revealing'), 'Returning to the foreground should catch up to the new phase')
  assert.equal(phases.at(-1), 'revealing')
  assert.ok(log().some(entry => entry.event === 'listen' && entry.reason === 'foreground'))
  assert.equal(phases.slice(phases.indexOf('revealing')).includes('answering'), false)

  await disableNetwork(db)
  navigator.onLine = false
  window.dispatchEvent(new Event('offline'))
  await round.update({ status: 'scored' })
  navigator.onLine = true
  window.dispatchEvent(new Event('online'))
  await enableNetwork(db)
  await waitFor(() => serverPhase('scored'), 'Restoring connectivity should deliver the latest phase')
  assert.ok(log().some(entry => entry.event === 'listen' && entry.reason === 'online'))
  assert.equal(phases.at(-1), 'scored')

  await disableNetwork(db)
  // Simulate Firestore losing its connection while the browser still reports online.
  // A restored page opens a new listener, which initially has only the cached result.
  const restoredPage = Object.assign(new Event('pageshow'), { persisted: true })
  await delay(1100)
  window.dispatchEvent(restoredPage)
  await round.update({ status: 'finished' })
  const timeoutRetries = () => log().filter(entry => entry.event === 'listen' && entry.reason === 'server-timeout').length
  await waitFor(() => timeoutRetries() >= 1, 'The listener should retry if it receives no server snapshot')
  await waitFor(() => timeoutRetries() >= 2, 'The listener should keep retrying if the first attempt fails')
  assert.equal(phases.at(-1), 'scored')
  await enableNetwork(db)
  await waitFor(() => serverPhase('finished'), 'The listener should catch up without player input or a browser online event')
  assert.equal(phases.at(-1), 'finished')
  assert.equal(hasRoomSyncError(), false)

  stop()
  stop = undefined
  const before = getRoomSyncLog()
  retryRoomSync()
  window.dispatchEvent(new Event('online'))
  assert.equal(getRoomSyncLog(), before, 'Unsubscribed watchers must ignore browser and manual retry events')
  assert.equal(before.includes('diagnostic-test-secret'), false)
  assert.equal(hasRoomSyncError(), false)
  console.log('Room sync listener recovery checks passed')
} finally {
  stop?.()
  await terminate(db)
  await deleteApp(app)
  await store.terminate()
  await adminApp.delete()
}
