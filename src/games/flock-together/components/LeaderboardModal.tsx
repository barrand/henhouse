import type { PlayerData } from '../types'

interface Props {
  players: PlayerData[]
  currentPlayerId: string | null
  onClose: () => void
}

export default function LeaderboardModal({ players, currentPlayerId, onClose }: Props) {
  const sorted = [...players].sort((a, b) => b.score - a.score)

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-deep/90" />
      <div
        className="relative w-full max-w-sm bg-surface-container-lowest sticker-card rounded-t-2xl p-6 pb-8 max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky -top-6 z-10 -mx-6 -mt-6 px-6 py-4 bg-surface-container-lowest flex justify-between items-center mb-4 border-b border-outline-variant/50">
          <div className="flex items-center gap-2">
            <img src="/images/generated-comic/midnight/hen-magnifying.png" alt="" className="w-10 h-10 animate-hen-bob" />
            <h2 className="font-headline text-xl font-bold text-on-surface">STANDINGS</h2>
          </div>
          <button aria-label="Close standings" onClick={onClose} className="text-on-surface-variant hover:text-on-surface-variant text-2xl">&times;</button>
        </div>

        {sorted.length === 0 ? (
          <p className="text-on-surface-variant text-center py-4 font-body">No players yet</p>
        ) : (
          <ul className="space-y-3">
            {sorted.map((player, i) => (
              <li
                key={player.id}
                className={`flex items-center justify-between py-2 px-3 rounded-lg font-body ${
                  player.id === currentPlayerId ? 'bg-secondary-fixed/30 border border-secondary-fixed-dim' : ''
                }`}
              >
                <span className="flex items-center gap-1.5 font-medium text-on-surface">
                  {i + 1}. {player.name}
                  {player.id === currentPlayerId && ' ←'}
                </span>
                <span className="font-headline text-lg font-bold tabular-nums text-on-surface">{player.score}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
