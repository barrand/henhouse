import type { ClueGroup, GameData, PlayerData, RoundData } from '@fowl-words/types'

export const PREVIEW_PLAYER_NAMES = [
  'Alice',
  'Bob',
  'Carol',
  'Dave',
  'Sally',
  'Frank',
  'Grace',
  'Hank',
  'Ivy',
  'Billy',
] as const

export const PREVIEW_PLAYERS: PlayerData[] = PREVIEW_PLAYER_NAMES.map((name, i) => ({
  id: `p${i + 1}`,
  name,
  connected: i !== 8,
  score: [42, 38, 35, 28, 24, 18, 15, 12, 10, 48][i],
}))

const PLAYER_IDS = PREVIEW_PLAYERS.map((p) => p.id)
const HOST_ID = 'p1'
const GUESSER_ID = 'p2'
const GIVER_IDS = PLAYER_IDS.filter((id) => id !== GUESSER_ID)

const SECRET_WORD = 'campfire'

const CAMPFIRE_CLUES: Record<string, string> = {
  p1: 'smoke',
  p3: 'flame',
  p4: 'marshmallow',
  p5: 'hot',
  p6: 'woods',
  p7: 'glow',
  p8: 'toast',
  p9: 'Glow',
  p10: 'Marshmallow',
}

/** Submission order for fast bonus: Alice → Carol → Sally (+3/+2/+1) */
const CAMPFIRE_TIMESTAMPS: Record<string, number> = {
  p1: 100,
  p3: 110,
  p5: 120,
  p6: 130,
  p8: 140,
  p4: 200,
  p10: 205,
  p7: 210,
  p9: 220,
}

const CAMPFIRE_CLUE_GROUPS: ClueGroup[] = [
  { playerIds: ['p1'], clueTexts: ['smoke'], isDuplicate: false },
  { playerIds: ['p3'], clueTexts: ['flame'], isDuplicate: false },
  { playerIds: ['p4', 'p10'], clueTexts: ['marshmallow', 'Marshmallow'], isDuplicate: true },
  { playerIds: ['p5'], clueTexts: ['hot'], isDuplicate: false },
  { playerIds: ['p6'], clueTexts: ['woods'], isDuplicate: false },
  { playerIds: ['p7', 'p9'], clueTexts: ['glow', 'Glow'], isDuplicate: true },
  { playerIds: ['p8'], clueTexts: ['toast'], isDuplicate: false },
]

/** Unique (visible) group indexes for the campfire preview round */
const CAMPFIRE_VISIBLE = [0, 1, 3, 4, 6]
const CAMPFIRE_ELIMINATION = 'marshmallow / Marshmallow · glow / Glow matched'

/**
 * Attempt-1 win (Bob nails it first try, 10 pt attempt, 9 givers → fast +3/+2/+1).
 * Votes: Carol+Sally ❤️ smoke; Frank ❤️ flame; Alice ❤️ woods.
 * Fastest: Alice +3, Carol +2, Sally +1.
 * Bob awarded ⭐ Most Helpful to Frank's "woods" (+5) — applied in preview helper.
 */
const RESULT_WIN_POINTS: Record<string, number> = {
  p2: 10,  // guesser
  p1: 15,  // +10 +3 fast +2 love
  p3: 13,  // +10 +2 fast +1 love
  p5: 11,  // +10 +1 fast
  p6: 12,  // +10 +1 fast +1 love (+5 helpful added when vote set)
  p8: 10,  // +10 visible
  p4: -1,
  p10: -1,
  p7: -1,
  p9: -1,
}

const RESULT_WIN_LOVES = {
  p3: { '0': true as const },
  p5: { '0': true as const },
  p6: { '1': true as const },
  p1: { '4': true as const },
}

