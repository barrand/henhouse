import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { GameData, PlayerData } from '../types'
import { fowlWordsRematch } from '../service'

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
      await fowlWordsRematch(game.id)
    } catch (err: any) {
      setRematchError(err.message ?? 'Couldn’t start a new game')
      setRematching(false)
    }
  }

  const sorted = [...players].sort((a, b) => b.score - a.score)
  const topScore = sorted[0]?.score ?? 0
  const winner = isFinal && topScore > 0 ? sorted[0] : null
  const isTie = isFinal && topScore > 0 && sorted.filter((p) => p.score === topScore).length > 1

  return (
    <div className="min-h-screen bg-surface linen-texture px-4 py-8 font-body">
      <div className="max-w-sm mx-auto space-y-6">
        {isFinal && !winner && (
          <div className="text-center space-y-2">
            <img src="/images/hen-embarrassed.svg" alt="" className="w-20 h-20 mx-auto" />
            <p className="font-headline text-4xl font-bold text-on-surface tracking-tight">GAME OVER</p>
            <p className="font-headline text-xl font-bold text-on-surface">Nobody scored!</p>
            <p className="text-outline">Tough crowd. Try again?</p>
          </div>
        )}

        {isFinal && winner && isTie && (
          <div className="text-center space-y-2">
            <div className="flex justify-center gap-2">
              <img src="/images/hen-winner.svg" alt="" className="w-16 h-16" />
              <img src="/images/hen-winner.svg" alt="" className="w-16 h-16" />
            </div>
            <p className="font-headline text-4xl font-bold text-on-surface tracking-tight">GAME OVER</p>
            <p className="font-headline text-xl font-bold text-on-surface">
              Tied at {topScore} points!
            </p>
            <p className="text-outline">The flock can’t agree.</p>
          </div>
        )}

        {isFinal && winner && !isTie && (
          <div className="text-center space-y-2">
            <img src="/images/hen-winner.svg" alt="" className="w-24 h-24 mx-auto animate-hen-celebrate" />
            <p className="font-headline text-4xl font-bold text-on-surface tracking-tight">GAME OVER</p>
            <p className="font-headline text-2xl font-bold text-primary">
              {winner.name} wins!
            </p>
            <p className="text-outline">with {winner.score} points</p>
          </div>
        )}

        {!isFinal && (
          <div className="text-center">
            <h2 className="font-headline text-2xl font-bold text-on-surface tracking-tight">THE STANDINGS</h2>
            <p className="text-outline mt-1">Round {game.currentRound} of {game.settings.totalRounds}</p>
          </div>
        )}

        <ul className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 divide-y divide-outline-variant/20 overflow-hidden shadow-sm">
          {sorted.map((player, i) => {
            const isWinner = isFinal && winner && player.id === winner.id && !isTie
            return (
              <li
                key={player.id}
                className={`px-4 py-3 flex items-center justify-between ${
                  isWinner ? 'bg-primary-fixed/30' : ''
                }`}
              >
                <span className="flex items-center gap-2 font-medium text-on-surface">
                  <span className="text-outline w-5 tabular-nums">{i + 1}.</span>
                  {player.name}
                  {isWinner && <span className="text-xs text-primary font-bold">CHAMPION</span>}
                </span>
                <span className="font-headline font-bold tabular-nums text-on-surface text-lg">
                  {player.score}
                </span>
              </li>
            )
          })}
        </ul>

        {isFinal && (
          <div className="space-y-3">
            {isHost ? (
              <>
                <button
                  onClick={handleRematch}
                  disabled={rematching}
                  className="w-full bg-primary text-on-primary h-14 rounded-xl font-bold tracking-wide hover:opacity-90 active:scale-[0.98] disabled:opacity-50 transition-all"
                >
                  {rematching ? 'Starting…' : 'Play again'}
                </button>
                <button
                  onClick={() => navigate('/')}
                  className="w-full bg-surface-container-lowest border-2 border-primary text-primary h-14 rounded-xl font-bold tracking-wide hover:bg-primary-fixed/20 active:scale-[0.98] transition-all"
                >
                  Back to home
                </button>
                {rematchError && <p className="text-center text-error text-sm">{rematchError}</p>}
              </>
            ) : (
              <>
                <p className="text-center text-outline text-sm animate-pulse">
                  Waiting for the host to start a rematch…
                </p>
                <button
                  onClick={() => navigate('/')}
                  className="w-full bg-surface-container-lowest border-2 border-primary text-primary h-14 rounded-xl font-bold tracking-wide hover:bg-primary-fixed/20 active:scale-[0.98] transition-all"
                >
                  Back to home
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
