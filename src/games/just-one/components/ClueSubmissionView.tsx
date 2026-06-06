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

  const handleSubmit = async () => {
    if (!clue.trim()) return setError('Enter a clue')
    if (clue.trim().split(/\s+/).length > 3) return setError('Clue must be 1-3 words')
    setError('')
    setSubmitting(true)
    try {
      await submitClue(game.id, game.currentRound, clue)
      setClue('')
    } catch (err: any) {
      setError(err.message ?? 'Failed to submit clue')
    } finally {
      setSubmitting(false)
    }
  }

  const handleForceDedup = async () => {
    try {
      await forceDedup(game.id, game.currentRound)
    } catch (err: any) {
      setError(err.message ?? 'Failed to force dedup')
    }
  }

  // GUESSER VIEW: blind, just wait
  if (isGuesser) {
    return (
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-10">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="text-7xl">🙈</div>
          <h2 className="font-headline text-3xl font-bold text-on-surface">Eyes closed!</h2>
          <p className="text-on-surface-variant font-body">
            The others are writing clues for you. No peeking at the screen!
          </p>
          <div className="bg-surface-container-lowest rounded-xl p-6 border border-outline-variant/15">
            <p className="font-label text-[10px] uppercase tracking-[0.2em] text-secondary mb-2">Clues submitted</p>
            <p className="font-headline text-4xl font-bold text-on-surface">
              {cluesCount} / {nonGuesserCount}
            </p>
          </div>
          {isHost && cluesCount > 0 && cluesCount < nonGuesserCount && (
            <button
              onClick={handleForceDedup}
              className="text-xs text-on-surface-variant underline opacity-60 hover:opacity-100"
            >
              Skip waiting (force start)
            </button>
          )}
        </div>
      </main>
    )
  }

  // CLUE-GIVER VIEW: secret word + clue input
  return (
    <main className="flex-1 flex flex-col px-6 py-6">
      <div className="max-w-md w-full mx-auto space-y-6">
        {/* Secret Word Banner */}
        <div className="bg-tertiary-fixed border-2 border-tertiary rounded-xl p-6 text-center">
          <p className="font-label text-[10px] uppercase tracking-[0.2em] text-secondary mb-2">
            The secret word for {guesserPlayer?.name ?? 'the guesser'}
          </p>
          <p className="font-headline text-5xl font-bold text-secondary tracking-tight">
            {round.secretWord}
          </p>
        </div>

        {/* Clue Input or Submitted State */}
        {!myClueSubmitted ? (
          <div className="bg-surface-container-lowest rounded-xl p-6 border border-outline-variant/15 space-y-4">
            <label className="block">
              <span className="font-label text-[10px] uppercase tracking-wider text-secondary">
                Your clue (1-3 words)
              </span>
              <input
                type="text"
                value={clue}
                onChange={(e) => setClue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                placeholder="A helpful hint..."
                maxLength={50}
                autoFocus
                className="mt-2 w-full bg-surface-container px-4 py-3 rounded-xl border border-outline-variant/30 focus:border-primary focus:outline-none font-body text-lg"
              />
            </label>
            <button
              onClick={handleSubmit}
              disabled={submitting || !clue.trim()}
              className="w-full bg-primary text-on-primary h-14 rounded-xl font-body font-semibold tracking-wide shadow-[0_8px_24px_rgba(0,0,0,0.3)] hover:opacity-90 active:scale-95 transition-all disabled:opacity-50"
            >
              {submitting ? 'Submitting...' : 'Submit Clue'}
            </button>
            {error && <p className="text-center text-error text-sm">{error}</p>}
            <p className="text-xs text-on-surface-variant text-center">
              Tip: avoid the OBVIOUS clue. Duplicate clues get eliminated.
            </p>
          </div>
        ) : (
          <div className="bg-surface-container-lowest rounded-xl p-6 border border-outline-variant/15 text-center">
            <div className="text-4xl mb-2">✅</div>
            <p className="font-headline text-lg font-bold text-on-surface mb-2">Clue submitted!</p>
            <p className="text-on-surface-variant text-sm mb-4">
              Waiting for others...
            </p>
            <div className="bg-surface-container px-4 py-3 rounded-lg">
              <p className="font-headline text-2xl font-bold text-on-surface">
                {cluesCount} / {nonGuesserCount}
              </p>
              <p className="text-xs text-on-surface-variant mt-1">clues in</p>
            </div>
          </div>
        )}

        {isHost && cluesCount > 0 && cluesCount < nonGuesserCount && (
          <div className="text-center">
            <button
              onClick={handleForceDedup}
              className="text-xs text-on-surface-variant underline opacity-60 hover:opacity-100"
            >
              Skip waiting (force start)
            </button>
          </div>
        )}
      </div>
    </main>
  )
}