/**
 * Attempt-3 win after unlocking marshmallow dup (2 pt attempt).
 * Votes: Carol+Sally ❤️ smoke; Frank ❤️ flame; Hank ❤️ woods; Ivy ❤️ toast.
 * Unlocked marshmallow dup visible — Dave+Billy get used +2 but keep -1 dup.
 */
const RESULT_WIN_LATE_POINTS: Record<string, number> = {
  p2: 2,
  p1: 7,   // +2 +3 fast +2 love
  p3: 5,   // +2 +2 fast +1 love
  p5: 3,   // +2 +1 fast
  p6: 3,   // +2 +1 love
  p8: 3,   // +2 +1 love
  p4: 1,   // -1 dup +2 used
  p10: 1,
  p7: -1,
  p9: -1,
}

const RESULT_WIN_LATE_LOVES = {
  p3: { '0': true as const },
  p5: { '0': true as const },
  p6: { '1': true as const },
  p8: { '4': true as const },
  p7: { '6': true as const },
}

/** All clues landed in duplicate groups — guesser must unlock one. */
const ALL_DUP_CLUE_GROUPS: ClueGroup[] = [
  { playerIds: ['p1', 'p3', 'p6'], clueTexts: ['fire', 'Fire', 'firepit'], isDuplicate: true },
  { playerIds: ['p4', 'p5', 'p10'], clueTexts: ['hot', 'Hot', 'heat'], isDuplicate: true },
  { playerIds: ['p7', 'p8', 'p9'], clueTexts: ['warm', 'Warm', 'cozy'], isDuplicate: true },
]

const ALL_DUP_CLUES: Record<string, string> = {
  p1: 'fire',
  p3: 'Fire',
  p4: 'hot',
  p5: 'Hot',
  p6: 'firepit',
  p7: 'warm',
  p8: 'Warm',
  p9: 'cozy',
  p10: 'heat',
}

const now = () => Math.floor(Date.now() / 1000)

function baseGame(overrides: Partial<GameData> = {}): GameData {
  return {
    id: 'preview-fowl',
    code: 'FOWL',
    gameType: 'fowl-words',
    hostId: HOST_ID,
    originalHostId: HOST_ID,
    status: 'playing',
    currentRound: 4,
    playerIds: PLAYER_IDS,
    settings: { totalRounds: 10, secondsPerRound: 60 },
    currentGuesser: GUESSER_ID,
    cardsRemaining: ['lantern', 'volcano', 'tent', 'compass'],
    ...overrides,
  }
}

function baseRound(overrides: Partial<RoundData> = {}): RoundData {
  return {
    id: 'r4',
    secretWord: SECRET_WORD,
    status: 'word-selection',
    wordOptions: ['Campfire', 'Volcano', 'Lantern'],
    wordVotes: {},
    wordSelectionDeadline: { seconds: now() + 15, nanoseconds: 0 },
    currentAttempt: 1,
    maxAttempts: 4,
    attemptInProgress: false,
    cluesByPlayer: {},
    clueGroups: [],
    visibleGroupIndexes: [],
    eliminationReason: '',
    guessAttempts: [],
    tentativePoints: {},
    pointsThisRound: {},
    cluePeerLoveVotes: {},
    cluePeerBooVotes: {},
    guesserMostHelpfulVote: null,
    guesserBooVote: null,
    ...overrides,
  }
}

export type FowlWordsPreviewScreen =
  | 'lobby'
  | 'word-selection'
  | 'clue-submission'
  | 'clue-submission-waiting'
  | 'deduplication'
  | 'reveal'
  | 'reveal-attempt2'
  | 'reveal-all-dupes'
  | 'reveal-busy'
  | 'guess'
  | 'result-win'
  | 'result-win-late'
  | 'result-fail'
  | 'leaderboard'
  | 'game-over-winner'
  | 'game-over-tie'
  | 'game-over-empty'
  | 'game-over-waiting'

