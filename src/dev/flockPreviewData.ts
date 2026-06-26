import type { GameData, PlayerData, RoundData } from '@flock/types'

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
  connected: i !== 8, // Ivy disconnected
  eggs: [6, 4, 2, 5, 3, 1, 4, 0, 2, 7][i],
}))

const PLAYER_IDS = PREVIEW_PLAYERS.map((p) => p.id)
const HOST_ID = 'p1'
const ROTTEN_ID = 'p3'

const now = () => Math.floor(Date.now() / 1000)

function baseGame(overrides: Partial<GameData> = {}): GameData {
  return {
    id: 'preview-flock',
    code: 'FLOCK',
    gameType: 'flock-together',
    hostId: HOST_ID,
    originalHostId: HOST_ID,
    status: 'playing',
    currentRound: 7,
    playerIds: PLAYER_IDS,
    settings: { totalRounds: 10, secondsPerRound: 60 },
    rottenEggHolder: ROTTEN_ID,
    categories: ['Movies', 'Food', 'Travel'],
    includePatrioticQuestions: false,
    ...overrides,
  }
}

function baseRound(overrides: Partial<RoundData> = {}): RoundData {
  return {
    id: 'r7',
    question: 'What do people always forget to bring to a party?',
    source: 'preset',
    type: 'open',
    status: 'answering',
    deadline: { seconds: now() + 300, nanoseconds: 0 },
    answerCount: 0,
    answeredPlayerIds: [],
    answerGroups: [],
    flockAnswer: [],
    results: {},
    playerAnswers: {},
    ...overrides,
  }
}

export type FlockPreviewScreen =
  | 'lobby'
  | 'question'
  | 'question-waiting'
  | 'question-mc'
  | 'question-patriotic'
  | 'question-timeout'
  | 'reveal-loading'
  | 'reveal-flock'
  | 'reveal-no-flock'
  | 'leaderboard'
  | 'game-over-winner'
  | 'game-over-tie'
  | 'game-over-empty'
  | 'game-over-waiting'

export const FLOCK_PREVIEW_SCREENS: { id: FlockPreviewScreen; label: string }[] = [
  { id: 'lobby', label: 'Lobby' },
  { id: 'question', label: 'Question (open)' },
  { id: 'question-waiting', label: 'Question (answered)' },
  { id: 'question-mc', label: 'Question (4 choices)' },
  { id: 'question-patriotic', label: 'Question (patriotic)' },
  { id: 'question-timeout', label: 'Question (timeout)' },
  { id: 'reveal-loading', label: 'Reveal (loading)' },
  { id: 'reveal-flock', label: 'Reveal (flock wins)' },
  { id: 'reveal-no-flock', label: 'Reveal (no flock)' },
  { id: 'leaderboard', label: 'Pecking order modal' },
  { id: 'game-over-winner', label: 'Game over (winner)' },
  { id: 'game-over-tie', label: 'Game over (tie)' },
  { id: 'game-over-empty', label: 'Game over (no eggs)' },
  { id: 'game-over-waiting', label: 'Game over (waiting)' },
]

export interface FlockPreviewScenario {
  game: GameData
  round: RoundData | null
  players: PlayerData[]
  isHost: boolean
  currentPlayerId: string
  showLeaderboard?: boolean
  isFinal?: boolean
}

