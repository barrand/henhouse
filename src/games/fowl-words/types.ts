// Fowl Words-specific types, extending shared base types

import type { BaseGameData, PlayerData as SharedPlayerData } from '@shared/types'

export interface GameData extends BaseGameData {
  currentGuesser: string | null    // playerId of current guesser (null in lobby)
  cardsRemaining: string[]         // word stack for remaining rounds
}

export interface PlayerData extends SharedPlayerData {
  score: number   // cumulative across the game
}

export type RoundStatus =
  | 'word-selection'
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
  secretWord: string       // empty string during word-selection, set when finalized
  status: RoundStatus
  // Word-selection phase
  wordOptions: string[]                   // 3 candidate words shown to clue-givers
  wordVotes: Record<string, number>       // playerId → index (0|1|2) of their vote
  eligiblePlayerIds?: string[]
  eligiblePlayerCount?: number
  wordSelectionDeadline?: { seconds: number; nanoseconds: number }
  clueSubmissionDeadline?: { seconds: number; nanoseconds: number }
  currentAttempt: number                // 1–4
  maxAttempts: number                   // min(4, max(1, totalClueGroups))
  attemptInProgress: boolean            // true during Gemini guess evaluation
  attemptDeadline?: { seconds: number; nanoseconds: number }
  cluesByPlayer: Record<string, string>
  clueTimestamps?: Record<string, number> // unix seconds, for fast-bonus ordering
  clueGroups: ClueGroup[]               // populated after dedup
  visibleGroupIndexes: number[]         // which groups are visible to the guesser
  lastUnlockedGroupIndex?: number       // most recently unlocked index (for flash anim)
  eliminationReason: string             // human-readable from Gemini
  guessAttempts: string[]               // history of wrong guesses
  guesserAnswer?: string                // final guess
  isCorrect?: boolean                   // round result
  tentativePoints: Record<string, number>  // server-computed, not yet final
  pointsThisRound: Record<string, number>  // final scores (written at 'scored')
  cluePeerLoveVotes?: Record<string, Record<string, true>>
  cluePeerBooVotes?: Record<string, number>
  guesserMostHelpfulVote?: number | null
  guesserBooVote?: number | null
  clueStarVotes?: Record<string, number>
  clueThumbsDownVotes?: Record<string, number>
  guesserStarVote?: number | null
  guesserThumbsDownVote?: number | null
}

// Client-side point lookup — only used for the PointCounter display, kept in
// sync with backend's scoring.ATTEMPT_POINTS. (Source of truth for SCORES is
// always the server's `tentativePoints` / `pointsThisRound`.)
export const ATTEMPT_POINTS = [10, 5, 2, 1] as const
