// Just One-specific types, extending shared base types

import type { BaseGameData, PlayerData as SharedPlayerData } from '@shared/types'

export interface GameData extends BaseGameData {
  currentGuesser: string // playerId of the current guesser
  teamScore: number // team score (shared across all players)
  cardsRemaining: string[] // remaining words to guess
  currentCard: string // current secret word for this round
}

export interface PlayerData extends SharedPlayerData {
  // No additional fields beyond shared PlayerData for Just One
}

export interface RoundData {
  id: string
  secretWord: string
  status: 'clue-submission' | 'reveal' | 'guess' | 'scored'
  deadline: { seconds: number; nanoseconds: number }
  cluesByPlayer: Record<string, string> // playerId -> clue
  eliminatedPlayerIds: string[] // players whose clues were duplicates
  eliminationReason: string
  guesserAnswer?: string // what the guesser guessed
  isCorrect?: boolean
  score: number // 0 or -1 (only applies after scoring)
}
