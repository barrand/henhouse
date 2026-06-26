process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080'
const admin = require('firebase-admin')
admin.initializeApp({ projectId: 'flock-together-game' })
const db = admin.firestore()
const now = Math.floor(Date.now() / 1000)
const ME = 'wPycsceumiWbf4U2XAarxo0aRCfv'

async function seed() {
  // Reset QUEST round to answering status with a far-future deadline
  await db.doc('games/preview-quest/rounds/3').set({
    id: 'r3', question: 'What do people always forget to bring to a party?',
    source: 'preset', type: 'open', status: 'answering',
    deadline: { seconds: now + 300, nanoseconds: 0 },
    answerCount: 2, answeredPlayerIds: ['p2', 'p3'],
    answerGroups: [], flockAnswer: [], results: {}, playerAnswers: {},
    commentary: '',
  })
  console.log('Done')
  process.exit(0)
}
seed().catch(e => { console.error(e.message); process.exit(1) })
