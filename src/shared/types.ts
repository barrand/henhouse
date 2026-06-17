// Base types shared across all games

export interface GameSettings {
  totalRounds: number
  secondsPerRound: number
}

export interface BaseGameData {
  id: string
  code: string
  gameType: 'flock-together' | 'fowl-words'
  hostId: string
  originalHostId: string
  status: 'lobby' | 'playing' | 'finished' | 'abandoned'
  currentRound: number
  playerIds: string[]
  settings: GameSettings
  rematchCode?: string
}

export interface PlayerData {
  id: string
  name: string
  connected: boolean
}

export type QuestionType = 'open' | 'multiple_choice'

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
