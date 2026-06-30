import * as admin from 'firebase-admin'
import { Timestamp } from 'firebase-admin/firestore'
import { wordKey } from './deck'

const COOLDOWN_MS = 48 * 60 * 60 * 1000

function cooldownCollection(originalHostId: string) {
  return admin.firestore()
    .collection('fowlWordsWordCooldowns')
    .doc(originalHostId)
    .collection('words')
}

export function isFowlWordCooldownActive(expiresAtMillis: number, nowMillis: number = Date.now()): boolean {
  return expiresAtMillis > nowMillis
}

export async function fetchActiveFowlWordCooldowns(originalHostId: string): Promise<Set<string>> {
  const now = Timestamp.fromMillis(Date.now())
  const snap = await cooldownCollection(originalHostId)
    .where('expiresAt', '>', now)
    .get()

  return new Set(snap.docs.map((doc) => doc.id))
}

export function addFowlWordCooldownWrites(
  batch: FirebaseFirestore.WriteBatch,
  originalHostId: string,
  words: string[],
  nowMillis: number = Date.now(),
): void {
  const lastUsedAt = Timestamp.fromMillis(nowMillis)
  const expiresAt = Timestamp.fromMillis(nowMillis + COOLDOWN_MS)
  const seenKeys = new Set<string>()

  for (const word of words) {
    const key = wordKey(word)
    if (!key || seenKeys.has(key)) continue
    seenKeys.add(key)
    batch.set(cooldownCollection(originalHostId).doc(key), {
      word,
      lastUsedAt,
      expiresAt,
    })
  }
}
