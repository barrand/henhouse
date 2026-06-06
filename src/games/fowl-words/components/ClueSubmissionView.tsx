import { useState } from 'react'
import type { GameData, PlayerData, RoundData } from '../types'
import { submitClue, forceDedup } from '../service'

interface Props {
  game: GameData
  round: RoundData
  players: PlayerData[]
  currentPlayer: PlayerData | null
  isGuesser: boolean
  isHost: boolean
}

export default function ClueSubmissionView({ game, round, players, currentPlayer, isGuesser, isHost }: Props) {
  const [clue, setClue] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const myClueSubmitted = currentPlayer?.id && !!round.cluesByPlayer[currentPlayer.id]
  const cluesCount = Object.keys(round.cluesByPlayer).length
  const nonGuesserCount = players.length - 1
  const guesserPlayer = players.find((p) => p.id === game.currentGuesser)

  const isMultiWord = clue.trim().split(/\s+/).length > 1

  const handleSubmit = async () => {
    if (!clue.trim()) return setError('Pop in a clue first')
    if (isMultiWord) return setError('One word only — that\'s the whole game!')
    setError('')
    setSubmitting(true)
    try {
      await submitClue(game.id, game.currentRound, clue)
      setClue('')
    } catch (err: any) {
      setError(err.message ?? 'Couldn’t send your clue')
    } finally {
      setSubmitting(false)
    }
  }

  const handleForceDedup = async () => {
    try {
      await forceDedup(game.id, game.currentRound)
    } catch (err: any) {
      setError(err.message ?? 'Couldn’t skip the wait')
    }
  }

  const givers = players.filter((p) => p.id !== game.currentGuesser)

  // GUESSER VIEW: blind, just wait
  if (isGuesser) {
    return (
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-10">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="text-7xl">🙈</div>
          <h2 className="font-headline text-3xl font-bold text-on-surface">No peeking!</h2>
          <p className="text-on-surface-variant font-body">
            Keep your eyes on your own screen. The flock is writing clues for you.
          </p>
          <div className="bg-surface-container-lowest border border-outline-variant/20 rounded-2xl p-4">
            <p className="text-xs font-bold uppercase tracking-widest text-secondary mb-3 font-label">
              {cluesCount} of {nonGuesserCount} ready
            </p>
            <ul className="space-y-2">
              {givers.map((p) => {
                const hasClue = !!round.cluesByPlayer[p.id]
                return (
                  <li key={p.id} className="flex items-center justify-between">
                    <span className={`text-sm font-body ${hasClue ? 'text-on-surface' : 'text-outline'}`}>
                      {p.name}
                    </span>
                    {hasClue ? (
                      <span className="material-symbols-outlined text-primary text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                    ) : (
                      <span className="text-xs text-outline italic font-body">writing…</span>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
          {isHost && cluesCount > 0 && cluesCount < nonGuesserCount && (
            <button
              onClick={handleForceDedup}
              className="text-xs text-outline underline hover:text-on-surface-variant font-body"
            >
              Not waiting for stragglers · Skip ahead
            </button>
          )}
        </div>
      </main>
    )
  }

  // CLUE-GIVER VIEW: secret word + clue input
  return (
    <main className="flex-1 flex flex-col px-4 py-6">
      <div className="max-w-md w-full mx-auto space-y-5">
        {/* Secret Word Banner — uses Flock's premium card pattern */}
        <div className="bg-primary-fixed/50 border-2 border-primary-fixed-dim rounded-2xl p-6 text-center shadow-sm">
          <p className="font-label text-[10px] uppercase tracking-[0.2em] text-primary mb-2 font-bold">
            Secret word for {guesserPlayer?.name ?? 'the guesser'}
          </p>
          <p className="font-headline text-5xl font-bold text-on-surface tracking-tight">
            {round.secretWord}
          </p>
        </div>

        {/* Clue Input or Submitted State */}
        {!myClueSubmitted ? (
          <div className="bg-surface-container-lowest rounded-2xl border-2 border-outline-variant/30 p-5 space-y-3 shadow-sm">
            <label className="block">
              <div className="flex justify-between items-center mb-1">
                <span className="font-label text-[10px] uppercase tracking-wider text-secondary font-bold">
                  Your clue · ONE word only
                </span>
                {isMultiWord && (
                  <span className="font-label text-[10px] uppercase tracking-wider text-error font-bold">
                    Too many words!
                  </span>
                )}
              </div>
              <input
                type="text"
                value={clue}
                onChange={(e) => setClue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                placeholder="One word…"
                maxLength={30}
                autoFocus
                className={`mt-1 w-full bg-surface-container-lowest border-2 rounded-xl px-4 py-3 text-lg text-on-surface placeholder:text-outline/50 font-body focus:ring-2 outline-none transition-all ${
                  isMultiWord
                    ? 'border-error focus:ring-error/20 focus:border-error'
                    : 'border-outline-variant/30 focus:ring-primary/20 focus:border-primary'
                }`}
              />
            </label>
            <button
              onClick={handleSubmit}
              disabled={submitting || !clue.trim() || isMultiWord}
              className="w-full bg-primary text-on-primary h-14 rounded-xl font-body font-bold tracking-wide hover:opacity-90 active:scale-[0.98] disabled:opacity-50 transition-all"
            >
              {submitting ? 'Sending…' : 'Lock it in'}
            </button>
            {error && <p className="text-center text-error text-sm font-body">{error}</p>}
            <p className="text-xs text-outline text-center font-body">
              Skip the obvious — duplicates get eliminated.
            </p>
          </div>
        ) : (
          <div className="bg-surface-container-lowest rounded-2xl border-2 border-primary/30 p-5 shadow-sm space-y-4">
            <div className="text-center">
              <div className="text-4xl mb-2">✅</div>
              <p className="font-headline text-lg font-bold text-primary">Clue locked in!</p>
            </div>
            <div className="border-t border-outline-variant/20 pt-3">
              <p className="text-xs font-bold uppercase tracking-widest text-secondary mb-3 font-label">
                {cluesCount} of {nonGuesserCount} ready
              </p>
              <ul className="space-y-2">
                {givers.map((p) => {
                  const hasClue = !!round.cluesByPlayer[p.id]
                  return (
                    <li key={p.id} className="flex items-center justify-between">
                      <span className={`text-sm font-body ${hasClue ? 'text-on-surface' : 'text-outline'}`}>
                        {p.name}
                      </span>
                      {hasClue ? (
                        <span className="material-symbols-outlined text-primary text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                      ) : (
                        <span className="text-xs text-outline italic font-body">writing…</span>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          </div>
        )}

        {isHost && cluesCount > 0 && cluesCount < nonGuesserCount && (
          <div className="text-center">
            <button
              onClick={handleForceDedup}
              className="text-xs text-outline underline hover:text-on-surface-variant font-body"
            >
              Skip stragglers · Move on
            </button>
          </div>
        )}
      </div>
    </main>
  )
}
