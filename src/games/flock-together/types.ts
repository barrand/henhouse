// Flock Together-specific types, extending shared base types

import type { BaseGameData, PlayerData as SharedPlayerData, QuestionType } from '@shared/types'

export interface GameData extends BaseGameData {
  categories: string[]
  includePatrioticQuestions: boolean
}

export interface PlayerData extends SharedPlayerData {
  score: number
}

export type RoundResult = 'flock' | 'outlier' | 'rotten' | 'no-answer'

export interface RoundData {
  id: string
  question: string
  source: 'preset' | 'custom' | 'ai-generated' | 'patriotic'
  /** Firestore questionPool doc id for the current question (used to return skipped questions to the pool). */
  questionPoolId?: string | null
  submittedBy?: string | null
  /** 'open' = free-text; 'multiple_choice' = tappable options. Defaults to 'open' for legacy rounds. */
  type?: QuestionType
  /** Present when type='multiple_choice'. Players must submit one of these exact strings. */
  options?: string[]
  status: 'answering' | 'revealing' | 'scored' | 'skipped'
  deadline: { seconds: number; nanoseconds: number }
  answerCount: number
  answeredPlayerIds?: string[]
  eligiblePlayerIds?: string[]
  eligiblePlayerCount?: number
  answerGroups: string[]
  flockAnswer: string[]
  results: Record<string, RoundResult>
  pointsThisRound: Record<string, number>
  playerAnswers?: Record<string, string>
  commentary?: string
}
