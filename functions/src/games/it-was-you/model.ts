export const WRITING_MS = 60_000
export const VOTING_MS = 30_000
export const AUTHOR_REVEAL_MS = 1_100
export const MIN_PLAYERS = 4
export const MAX_WRITERS = 6
export const MIN_ANSWERS = 3
export const MAX_ANSWER_LENGTH = 140

export type Phase = 'preview' | 'writing' | 'voting' | 'reveal' | 'standings'
export type Action = 'preview' | 'swap' | 'write' | 'submit' | 'vote' | 'close' | 'advance' | 'finish' | 'abandon'
export type VoteCounts = Record<string, number>

export interface Answer {
  authorId: string
  text: string
}

export interface RoundReveal {
  authorId: string
  leaders: string[]
  counts: VoteCounts
  revealAt: number
  automatic: boolean
}

export interface Round {
  phase: Phase
  revision: number
  prompt: string
  canSwap: boolean
  deadline: number
  eligiblePlayerIds: string[]
  writerIds: string[]
  submitted: number
  candidateIds: string[]
  answer: { id: string; text: string } | null
  reveal: RoundReveal | null
  pointsThisRound: VoteCounts
  shortRound: boolean
}

export interface PlayerView {
  submittedText?: string
  answerId?: string
  candidateId?: string
}

export interface DisplayRound extends Omit<Round, 'eligiblePlayerIds' | 'writerIds'> {
  kind: 'it-was-you'
  eligible: number
  writers: number
}

export interface RoundAction {
  gameId: string
  roundNum: number
  revision: number
  action: Action
  text?: string
  answerId?: string
  candidateId?: string
}
