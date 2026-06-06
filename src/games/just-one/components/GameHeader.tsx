import type { GameData, PlayerData, RoundData } from '../types'

interface Props {
  game: GameData
  players: PlayerData[]
  round: RoundData | null
}

export default function GameHeader({ game, players, round }: Props) {
  const guesserPlayer = players.find((p) => p.id === game.currentGuesser)
  const sortedPlayers = [...players].sort((a, b) => b.score - a.score)

  return (
    <header className="bg-surface-container-lowest border-b border-outline-variant/15 px-4 py-3 sticky top-0 z-20 backdrop-blur-sm">
      <div className="max-w-md mx-auto">
        <div className="flex items-center justify-between mb-2">
          <div>
            <p className="font-label text-[10px] uppercase tracking-[0.2em] text-secondary">
              Round {game.currentRound} of {game.settings.totalRounds}
            </p>
            <p className="font-headline text-sm font-semibold text-on-surface">
              <span className="text-tertiary">{guesserPlayer?.name ?? '...'}</span>{' '}
              <span className="text-on-surface-variant font-normal">is guessing</span>
            </p>
          </div>
          {round?.status && (
            <span className="text-xs font-label uppercase tracking-wider text-on-surface-variant">
              {round.status.replace('-', ' ')}
            </span>
          )}
        </div>

        {/* Mini scoreboard */}
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
          {sortedPlayers.map((p) => {
            const isGuesser = p.id === game.currentGuesser
            return (
              <div
                key={p.id}
                className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 ${
                  isGuesser
                    ? 'bg-tertiary-fixed text-secondary border border-tertiary'
                    : 'bg-surface-container-low text-on-surface'
                }`}
              >
                <span>{p.name}</span>
                {isGuesser && <span className="text-[10px]">👀</span>}
                <span className="font-bold tabular-nums">{p.score}</span>
              </div>
            )
          })}
        </div>
      </div>
    </header>
  )
}
