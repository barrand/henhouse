// Just One backend types (mirror of frontend types where relevant)

export interface ClueGroup {
  playerIds: string[]      // 1+ players who share the same/similar clue
  clueText: string         // canonical version of the clue (first submission's text)
  isDuplicate: boolean     // true if playerIds.length >= 2
}

export type RoundStatus =
  | 'clue-submission'
  | 'deduplication'
  | 'reveal'
  | 'guess'
  | 'scored'
