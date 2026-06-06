// Just One backend types (mirror of frontend types where relevant)

export interface ClueGroup {
  playerIds: string[]      // 1+ players who share the same/similar clue
  clueTexts: string[]      // ALL clue texts in this group (one per player, same order)
  isDuplicate: boolean     // true if playerIds.length >= 2
}

export type RoundStatus =
  | 'clue-submission'
  | 'deduplication'
  | 'reveal'
  | 'guess'
  | 'scored'
