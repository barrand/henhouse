import { FieldValue, type DocumentData, type DocumentReference, type Transaction } from 'firebase-admin/firestore'
import { displayRoundRef, flockDisplay, scoreMap, addPoints } from '../../shared/sharedViewProjection'
import { REVEAL_LEAD_MS, type Scores } from '../../shared/sharedViewModel'

export async function publishFlockScore(tx: Transaction, roundRef: DocumentReference, round: DocumentData, result: DocumentData) {
  const players = roundRef.parent.parent!.collection('players')
  const before = scoreMap(await tx.get(players))
  const points = result.pointsThisRound as Scores
  const data = { ...result, status: 'scored', revealAt: Date.now() + REVEAL_LEAD_MS,
    scoresBefore: before, scoresAfter: addPoints(before, points) }
  tx.update(roundRef, data)
  tx.set(displayRoundRef(roundRef), flockDisplay({ ...round, ...data }))
  for (const [id, delta] of Object.entries(points)) {
    if (delta) tx.update(players.doc(id), { score: FieldValue.increment(delta) })
  }
}
