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
    if (players.length < 2) return setError('Need at least 2 players')
    setError('')
    setStarting(true)
    try {
      await startGame(game.id)
    } catch (err: any) {
      setError(err.message ?? 'Couldn’t start the game')
      setStarting(false)
    }
  }

  const buttonLabel = starting
    ? 'Starting…'
    : players.length < 2
    ? `Need ${2 - players.length} more player${2 - players.length === 1 ? '' : 's'}`
    : 'Start the game'

  return (
    <div className="min-h-screen bg-surface linen-texture font-body text-on-surface relative overflow-hidden">
      <main className="max-w-md mx-auto px-6 pt-6 pb-24 relative z-10">
        {/* Title + Room Code */}
        <div className="text-center mb-6">
          <button
            onClick={() => navigate('/')}
            className="mb-4 inline-flex items-center gap-2 text-on-surface-variant hover:text-on-surface transition-colors"
          >
            <span className="material-symbols-outlined">arrow_back</span>
            <span className="text-sm font-medium">Back</span>
          </button>
          <h2 className="font-headline text-4xl font-bold text-on-surface mb-1 tracking-tight">FOWL WORDS</h2>
          <p className="text-on-surface-variant text-sm font-body">One clue. One word. Stay unique.</p>

          <div className="mt-5 inline-flex items-center gap-3 bg-surface-container-lowest px-6 py-3 rounded-2xl border border-outline-variant/30 shadow-sm">
            <div className="flex flex-col items-center">
              <span className="font-label text-[10px] uppercase tracking-[0.2em] text-secondary font-bold mb-1">Room code</span>
              <span className="font-headline text-3xl font-bold text-on-surface tracking-[0.3em]">{game.code}</span>
            </div>
            <button
              onClick={() => navigator.clipboard.writeText(game.code)}
              className="w-10 h-10 rounded-full bg-tertiary-container text-on-tertiary-container hover:opacity-90 active:scale-95 transition-all flex items-center justify-center"
              aria-label="Copy room code"
            >
              <span className="material-symbols-outlined text-xl">content_copy</span>
            </button>
          </div>
        </div>

        {/* Players */}
        <section className="mb-6">
          <div className="flex justify-between items-end mb-2 px-1">
            <h3 className="font-headline text-lg font-bold text-primary">
              In the henhouse <span className="text-outline font-normal text-sm ml-1">({players.length})</span>
            </h3>
          </div>
          <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 px-5 py-4 shadow-sm">
            <ul className="space-y-3">
              {players.map((p) => (
                <li key={p.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className={`w-2 h-2 rounded-full ${p.connected ? 'bg-primary' : 'bg-outline-variant'}`} />
                    <span className="font-medium text-on-surface">
                      {p.name}
                      {(p.id === game.hostId || p.id === currentPlayer?.id) && (
                        <span className="text-on-surface-variant text-xs font-normal ml-1.5">
                          {p.id === game.hostId && '(host)'}
                          {p.id === currentPlayer?.id && ' ← you'}
                        </span>
                      )}
                    </span>
                  </div>
                </li>
              ))}
              <li className="pt-2 border-t border-outline-variant/20">
                <p className="italic text-outline text-sm text-center font-body">More friends? Send them the code.</p>
              </li>
            </ul>
          </div>
        </section>

        {/* How to Play */}
        <section className="mb-6 bg-surface-container-lowest border border-outline-variant/30 rounded-2xl p-5 shadow-sm">
          <h3 className="font-headline text-base font-bold text-on-surface mb-3">How it works</h3>
          <ol className="text-sm text-on-surface-variant space-y-2 list-decimal list-inside font-body">
            <li>One player is the <strong className="text-on-surface">guesser</strong>. No peeking.</li>
            <li>The rest see a <strong className="text-on-surface">secret word</strong> and each write a <strong className="text-on-surface">one-word clue</strong>.</li>
            <li>Duplicate clues get <strong className="text-on-surface">eliminated</strong>.</li>
            <li>Guesser reads the survivors and takes a shot.</li>
            <li>Nail it → <strong className="text-primary">+10 pts</strong> for everyone who helped. Miss → try again for fewer points.</li>
          </ol>
        </section>

        {/* Game Settings */}
        <section className="mb-6 grid grid-cols-2 gap-3">
          <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-2xl p-4 flex flex-col gap-0.5">
            <span className="font-label text-[10px] uppercase tracking-wider text-secondary font-bold">Rounds</span>
            <span className="font-headline text-2xl font-bold text-on-surface">{game.settings.totalRounds}</span>
          </div>
          <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-2xl p-4 flex flex-col gap-0.5">
            <span className="font-label text-[10px] uppercase tracking-wider text-secondary font-bold">Timer</span>
            <span className="font-headline text-2xl font-bold text-on-surface">{game.settings.secondsPerRound}s</span>
          </div>
        </section>

        {/* Start Button */}
        {isHost ? (
          <button
            onClick={handleStart}
            disabled={starting || players.length < 2}
            className="w-full bg-primary text-on-primary h-14 rounded-xl font-body font-bold tracking-wide hover:opacity-90 active:scale-[0.98] disabled:opacity-50 transition-all"
          >
            {buttonLabel}
          </button>
        ) : (
          <p className="text-center text-outline text-sm animate-pulse font-body">
            Hang tight — the host is rounding everyone up…
          </p>
        )}

        {error && <p className="text-center text-error text-sm mt-3 font-body">{error}</p>}
      </main>
    </div>
  )
}
