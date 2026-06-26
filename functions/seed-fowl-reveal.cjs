// Seeds a Fowl Words game in the 'reveal' phase for preview.
// Browser user (3EDvfK6bWPyH3FKGcTZE7Nx9b5wq) is a giver named Alice.
process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080'
const admin = require('firebase-admin')
admin.initializeApp({ projectId: 'flock-together-game' })
const db = admin.firestore()

const BROWSER_UID = '3EDvfK6bWPyH3FKGcTZE7Nx9b5wq' // Alice (current browser user — giver)
const GUESSER_UID = 'p-bob'

async function seed() {
  const gameId = 'preview-fowl-reveal'

  // Room code → game
  await db.doc('rooms/FOWL').set({ gameId, active: true, gameType: 'fowl-words' })

  // Game doc
  await db.doc(`games/${gameId}`).set({
    code: 'FOWL',
    gameType: 'fowl-words',
    hostId: BROWSER_UID,
    originalHostId: BROWSER_UID,
    status: 'playing',
    currentRound: 1,
    currentGuesser: GUESSER_UID,
    cardsRemaining: [],
    playerIds: [BROWSER_UID, GUESSER_UID, 'p-carol', 'p-dave', 'p-enrique', 'p-frank'],
    settings: { totalRounds: 10, secondsPerRound: 60, autoAdvanceSeconds: 10 },
  })

  // Players
  const players = [
    { id: BROWSER_UID, name: 'Alice', score: 14, connected: true },
    { id: GUESSER_UID,  name: 'Bob',   score: 10, connected: true },
    { id: 'p-carol',   name: 'Carol',  score: 18, connected: true },
    { id: 'p-dave',    name: 'Dave',   score: 6,  connected: true },
    { id: 'p-enrique', name: 'Enrique',score: 22, connected: true },
    { id: 'p-frank',   name: 'Frank',  score: 8,  connected: false },
  ]
  for (const p of players) {
    await db.doc(`games/${gameId}/players/${p.id}`).set(p)
  }

  // Round 1 — reveal phase
  // Secret word: CAMPFIRE
  // Clue groups:
  //   0: smoke      (Alice = browser user) — VISIBLE
  //   1: flame      (Carol)                — VISIBLE
  //   2: marshmallow/Marshmallow (Dave, Frank) — ELIMINATED duplicate
  //   3: hot        (Enrique)              — VISIBLE
  //   4: campsite   (Carol)... wait Carol already in 1
  //   Let me redo: each player submits ONE clue
  //   Alice → smoke (group 0)
  //   Carol → flame (group 1)
  //   Dave  → marshmallow (group 2, dup)
  //   Enrique → hot (group 3)
  //   Frank → marshmallow (group 2, dup with Dave)
  //   Bob is guesser — no clue
  await db.doc(`games/${gameId}/rounds/1`).set({
    secretWord: 'campfire',
    status: 'reveal',
    currentAttempt: 1,
    maxAttempts: 3, // 3 visible groups
    attemptInProgress: false,
    wordOptions: ['campfire', 'volcano', 'lantern'],
    wordVotes: {},
    cluesByPlayer: {
      [BROWSER_UID]: 'smoke',
      'p-carol':     'flame',
      'p-dave':      'marshmallow',
      'p-enrique':   'hot',
      'p-frank':     'Marshmallow',
    },
    clueGroups: [
      { playerIds: [BROWSER_UID], clueTexts: ['smoke'],                    isDuplicate: false },
      { playerIds: ['p-carol'],   clueTexts: ['flame'],                    isDuplicate: false },
      { playerIds: ['p-dave', 'p-frank'], clueTexts: ['marshmallow', 'Marshmallow'], isDuplicate: true },
      { playerIds: ['p-enrique'], clueTexts: ['hot'],                      isDuplicate: false },
    ],
    // Visible = non-duplicate groups
    visibleGroupIndexes: [0, 1, 3],
    lastUnlockedGroupIndex: null,
    eliminationReason: 'marshmallow / Marshmallow matched',
    guessAttempts: [],
    guesserAnswer: null,
    isCorrect: null,
    tentativePoints: {},
    pointsThisRound: {},
    eligiblePlayerCount: 6,
    // Some pre-existing votes to show count badges
    clueStarVotes: {
      'p-carol':   3,   // Carol 👍'd group 3 (hot by Enrique)
      'p-enrique': 0,   // Enrique 👍'd group 0 (smoke by Alice)
    },
    clueThumbsDownVotes: {
      'p-dave': 1,      // Dave 👎'd group 1 (flame by Carol)
    },
    guesserStarVote: null,
    guesserThumbsDownVote: null,
  })

  console.log('✅ Seeded Fowl Words reveal game — navigate to /fowl-words/FOWL')
}

seed().catch(console.error).finally(() => process.exit())
