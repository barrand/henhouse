import { randomInt } from 'node:crypto'
import { FieldValue, type DocumentReference, type QuerySnapshot, type Transaction } from 'firebase-admin/firestore'
import { HttpsError } from 'firebase-functions/v2/https'
import type { ScoringState } from './scoringProtocol'

export interface LiveBallot {
  loves: string[]
  boo: string | null
}

export function isLiveGuess(phase: ScoringState['phase']) {
  return phase === 'reveal' || phase === 'guess'
}

export function foldLiveBallots(state: ScoringState, ballots: QuerySnapshot) {
  for (const ballot of ballots.docs) {
    const { loves, boo } = ballot.data() as LiveBallot
    state.love[ballot.id] = loves
    if (boo === null) delete state.boo[ballot.id]
    else state.boo[ballot.id] = boo
  }
}

export async function writeLiveReaction(
  tx: Transaction, roundRef: DocumentReference, state: ScoringState, uid: string, action: 'love' | 'boo', clueId: string | undefined,
) {
  const target = state.groups.find(group => group.id === clueId)
  if (!target || target.authorIds.includes(uid)) throw new HttpsError('invalid-argument', 'Choose another giver’s clue')
  if (state.guesser === uid || !state.shown.includes(target.id)) throw new HttpsError('failed-precondition', 'Choose a shown clue')
  if (action === 'love' && (Date.now() >= state.deadline || state.rules.mode !== 'classic')) {
    throw new HttpsError('failed-precondition', 'Peer love is not available here')
  }

  // Independent voter documents keep live reactions off the scoring state and
  // avoid rewriting every phone’s projection when someone taps a reaction.
  const ballotRef = roundRef.collection('privateReactions').doc(uid)
  const before = (await tx.get(ballotRef)).data() as LiveBallot | undefined
  const ballot: LiveBallot = before ? { ...before } : { loves: [], boo: null }
  let update: Record<string, Record<string, FieldValue>>
  if (action === 'love') {
    const removing = ballot.loves.includes(target.id)
    ballot.loves = removing ? ballot.loves.filter(id => id !== target.id) : [...ballot.loves, target.id]
    update = { loves: { [target.id]: FieldValue.increment(removing ? -1 : 1) } }
  } else {
    const boos: Record<string, FieldValue> = {}
    if (ballot.boo !== null) boos[ballot.boo] = FieldValue.increment(-1)
    ballot.boo = ballot.boo === target.id ? null : target.id
    if (ballot.boo !== null) boos[ballot.boo] = FieldValue.increment(1)
    update = { boos }
  }
  // Each shard contains only count deltas, never a voter identifier. Spreading
  // concurrent increments avoids one hot aggregate document for a big room.
  const shard = roundRef.collection('reactionCounts').doc(String(randomInt(16)))
  tx.set(ballotRef, ballot)
  tx.set(shard, update, { merge: true })
}