export function getFlockPreviewScenario(
  screen: FlockPreviewScreen,
  asPlayerId: string = HOST_ID,
): FlockPreviewScenario {
  const players = PREVIEW_PLAYERS
  const isHost = asPlayerId === HOST_ID
  const answered7 = PLAYER_IDS.slice(0, 7)

  switch (screen) {
    case 'lobby':
      return {
        game: baseGame({ status: 'lobby', currentRound: 0, rottenEggHolder: null }),
        round: null,
        players: players.map((p) => ({ ...p, eggs: 0 })),
        isHost,
        currentPlayerId: asPlayerId,
      }

    case 'question': {
      const othersAnswered = PLAYER_IDS.filter((id) => id !== asPlayerId).slice(0, 6)
      return {
        game: baseGame(),
        round: baseRound({ answeredPlayerIds: othersAnswered, answerCount: othersAnswered.length }),
        players,
        isHost,
        currentPlayerId: asPlayerId,
      }
    }

    case 'question-waiting': {
      const waitingAnswered = [...new Set([...answered7, asPlayerId])]
      return {
        game: baseGame(),
        round: baseRound({
          answeredPlayerIds: waitingAnswered,
          answerCount: waitingAnswered.length,
          playerAnswers: { [asPlayerId]: 'Gift wrap' },
        }),
        players,
        isHost,
        currentPlayerId: asPlayerId,
      }
    }

    case 'question-mc':
      return {
        game: baseGame(),
        round: baseRound({
          type: 'multiple_choice',
          options: ['Pizza', 'Tacos', 'Sushi', 'Burgers'],
          question: 'Pick the best party food',
          answeredPlayerIds: answered7.slice(0, 5),
          answerCount: 5,
        }),
        players,
        isHost,
        currentPlayerId: asPlayerId,
      }

    case 'question-patriotic':
      return {
        game: baseGame({ includePatrioticQuestions: true }),
        round: baseRound({
          source: 'patriotic',
          question: 'Name a US president everyone recognizes',
          answeredPlayerIds: answered7.slice(0, 4),
          answerCount: 4,
        }),
        players,
        isHost,
        currentPlayerId: asPlayerId,
      }

    case 'question-timeout': {
      // Current player did NOT answer — deadline passed → "Too slow!" UI
      const timeoutPlayer = PLAYER_IDS.includes(asPlayerId) ? asPlayerId : 'p10'
      const othersAnswered = PLAYER_IDS.filter((id) => id !== timeoutPlayer).slice(0, 7)
      return {
        game: baseGame(),
        round: baseRound({
          deadline: { seconds: now() - 30, nanoseconds: 0 },
          answeredPlayerIds: othersAnswered,
          answerCount: othersAnswered.length,
        }),
        players,
        isHost: false,
        currentPlayerId: timeoutPlayer,
      }
    }

    case 'reveal-loading':
      return {
        game: baseGame(),
        round: baseRound({ status: 'revealing' }),
        players,
        isHost,
        currentPlayerId: asPlayerId,
      }

    case 'reveal-flock': {
      const flockIds = ['p1', 'p2', 'p4', 'p7']
      const results = Object.fromEntries(
        PLAYER_IDS.map((id) => {
          if (id === ROTTEN_ID) return [id, 'rotten']
          if (flockIds.includes(id)) return [id, 'flock']
          if (id === 'p6') return [id, 'no-answer']
          return [id, 'outlier']
        }),
      ) as Record<string, RoundData['results'][string]>
      const playerAnswers: Record<string, string> = {
        p1: 'Gift',
        p2: 'Gift',
        p3: 'Phone',
        p4: 'Gift',
        p5: 'Drinks',
        p6: '',
        p7: 'Gift',
        p8: 'Snacks',
        p9: 'Snacks',
        p10: 'Drinks',
      }
      return {
        game: baseGame(),
        round: baseRound({
          status: 'scored',
          flockAnswer: ['Gift'],
          results,
          playerAnswers,
          answeredPlayerIds: PLAYER_IDS.filter((id) => id !== 'p6'),
          answerCount: 9,
          commentary: 'Apparently everyone forgets gifts!',
        }),
        players,
        isHost,
        currentPlayerId: asPlayerId,
      }
    }

    case 'reveal-no-flock': {
      // No majority → everyone is outlier; rotten egg only applies when there IS a flock
      // and exactly one player answered alone (see functions scoring.ts).
      const results = Object.fromEntries(
        PLAYER_IDS.map((id) => [id, 'outlier']),
      ) as Record<string, RoundData['results'][string]>
      const playerAnswers: Record<string, string> = {
        p1: 'Gift',
        p2: 'Gift',
        p3: 'Phone',
        p4: 'Phone',
        p5: 'Snacks',
        p6: 'Snacks',
        p7: 'Drinks',
        p8: 'Drinks',
        p9: 'Ice',
        p10: 'Ice',
      }
      return {
        game: baseGame(),
        round: baseRound({
          status: 'scored',
          flockAnswer: [],
          results,
          playerAnswers,
          answeredPlayerIds: PLAYER_IDS,
          answerCount: 10,
          commentary: 'The flock could not agree on anything!',
        }),
        players,
        isHost,
        currentPlayerId: asPlayerId,
      }
    }

    case 'leaderboard':
      return {
        game: baseGame(),
        round: baseRound({ answeredPlayerIds: answered7, answerCount: 7 }),
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
          p.id === 'p2' || p.id === 'p10' ? { ...p, eggs: 7 } : { ...p, eggs: Math.min(p.eggs, 3) },
        ),
        isHost,
        currentPlayerId: asPlayerId,
        isFinal: true,
      }

    case 'game-over-empty':
      return {
        game: baseGame({ status: 'finished', currentRound: 10 }),
        round: null,
        players: players.map((p) => ({ ...p, eggs: 0 })),
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
      return getFlockPreviewScenario('lobby', asPlayerId)
  }
}
