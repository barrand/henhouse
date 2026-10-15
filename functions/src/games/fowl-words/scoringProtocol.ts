import type { PointPart, ScoringGroup, ScoringRules } from './rules'

export type ScoringPhase = 'word-selection' | 'word-selected' | 'clue-submission' | 'clue-voting' | 'deduplication' | 'reveal' | 'guess' | 'scored'
export interface BoardClue { id: string; text: string; author: string; at: number }
export interface AttemptEvent { attempt: number; kind: 'guess' | 'skip' | 'timeout' | 'give-up'; text?: string; correct?: boolean }
export interface ScoringState {
  version: 1; roundNum: number; rules: ScoringRules; eligible: string[]; guesser: string;
  phase: ScoringPhase; startedAt: number; deadline: number; selectionOpensAt: number;
  wordOptions: string[]; wordVotes: Record<string, number>; secretWord: string;
  clues: BoardClue[]; rankingVotes: Record<string, string[]>; love: Record<string, string[]>;
  boo: Record<string, string>; helpful: string | null; groups: ScoringGroup[]; queue: string[];
  schedule: number[]; attempt: number; maxAttempts: number; shown: string[]; newlyShown: string[];
  history: AttemptEvent[]; scores: Record<string, number>; breakdown: Record<string, PointPart[]>;
  correct: boolean; playerScores: Record<string, number>; claim?: { id: string; expires: number; attempt: number };
  phaseClaim?: { id: string; expires: number }; finishedAt?: number;
}

export interface ScoringView {
  phase: ScoringPhase; rules: ScoringRules; roundNum: number; guesser: boolean; participating: boolean;
  startedAt: number; deadline: number; selectionOpensAt: number;
  wordOptions: string[]; myWordVote: number | null; wordsVoted: number;
  secretWord: string; ownClue: string; submittedCount: number; giverCount: number;
  board: { id: string; text: string; backed: boolean }[]; ownRankingVotes: string[];
  groups: { id: string; text: string; duplicate: boolean; shown: boolean; newlyShown: boolean;
    authors: string[]; mine: boolean; loves: number; boos: number; helpful: boolean }[];
  ownLove: string[]; ownBoo: string | null; attempt: number; maxAttempts: number;
  payout: number; nextPayout: number; hiddenCount: number; nextRevealCount: number;
  history: AttemptEvent[]; correct: boolean; scores: Record<string, number>;
  tentative: Record<string, number>; breakdown: Record<string, PointPart[]>;
  processing: boolean; claimExpiresAt: number; phaseClaimExpiresAt: number;
}

export function projectScoringView(s: ScoringState, uid: string, tentative: Record<string, number>): ScoringView {
  const participating = s.eligible.includes(uid)
  const guesser = uid === s.guesser
  const scored = s.phase === 'scored'
  const own = s.clues.find(c => c.author === uid)
  const giver = participating && !guesser
  const canSeeBoard = giver && !!own && (s.phase === 'clue-submission' || s.phase === 'clue-voting') && s.rules.mode === 'best-clues-first'
  const board = canSeeBoard ? s.clues.filter(c => c.author !== uid).map(c => ({ id: c.id, text: c.text, backed: (s.rankingVotes[uid] ?? []).includes(c.id) })) : []
  return {
    phase: s.phase, rules: s.rules, roundNum: s.roundNum, guesser, participating,
    startedAt: s.startedAt, deadline: s.deadline, selectionOpensAt: s.selectionOpensAt,
    wordOptions: giver && s.phase === 'word-selection' ? s.wordOptions : [],
    myWordVote: s.wordVotes[uid] ?? null, wordsVoted: Object.keys(s.wordVotes).length,
    secretWord: scored || (giver && s.phase !== 'word-selection') ? s.secretWord : '',
    ownClue: own?.text ?? '', submittedCount: s.clues.length, giverCount: s.eligible.length - 1,
    board, ownRankingVotes: giver ? s.rankingVotes[uid] ?? [] : [],
    groups: s.groups.filter(g => scored || s.shown.includes(g.id) || (giver && !!own))
      .sort((a, b) => s.queue.indexOf(a.id) - s.queue.indexOf(b.id)).map(g => ({
      id: g.id, text: g.texts.join(' / '), duplicate: g.duplicate, shown: s.shown.includes(g.id),
      newlyShown: s.newlyShown.includes(g.id), authors: scored ? g.authorIds : [], mine: g.authorIds.includes(uid),
      loves: s.rules.mode === 'best-clues-first' ? scored
        ? Object.values(s.rankingVotes).reduce((n, ids) => n + ids.filter(id => s.clues.some(c => c.id === id && g.authorIds.includes(c.author))).length, 0) : 0
        : Object.values(s.love).filter(ids => ids.includes(g.id)).length,
      boos: Object.values(s.boo).filter(id => id === g.id).length, helpful: s.helpful === g.id,
    })),
    ownLove: giver ? s.love[uid] ?? [] : [], ownBoo: s.boo[uid] ?? null,
    attempt: s.attempt, maxAttempts: s.maxAttempts, payout: s.rules.payouts[s.attempt - 1] ?? 0,
    nextPayout: s.rules.payouts[s.attempt] ?? 0, hiddenCount: s.groups.length - s.shown.length,
    nextRevealCount: Math.max(0, (s.schedule[s.attempt] ?? s.shown.length) - s.shown.length),
    history: s.history, correct: s.correct, scores: scored ? s.scores : {},
    tentative: scored ? tentative : { [uid]: tentative[uid] ?? 0 },
    breakdown: scored ? s.breakdown : {}, processing: !!s.claim,
    claimExpiresAt: s.claim?.expires ?? 0, phaseClaimExpiresAt: s.phaseClaim?.expires ?? 0,
  }
}
