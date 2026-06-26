process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080'
const admin = require('firebase-admin')
admin.initializeApp({ projectId: 'flock-together-game' })
const db = admin.firestore()
async function check() {
  const snap = await db.doc('games/preview-quest/rounds/3').get()
  console.log(JSON.stringify({ exists: snap.exists, data: snap.data() }, null, 2))
  process.exit(0)
}
check().catch(e => { console.error(e.message); process.exit(1) })
