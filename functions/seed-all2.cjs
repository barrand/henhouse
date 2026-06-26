process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080'
const admin = require('firebase-admin')
admin.initializeApp({ projectId: 'flock-together-game' })
const db = admin.firestore()
const now = Math.floor(Date.now() / 1000)
const ME = '3EDvfK6bWPyH3FKGcTZE7Nx9b5wq'

async function seed() {
  // LOBBY
  await db.doc('rooms/LOBBY').set({ gameId: 'preview-lobby', active: true })
  await db.doc('games/preview-lobby').set({
    id: 'preview-lobby', code: 'LOBBY', gameType: 'flock-together',
    hostId: ME, originalHostId: ME, status: 'lobby', currentRound: 0,
    playerIds: [ME, 'p2', 'p3'],
    settings: { totalRounds: 10, secondsPerRound: 60 },
    rottenEggHolder: null, categories: ['Movies', 'Sports'], includePatrioticQuestions: false,
  })
  await db.doc('games/preview-lobby/players/' + ME).set({ id: ME, name: 'Alice', connected: true, eggs: 0 })
  await db.doc('games/preview-lobby/players/p2').set({ id: 'p2', name: 'Bob', connected: true, eggs: 0 })
  await db.doc('games/preview-lobby/players/p3').set({ id: 'p3', name: 'Carol', connected: false, eggs: 0 })

  // QUESTION answering (no functions running = won't auto-score)
  await db.doc('rooms/QUEST').set({ gameId: 'preview-quest', active: true })
  await db.doc('games/preview-quest').set({
    id: 'preview-quest', code: 'QUEST', gameType: 'flock-together',
    hostId: ME, originalHostId: ME, status: 'playing', currentRound: 3,
    playerIds: [ME, 'p2', 'p3', 'p4'],
    settings: { totalRounds: 10, secondsPerRound: 60 },
    rottenEggHolder: 'p3', categories: [], includePatrioticQuestions: false,
  })
  await db.doc('games/preview-quest/players/' + ME).set({ id: ME, name: 'Alice', connected: true, eggs: 2 })
  await db.doc('games/preview-quest/players/p2').set({ id: 'p2', name: 'Bob', connected: true, eggs: 1 })
  await db.doc('games/preview-quest/players/p3').set({ id: 'p3', name: 'Carol', connected: true, eggs: 0 })
  await db.doc('games/preview-quest/players/p4').set({ id: 'p4', name: 'Dave', connected: true, eggs: 3 })
  await db.doc('games/preview-quest/rounds/3').set({
    id: 'r3', question: 'What do people always forget to bring to a party?',
    source: 'preset', type: 'open', status: 'answering',
    deadline: { seconds: now + 300, nanoseconds: 0 },
    answerCount: 2, answeredPlayerIds: ['p2', 'p3'],
    answerGroups: [], flockAnswer: [], results: {}, playerAnswers: {}, commentary: '',
  })

  // REVEAL
  await db.doc('rooms/REVL').set({ gameId: 'preview-revl', active: true })
  await db.doc('games/preview-revl').set({
    id: 'preview-revl', code: 'REVL', gameType: 'flock-together',
    hostId: ME, originalHostId: ME, status: 'playing', currentRound: 3,
    playerIds: [ME, 'p2', 'p3', 'p4'],
    settings: { totalRounds: 10, secondsPerRound: 60 },
    rottenEggHolder: 'p3', categories: [], includePatrioticQuestions: false,
  })
  await db.doc('games/preview-revl/players/' + ME).set({ id: ME, name: 'Alice', connected: true, eggs: 3 })
  await db.doc('games/preview-revl/players/p2').set({ id: 'p2', name: 'Bob', connected: true, eggs: 1 })
  await db.doc('games/preview-revl/players/p3').set({ id: 'p3', name: 'Carol', connected: true, eggs: 0 })
  await db.doc('games/preview-revl/players/p4').set({ id: 'p4', name: 'Dave', connected: true, eggs: 4 })
  await db.doc('games/preview-revl/rounds/3').set({
    id: 'r3', question: 'What do people always forget to bring to a party?',
    source: 'preset', type: 'open', status: 'scored',
    deadline: { seconds: now - 10, nanoseconds: 0 },
    answerCount: 4, answeredPlayerIds: [ME, 'p2', 'p3', 'p4'],
    answerGroups: [],
    flockAnswer: ['Gift'],
    results: { [ME]: 'flock', p2: 'outlier', p3: 'rotten', p4: 'flock' },
    playerAnswers: { [ME]: 'Gift', p2: 'Their phone', p3: 'Phone', p4: 'Gift' },
    commentary: "Apparently everyone forgets gifts!",
  })

  // SCOREBOARD (finished)
  await db.doc('rooms/SCORE').set({ gameId: 'preview-score', active: true })
  await db.doc('games/preview-score').set({
    id: 'preview-score', code: 'SCORE', gameType: 'flock-together',
    hostId: ME, originalHostId: ME, status: 'finished', currentRound: 10,
    playerIds: [ME, 'p2', 'p3', 'p4'],
    settings: { totalRounds: 10, secondsPerRound: 60 },
    rottenEggHolder: 'p2', categories: [], includePatrioticQuestions: false,
  })
  await db.doc('games/preview-score/players/' + ME).set({ id: ME, name: 'Alice', connected: true, eggs: 6 })
  await db.doc('games/preview-score/players/p2').set({ id: 'p2', name: 'Bob', connected: true, eggs: 2 })
  await db.doc('games/preview-score/players/p3').set({ id: 'p3', name: 'Carol', connected: true, eggs: 4 })
  await db.doc('games/preview-score/players/p4').set({ id: 'p4', name: 'Dave', connected: true, eggs: 7 })

  console.log('All seeded!')
  process.exit(0)
}
seed().catch(e => { console.error(e.message); process.exit(1) })
