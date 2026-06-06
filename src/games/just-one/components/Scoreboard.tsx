import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { GameData, PlayerData } from '../types'
import { justOneRematch } from '../service'

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
      await justOneRematch(game.id)
    } catch (err: any) {
      setRematchError(err.message ?? 'Failed to start new game')
      setRematching(false)
    }
  }

  const sorted = [...players].sort((a, b) => b.score - a.score)
  const topScore = sorted[0]?.score ?? 0
  const winner = isFinal && topScore > 0 ? sorted[0] : null
  const isTie = isFinal && topScore > 0 && sorted.filter((p) => p.score === topScore).length > 1

  return (
    <div className="min-h-screen bg-surface linen-texture px-4 py-8">
      <div className="max-w-sm mx-auto space-y-6">
        {isFinal && !winner && (
          <div className="text-center space-y-2">
            <p className="font-headline text-3xl font-bold text-on-surface">GAME OVER!</p>
            <p className="text-5xl">🙊</p>
            <p className="font-headline text-xl font-bold text-on-surface">
              Nobody scored!
            </p>
            <p className="text-on-surface-variant font-body">Better luck next time.</p>
          </div>
        )}

        {isFinal && winner && isTie && (
          <div className="text-center space-y-2">
            <p className="font-headline text-3xl font-bold text-on-surface">GAME OVER!</p>
            <p className="text-5xl">🏆🤝🏆</p>
            <p className="font-headline text-xl font-bold text-on-surface">
              Tied at {topScore} points!
            </p>
          </div>
        )}

        {isFinal && winner && !isTie && (
          <div className="text-center space-y-2">
            <p className="font-headline text-3xl font-bold text-on-surface">GAME OVER!</p>
            <p className="text-5xl">🏆</p>
            <p className="font-headline text-2xl font-bold text-on-surface">
              {winner.name} WINS!
            </p>
            <p className="text-on-surface-variant font-body">with {winner.score} points</p>
          </div>
        )}

        <ul className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 divide-y divide-outline-variant/20">
          {sorted.map((player, i) => (
            <li key={player.id} className="px-4 py-3 flex items-center justify-between">
              <span className="flex items-center gap-1.5 font-medium text-on-surface font-body">
                {i + 1}. {player.name}
              </span>
              <span className="font-headline font-bold tabular-nums text-on-surface text-lg">
                {player.score}
              </span>
            </li>
          ))}
        </ul>

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