export const FOWL_WORDS_PREVIEW_SCREENS: { id: FowlWordsPreviewScreen; label: string }[] = [
  { id: 'lobby', label: 'Lobby' },
  { id: 'word-selection', label: 'Word vote' },
  { id: 'clue-submission', label: 'Clue (writing)' },
  { id: 'clue-submission-waiting', label: 'Clue (submitted)' },
  { id: 'deduplication', label: 'Dedup (loading)' },
  { id: 'reveal', label: 'Reveal (attempt 1)' },
  { id: 'reveal-attempt2', label: 'Reveal (attempt 2)' },
  { id: 'reveal-all-dupes', label: 'Reveal (all dupes)' },
  { id: 'reveal-busy', label: '🔥 Reveal (busy)' },
  { id: 'guess', label: 'Guess (checking)' },
  { id: 'result-win', label: 'Result (nailed it)' },
  { id: 'result-win-late', label: 'Result (late win)' },
  { id: 'result-fail', label: 'Result (no luck)' },
  { id: 'leaderboard', label: 'Standings modal' },
  { id: 'game-over-winner', label: 'Game over (winner)' },
  { id: 'game-over-tie', label: 'Game over (tie)' },
  { id: 'game-over-empty', label: 'Game over (no score)' },
  { id: 'game-over-waiting', label: 'Game over (waiting)' },
]

export interface FowlWordsPreviewScenario {
  game: GameData
  round: RoundData | null
  players: PlayerData[]
  isHost: boolean
  currentPlayerId: string
  showLeaderboard?: boolean
  isFinal?: boolean
}

