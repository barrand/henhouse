import { randomInt } from 'node:crypto'
import { FieldValue, getFirestore, type DocumentReference, type Transaction } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { isRoundEligible } from '../../shared/roundEligibility'
import { prompts } from './prompts'
import { chooseWriters, shuffle, tallyVotes } from './rules'
import {
  AUTHOR_REVEAL_MS, MAX_ANSWER_LENGTH, MIN_ANSWERS, MIN_PLAYERS, VOTING_MS, WRITING_MS,
  type Answer, type PlayerView, type Round, type RoundAction, type VoteCounts,
} from './model'

interface Secret {
  answers: Answer[]
  points: VoteCounts
}

function preview(used: number[], revision: number): { round: Round; used: number[] } {
  const remaining = prompts.flatMap((_, index) => used.includes(index) ? [] : [index])
  if (!remaining.length) throw new HttpsError('failed-precondition', 'All prompts have been played. You can finish the game.')
  const index = remaining[randomInt(remaining.length)]
  return {
    round: {
      phase: 'preview', revision, prompt: prompts[index], canSwap: remaining.length > 1,
      deadline: 0, eligiblePlayerIds: [], writerIds: [], submitted: 0,
      candidateIds: [], answer: null, reveal: null, pointsThisRound: {}, shortRound: false,
    },
    used: [...used, index],
  }
}

function openBallot(round: Round, first: Answer, candidates: string[], now: number): Round {
  const revision = round.revision + 1
  return {
    ...round, phase: 'voting', revision, deadline: now + VOTING_MS,
    answer: { id: String(revision), text: first.text }, candidateIds: candidates, reveal: null,
  }
}

function closeWriting(tx: Transaction, ref: DocumentReference, privateRef: DocumentReference, round: Round, secret: Secret, now: number) {
  if (secret.answers.length < MIN_ANSWERS) {
    tx.set(ref, { ...round, phase: 'standings', revision: round.revision + 1, deadline: 0, shortRound: true })
    return
  }
  const answers = shuffle(secret.answers)
  const candidates = round.writerIds.filter(id => answers.some(answer => answer.authorId === id))
  tx.set(privateRef, { ...secret, answers })
  tx.set(ref, openBallot(round, answers[0], candidates, now))
}

function invalidPhase(): never {
  throw new HttpsError('failed-precondition', 'That part of the round has already closed.')
}

function requireHost(isHost: boolean) {
  if (!isHost) throw new HttpsError('permission-denied', 'Only the host can do that.')
}

