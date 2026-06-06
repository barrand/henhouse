import { useState } from 'react'
import type { GameData, PlayerData, RoundData } from '../types'
import { advanceRound } from '../service'

interface Props {
  game: GameData
  round: RoundData
  players: PlayerData[]
  isHost: boolean
  currentPlayerId: string | null
}

export default function RoundResultView({ game, round, players, isHost, currentPlayerId }: Props) {
  const [advancing, setAdvancing] = useState(false)
  const [error, setError] = useState('')

  const guesserPlayer = players.find((p) => p.id === game.currentGuesser)
  const isLastRound = game.currentRound >= game.settings.totalRounds

  const handleAdvance = async () => {
    setError('')
    setAdvancing(true)
    try {
      await advanceRound(game.id)
    } catch (err: any) {
      setError(err.message ?? 'Failed to advance')
      setAdvancing(false)
    }
  }

  const myPoints = currentPlayerId ? round.pointsThisRound[currentPlayerId] ?? 0 : 0
  const sortedPlayers = [...players].sort((a, b) => b.score - a.score)

  return (
    <main className="flex-1 flex flex-col px-6 py-6">
      <div className="max-w-md w-full mx-auto space-y-6">
        {/* Result Banner */}
        <div className="text-center space-y-3">
          {round.isCorrect ? (
            <>
              <div className="text-6xl">🎉</div>
              <h2 className="font-headline text-3xl font-bold text-primary">CORRECT!</h2>
              <p className="text-on-surface-variant font-body">
                {guesserPlayer?.name} guessed{' '}
                <span className="font-semibold text-on-surface">{round.guesserAnswer}</span>
              </p>
            </>
          ) : (
            <>
              <div className="text-6xl">😬</div>
              <h2 className="font-headline text-3xl font-bold text-error">Not quite!</h2>
              <p className="text-on-surface-variant font-body">
                {guesserPlayer?.name} guessed{' '}
                <span className="font-semibold text-on-surface">{round.guesserAnswer}</span>
              </p>
            </>
          )}
        </div>

        {/* Secret Word */}
        <div className="bg-tertiary-fixed border-2 border-tertiary rounded-xl p-5 text-center">
          <p className="font-label text-[10px] uppercase tracking-[0.2em] text-secondary mb-1">
            The word was
          </p>
          <p className="font-headline text-4xl font-bold text-secondary tracking-tight">
            {round.secretWord}
          </p>
        </div>

        {/* Personal score */}
        {myPoints > 0 && (
          <div className="bg-primary/15 border-2 border-primary rounded-xl p-4 text-center">
            <p className="font-headline text-2xl font-bold text-primary">+{myPoints} pts!</p>
          </div>
        )}

        {/* Updated scoreboard */}
        <div>
          <h3 className="font-label text-xs uppercase tracking-wider text-secondary mb-2 px-1">
            Standings
          </h3>
          <ul className="bg-surface-container-lowest rounded-xl border border-outline-variant/15 divide-y divide-outline-variant/15">
            {sortedPlayers.map((p, i) => {
              const earned = round.pointsThisRound[p.id] ?? 0
              return (
                <li key={p.id} className="px-4 py-3 flex items-center justify-between">
                  <span className="flex items-center gap-2 font-medium text-on-surface font-body">
                    {i + 1}. {p.name}
                    {p.id === currentPlayerId && (
                      <span className="text-xs text-on-surface-variant">(you)</span>
                    )}
                  </span>
                  <div className="flex items-center gap-2">
                    {earned > 0 && (
                      <span className="text-xs text-primary font-bold">+{earned}</span>
                    )}
                    <span className="font-headline font-bold tabular-nums text-on-surface">
                      {p.score}
                    </span>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>

        {/* Action button */}
        {isHost ? (
          <button
            onClick={handleAdvance}
            disabled={advancing}
            className="w-full bg-primary text-on-primary h-14 rounded-xl font-body font-semibold tracking-wide shadow-[0_8px_24px_rgba(0,0,0,0.3)] hover:opacity-90 active:scale-95 transition-all disabled:opacity-50"
          >
            {advancing ? 'Loading...' : isLastRound ? 'See Final Scores →' : 'Next Round →'}
          </button>
        ) : (
          <p className="text-center text-on-surface-variant text-sm animate-pulse">
            Waiting for host to continue...
          </p>
        )}

        {error && <p className="text-center text-error text-sm">{error}</p>}
      </div>
    </main>
  )
}
