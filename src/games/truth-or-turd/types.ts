import type { BaseGameData, PlayerData as SharedPlayerData } from '@shared/types'

export type TruthOrTurdAnswer = 'truth' | 'turd'
export type TruthOrTurdSubmittedAnswer = string
export type TruthOrTurdRoundStatus = 'answering' | 'revealing' | 'revealed'
export type TruthOrTurdRoundResult = 'correct' | 'incorrect' | 'no-answer'

export interface TruthOrTurdChoice {
  id: string
  text: string
}

export interface GameData extends BaseGameData {
  gameType: 'truth-or-turd'
  includePatrioticQuestions: boolean
  usedTruthOrTurdQuestionKeys?: string[]
}

export interface PlayerData extends SharedPlayerData {
  score: number
}

export interface RoundData {
  id: string
  kind?: 'binary' | 'multiple-choice'
  statement?: string
  prompt?: string
  choices?: TruthOrTurdChoice[]
  tags?: string[]
  source?: 'preset' | 'patriotic'
  tag?: string | null
  questionKey: string
  status: TruthOrTurdRoundStatus
  deadline: { seconds: number; nanoseconds: number }
  answerCount: number
  answeredPlayerIds?: string[]
  eligiblePlayerIds?: string[]
  eligiblePlayerCount?: number
  correctAnswer?: TruthOrTurdAnswer
  correctChoiceId?: string
  correctChoiceText?: string
  explanation?: string
  results: Record<string, TruthOrTurdRoundResult>
  pointsThisRound: Record<string, number>
  playerAnswers?: Record<string, TruthOrTurdSubmittedAnswer>
  sourceRefs?: string[]
}