export const itWasYouRoundAction = onCall(async request => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Must be signed in')
  const input = request.data as (RoundAction & { early?: boolean }) | undefined
  if (!input || typeof input.gameId !== 'string' || !/^[A-Za-z0-9]+$/.test(input.gameId)
      || !Number.isInteger(input.roundNum) || input.roundNum < 0 || !Number.isInteger(input.revision)) {
    throw new HttpsError('invalid-argument', 'Missing game or round.')
  }

  const gameRef = getFirestore().collection('games').doc(input.gameId)
  return getFirestore().runTransaction(async tx => {
    const game = (await tx.get(gameRef)).data()
    if (game?.gameType !== 'it-was-you') throw new HttpsError('not-found', 'Room not found.')
    if (!game.playerIds.includes(uid)) throw new HttpsError('permission-denied', 'Join the room first.')
    const host = game.hostId === uid
    const ref = gameRef.collection('rounds').doc(String(input.roundNum))
    const privateRef = ref.collection('private').doc('state')
    const viewRef = ref.collection('views').doc(uid)
    const round = game.currentRound === input.roundNum && input.roundNum > 0
      ? (await tx.get(ref)).data() as Round | undefined : undefined
    const now = Date.now()

    if (input.action === 'abandon') {
      requireHost(host)
      if (game.status !== 'lobby' && game.status !== 'playing') return
      const roomRef = getFirestore().collection('rooms').doc(game.code)
      const room = (await tx.get(roomRef)).data()
      if (room?.gameId === gameRef.id) tx.update(roomRef, { active: false })
      tx.update(gameRef, { status: 'abandoned' })
      return
    }

    if (input.action === 'preview') {
      requireHost(host)
      if (game.currentRound !== input.roundNum) return
      if (game.status === 'lobby' || (game.status === 'playing' && round?.phase === 'standings' && round.revision === input.revision)) {
        const next = preview(game.usedPrompts ?? [], 1)
        tx.create(gameRef.collection('rounds').doc(String(input.roundNum + 1)), next.round)
        tx.update(gameRef, { currentRound: input.roundNum + 1, status: 'playing', usedPrompts: next.used })
      }
      return
    }

    if (game.status !== 'playing' || !round || round.revision !== input.revision) {
      if (input.action === 'vote' || input.action === 'submit') invalidPhase()
      return
    }

    switch (input.action) {
      case 'swap': {
        requireHost(host)
        if (round.phase !== 'preview') return
        const next = preview(game.usedPrompts ?? [], round.revision + 1)
        tx.set(ref, next.round)
        tx.update(gameRef, { usedPrompts: next.used })
        return
      }
      case 'write': {
        requireHost(host)
        if (round.phase !== 'preview') return
        const players = await tx.get(gameRef.collection('players').where('connected', '==', true))
        const connected = players.docs.filter(player => game.playerIds.includes(player.id))
        const eligiblePlayerIds = connected.map(player => player.id)
        if (eligiblePlayerIds.length < MIN_PLAYERS) throw new HttpsError('failed-precondition', 'At least four connected players are needed.')
        const writerIds = chooseWriters(eligiblePlayerIds, Object.fromEntries(connected.map(player => [player.id, player.data().writingOpportunities ?? 0])))
        for (const id of writerIds) tx.update(gameRef.collection('players').doc(id), { writingOpportunities: FieldValue.increment(1) })
        tx.create(privateRef, { answers: [], points: {} } satisfies Secret)
        tx.set(ref, { ...round, phase: 'writing', revision: round.revision + 1, deadline: now + WRITING_MS, eligiblePlayerIds, writerIds })
        return
      }
      case 'submit': {
        if (round.phase !== 'writing' || now >= round.deadline) invalidPhase()
        if (!round.writerIds.includes(uid)) throw new HttpsError('permission-denied', 'You are not writing this round.')
        const text = typeof input.text === 'string' ? input.text.trim() : ''
        if (!text || text.length > MAX_ANSWER_LENGTH) throw new HttpsError('invalid-argument', 'Write an answer of 1–140 characters.')
        const secret = (await tx.get(privateRef)).data() as Secret
        const own = secret.answers.find(answer => answer.authorId === uid)
        if (own?.text === text) return
        if (own) throw new HttpsError('already-exists', 'Your answer is already in.')
        if (secret.answers.some(answer => answer.text.toLowerCase() === text.toLowerCase())) {
          throw new HttpsError('already-exists', 'Someone wrote that too. Try another answer!')
        }
        secret.answers.push({ authorId: uid, text })
        tx.set(viewRef, { submittedText: text }, { merge: true })
        const updated = { ...round, submitted: secret.answers.length }
        if (secret.answers.length === round.writerIds.length) {
          closeWriting(tx, ref, privateRef, updated, secret, now)
        } else {
          tx.set(privateRef, secret)
          tx.update(ref, { submitted: updated.submitted })
        }
        return
      }
      case 'vote': {
        if (round.phase !== 'voting' || round.answer?.id !== input.answerId || now >= round.deadline) invalidPhase()
        if (!isRoundEligible(round, game, uid)) throw new HttpsError('permission-denied', 'You can vote next round.')
        if (typeof input.candidateId !== 'string' || !round.candidateIds.includes(input.candidateId)) {
          throw new HttpsError('invalid-argument', 'Choose one of the remaining players.')
        }
        const previous = (await tx.get(viewRef)).data() as PlayerView | undefined
        const previousCandidate = previous?.answerId === input.answerId ? previous?.candidateId : undefined
        if (previousCandidate === input.candidateId) return
        const counts = { [input.candidateId]: FieldValue.increment(1) }
        if (previousCandidate) counts[previousCandidate] = FieldValue.increment(-1)
        const shard = ref.collection('voteFeeds').doc(round.answer!.id).collection('shards').doc(String(randomInt(16)))
        tx.set(viewRef, { answerId: input.answerId, candidateId: input.candidateId }, { merge: true })
        tx.set(shard, { counts, voted: FieldValue.increment(previousCandidate ? 0 : 1), voters: { [uid]: true } }, { merge: true })
        return
      }
      case 'close': {
        if (round.phase !== 'writing' && round.phase !== 'voting') return
        if (now < round.deadline) {
          if (!input.early) throw new HttpsError('failed-precondition', 'The timer is still running.')
          requireHost(host)
        }
        const secret = (await tx.get(privateRef)).data() as Secret
        if (round.phase === 'writing') {
          if (now < round.deadline && secret.answers.length < MIN_ANSWERS) {
            throw new HttpsError('failed-precondition', 'Wait for at least three answers.')
          }
          closeWriting(tx, ref, privateRef, round, secret, now)
          return
        }

        const ballots = await tx.get(ref.collection('views').where('answerId', '==', round.answer!.id))
        if (now < round.deadline && ballots.empty) throw new HttpsError('failed-precondition', 'Wait for at least one vote.')
        const authorId = secret.answers[0].authorId
        const { counts, leaders, points } = tallyVotes(ballots.docs.map(ballot => ({
          voterId: ballot.id, candidateId: ballot.data().candidateId as string,
        })), authorId)
        for (const [id, pointsEarned] of Object.entries(points)) {
          secret.points[id] = (secret.points[id] ?? 0) + pointsEarned
          tx.update(gameRef.collection('players').doc(id), { score: FieldValue.increment(pointsEarned) })
        }
        tx.set(privateRef, secret)
        tx.set(ref, {
          ...round, phase: 'reveal', revision: round.revision + 1, deadline: 0,
          reveal: { authorId, leaders, counts, revealAt: now + AUTHOR_REVEAL_MS, automatic: false },
        })
        return
      }
      case 'advance': {
        requireHost(host)
        if (round.phase !== 'reveal' || now < round.reveal!.revealAt) return
        const secret = (await tx.get(privateRef)).data() as Secret
        const answers = secret.answers.slice(1)
        if (!answers.length) {
          tx.set(ref, { ...round, phase: 'standings', revision: round.revision + 1, pointsThisRound: secret.points, answer: null, reveal: null })
          return
        }
        const candidates = round.candidateIds.filter(id => id !== round.reveal!.authorId)
        tx.set(privateRef, { ...secret, answers })
        if (answers.length > 1) {
          tx.set(ref, openBallot(round, answers[0], candidates, now))
        } else {
          tx.set(ref, {
            ...round, revision: round.revision + 1, candidateIds: candidates,
            answer: { id: String(round.revision + 1), text: answers[0].text },
            reveal: { authorId: answers[0].authorId, leaders: [], counts: {}, revealAt: now, automatic: true },
          })
        }
        return
      }
      case 'finish': {
        requireHost(host)
        if (round.phase === 'standings') tx.update(gameRef, { status: 'finished' })
        return
      }
      default:
        throw new HttpsError('invalid-argument', 'Unknown action.')
    }
  })
})
