import type { BaseGameData, PlayerData as SharedPlayerData } from '@shared/types'

export type TruthOrTurdAnswer = 'truth' | 'turd'
export type TruthOrTurdRoundStatus = 'answering' | 'revealing' | 'revealed'
export type TruthOrTurdRoundResult = 'correct' | 'incorrect' | 'no-answer'

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
  statement: string
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
  explanation?: string
  results: Record<string, TruthOrTurdRoundResult>
  pointsThisRound: Record<string, number>
  playerAnswers?: Record<string, TruthOrTurdAnswer>
}
