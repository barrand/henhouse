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
  p7: 'embers',
  p8: 'toast',
  p9: 'night',
  p10: 'Marshmallow',
}

const CAMPFIRE_CLUE_GROUPS: ClueGroup[] = [
  { playerIds: ['p1'], clueTexts: ['smoke'], isDuplicate: false },
  { playerIds: ['p3'], clueTexts: ['flame'], isDuplicate: false },
  { playerIds: ['p4', 'p10'], clueTexts: ['marshmallow', 'Marshmallow'], isDuplicate: true },
  { playerIds: ['p5'], clueTexts: ['hot'], isDuplicate: false },
  { playerIds: ['p6'], clueTexts: ['woods'], isDuplicate: false },
  { playerIds: ['p7'], clueTexts: ['embers'], isDuplicate: false },
  { playerIds: ['p8'], clueTexts: ['toast'], isDuplicate: false },
  { playerIds: ['p9'], clueTexts: ['night'], isDuplicate: false },
]

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
    clueStarVotes: {},
    clueThumbsDownVotes: {},
    guesserStarVote: null,
    guesserThumbsDownVote: null,
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
          visibleGroupIndexes: [0, 1, 3, 4, 5, 6, 7],
          maxAttempts: 4,
          eliminationReason: 'marshmallow / Marshmallow matched',
          attemptDeadline: { seconds: now() + 55, nanoseconds: 0 },
          clueStarVotes: { p3: 3, p5: 0 },
          clueThumbsDownVotes: { p4: 1 },
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
          visibleGroupIndexes: [0, 1, 3, 4, 5, 6, 7, 2],
          lastUnlockedGroupIndex: 2,
          guessAttempts: ['beach'],
          eliminationReason: 'marshmallow / Marshmallow matched',
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
          visibleGroupIndexes: [0, 1, 3, 4, 5, 6, 7],
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
          clueGroups: CAMPFIRE_CLUE_GROUPS,
          visibleGroupIndexes: [0, 1, 3, 4, 5, 6, 7],
          eliminationReason: 'marshmallow / Marshmallow matched',
          pointsThisRound: {
            p2: 10,
            p1: 12,
            p3: 10,
            p5: 11,
            p6: 9,
            p7: 8,
            p8: 7,
            p9: 6,
            p4: -1,
            p10: -1,
          },
          clueStarVotes: { p3: 0, p5: 0, p6: 1 },
          clueThumbsDownVotes: { p4: 2 },
          guesserStarVote: 0,
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
          clueGroups: CAMPFIRE_CLUE_GROUPS,
          visibleGroupIndexes: [0, 1, 3, 4, 5, 6, 7, 2],
          eliminationReason: 'marshmallow / Marshmallow matched',
          pointsThisRound: {
            p2: 2,
            p1: 4,
            p3: 2,
            p5: 3,
            p6: 2,
            p7: 2,
            p8: 2,
            p9: 2,
            p4: -1,
            p10: 1,
          },
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
          clueGroups: CAMPFIRE_CLUE_GROUPS,
          visibleGroupIndexes: [0, 1, 3, 4, 5, 6, 7, 2],
          eliminationReason: 'marshmallow / Marshmallow matched',
          pointsThisRound: { p4: -1, p10: -1 },
          clueThumbsDownVotes: { p1: 2 },
          guesserThumbsDownVote: 2,
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