export function getFowlWordsPreviewScenario(
  screen: FowlWordsPreviewScreen,
  asPlayerId: string = HOST_ID,
): FowlWordsPreviewScenario {
  const players = PREVIEW_PLAYERS
  const isHost = asPlayerId === HOST_ID

  switch (screen) {
    case 'lobby':
      return {
        game: baseGame({ status: 'lobby', currentRound: 0, currentGuesser: null }),
        round: null,
        players: players.map((p) => ({ ...p, score: 0 })),
        isHost,
        currentPlayerId: asPlayerId,
      }

    case 'word-selection': {
      const votedGivers = GIVER_IDS.slice(0, 6)
      const wordVotes = Object.fromEntries(
        votedGivers.map((id, i) => [id, i % 3]),
      )
      return {
        game: baseGame(),
        round: baseRound({
          status: 'word-selection',
          secretWord: '',
          wordVotes,
        }),
        players,
        isHost,
        currentPlayerId: asPlayerId,
      }
    }

    case 'clue-submission':
      return {
        game: baseGame(),
        round: baseRound({
          status: 'clue-submission',
          clueSubmissionDeadline: { seconds: now() + 45, nanoseconds: 0 },
          cluesByPlayer: Object.fromEntries(GIVER_IDS.slice(0, 5).map((id) => [id, CAMPFIRE_CLUES[id]])),
        }),
        players,
        isHost,
        currentPlayerId: asPlayerId,
      }

    case 'clue-submission-waiting':
      return {
        game: baseGame(),
        round: baseRound({
          status: 'clue-submission',
          clueSubmissionDeadline: { seconds: now() + 20, nanoseconds: 0 },
          cluesByPlayer: { ...CAMPFIRE_CLUES, [asPlayerId]: CAMPFIRE_CLUES[asPlayerId] ?? 'smoke' },
        }),
        players,
        isHost,
        currentPlayerId: asPlayerId,
      }

    case 'deduplication':
      return {
        game: baseGame(),
        round: baseRound({
          status: 'deduplication',
          cluesByPlayer: CAMPFIRE_CLUES,
        }),
        players,
        isHost,
        currentPlayerId: asPlayerId,
      }

    case 'reveal':
      return {
        game: baseGame(),
        round: baseRound({
          status: 'reveal',
          cluesByPlayer: CAMPFIRE_CLUES,
          clueGroups: CAMPFIRE_CLUE_GROUPS,
          visibleGroupIndexes: CAMPFIRE_VISIBLE,
          maxAttempts: 4,
          eliminationReason: CAMPFIRE_ELIMINATION,
          attemptDeadline: { seconds: now() + 55, nanoseconds: 0 },
          cluePeerLoveVotes: { p3: { '3': true }, p5: { '0': true } },
          cluePeerBooVotes: { p4: 1 },
        }),
        players,
        isHost,
        currentPlayerId: asPlayerId,
      }

    case 'reveal-attempt2':
      return {
        game: baseGame(),
        round: baseRound({
          status: 'reveal',
          currentAttempt: 2,
          cluesByPlayer: CAMPFIRE_CLUES,
          clueGroups: CAMPFIRE_CLUE_GROUPS,
          visibleGroupIndexes: [...CAMPFIRE_VISIBLE, 2],
          lastUnlockedGroupIndex: 2,
          guessAttempts: ['beach'],
          eliminationReason: CAMPFIRE_ELIMINATION,
          attemptDeadline: { seconds: now() + 35, nanoseconds: 0 },
        }),
        players,
        isHost,
        currentPlayerId: asPlayerId,
      }

    case 'reveal-all-dupes':
      return {
        game: baseGame(),
        round: baseRound({
          status: 'reveal',
          secretWord: 'campfire',
          cluesByPlayer: ALL_DUP_CLUES,
          clueGroups: ALL_DUP_CLUE_GROUPS,
          visibleGroupIndexes: [],
          maxAttempts: 3,
          eliminationReason: 'fire / Fire / firepit matched',
          attemptDeadline: { seconds: now() + 55, nanoseconds: 0 },
        }),
        players,
        isHost,
        currentPlayerId: asPlayerId,
      }

    case 'guess':
      return {
        game: baseGame(),
        round: baseRound({
          status: 'guess',
          attemptInProgress: true,
          cluesByPlayer: CAMPFIRE_CLUES,
          clueGroups: CAMPFIRE_CLUE_GROUPS,
          visibleGroupIndexes: CAMPFIRE_VISIBLE,
          guessAttempts: ['beach'],
        }),
        players,
        isHost,
        currentPlayerId: asPlayerId,
      }

    case 'result-win':
      return {
        game: baseGame(),
        round: baseRound({
          status: 'scored',
          isCorrect: true,
          currentAttempt: 1,
          guesserAnswer: SECRET_WORD,
          cluesByPlayer: CAMPFIRE_CLUES,
          clueTimestamps: CAMPFIRE_TIMESTAMPS,
          clueGroups: CAMPFIRE_CLUE_GROUPS,
          visibleGroupIndexes: CAMPFIRE_VISIBLE,
          eliminationReason: CAMPFIRE_ELIMINATION,
          pointsThisRound: RESULT_WIN_POINTS,
          cluePeerLoveVotes: RESULT_WIN_LOVES,
          cluePeerBooVotes: { p4: 1 },
          guesserMostHelpfulVote: 4,
        }),
        players,
        isHost,
        currentPlayerId: asPlayerId,
      }

    case 'result-win-late':
      return {
        game: baseGame(),
        round: baseRound({
          status: 'scored',
          isCorrect: true,
          currentAttempt: 3,
          maxAttempts: 4,
          guesserAnswer: SECRET_WORD,
          guessAttempts: ['beach', 'forest'],
          cluesByPlayer: CAMPFIRE_CLUES,
          clueTimestamps: CAMPFIRE_TIMESTAMPS,
          clueGroups: CAMPFIRE_CLUE_GROUPS,
          visibleGroupIndexes: [...CAMPFIRE_VISIBLE, 2],
          eliminationReason: CAMPFIRE_ELIMINATION,
          pointsThisRound: RESULT_WIN_LATE_POINTS,
          cluePeerLoveVotes: RESULT_WIN_LATE_LOVES,
          cluePeerBooVotes: { p4: 3 },
        }),
        players,
        isHost,
        currentPlayerId: asPlayerId,
      }

    case 'result-fail':
      return {
        game: baseGame(),
        round: baseRound({
          status: 'scored',
          isCorrect: false,
          currentAttempt: 4,
          maxAttempts: 4,
          guesserAnswer: 'cozy',
          guessAttempts: ['beach', 'forest', 'warm', 'cozy'],
          cluesByPlayer: CAMPFIRE_CLUES,
          clueTimestamps: CAMPFIRE_TIMESTAMPS,
          clueGroups: CAMPFIRE_CLUE_GROUPS,
          visibleGroupIndexes: [...CAMPFIRE_VISIBLE, 2],
          eliminationReason: CAMPFIRE_ELIMINATION,
          pointsThisRound: { p4: -1, p10: -1, p7: -1, p9: -1 },
          cluePeerLoveVotes: {
            p1: { '3': true },
            p5: { '0': true, '4': true },
          },
          cluePeerBooVotes: { p3: 3 },
          guesserBooVote: 2,
        }),
        players,
        isHost,
        currentPlayerId: asPlayerId,
      }

    case 'reveal-busy':
      return {
        game: baseGame(),
        round: baseRound({
          status: 'reveal',
          currentAttempt: 2,
          cluesByPlayer: CAMPFIRE_CLUES,
          clueGroups: CAMPFIRE_CLUE_GROUPS,
          visibleGroupIndexes: [...CAMPFIRE_VISIBLE, 2],
          lastUnlockedGroupIndex: 2,
          guessAttempts: ['beach'],
          eliminationReason: CAMPFIRE_ELIMINATION,
          attemptDeadline: { seconds: now() + 35, nanoseconds: 0 },
          cluePeerLoveVotes: {
            p1: { '1': true, '4': true },
            p3: { '0': true, '6': true },
            p5: { '0': true, '1': true, '4': true },
            p7: { '3': true },
            p8: { '0': true, '4': true },
            p9: { '1': true, '3': true, '2': true },
            p10: { '0': true },
          },
          cluePeerBooVotes: {
            p1: 6,
            p5: 3,
            p7: 4,
          },
        }),
        players,
        isHost,
        currentPlayerId: asPlayerId,
      }

    case 'leaderboard':
      return {
        game: baseGame(),
        round: baseRound({ status: 'clue-submission', cluesByPlayer: CAMPFIRE_CLUES }),
        players,
        isHost,
        currentPlayerId: asPlayerId,
        showLeaderboard: true,
      }

    case 'game-over-winner':
      return {
        game: baseGame({ status: 'finished', currentRound: 10 }),
        round: null,
        players,
        isHost,
        currentPlayerId: asPlayerId,
        isFinal: true,
      }

    case 'game-over-tie':
      return {
        game: baseGame({ status: 'finished', currentRound: 10 }),
        round: null,
        players: players.map((p) =>
          p.id === 'p1' || p.id === 'p10' ? { ...p, score: 52 } : { ...p, score: Math.min(p.score, 20) },
        ),
        isHost,
        currentPlayerId: asPlayerId,
        isFinal: true,
      }

    case 'game-over-empty':
      return {
        game: baseGame({ status: 'finished', currentRound: 10 }),
        round: null,
        players: players.map((p) => ({ ...p, score: 0 })),
        isHost,
        currentPlayerId: asPlayerId,
        isFinal: true,
      }

    case 'game-over-waiting':
      return {
        game: baseGame({ status: 'finished', currentRound: 10 }),
        round: null,
        players,
        isHost: false,
        currentPlayerId: asPlayerId === HOST_ID ? 'p4' : asPlayerId,
        isFinal: true,
      }

    default:
      return getFowlWordsPreviewScenario('lobby', asPlayerId)
  }
}

export const PREVIEW_GUESSER_ID = GUESSER_ID
