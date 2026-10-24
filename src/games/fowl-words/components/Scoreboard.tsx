import { useState } from 'react'
import BottomActionDock from '../../../shared/BottomActionDock'
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
    <div data-action-screen className="min-h-screen bg-surface linen-texture px-4 py-8 font-body">
      <div className="max-w-sm mx-auto space-y-6">
        {isFinal && !winner && (
          <div className="text-center space-y-2">
            <img src="/images/generated-comic/midnight/hen-embarrassed.png" alt="" className="w-20 h-20 mx-auto" />
            <p className="font-headline text-4xl font-bold text-on-surface tracking-tight">GAME OVER</p>
            <p className="font-headline text-xl font-bold text-on-surface">Nobody scored!</p>
            <p className="text-on-surface-variant">Tough crowd. Try again?</p>
          </div>
        )}

        {isFinal && winner && isTie && (
          <div className="text-center space-y-2">
            <div className="flex justify-center gap-2">
              <img src="/images/generated-comic/midnight/hen-winner.png" alt="" className="w-16 h-16" />
              <img src="/images/generated-comic/midnight/hen-winner.png" alt="" className="w-16 h-16" />
            </div>
            <p className="font-headline text-4xl font-bold text-on-surface tracking-tight">GAME OVER</p>
            <p className="font-headline text-xl font-bold text-on-surface">
              Tied at {topScore} points!
            </p>
            <p className="text-on-surface-variant">The flock can’t agree.</p>
          </div>
        )}

        {isFinal && winner && !isTie && (
          <div className="text-center space-y-2">
            <img src="/images/generated-comic/midnight/hen-winner.png" alt="" className="w-32 h-32 mx-auto animate-hen-celebrate" />
            <p className="font-headline text-4xl font-bold text-on-surface tracking-tight">GAME OVER</p>
            <p className="font-headline text-2xl font-bold text-primary">
              {winner.name} wins!
            </p>
            <p className="text-on-surface-variant">with {winner.score} points</p>
          </div>
        )}

        {!isFinal && (
          <div className="text-center">
            <h2 className="font-headline text-2xl font-bold text-on-surface tracking-tight">THE STANDINGS</h2>
            <p className="text-on-surface-variant mt-1">Round {game.currentRound} of {game.settings.totalRounds}</p>
          </div>
        )}

        <ul className="bg-surface-container-lowest rounded-2xl border border-outline-variant divide-y divide-outline-variant overflow-hidden shadow-sm">
          {sorted.map((player, i) => {
            const isWinner = isFinal && winner && player.id === winner.id && !isTie
            return (
              <li
                key={player.id}
                className={`grid grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-2 px-4 py-3 ${
                  isWinner ? 'bg-primary-fixed/30' : ''
                }`}
              >
                <span className="text-on-surface-variant tabular-nums">{i + 1}.</span>
                <div className="flex min-w-0 items-center gap-2 font-medium text-on-surface">
                  <span className="truncate">{player.name}</span>
                  {isWinner && (
                    <span className="inline-flex shrink-0 items-center rounded-md border-2 border-primary px-1.5 py-0.5 text-[10px] font-label font-bold uppercase leading-none tracking-[0.08em] text-primary">
                      Champion
                    </span>
                  )}
                </div>
                <span className="font-headline font-bold tabular-nums text-on-surface text-lg text-right">
                  {player.score}
                </span>
              </li>
            )
          })}
        </ul>

        {isFinal && (
          <BottomActionDock>
            {isHost ? (
              <>
                <button
                  onClick={handleRematch}
                  disabled={rematching}
                  className="w-full bg-action text-on-action h-14 rounded-xl font-bold tracking-wide hover:opacity-90 active:scale-[0.98] disabled:bg-primary-container disabled:text-on-primary-container disabled:opacity-100 transition-all"
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
                <p className="text-center text-on-surface-variant text-sm animate-pulse">
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
          </BottomActionDock>
        )}
      </div>
    </div>
  )
}
