import type { GameData, PlayerData } from '../types'
import RottenEgg from './RottenEgg'

interface Props {
  game: GameData
  players: PlayerData[]
  currentPlayerId: string | null
  onClose: () => void
}

export default function LeaderboardModal({ game, players, currentPlayerId, onClose }: Props) {
  const sorted = [...players].sort((a, b) => b.eggs - a.eggs)

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-on-surface/40" />
      <div
        className="relative w-full max-w-sm bg-surface-container-lowest rounded-t-2xl p-6 pb-8 max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-headline text-xl font-bold text-on-surface">THE PECKING ORDER</h2>
          <button onClick={onClose} className="text-outline hover:text-on-surface-variant text-2xl">&times;</button>
        </div>

        {sorted.length === 0 ? (
          <p className="text-outline text-center py-4 font-body">No players yet</p>
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
                  {game.rottenEggHolder === player.id && <RottenEgg size={18} />}
                  {player.id === currentPlayerId && ' ←'}
                </span>
                <div className="flex items-center gap-2">
                  <span>{'🥚'.repeat(Math.min(player.eggs, 8))}</span>
                  {player.eggs > 8 && <span className="text-sm text-on-surface-variant">x{player.eggs}</span>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
