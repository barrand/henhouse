import { initializeApp, deleteApp } from 'firebase/app'
import { getAuth, connectAuthEmulator, signInAnonymously } from 'firebase/auth'
import { getFirestore, connectFirestoreEmulator, doc, getDoc } from 'firebase/firestore'
import { getFunctions, connectFunctionsEmulator, httpsCallable } from 'firebase/functions'

const host = process.env.JEV_EMULATOR_HOST ?? '127.0.0.1'
const projectId = process.env.JEV_EMULATOR_PROJECT_ID ?? 'flock-together-game'
if (!['127.0.0.1', 'localhost', '::1'].includes(host)) throw new Error(`non-loopback host rejected: ${host}`)

async function actor(label) {
  const app = initializeApp({ apiKey: 'jev-validation-local-only', projectId, appId: `jev-validation-${label}-${Date.now()}-${Math.random()}` }, label)
  const auth = getAuth(app)
  const db = getFirestore(app)
  const functions = getFunctions(app, 'us-central1')
  connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true })
  connectFirestoreEmulator(db, host, 8080)
  connectFunctionsEmulator(functions, host, 5001)
  await signInAnonymously(auth)
  return {
    db,
    call: async (name, data) => (await httpsCallable(functions, name)(data)).data,
    close: () => deleteApp(app),
  }
}

async function createAndJoin(gameType) {
  const gameHost = await actor(`${gameType}-host`)
  const player = await actor(`${gameType}-player`)
  try {
    const create = gameType === 'flock-together' ? 'flockCreateGame' : 'fowlWordsCreateGame'
    const created = await gameHost.call(create, { playerName: 'Validation Host', includePatrioticQuestions: false })
    if (!created?.gameId || !created?.code) throw new Error(`${gameType}: create callable returned no gameId/code`)
    const joined = await player.call('joinGame', { code: created.code, playerName: 'Validation Player' })
    if (joined.gameId !== created.gameId || joined.gameType !== gameType) throw new Error(`${gameType}: join callable returned the wrong room`)
    const game = await getDoc(doc(gameHost.db, 'games', created.gameId))
    if (!game.exists() || game.data().status !== 'lobby') throw new Error(`${gameType}: game was not persisted in the emulator`)
    if (!game.data().playerIds || game.data().playerIds.length !== 2) throw new Error(`${gameType}: expected two joined players`)
    return { gameType, gameId: created.gameId, code: created.code }
  } finally {
    await Promise.all([gameHost.close(), player.close()])
  }
}

const games = []
games.push(await createAndJoin('flock-together'))
games.push(await createAndJoin('fowl-words'))
process.stdout.write(`${JSON.stringify({ status: 'pass', games })}\n`)
