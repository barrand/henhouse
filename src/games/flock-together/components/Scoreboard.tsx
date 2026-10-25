import { useState } from 'react'
import BottomActionDock from '../../../shared/BottomActionDock'
import { useNavigate } from 'react-router-dom'
import type { GameData, PlayerData } from '../types'
import { flockRematch } from '../service'

interface Props {
  game: GameData
  players: PlayerData[]
  isHost: boolean
  isFinal?: boolean
  currentPlayerId: string | null
}

function ordinal(rank: number) {
  const lastTwo = rank % 100
  const suffix = lastTwo >= 11 && lastTwo <= 13 ? 'th'
    : rank % 10 === 1 ? 'st' : rank % 10 === 2 ? 'nd' : rank % 10 === 3 ? 'rd' : 'th'
  return `${rank}${suffix}`
}

export default function Scoreboard({ game, players, isHost, isFinal, currentPlayerId }: Props) {
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

  const sorted = [...players].sort((a, b) => b.score - a.score)
  const topScore = sorted[0]?.score ?? 0
  const winners = isFinal && topScore > 0 ? sorted.filter((p) => p.score === topScore) : []
  const winner = winners.length === 1 ? winners[0] : null
  const isTie = winners.length > 1
  const currentPlayer = players.find((player) => player.id === currentPlayerId)
  const yourRank = currentPlayer ? sorted.findIndex((player) => player.id === currentPlayer.id) + 1 : null

  return (
    <div data-action-screen className="min-h-screen bg-surface linen-texture px-4 py-8">
      <div className="max-w-sm mx-auto space-y-6">
        {isFinal && topScore <= 0 && (
          <div className="text-center space-y-2">
            <p className="font-headline text-3xl font-bold text-on-surface">GAME OVER!</p>
            <img src="/images/generated-comic/midnight/hen-runner.png" alt="" className="w-20 h-20 mx-auto" />
            <p className="font-headline text-xl font-bold text-on-surface">
              No one scored a single point!
            </p>
            <p className="text-on-surface-variant font-body">The whole flock went rogue.</p>
          </div>
        )}

        {isFinal && winner && isTie && (
          <div className="text-center space-y-2">
            <p className="font-headline text-3xl font-bold text-on-surface">GAME OVER!</p>
            <div className="flex justify-center gap-2">
              <img src="/images/generated-comic/midnight/hen-winner.png" alt="" className="w-16 h-16" />
              <img src="/images/generated-comic/midnight/hen-winner.png" alt="" className="w-16 h-16" />
            </div>
            <p className="font-headline text-xl font-bold text-on-surface">
              Shared victory at {topScore} points!
            </p>
            <p className="text-on-surface-variant font-body">
              {winners.map((p) => p.name).join(', ')} share the win.
            </p>
          </div>
        )}

        {isFinal && winner && !isTie && (
          <div className="text-center space-y-2">
            <p className="font-headline text-3xl font-bold text-on-surface">GAME OVER!</p>
            <img src="/images/generated-comic/midnight/hen-winner.png" alt="" className="w-36 h-36 mx-auto animate-hen-celebrate" />
            <p className="font-headline text-2xl font-bold text-primary">
              {winner.name} RULES THE ROOST!
            </p>
            <p className="text-on-surface-variant font-body">with {winner.score} points</p>
          </div>
        )}

        {!isFinal && (
          <div className="text-center">
            <h2 className="font-headline text-2xl font-bold text-on-surface">STANDINGS</h2>
            <p className="text-on-surface-variant mt-1 font-body">Round {game.currentRound} of {game.settings.totalRounds}</p>
          </div>
        )}

        {isFinal && currentPlayer && yourRank && (
          <section aria-label="Your final standing" className="rounded-2xl bg-primary-fixed border border-primary-fixed-dim p-4">
            <p className="font-label text-[11px] uppercase tracking-widest font-bold text-on-primary-fixed-variant">Your finish</p>
            <div className="flex items-baseline justify-between gap-3 mt-1">
              <p className="font-headline text-xl font-bold text-on-primary-fixed">{ordinal(yourRank)} place</p>
              <p className="font-headline text-xl font-bold tabular-nums text-on-primary-fixed">{currentPlayer.score}</p>
            </div>
          </section>
        )}

        <ul className="bg-surface-container-lowest rounded-2xl border border-outline-variant divide-y divide-outline-variant">
          {sorted.map((player, i) => {
            const isYou = player.id === currentPlayerId
            return (
            <li key={player.id} className={`px-4 py-3 flex items-center justify-between gap-3 ${isYou ? 'bg-primary-fixed' : ''}`}>
              <span className={`flex flex-wrap min-w-0 items-center gap-1.5 font-medium font-body break-words ${isYou ? 'text-on-primary-fixed font-bold' : 'text-on-surface'}`}>
                {i + 1}. {player.name}
                {isYou && <span className="px-1.5 py-0.5 rounded-md border border-primary-fixed-dim text-[10px] font-label tracking-wide text-on-primary-fixed-variant">YOU</span>}
              </span>
              <span className={`font-headline text-lg font-bold tabular-nums ${isYou ? 'text-on-primary-fixed' : 'text-on-surface'}`}>{player.score}</span>
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
                  className="w-full bg-action text-on-action h-14 rounded-xl font-body font-semibold tracking-wide shadow-sticker hover:opacity-90 active:scale-95 transition-all disabled:opacity-50"
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
          </BottomActionDock>
        )}
      </div>
    </div>
  )
}
