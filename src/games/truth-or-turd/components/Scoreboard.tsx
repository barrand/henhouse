import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { GameData, PlayerData } from '../types'
import { truthOrTurdRematch } from '../service'

interface Props {
  game: GameData
  players: PlayerData[]
  isHost: boolean
  isFinal?: boolean
  currentPlayerId?: string | null
}

export default function Scoreboard({ game, players, isHost, isFinal, currentPlayerId = null }: Props) {
  const navigate = useNavigate()
  const [rematching, setRematching] = useState(false)
  const [rematchError, setRematchError] = useState('')

  const sorted = [...players].sort((a, b) => b.score - a.score)
  const topScore = sorted[0]?.score ?? 0
  const winners = isFinal && sorted.length > 0 ? sorted.filter((player) => player.score === topScore) : []
  const winner = winners.length === 1 ? winners[0] : null
  const isTie = winners.length > 1

  const handleRematch = async () => {
    setRematching(true)
    setRematchError('')
    try {
      await truthOrTurdRematch(game.id)
    } catch (err: unknown) {
      setRematchError(err instanceof Error ? err.message : 'Failed to start new game')
      setRematching(false)
    }
  }

  return (
    <div className="min-h-screen bg-surface linen-texture px-4 py-8">
      <div className="max-w-sm mx-auto space-y-6">
        {isFinal && topScore <= 0 && (
          <div className="text-center space-y-2">
            <p className="font-headline text-3xl font-bold text-on-surface">GAME OVER!</p>
            <img src="/images/generated-comic/hen-confused.png" alt="" className="w-24 h-24 mx-auto animate-hen-pop" />
            <p className="font-headline text-xl font-bold text-on-surface">Nobody found the truth.</p>
            <p className="text-on-surface-variant font-body">A historic pile of turds.</p>
          </div>
        )}

        {isFinal && winner && (
          <div className="text-center space-y-2">
            <p className="font-headline text-3xl font-bold text-on-surface">GAME OVER!</p>
            <img src="/images/generated-comic/hen-winner.png" alt="" className="w-36 h-36 mx-auto animate-hen-celebrate" />
            <p className="font-headline text-2xl font-bold text-on-surface">
              {winner.name} RULES THE ROOST!
            </p>
            <p className="text-on-surface-variant font-body">with {winner.score} points</p>
          </div>
        )}

        {isFinal && isTie && topScore > 0 && (
          <div className="text-center space-y-2">
            <p className="font-headline text-3xl font-bold text-on-surface">GAME OVER!</p>
            <div className="flex justify-center gap-2">
              <img src="/images/generated-comic/hen-winner.png" alt="" className="w-16 h-16" />
              <img src="/images/generated-comic/hen-winner.png" alt="" className="w-16 h-16" />
            </div>
            <p className="font-headline text-xl font-bold text-on-surface">Shared victory at {topScore} points!</p>
            <p className="text-on-surface-variant font-body">{winners.map((player) => player.name).join(', ')} share the win.</p>
          </div>
        )}

        {!isFinal && (
          <div className="text-center">
            <h2 className="font-headline text-2xl font-bold text-on-surface">STANDINGS</h2>
            <p className="text-on-surface-variant mt-1 font-body">Round {game.currentRound} of {game.settings.totalRounds}</p>
          </div>
        )}

        <ul className="bg-surface-container-lowest rounded-2xl border border-outline-variant/60 divide-y divide-outline-variant/50 overflow-hidden">
          {sorted.map((player, index) => {
            const isYou = player.id === currentPlayerId
            return (
              <li
                key={player.id}
                className={`px-4 py-3 flex items-center justify-between gap-3 ${
                  isYou ? 'bg-primary-fixed text-on-primary-fixed ring-2 ring-inset ring-primary' : ''
                }`}
              >
                <span className={`flex items-center gap-2 font-medium font-body min-w-0 ${isYou ? 'text-on-primary-fixed' : 'text-on-surface'}`}>
                  <span className="shrink-0">{index + 1}.</span>
                  <span className="truncate">{player.name}</span>
                  {isYou && <span className="text-xs text-on-primary-fixed-variant shrink-0">← you</span>}
                </span>
                <span className={`font-headline text-lg font-bold tabular-nums shrink-0 ${isYou ? 'text-on-primary-fixed' : 'text-on-surface'}`}>
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
                  type="button"
                  onClick={handleRematch}
                  disabled={rematching}
                  className="w-full bg-primary text-on-primary h-14 rounded-xl font-body font-semibold tracking-wide shadow-[0_12px_32px_rgba(0,0,0,0.4)] hover:opacity-90 active:scale-95 transition-all disabled:opacity-50"
                >
                  {rematching ? 'Starting...' : 'PLAY AGAIN'}
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/')}
                  className="w-full bg-surface-container-lowest border-2 border-primary text-primary h-14 rounded-xl font-body font-semibold tracking-wide hover:bg-primary-fixed/20 active:scale-95 transition-all"
                >
                  BACK TO HOME
                </button>
                {rematchError && <p className="text-center text-error text-sm">{rematchError}</p>}
              </>
            ) : (
              <>
                <p className="text-center text-on-surface-variant text-sm animate-pulse">Waiting for host to start a new game...</p>
                <button
                  type="button"
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
