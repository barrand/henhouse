import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { GameData, PlayerData } from '../types'
import RottenEgg from './RottenEgg'
import { flockRematch } from '../service'

interface Props {
  game: GameData
  players: PlayerData[]
  isHost: boolean
  isFinal?: boolean
}

export default function Scoreboard({ game, players, isHost, isFinal }: Props) {
  const navigate = useNavigate()
  const [rematching, setRematching] = useState(false)
  const [rematchError, setRematchError] = useState('')
  const handleRematch = async () => {
    setRematching(true)
    setRematchError('')
    try {
      await flockRematch(game.id)
      // Navigation is handled by the rematchCode effect in Game.tsx
    } catch (err: any) {
      setRematchError(err.message ?? 'Failed to start new game')
      setRematching(false)
    }
  }

  const sorted = [...players].sort((a, b) => b.eggs - a.eggs)
  const topScore = sorted[0]?.eggs ?? 0
  const winner = isFinal && topScore > 0 ? sorted[0] : null
  const isTie = isFinal && topScore > 0 && sorted.filter((p) => p.eggs === topScore).length > 1

  return (
    <div className="min-h-screen bg-surface linen-texture px-4 py-8">
      <div className="max-w-sm mx-auto space-y-6">
        {isFinal && !winner && (
          <div className="text-center space-y-2">
            <p className="font-headline text-3xl font-bold text-on-surface">GAME OVER!</p>
            <img src="/images/hen-runner.svg" alt="" className="w-20 h-20 mx-auto" />
            <p className="font-headline text-xl font-bold text-on-surface">
              No one scored a single egg!
            </p>
            <p className="text-on-surface-variant font-body">The whole flock went rogue.</p>
          </div>
        )}

        {isFinal && winner && isTie && (
          <div className="text-center space-y-2">
            <p className="font-headline text-3xl font-bold text-on-surface">GAME OVER!</p>
            <div className="flex justify-center gap-2">
              <img src="/images/hen-winner.svg" alt="" className="w-16 h-16" />
              <img src="/images/hen-winner.svg" alt="" className="w-16 h-16" />
            </div>
            <p className="font-headline text-xl font-bold text-on-surface">
              It's a tie at {topScore} eggs!
            </p>
            <p className="text-on-surface-variant font-body">The flock couldn't pick a leader.</p>
          </div>
        )}

        {isFinal && winner && !isTie && (
          <div className="text-center space-y-2">
            <p className="font-headline text-3xl font-bold text-on-surface">GAME OVER!</p>
            <img src="/images/hen-winner.svg" alt="" className="w-28 h-28 mx-auto animate-hen-celebrate" />
            <p className="font-headline text-2xl font-bold text-on-surface">
              {winner.name} RULES THE ROOST!
            </p>
            <p className="text-on-surface-variant font-body">with {winner.eggs} eggs</p>
          </div>
        )}

        {!isFinal && (
          <div className="text-center">
            <h2 className="font-headline text-2xl font-bold text-on-surface">THE PECKING ORDER</h2>
            <p className="text-on-surface-variant mt-1 font-body">Round {game.currentRound} of {game.settings.totalRounds}</p>
          </div>
        )}

        <ul className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 divide-y divide-outline-variant/20">
          {sorted.map((player, i) => (
            <li key={player.id} className="px-4 py-3 flex items-center justify-between">
              <span className="flex items-center gap-1.5 font-medium text-on-surface font-body">
                {i + 1}. {player.name}
                {game.rottenEggHolder === player.id && <RottenEgg size={18} />}
              </span>
              <div className="flex items-center gap-2">
                <span className="text-lg">{'🥚'.repeat(Math.min(player.eggs, 10))}</span>
                {player.eggs > 10 && <span className="text-sm text-on-surface-variant font-body">x{player.eggs}</span>}
              </div>
            </li>
          ))}
        </ul>

        {game.rottenEggHolder && (
          <div className="flex items-center justify-center gap-2 text-sm font-medium font-body">
            <RottenEgg size={20} />
            <span className="text-tertiary">
              {players.find((p) => p.id === game.rottenEggHolder)?.name} has the Rotten Egg!
            </span>
          </div>
        )}

        {isFinal && (
          <div className="space-y-3">
            {isHost ? (
              <>
                <button
                  onClick={handleRematch}
                  disabled={rematching}
                  className="w-full bg-primary text-on-primary h-14 rounded-xl font-body font-semibold tracking-wide shadow-[0_12px_32px_rgba(0,0,0,0.4)] hover:opacity-90 active:scale-95 transition-all disabled:opacity-50"
                >
                  {rematching ? 'Starting...' : 'PLAY AGAIN'}
                </button>
                <button
                  onClick={() => navigate('/')}
                  className="w-full bg-surface-container-lowest border-2 border-primary text-primary h-14 rounded-xl font-body font-semibold tracking-wide hover:bg-primary-fixed/20 active:scale-95 transition-all"
                >
                  BACK TO HOME
                </button>
                {rematchError && <p className="text-center text-error text-sm">{rematchError}</p>}
              </>
            ) : (
              <>
                <p className="text-center text-on-surface-variant text-sm animate-pulse">
                  Waiting for host to start a new game...
                </p>
                <button
                  onClick={() => navigate('/')}
                  className="w-full bg-surface-container-lowest border-2 border-primary text-primary h-14 rounded-xl font-body font-semibold tracking-wide hover:bg-primary-fixed/20 active:scale-95 transition-all"
                >
                  BACK TO HOME
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
