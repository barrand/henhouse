import type { DisplayRound as ItWasYouDisplayRound } from '../games/it-was-you/model'

export const FLOCK_REVEAL_MS = 5000
export const FOWL_DEBRIEF_MS = 1400
export const REVEAL_LEAD_MS = 1100

export type Scores = Record<string, number>

export interface DisplayGame {
  kind: 'flock-together' | 'fowl-words' | 'it-was-you'
  status: 'lobby' | 'playing' | 'finished' | 'abandoned'
  round: number
  totalRounds: number
  guesser: string | null
  rematchCode: string | null
}

export interface FlockGroup {
  id: string
  answer: string
  playerIds: string[]
  type: 'flock' | 'outlier' | 'rotten'
  variations: string[]
}

export interface FlockDisplayRound {
  kind: 'flock-together'
  instance: string
  phase: 'answering' | 'revealing' | 'scored' | 'skipped'
  question: string
  options: string[]
  deadline: number
  answered: number
  eligible: number
  revealAt: number
  groups: FlockGroup[]
  missing: string[]
  points: Scores
  before: Scores
  after: Scores
}

export interface DisplayClue {
  id: string
  text: string
  authors: string[]
  shown: boolean
  newlyShown: boolean
  duplicate: boolean
  loves: number
  boos: number
  helpful: boolean
}

export interface FowlDisplayRound {
  kind: 'fowl-words'
  phase: 'word-selection' | 'word-selected' | 'clue-submission' | 'clue-voting' | 'deduplication' | 'reveal' | 'guess' | 'scored'
  deadline: number
  selectionOpensAt: number
  voters: number
  submitted: number
  givers: number
  attempt: number
  maxAttempts: number
  payout: number
  processing: boolean
  bestCluesFirst: boolean
  reactionFeed?: boolean
  clues: DisplayClue[]
  revealAt: number
  word: string
  correct: boolean
  before: Scores
  points: Scores
}

export type DisplayRound = FlockDisplayRound | FowlDisplayRound | ItWasYouDisplayRound
