import { useState } from 'react'
import type { GameData, PlayerData, RoundData } from '../types'
import { submitGuess } from '../service'

interface Props {
  game: GameData
  round: RoundData
  players: PlayerData[]
  currentPlayer: PlayerData | null
  isGuesser: boolean
}

export default function RevealView({ game, round, players, isGuesser }: Props) {
  const [guess, setGuess] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const playerName = (id: string) => players.find((p) => p.id === id)?.name ?? 'Unknown'
  const visibleSet = new Set(round.visibleGroupIndexes)
  const guesserPlayer = players.find((p) => p.id === game.currentGuesser)

  const handleGuess = async () => {
    if (!guess.trim()) return setError('Enter a guess')
    setError('')
    setSubmitting(true)
    try {
      await submitGuess(game.id, game.currentRound, guess)
    } catch (err: any) {
      setError(err.message ?? 'Failed to submit guess')
      setSubmitting(false)
    }
  }

  return (
    <main className="flex-1 flex flex-col px-6 py-6">
      <div className="max-w-md w-full mx-auto space-y-5">
        {/* Secret word visible to non-guessers only */}
        {!isGuesser && (
          <div className="bg-tertiary-fixed border-2 border-tertiary rounded-xl p-4 text-center">
            <p className="font-label text-[10px] uppercase tracking-[0.2em] text-secondary mb-1">
              Secret word
            </p>
            <p className="font-headline text-3xl font-bold text-secondary tracking-tight">
              {round.secretWord}
            </p>
          </div>
        )}

        {/* Guesser heading */}
        {isGuesser && (
          <div className="text-center">
            <h2 className="font-headline text-2xl font-bold text-on-surface">
              Here are your clues
            </h2>
            <p className="text-on-surface-variant text-sm mt-1">
              Take a beat, then guess the word.
            </p>
          </div>
        )}

        {/* Non-guesser heading */}
        {!isGuesser && (
          <div className="text-center">
            <h2 className="font-headline text-xl font-bold text-on-surface">
              {guesserPlayer?.name} is reading the clues
            </h2>
            {round.eliminationReason && (
              <p className="text-xs text-on-surface-variant mt-1 italic">
                {round.eliminationReason}
              </p>
            )}
          </div>
        )}

        {/* Clue groups */}
        <div className="space-y-3">
          {round.clueGroups.map((group, idx) => {
            const isVisible = visibleSet.has(idx)

            // Don't show locked groups to the guesser at all
            if (isGuesser && !isVisible) return null

            // Build display text: if all clue texts in the group are identical,
            // just show it once; otherwise show variants separated by " / ".
            const uniqueTexts = Array.from(new Set(group.clueTexts.map((t) => t.trim())))
            const showVariants = uniqueTexts.length > 1
            const displayText = uniqueTexts.join(' / ')

            if (isVisible) {
              return (
                <div
                  key={idx}
                  className={`bg-surface-container-lowest rounded-xl p-5 border-2 ${
                    group.isDuplicate
                      ? 'border-tertiary/60 shadow-[0_4px_16px_rgba(255,200,100,0.15)]'
                      : 'border-primary/40 shadow-[0_4px_16px_rgba(168,201,169,0.15)]'
                  }`}
                >
                  <p className="font-headline text-2xl font-bold text-on-surface text-center">
                    {displayText}
                  </p>
                  {showVariants && (
                    <p className="text-[10px] text-on-surface-variant text-center mt-1 italic">
                      same word, different spelling
                    </p>
                  )}
                  {!isGuesser && (
                    <p className="text-xs text-on-surface-variant text-center mt-2">
                      {group.playerIds.length === 1
                        ? `— ${playerName(group.playerIds[0])}`
                        : `— ${group.playerIds.map(playerName).join(', ')} (${group.playerIds.length})`}
                    </p>
                  )}
                </div>
              )
            }

            // Locked / eliminated group (shown to non-guessers only)
            return (
              <div
                key={idx}
                className="bg-surface-container-low rounded-xl p-4 border border-outline-variant/20 opacity-60"
              >
                <p className="font-headline text-xl font-medium text-on-surface-variant text-center line-through">
                  {displayText}
                </p>
                <p className="text-xs text-error text-center mt-1 font-label uppercase tracking-wider">
                  Eliminated — duplicate
                </p>
                <p className="text-xs text-on-surface-variant text-center mt-0.5">
                  {group.playerIds.map(playerName).join(', ')}
                </p>
              </div>
            )
          })}
        </div>

        {/* Guesser's input */}
        {isGuesser && (
          <div className="bg-surface-container-lowest rounded-xl p-5 border border-outline-variant/15 space-y-3 mt-2">
            <label className="block">
              <span className="font-label text-[10px] uppercase tracking-wider text-secondary">
                Your guess
              </span>
              <input
                type="text"
                value={guess}
                onChange={(e) => setGuess(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleGuess()}
                placeholder="The secret word..."
                maxLength={100}
                autoFocus
                disabled={submitting}
                className="mt-2 w-full bg-surface-container px-4 py-3 rounded-xl border border-outline-variant/30 focus:border-primary focus:outline-none font-body text-lg"
              />
            </label>
            <button
              onClick={handleGuess}
              disabled={submitting || !guess.trim()}
              className="w-full bg-primary text-on-primary h-14 rounded-xl font-body font-semibold tracking-wide shadow-[0_8px_24px_rgba(0,0,0,0.3)] hover:opacity-90 active:scale-95 transition-all disabled:opacity-50"
            >
              {submitting ? 'Submitting...' : 'Submit Guess'}
            </button>
            {error && <p className="text-center text-error text-sm">{error}</p>}
          </div>
        )}

        {!isGuesser && (
          <p className="text-center text-on-surface-variant text-sm animate-pulse mt-4">
            Watching {guesserPlayer?.name} think...
          </p>
        )}
      </div>
    </main>
  )
}
