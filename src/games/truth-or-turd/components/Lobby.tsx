import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { GameData, PlayerData } from '../types'
import { startGame } from '../service'

interface Props {
  game: GameData
  players: PlayerData[]
  isHost: boolean
  currentPlayer: PlayerData | null
}

export default function Lobby({ game, players, isHost, currentPlayer }: Props) {
  const navigate = useNavigate()
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState('')

  const handleStart = async () => {
    if (players.length < 1) return setError('Need at least 1 player')
    setError('')
    setStarting(true)
    try {
      await startGame(game.id)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to start game')
      setStarting(false)
    }
  }

  return (
    <div className="min-h-screen bg-surface linen-texture font-body text-on-surface relative overflow-hidden">
      <div className="absolute -top-8 -left-8 opacity-[0.07] pointer-events-none -rotate-12">
        <img src="/images/generated-comic/botanical-fern.png" alt="" className="w-52 h-52 object-contain" />
      </div>
      <div className="absolute -bottom-6 -right-6 opacity-[0.07] pointer-events-none rotate-[140deg]">
        <img src="/images/generated-comic/botanical-wheat.png" alt="" className="w-48 h-48 object-contain" />
      </div>

      <main className="max-w-md mx-auto px-6 pt-4 pb-32 relative z-10">
        <div className="text-center mb-8">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="mb-4 inline-flex items-center gap-2 text-on-surface-variant hover:text-on-surface transition-colors"
          >
            <span className="material-symbols-outlined">arrow_back</span>
            <span className="text-sm font-medium">Back</span>
          </button>
          <img src="/images/generated-comic/hen-neutral.png" alt="" className="w-24 h-24 mx-auto mb-3 animate-hen-bob" />
          <h2 className="font-headline text-4xl font-bold text-on-surface mb-2 tracking-tight">TRUTH OR TURD</h2>
          <p className="text-on-surface-variant text-sm">A fast fact-or-flop showdown</p>

          <div className="mt-6 inline-flex items-center gap-4 bg-surface-container-lowest px-8 py-4 rounded-xl shadow-[0_4px_16px_rgba(0,0,0,0.3)] border border-outline-variant/60">
            <div className="flex flex-col items-center">
              <span className="font-label text-[10px] uppercase tracking-[0.2em] text-secondary mb-1">Room Code</span>
              <span className="font-headline text-3xl font-bold text-on-surface tracking-[0.3em]">{game.code}</span>
            </div>
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(game.code)}
              className="w-10 h-10 rounded-full bg-tertiary-fixed flex items-center justify-center text-on-tertiary-fixed hover:bg-tertiary-fixed-dim transition-colors"
              aria-label="Copy room code"
            >
              <span className="material-symbols-outlined text-xl">content_copy</span>
            </button>
          </div>
        </div>

        {game.includePatrioticQuestions && (
          <div className="mb-6 bg-surface-container-lowest border border-outline-variant/60 rounded-xl p-4 text-center">
            <p className="font-headline text-lg font-bold text-on-surface">Patriotic Edition is ON</p>
            <p className="text-on-surface-variant text-sm font-body mt-1">Every question is America-themed.</p>
          </div>
        )}

        <section className="mb-8">
          <div className="flex justify-between items-end mb-3 px-1">
            <h3 className="font-headline text-xl font-semibold text-primary">
              The Henhouse <span className="text-on-surface-variant font-normal text-sm ml-1">({players.length})</span>
            </h3>
          </div>
          <div className="bg-surface-container-lowest rounded-xl p-6 shadow-[0_4px_16px_rgba(0,0,0,0.3)] border border-outline-variant/60 relative overflow-hidden">
            <ul className="grid grid-cols-2 gap-x-4 gap-y-3 relative z-10">
              {players.map((player) => (
                <li key={player.id} className="flex items-center min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`shrink-0 w-2 h-2 rounded-full ${player.connected ? 'bg-primary shadow-[0_0_8px_rgba(168,201,169,0.5)]' : 'bg-outline-variant'}`} />
                    <span className="font-medium truncate">
                      {player.name}
                      {(player.id === game.hostId || player.id === currentPlayer?.id) && (
                        <span className="text-on-surface-variant text-xs font-normal ml-1">
                          {player.id === game.hostId && '(host)'}
                          {player.id === currentPlayer?.id && ' ← you'}
                        </span>
                      )}
                    </span>
                  </div>
                </li>
              ))}
              <li className="col-span-2 pt-2 border-t border-outline-variant/50 text-center">
                <p className="italic text-on-surface-variant text-sm">Waiting for the flock...</p>
              </li>
            </ul>
          </div>
        </section>

        <section className="mb-8 bg-surface-container-lowest rounded-xl border border-outline-variant/60 p-4">
          <div className="grid grid-cols-2 gap-3 text-center">
            <div>
              <p className="font-label text-[10px] uppercase tracking-[0.2em] text-secondary font-bold">Rounds</p>
              <p className="font-headline text-2xl font-bold text-on-surface">{game.settings.totalRounds}</p>
            </div>
            <div>
              <p className="font-label text-[10px] uppercase tracking-[0.2em] text-secondary font-bold">Timer</p>
              <p className="font-headline text-2xl font-bold text-on-surface">{game.settings.secondsPerRound}s</p>
            </div>
          </div>
        </section>

        {error && <p className="text-center text-error text-sm mb-4">{error}</p>}
      </main>

      {isHost ? (
        <div className="fixed bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-background via-background/95 to-transparent z-40">
          <div className="max-w-md mx-auto">
            <button
              type="button"
              onClick={handleStart}
              disabled={starting || players.length < 1}
              className="w-full bg-primary text-on-primary h-16 rounded-xl font-headline font-bold text-lg shadow-[0_12px_32px_rgba(0,0,0,0.4)] flex items-center justify-center gap-3 active:scale-95 disabled:opacity-50 transition-transform duration-200"
            >
              <span>{starting ? 'Starting...' : 'Start Game'}</span>
              {!starting && <span className="material-symbols-outlined">play_arrow</span>}
            </button>
          </div>
        </div>
      ) : (
        <div className="fixed bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-background via-background/95 to-transparent z-40">
          <div className="max-w-md mx-auto text-center">
            <p className="text-on-surface-variant animate-pulse">Waiting for host to start...</p>
          </div>
        </div>
      )}
    </div>
  )
}
