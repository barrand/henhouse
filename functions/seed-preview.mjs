// Seed preview data into Firestore emulator for UI screenshots
import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080'

initializeApp({ projectId: 'flock-together-game', credential: { getAccessToken: () => ({ access_token: 'owner', expires_in: 9999 }) } })
const db = getFirestore()

const now = Math.floor(Date.now() / 1000)

async function seed() {
  // ── LOBBY ──────────────────────────────────────────────────────────────
  await db.doc('rooms/LOBBY').set({ gameId: 'preview-lobby', active: true })
  await db.doc('games/preview-lobby').set({
    id: 'preview-lobby', code: 'LOBBY', gameType: 'flock-together',
    hostId: 'p1', originalHostId: 'p1', status: 'lobby', currentRound: 0,
    playerIds: ['p1', 'p2', 'p3'],
    settings: { totalRounds: 10, secondsPerRound: 60 },
    rottenEggHolder: null, categories: ['Movies', 'Sports'], includePatrioticQuestions: false,
  })
  for (const [id, name, conn] of [['p1','Alice',true],['p2','Bob',true],['p3','Carol',false]]) {
    await db.doc(`games/preview-lobby/players/${id}`).set({ id, name, connected: conn, eggs: 0 })
  }

  // ── QUESTION / ANSWERING ───────────────────────────────────────────────
  await db.doc('rooms/QUEST').set({ gameId: 'preview-quest', active: true })
  await db.doc('games/preview-quest').set({
    id: 'preview-quest', code: 'QUEST', gameType: 'flock-together',
    hostId: 'p1', originalHostId: 'p1', status: 'playing', currentRound: 3,
    playerIds: ['p1', 'p2', 'p3', 'p4'],
    settings: { totalRounds: 10, secondsPerRound: 60 },
    rottenEggHolder: 'p3', categories: [], includePatrioticQuestions: false,
  })
  for (const [id, name, eggs] of [['p1','Alice',2],['p2','Bob',1],['p3','Carol',0],['p4','Dave',3]]) {
    await db.doc(`games/preview-quest/players/${id}`).set({ id, name, connected: true, eggs })
  }
  await db.doc('games/preview-quest/rounds/3').set({
    id: 'r3', question: 'What do people always forget to bring to a party?',
    source: 'preset', type: 'open', status: 'answering',
    deadline: { seconds: now + 45, nanoseconds: 0 },
    answerCount: 2, answeredPlayerIds: ['p1', 'p2'],
    answerGroups: [], flockAnswer: [], results: {}, playerAnswers: {},
  })

  // ── REVEAL BOARD ───────────────────────────────────────────────────────
  await db.doc('rooms/REVL').set({ gameId: 'preview-revl', active: true })
  await db.doc('games/preview-revl').set({
    id: 'preview-revl', code: 'REVL', gameType: 'flock-together',
    hostId: 'p1', originalHostId: 'p1', status: 'playing', currentRound: 3,
    playerIds: ['p1', 'p2', 'p3', 'p4'],
    settings: { totalRounds: 10, secondsPerRound: 60 },
    rottenEggHolder: 'p3', categories: [], includePatrioticQuestions: false,
  })
  for (const [id, name, eggs] of [['p1','Alice',2],['p2','Bob',1],['p3','Carol',0],['p4','Dave',3]]) {
    await db.doc(`games/preview-revl/players/${id}`).set({ id, name, connected: true, eggs })
  }
  await db.doc('games/preview-revl/rounds/3').set({
    id: 'r3', question: 'What do people always forget to bring to a party?',
    source: 'preset', type: 'open', status: 'scored',
    deadline: { seconds: now - 10, nanoseconds: 0 },
    answerCount: 4, answeredPlayerIds: ['p1', 'p2', 'p3', 'p4'],
    answerGroups: [['Gift'], ['Their phone', 'Phone'], ['ID']],
    flockAnswer: ['Gift'],
    results: { p1: 'flock', p2: 'outlier', p3: 'rotten', p4: 'flock' },
    playerAnswers: { p1: 'Gift', p2: 'Their phone', p3: 'Phone', p4: 'Gift' },
    commentary: "Apparently everyone forgets gifts!",
  })

  // ── SCOREBOARD (mid-game) ──────────────────────────────────────────────
  await db.doc('rooms/SCORE').set({ gameId: 'preview-score', active: true })
  await db.doc('games/preview-score').set({
    id: 'preview-score', code: 'SCORE', gameType: 'flock-together',
    hostId: 'p1', originalHostId: 'p1', status: 'playing', currentRound: 5,
    playerIds: ['p1', 'p2', 'p3', 'p4'],
    settings: { totalRounds: 10, secondsPerRound: 60 },
    rottenEggHolder: 'p2', categories: [], includePatrioticQuestions: false,
  })
  for (const [id, name, eggs] of [['p1','Alice',4],['p2','Bob',2],['p3','Carol',1],['p4','Dave',5]]) {
    await db.doc(`games/preview-score/players/${id}`).set({ id, name, connected: true, eggs })
  }

  console.log('✓ All preview data seeded')
}

seed().catch(console.error)
