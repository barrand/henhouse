import type { GameData, PlayerData } from '../types'

interface Props {
  game: GameData
  players: PlayerData[]
  currentPlayerId: string | null
  onClose: () => void
}

export default function LeaderboardModal({ game, players, currentPlayerId, onClose }: Props) {
  const sorted = [...players].sort((a, b) => b.score - a.score)
  const guesserId = game.currentGuesser

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-on-surface/40" />
      <div
        className="relative w-full max-w-sm bg-surface-container-lowest rounded-t-2xl p-6 pb-8 max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-headline text-xl font-bold text-on-surface">STANDINGS</h2>
          <button
            onClick={onClose}
            className="text-outline hover:text-on-surface-variant text-2xl"
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        {sorted.length === 0 ? (
          <p className="text-outline text-center py-4 font-body">No players yet</p>
        ) : (
          <ul className="space-y-2">
            {sorted.map((player, i) => {
              const isYou = player.id === currentPlayerId
              const isGuesser = player.id === guesserId
              return (
                <li
                  key={player.id}
                  className={`flex items-center justify-between py-2.5 px-3 rounded-lg font-body ${
                    isYou ? 'bg-secondary-fixed/30 border border-secondary-fixed-dim' : ''
                  }`}
                >
                  <span className="flex items-center gap-1.5 font-medium text-on-surface">
                    <span className="text-outline w-5 tabular-nums">{i + 1}.</span>
                    {player.name}
                    {isGuesser && (
                      <span className="text-[10px] font-bold bg-tertiary-container text-on-tertiary-container px-1.5 py-0.5 rounded-full font-label">
                        👀 GUESSER
                      </span>
                    )}
                    {isYou && <span className="text-xs text-on-surface-variant">← you</span>}
                  </span>
                  <span className="font-headline text-lg font-bold tabular-nums text-on-surface">
                    {player.score}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
