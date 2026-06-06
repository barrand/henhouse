import { useState } from 'react'
import type { GameData, PlayerData } from '../types'
import { startGame } from '../service'

interface Props {
  game: GameData
  players: PlayerData[]
  isHost: boolean
  currentPlayer: PlayerData | null
}

export default function Lobby({ game, players, isHost, currentPlayer }: Props) {
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState('')

  const handleStart = async () => {
    if (players.length < 2) return setError('Need at least 2 players')
    setError('')
    setStarting(true)
    try {
      await startGame(game.id)
    } catch (err: any) {
      setError(err.message ?? 'Failed to start game')
      setStarting(false)
    }
  }

  const buttonLabel = starting
    ? 'Starting...'
    : players.length < 2
    ? `Need ${2 - players.length} more players`
    : 'Start Game'

  return (
    <div className="min-h-screen bg-surface linen-texture font-body text-on-surface relative overflow-hidden">
      <main className="max-w-md mx-auto px-6 pt-4 pb-32 relative z-10">
        {/* Header + Room Code */}
        <div className="text-center mb-8">
          <h2 className="font-headline text-4xl font-bold text-on-surface mb-2 tracking-tight">JUST ONE</h2>
          <p className="text-on-surface-variant text-sm">One clue. One guess. One word.</p>

          <div className="mt-6 inline-flex items-center gap-4 bg-surface-container-lowest px-8 py-4 rounded-xl shadow-[0_4px_16px_rgba(0,0,0,0.3)] border border-outline-variant/10">
            <div className="flex flex-col items-center">
              <span className="font-label text-[10px] uppercase tracking-[0.2em] text-secondary mb-1">Room Code</span>
              <span className="font-headline text-3xl font-bold text-on-surface tracking-[0.3em]">{game.code}</span>
            </div>
            <button
              onClick={() => navigator.clipboard.writeText(game.code)}
              className="w-10 h-10 rounded-full bg-tertiary-fixed flex items-center justify-center text-secondary hover:bg-tertiary-fixed-dim transition-colors"
            >
              <span className="material-symbols-outlined text-xl">content_copy</span>
            </button>
          </div>
        </div>

        {/* Players */}
        <section className="mb-8">
          <div className="flex justify-between items-end mb-3 px-1">
            <h3 className="font-headline text-xl font-semibold text-primary">
              Players <span className="text-on-surface-variant font-normal text-sm ml-1">({players.length})</span>
            </h3>
          </div>
          <div className="bg-surface-container-lowest rounded-xl p-6 shadow-[0_4px_16px_rgba(0,0,0,0.3)] border border-outline-variant/15">
            <ul className="space-y-4">
              {players.map((p) => (
                <li key={p.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className={`w-2 h-2 rounded-full ${p.connected ? 'bg-primary shadow-[0_0_8px_rgba(168,201,169,0.5)]' : 'bg-outline-variant'}`} />
                    <span className="font-medium">
                      {p.name}
                      {(p.id === game.hostId || p.id === currentPlayer?.id) && (
                        <span className="text-on-surface-variant text-xs font-normal ml-1">
                          {p.id === game.hostId && '(host)'}
                          {p.id === currentPlayer?.id && ' ← you'}
                        </span>
                      )}
                    </span>
                  </div>
                </li>
              ))}
              <li className="pt-2 border-t border-outline-variant/10">
                <p className="italic text-on-surface-variant text-sm text-center">Waiting for others...</p>
              </li>
            </ul>
          </div>
        </section>

        {/* How to Play */}
        <section className="mb-8 bg-surface-container-low p-5 rounded-xl border border-outline-variant/10">
          <h3 className="font-headline text-base font-semibold text-on-surface mb-3">How to Play</h3>
          <ol className="text-sm text-on-surface-variant space-y-2 list-decimal list-inside">
            <li>One player is the <strong>guesser</strong>. They close their eyes.</li>
            <li>Everyone else sees a <strong>secret word</strong> and writes a <strong>one-word clue</strong>.</li>
            <li>Duplicate or similar clues get <strong>eliminated</strong>.</li>
            <li>The guesser sees the remaining clues and tries to guess.</li>
            <li>Get it right: <strong>+10 points</strong> for everyone whose clue helped.</li>
          </ol>
        </section>

        {/* Game Settings */}
        <section className="mb-8">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-surface-container-low p-4 rounded-xl border border-outline-variant/10 flex flex-col gap-1">
              <span className="font-label text-[10px] uppercase tracking-wider text-secondary">Rounds</span>
              <span className="font-headline text-xl font-bold">{game.settings.totalRounds}</span>
            </div>
            <div className="bg-surface-container-low p-4 rounded-xl border border-outline-variant/10 flex flex-col gap-1">
              <span className="font-label text-[10px] uppercase tracking-wider text-secondary">Timer</span>
              <span className="font-headline text-xl font-bold">{game.settings.secondsPerRound}s</span>
            </div>
          </div>
        </section>

        {/* Start Button */}
        {isHost && (
          <button
            onClick={handleStart}
            disabled={starting || players.length < 2}
            className="w-full bg-primary text-on-primary h-14 rounded-xl font-body font-semibold tracking-wide shadow-[0_12px_32px_rgba(0,0,0,0.4)] hover:opacity-90 active:scale-95 transition-all disabled:opacity-50"
          >
            {buttonLabel}
          </button>
        )}

        {!isHost && (
          <p className="text-center text-on-surface-variant text-sm animate-pulse">
            Waiting for host to start...
          </p>
        )}

        {error && <p className="text-center text-error text-sm mt-3">{error}</p>}
      </main>
    </div>
  )
}
