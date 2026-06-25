import type { GameData, RoundData, PlayerData } from '../types'
import { advanceRound } from '../service'
import RottenEgg from './RottenEgg'

interface Props {
  game: GameData
  round: RoundData
  players: PlayerData[]
  isHost: boolean
  currentPlayerId: string | null
}

export default function RevealBoard({ game, round, players, isHost, currentPlayerId }: Props) {
  const playerNameById = (id: string) => players.find((p) => p.id === id)?.name ?? id

  if (round.status === 'revealing') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-12">
        <div className="text-center space-y-3">
          <img src="/images/hen-thinking.svg" alt="" className="w-20 h-20 animate-hen-bob mx-auto" />
          <p className="font-headline text-xl font-bold text-on-surface">Checking all answers...</p>
          <p className="text-outline text-sm font-body">The flock is being counted</p>
        </div>
      </div>
    )
  }

  const playerAnswers = round.playerAnswers ?? {}
  const results = round.results ?? {}
  const hasFlock = Object.values(results).some((r) => r === 'flock')

  const sortedPlayers = Object.entries(results).sort(([, a], [, b]) => {
    const order: Record<string, number> = { flock: 0, outlier: 1, rotten: 2, 'no-answer': 3 }
    return (order[a] ?? 4) - (order[b] ?? 4)
  })

  const isLastRound = game.currentRound >= game.settings.totalRounds

  const handleAdvance = async () => {
    try {
      await advanceRound(game.id)
    } catch (err) {
      console.error('Failed to advance:', err)
    }
  }

  const resultBadge = (result: string) => {
    switch (result) {
      case 'flock':
        return <span className="text-xs font-bold bg-primary-fixed text-on-primary-fixed px-2 py-0.5 rounded-full font-label">FLOCK</span>
      case 'rotten':
        return (
          <span className="flex items-center gap-1 text-xs font-bold bg-tertiary-fixed text-on-tertiary-fixed px-2 py-0.5 rounded-full font-label">
            <RottenEgg size={14} animate />
            ROTTEN EGG
          </span>
        )
      case 'outlier':
        return <span className="text-xs font-bold bg-surface-container-high text-on-surface-variant px-2 py-0.5 rounded-full font-label">FLOWN THE COOP</span>
      case 'no-answer':
        return <span className="text-xs font-bold bg-surface-container text-outline px-2 py-0.5 rounded-full font-label">NO ANSWER</span>
      default:
        return null
    }
  }

  return (
    <div className="flex-1 px-4 py-6 space-y-4">
      <div className="text-center">
        <p className="font-headline text-lg font-bold text-on-surface">{round.question}</p>
      </div>

      {hasFlock ? (
        <div className="bg-primary-fixed border-2 border-primary-fixed-dim rounded-2xl p-4 text-center">
          <p className="font-label text-sm font-bold text-on-primary-fixed-variant uppercase tracking-wide">The Flock Said</p>
          <p className="font-headline text-2xl font-bold text-on-primary-fixed mt-1">"{round.flockAnswer?.[0]}"</p>
        </div>
      ) : (
        <div className="bg-secondary-fixed border-2 border-secondary-fixed-dim rounded-2xl p-4 text-center">
          <p className="font-headline text-lg font-bold text-on-secondary-fixed">No Flock!</p>
          <p className="text-on-secondary-fixed-variant text-sm font-body">No eggs awarded this round.</p>
        </div>
      )}

      {round.commentary && (
        <div className="bg-secondary-fixed/20 border border-secondary-fixed-dim/50 rounded-xl p-3 text-center">
          <p className="text-on-surface-variant text-sm italic font-headline">"{round.commentary}"</p>
        </div>
      )}

      <div className="space-y-2">
        {sortedPlayers.map(([playerId, result]) => {
          const isYou = playerId === currentPlayerId
          return (
            <div
              key={playerId}
              className={`rounded-xl p-3 border flex items-center justify-between ${
                isYou ? 'ring-2 ring-secondary-fixed-dim ' : ''
              }${
                result === 'flock'
                  ? 'bg-primary-fixed/20 border-primary-fixed-dim'
                  : result === 'rotten'
                  ? 'bg-tertiary-fixed/20 border-tertiary-fixed-dim'
                  : 'bg-surface-container-lowest border-outline-variant/30'
              }`}
            >
              <div className="flex flex-col gap-0.5">
                <span className="text-on-surface font-medium font-body">
                  {playerNameById(playerId)}
                  {isYou && (
                    <span className="ml-1.5 text-xs font-bold bg-secondary-fixed text-on-secondary-fixed-variant px-1.5 py-0.5 rounded-full font-label">
                      you
                    </span>
                  )}
                </span>
                <span className="text-outline text-sm font-body">
                  {playerAnswers[playerId] ? `"${playerAnswers[playerId]}"` : '—'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {result === 'rotten' && <img src="/images/hen-embarrassed.svg" alt="" className="w-10 h-10 animate-hen-pop" />}
                {resultBadge(result)}
                {result === 'flock' && <span className="text-sm font-bold text-primary font-body">+1</span>}
              </div>
            </div>
          )
        })}
      </div>

      <div className="text-center pt-4 space-y-2">
        {isHost ? (
          <button
            onClick={handleAdvance}
            className="w-full bg-primary text-on-primary py-3 rounded-xl font-body font-semibold tracking-wide hover:opacity-90 transition-all"
          >
            {isLastRound ? 'SEE FINAL PECKING ORDER' : 'NEXT ROUND'}
          </button>
        ) : (
          <p className="text-sm text-outline font-body">Waiting for host to continue...</p>
        )}
      </div>
    </div>
  )
}
