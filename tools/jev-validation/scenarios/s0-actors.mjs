import { createRequire } from 'node:module'
import { initializeApp, deleteApp } from 'firebase/app'
import { getAuth, connectAuthEmulator, signInAnonymously } from 'firebase/auth'
import { getFirestore, connectFirestoreEmulator, doc, getDoc, updateDoc, setDoc } from 'firebase/firestore'
import { getFunctions, connectFunctionsEmulator, httpsCallable } from 'firebase/functions'

const require = createRequire(import.meta.url)
const admin = require('../../../functions/node_modules/firebase-admin')
const host = '127.0.0.1'
const projectId = 'flock-together-game'
process.env.FIRESTORE_EMULATOR_HOST = host + ':8080'
admin.initializeApp({ projectId })

async function actor(label) {
  const app = initializeApp({ apiKey: 'jev-validation-local-only', projectId, appId: 'jev-s0-' + label + '-' + Date.now() }, label)
  const auth = getAuth(app); const db = getFirestore(app); const functions = getFunctions(app, 'us-central1')
  connectAuthEmulator(auth, 'http://' + host + ':9099', { disableWarnings: true }); connectFirestoreEmulator(db, host, 8080); connectFunctionsEmulator(functions, host, 5001)
  const credential = await signInAnonymously(auth)
  return { uid: credential.user.uid, db, call: async (name, data) => (await httpsCallable(functions, name)(data)).data, close: () => deleteApp(app) }
}
async function mustReject(action, label) { try { await action(); throw new Error(label + ' unexpectedly succeeded') } catch (error) { if (String(error.message).includes('unexpectedly succeeded')) throw error } }
const gameHost = await actor('host'); const guest = await actor('guest')
try {
  const legacy = await gameHost.call('flockCreateGame', { playerName: 'Legacy host' })
  const legacyDoc = await getDoc(doc(gameHost.db, 'games', legacy.gameId))
  if (legacyDoc.data()?.aiExperiment?.mode !== 'legacy') throw new Error('normal game was not stamped legacy')
  await mustReject(() => gameHost.call('flockCreateGame', { playerName: 'Blocked host', experimental: true }), 'disabled experimental create')
  await admin.firestore().doc('aiExperimentConfig/jev').set({ admissionEnabled: true, allowedHostUids: [gameHost.uid], mode: 'jev', approvedConfigVersion: 'jev-v1', enabledOperations: { clue: true, guess: true, grouping: true } })
  const experimental = await gameHost.call('flockCreateGame', { playerName: 'Experimental host', experimental: true })
  const joined = await guest.call('joinGame', { code: experimental.code, playerName: 'Experimental guest' })
  if (joined.gameId !== experimental.gameId) throw new Error('guest did not join experimental game')
  const experimentalRef = doc(gameHost.db, 'games', experimental.gameId)
  if ((await getDoc(experimentalRef)).data()?.aiExperiment?.mode !== 'jev') throw new Error('server did not select Jev mode')
  await mustReject(() => updateDoc(experimentalRef, { aiExperiment: { mode: 'legacy' } }), 'client experiment mutation')
  await mustReject(() => setDoc(doc(gameHost.db, 'aiExperimentConfig', 'jev'), { admissionEnabled: true }), 'client config mutation')
  await mustReject(() => getDoc(doc(gameHost.db, 'aiExperimentConfig', 'jev')), 'client config read')
  await admin.firestore().doc('games/' + experimental.gameId).update({ status: 'finished' })
  await admin.firestore().doc('aiExperimentConfig/jev').update({ admissionEnabled: false })
  await mustReject(() => gameHost.call('flockRematch', { gameId: experimental.gameId }), 'disabled experimental rematch')
  process.stdout.write(JSON.stringify({ status: 'pass', gameId: experimental.gameId }) + '\n')
} finally { await Promise.all([gameHost.close(), guest.close()]); await admin.app().delete() }
