import * as admin from 'firebase-admin'
import { FieldValue } from 'firebase-admin/firestore'

function getDb() {
  return admin.firestore()
}

/**
 * Claims a unique room code for the given gameId.
 * Uses a transaction to prevent race conditions with concurrent game creation.
 * The room doc gets `gameType` so clients can route to the correct game module on join.
 */
export async function claimRoomCode(
  gameId: string,
  gameType: string,
): Promise<string> {
  const db = getDb()
  const roomWords = (await import('../data/roomWords.json')).default as string[]

  let code = ''
  let attempts = 0
  while (attempts < 50) {
    const candidate = roomWords[Math.floor(Math.random() * roomWords.length)].toUpperCase()
    const roomRef = db.collection('rooms').doc(candidate)
    try {
      await db.runTransaction(async (tx) => {
        const roomSnap = await tx.get(roomRef)
        if (roomSnap.exists && roomSnap.data()?.active) throw new Error('taken')
        tx.set(roomRef, {
          gameId,
          gameType,
          createdAt: FieldValue.serverTimestamp(),
          active: true,
        })
      })
      code = candidate
      break
    } catch (err: any) {
      if (err?.message === 'taken') attempts++
      else { console.error('Room claim error:', err); attempts++ }
    }
  }

  if (!code) throw new Error('Could not generate room code')
  return code
}

/**
 * Deactivates a room code so it can no longer be joined.
 */
export async function releaseRoomCode(code: string): Promise<void> {
  const db = getDb()
  await db.collection('rooms').doc(code).update({ active: false })
}
