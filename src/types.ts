export interface GameSettings {
  totalRounds: number
  secondsPerRound: number
}

export interface GameData {
  id: string
  code: string
  hostId: string
  originalHostId: string
  status: 'lobby' | 'playing' | 'finished'
  currentRound: number
  rottenEggHolder: string | null
  categories: string[]
  playerIds: string[]
  settings: GameSettings
  includePatrioticQuestions: boolean
}

export interface PlayerData {
  id: string
  name: string
  eggs: number
  connected: boolean
}

export type RoundResult = 'flock' | 'outlier' | 'rotten' | 'no-answer'

export type QuestionType = 'open' | 'multiple_choice'

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
  answerGroups: string[]
  flockAnswer: string[]
  results: Record<string, RoundResult>
  playerAnswers?: Record<string, string>
  commentary?: string
}

export interface QuestionPoolItem {
  id: string
  text: string
  source: 'preset' | 'custom' | 'ai-generated' | 'patriotic'
  type?: QuestionType
  options?: string[]
  used: boolean
  submittedBy: string | null
  category: string | null
}
