process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080'
const admin = require('firebase-admin')
admin.initializeApp({ projectId: 'flock-together-game' })
const db = admin.firestore()
const ME = 'wPycsceumiWbf4U2XAarxo0aRCfv'
async function fix() {
  await db.doc('games/preview-score').update({ status: 'finished' })
  console.log('Fixed')
  process.exit(0)
}
fix().catch(e => { console.error(e.message); process.exit(1) })
