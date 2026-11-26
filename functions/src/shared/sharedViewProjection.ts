import type { DocumentData, DocumentReference, Transaction } from 'firebase-admin/firestore'
import { buildClusters } from '../games/flock-together/answerClusters'
import { effectivePeerLoveVotesFromRound } from '../games/fowl-words/peerLove'
import { ATTEMPT_POINTS } from '../games/fowl-words/scoring'
import { projectScoringView, type ScoringState } from '../games/fowl-words/scoringProtocol'
import { REVEAL_LEAD_MS, type DisplayGame, type FlockDisplayRound, type FowlDisplayRound, type Scores } from './sharedViewModel'

export function gameDisplay(game: DocumentData): DisplayGame | null {
  const kind = game.gameType ?? 'flock-together'
  if (kind !== 'flock-together' && kind !== 'fowl-words' && kind !== 'it-was-you') return null
  return {
    kind, status: game.status, round: game.currentRound ?? 0,
    totalRounds: game.settings?.totalRounds ?? 0,
    guesser: kind === 'fowl-words' ? game.currentGuesser ?? null : null,
    rematchCode: game.rematchCode ?? null,
  }
}

export function displayRoundRef(round: DocumentReference) {
  return round.parent.parent!.collection('sharedRounds').doc(round.id)
}

export function millis(value: number | { toMillis(): number } | undefined): number {
  return typeof value === 'number' ? value : value?.toMillis() ?? 0
}

export function flockDisplay(round: DocumentData, eligible = 0): FlockDisplayRound {
  const scored = round.status === 'scored'
  const { clusters, noAnswerIds } = scored ? buildClusters(round) : { clusters: [], noAnswerIds: [] }
  return {
    kind: 'flock-together', phase: round.status,
    instance: String(round.questionInstance ?? `${round.questionPoolId ?? ''}:${millis(round.deadline)}`),
    question: round.question, options: round.options ?? [], deadline: millis(round.deadline),
    answered: scored ? clusters.reduce((count, group) => count + group.playerIds.length, 0) : round.answerCount ?? 0,
    eligible: round.eligiblePlayerCount ?? round.eligiblePlayerIds?.length ?? eligible,
    revealAt: scored ? round.revealAt ?? 0 : 0, groups: clusters, missing: noAnswerIds,
    points: scored ? round.pointsThisRound ?? {} : {},
    before: round.scoresBefore ?? {}, after: scored ? round.scoresAfter ?? {} : {},
  }
}

export function fowlRevealAt(finishedAt: number | undefined) {
  return finishedAt ? finishedAt + REVEAL_LEAD_MS : 0
}

export function legacyFowlDisplay(round: DocumentData, eligible = 0): FowlDisplayRound {
  const phase = round.status
  const scored = phase === 'scored'
  const guessing = phase === 'reveal' || phase === 'guess'
  const visible = new Set<number>(round.visibleGroupIndexes ?? [])
  const love = Object.values(effectivePeerLoveVotesFromRound(round))
  const boos = Object.values(round.cluePeerBooVotes ?? round.clueThumbsDownVotes ?? {})
  const guesserBoo = round.guesserBooVote ?? round.guesserThumbsDownVote
  const helpful = round.guesserMostHelpfulVote ?? round.guesserStarVote
  const groups = (round.clueGroups ?? []) as { clueTexts: string[]; playerIds: string[]; isDuplicate: boolean }[]
  const attempt = round.currentAttempt ?? 1
  return {
    kind: 'fowl-words', phase, attempt, maxAttempts: round.maxAttempts ?? 1,
    deadline: millis(({ 'word-selection': round.wordSelectionDeadline, 'word-selected': round.wordSelectedDeadline,
      'clue-submission': round.clueSubmissionDeadline, reveal: round.attemptDeadline, guess: round.attemptDeadline } as Record<string, DocumentData[string]>)[phase]),
    selectionOpensAt: millis(round.wordSelectionStartsAt), voters: Object.keys(round.wordVotes ?? {}).length,
    submitted: Object.keys(round.cluesByPlayer ?? {}).length,
    givers: Math.max(0, (round.eligiblePlayerCount ?? round.eligiblePlayerIds?.length ?? eligible) - 1),
    payout: ATTEMPT_POINTS[attempt - 1] ?? 0, processing: guessing && !!round.attemptInProgress,
    bestCluesFirst: false, revealAt: scored ? round.revealAt ?? 0 : 0,
    word: scored ? round.secretWord ?? '' : '', correct: scored && !!round.isCorrect,
    before: round.scoresBefore ?? {}, points: scored ? round.pointsThisRound ?? {} : {},
    clues: scored || guessing ? groups.flatMap((group, index) => {
      const shown = visible.has(index)
      if (!scored && !shown) return []
      const text = scored ? [...new Set(group.clueTexts)].join(' / ') : group.clueTexts[0] ?? ''
      return [{ id: String(index), text, authors: scored ? group.playerIds : [], shown,
        newlyShown: guessing && round.lastUnlockedGroupIndex === index,
        duplicate: scored && group.isDuplicate,
        loves: love.filter(votes => votes[String(index)]).length,
        boos: boos.filter(vote => vote === index).length + Number(scored && guesserBoo === index),
        helpful: scored && helpful === index }]
    }) : [],
  }
}

export function versionedFowlDisplay(state: ScoringState): FowlDisplayRound {
  const view = projectScoringView(state, state.guesser, {})
  const scored = view.phase === 'scored'
  const guessing = view.phase === 'reveal' || view.phase === 'guess'
  return {
    kind: 'fowl-words', phase: view.phase, deadline: view.deadline, selectionOpensAt: view.selectionOpensAt,
    voters: view.wordsVoted, submitted: view.submittedCount, givers: view.giverCount,
    attempt: view.attempt, maxAttempts: view.maxAttempts, payout: view.payout, processing: view.processing,
    bestCluesFirst: view.rules.mode === 'best-clues-first', revealAt: scored ? fowlRevealAt(state.finishedAt) : 0,
    reactionFeed: !!state.reactionFeed,
    word: scored ? view.secretWord : '', correct: scored && view.correct,
    before: state.playerScores, points: scored ? view.scores : {},
    clues: scored || guessing ? view.groups.map(group => ({
      id: group.id, text: group.text, shown: group.shown, authors: scored ? group.authors : [],
      newlyShown: guessing && group.newlyShown, duplicate: scored && group.duplicate,
      loves: group.loves, boos: group.boos, helpful: scored && group.helpful,
    })) : [],
  }
}

export function scoreMap(players: FirebaseFirestore.QuerySnapshot): Scores {
  return Object.fromEntries(players.docs.map(player => [player.id, player.data().score ?? 0]))
}

export function addPoints(before: Scores, points: Scores): Scores {
  const after = { ...before }
  for (const [id, delta] of Object.entries(points)) after[id] = (after[id] ?? 0) + delta
  return after
}

export function writeLegacyFowlResult(transaction: Transaction, ref: DocumentReference, round: DocumentData, result: DocumentData) {
  const data = { ...result, status: 'scored', revealAt: Date.now() + REVEAL_LEAD_MS }
  transaction.update(ref, data)
  transaction.set(displayRoundRef(ref), legacyFowlDisplay({ ...round, ...data }))
}
