// Just One-specific types, extending shared base types

import type { BaseGameData, PlayerData as SharedPlayerData } from '@shared/types'

export interface GameData extends BaseGameData {
  currentGuesser: string | null    // playerId of current guesser (null in lobby)
  cardsRemaining: string[]         // word stack for remaining rounds
}

export interface PlayerData extends SharedPlayerData {
  score: number   // cumulative across the game
}

export type RoundStatus =
  | 'clue-submission'
  | 'deduplication'
  | 'reveal'
  | 'guess'
  | 'scored'

export interface ClueGroup {
  playerIds: string[]      // 1+ players who share the same/similar clue
  clueTexts: string[]      // ALL clue texts (one per player, same order as playerIds)
  isDuplicate: boolean     // true if size >= 2
}

export interface RoundData {
  id: string
  secretWord: string
  status: RoundStatus
  currentAttempt: number               // 1–4 (always 1 in Phase 3A)
  maxAttempts: number                  // always 1 in Phase 3A
  attemptInProgress: boolean           // true during Gemini guess evaluation
  attemptDeadline?: { seconds: number; nanoseconds: number }
  cluesByPlayer: Record<string, string>
  clueGroups: ClueGroup[]              // populated after dedup
  visibleGroupIndexes: number[]        // which groups are visible to the guesser
  eliminationReason: string            // human-readable from Gemini
  guessAttempts: string[]              // history of wrong guesses (Phase 3B)
  guesserAnswer?: string               // final guess
  isCorrect?: boolean                  // round result
  tentativePoints: Record<string, number>  // server-computed, not yet final
  pointsThisRound: Record<string, number>  // final scores (written at 'scored')
}
