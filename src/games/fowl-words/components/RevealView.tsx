import { useState, useEffect, useRef } from 'react'
import type { GameData, PlayerData, RoundData } from '../types'
import { submitGuess, unlockFirst, advanceRound } from '../service'
import PointCounter from './PointCounter'

interface Props {
  game: GameData
  round: RoundData
  players: PlayerData[]
  currentPlayer: PlayerData | null
  isGuesser: boolean
  isHost: boolean
}

export default function RevealView({ game, round, players, isGuesser, isHost }: Props) {
  const [guess, setGuess] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [unlocking, setUnlocking] = useState(false)
  const [error, setError] = useState('')
  const [timeLeft, setTimeLeft] = useState(60)
  const guessRef = useRef(guess)
  const autoSubmittedRef = useRef(false)

  // Keep ref in sync so the timer callback can read the current value
  useEffect(() => { guessRef.current = guess }, [guess])

  // Guess countdown timer — auto-submit on expiry
  useEffect(() => {
    if (!round.attemptDeadline || !isGuesser) return
    autoSubmittedRef.current = false

    const deadlineMs = round.attemptDeadline.seconds * 1000

    const tick = async () => {
      const remaining = Math.max(0, Math.ceil((deadlineMs - Date.now()) / 1000))
      setTimeLeft(remaining)

      if (remaining === 0 && !autoSubmittedRef.current && !submitting) {
        autoSubmittedRef.current = true
        // Submit whatever they've typed, or a placeholder if empty (forced wrong answer)
        const currentGuess = guessRef.current.trim() || '---'
        try { await submitGuess(game.id, game.currentRound, currentGuess) } catch { /* ignore */ }
      }
    }

    tick()
    const interval = setInterval(tick, 500)
    return () => clearInterval(interval)
  }, [round.attemptDeadline?.seconds, round.currentAttempt]) // eslint-disable-line react-hooks/exhaustive-deps

  const playerName = (id: string) => players.find((p) => p.id === id)?.name ?? 'Unknown'
  const visibleSet = new Set(round.visibleGroupIndexes)
  const guesserPlayer = players.find((p) => p.id === game.currentGuesser)

  const handleGuess = async () => {
    if (!guess.trim()) return setError('Take a guess')
    setError('')
    setSubmitting(true)
    try {
      await submitGuess(game.id, game.currentRound, guess)
    } catch (err: any) {
      setError(err.message ?? "Couldn't submit your guess")
      setSubmitting(false)
    }
  }

  const handleUnlockFirst = async () => {
    setUnlocking(true)
    try {
      await unlockFirst(game.id, game.currentRound)
    } catch (err: any) {
      setError(err.message ?? "Couldn't unlock clue")
      setUnlocking(false)
    }
  }

  const allDuplicates = visibleSet.size === 0 && round.clueGroups.length > 0

  return (
    <main className="flex-1 flex flex-col px-4 py-6">
      <div className="max-w-md w-full mx-auto space-y-5">
        {/* Secret word visible to non-guessers only — Flock-style premium card */}
        {!isGuesser && (
          <div className="bg-primary-fixed/50 border-2 border-primary-fixed-dim rounded-2xl p-4 text-center shadow-sm">
            <p className="font-label text-[10px] uppercase tracking-[0.2em] text-primary font-bold mb-1">
              The secret word
            </p>
            <p className="font-headline text-4xl font-bold text-on-surface tracking-tight">
              {round.secretWord}
            </p>
          </div>
        )}

        {/* Point counter — visible to everyone */}
        <PointCounter currentAttempt={round.currentAttempt} maxAttempts={round.maxAttempts} />

        {/* Heading */}
        {isGuesser ? (
          <div className="text-center">
            <h2 className="font-headline text-2xl font-bold text-on-surface">
              {allDuplicates
                ? 'All clues are duplicates!'
                : round.currentAttempt === 1
                ? 'Your clues'
                : 'New clue unlocked!'}
            </h2>
            <p className="text-on-surface-variant text-sm mt-1 font-body">
              {allDuplicates
                ? 'Everyone thought of the same thing. Unlock one to see it.'
                : round.currentAttempt === 1
                ? 'Take a beat. Then guess.'
                : 'Try again — points just dropped.'}
            </p>
          </div>
        ) : (
          <div className="text-center">
            <h2 className="font-headline text-lg font-bold text-on-surface">
              {allDuplicates
                ? <><span className="text-error">All duplicates!</span></>
                : <><span className="text-primary">{guesserPlayer?.name}</span> is thinking…</>}
            </h2>
            <p className="text-xs text-outline mt-1 italic font-body">
              {allDuplicates
                ? `Every clue matched — ${guesserPlayer?.name} is unlocking the first one`
                : round.eliminationReason && round.currentAttempt === 1
                ? round.eliminationReason
                : null}
            </p>
          </div>
        )}

        {/* All-duplicates state — shown instead of clue list */}
        {allDuplicates && (
          <div className="bg-surface-container-lowest rounded-2xl border-2 border-outline-variant/30 p-6 text-center space-y-4 shadow-sm">
            <p className="text-4xl">🔒</p>
            <div>
              <p className="font-headline text-lg font-bold text-on-surface">
                Every clue matched
              </p>
              <p className="text-on-surface-variant text-sm mt-1 font-body">
                {isGuesser
                  ? 'No unique clues to see. Unlock the first duplicate to get a hint — but you\'ll be guessing for 5 pts.'
                  : 'All clues were duplicates. The guesser needs to unlock one to continue.'}
              </p>
            </div>

            {/* Locked clue count for non-guessers */}
            {!isGuesser && (
              <p className="text-xs text-outline font-body">
                {round.clueGroups.length} duplicate group{round.clueGroups.length !== 1 ? 's' : ''} locked
              </p>
            )}

            {/* Unlock button — guesser only */}
            {isGuesser && (
              <button
                onClick={handleUnlockFirst}
                disabled={unlocking}
                className="w-full bg-tertiary-container text-on-tertiary-container h-12 rounded-xl font-body font-bold tracking-wide hover:opacity-90 active:scale-[0.98] disabled:opacity-50 transition-all"
              >
                {unlocking ? 'Unlocking…' : 'Unlock first clue → 5 pts'}
              </button>
            )}

            {!isGuesser && (
              <div className="space-y-2">
                <p className="text-xs text-outline animate-pulse font-body">
                  Waiting for {guesserPlayer?.name} to unlock…
                </p>
                {isHost && (
                  <button
                    onClick={() => advanceRound(game.id).catch(() => {})}
                    className="text-xs text-outline underline hover:text-on-surface-variant font-body"
                  >
                    Skip this round
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Clue groups — only shown when there are visible clues */}
        {!allDuplicates && <div className="space-y-3">
          {round.clueGroups.map((group, idx) => {
            const isVisible = visibleSet.has(idx)

            // Don't show locked groups to the guesser
            if (isGuesser && !isVisible) return null

            const uniqueTexts = Array.from(new Set(group.clueTexts.map((t) => t.trim())))
            const showVariants = uniqueTexts.length > 1
            const displayText = uniqueTexts.join(' / ')

            if (isVisible) {
              const justUnlocked = round.lastUnlockedGroupIndex === idx
              return (
                <div
                  key={idx}
                  className={`relative bg-surface-container-lowest rounded-2xl border-2 px-5 py-4 shadow-sm transition-all ${
                    justUnlocked
                      ? 'border-tertiary scale-[1.02] shadow-[0_8px_24px_rgba(255,200,100,0.3)]'
                      : group.isDuplicate
                      ? 'border-tertiary/50'
                      : 'border-primary/40'
                  }`}
                >
                  {justUnlocked && (
                    <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-tertiary-container text-on-tertiary-container text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full font-label">
                      🔓 Just unlocked
                    </span>
                  )}
                  <p className="font-headline text-2xl font-bold text-on-surface text-center">
                    {displayText}
                  </p>
                  {showVariants && (
                    <p className="text-[10px] text-outline text-center mt-1 italic font-body">
                      same word, different spelling
                    </p>
                  )}
                  <p className="text-xs text-on-surface-variant text-center mt-2 font-body">
                    {group.playerIds.length === 1
                      ? `from ${playerName(group.playerIds[0])}`
                      : `from ${group.playerIds.map(playerName).join(', ')}`}
                  </p>
                </div>
              )
            }

            // Locked / eliminated group (non-guessers only)
            return (
              <div
                key={idx}
                className="bg-surface-container-low rounded-2xl border border-outline-variant/30 px-5 py-3 opacity-70"
              >
                <p className="font-headline text-lg font-medium text-on-surface-variant text-center line-through">
                  {displayText}
                </p>
                <p className="text-[10px] text-error text-center mt-1 font-label uppercase tracking-wider font-bold">
                  Eliminated — duplicate
                </p>
                <p className="text-xs text-outline text-center mt-1 font-body">
                  from {group.playerIds.map(playerName).join(', ')}
                </p>
              </div>
            )
          })}
        </div>}

        {/* Guesser's input — only shown when there are visible clues to guess from */}
        {isGuesser && !allDuplicates && (
          <div className="bg-surface-container-lowest rounded-2xl border-2 border-outline-variant/30 p-5 space-y-3 shadow-sm mt-2">
            {/* Guess timer */}
            {round.attemptDeadline && (
              <div className="flex items-center justify-between">
                <span className="font-label text-[10px] uppercase tracking-wider text-secondary font-bold">
                  Your guess
                </span>
                <span className={`font-headline text-2xl font-bold tabular-nums transition-colors ${
                  timeLeft <= 10 ? 'text-error' : timeLeft <= 20 ? 'text-tertiary' : 'text-primary'
                }`}>
                  {timeLeft}s
                </span>
              </div>
            )}
            {!round.attemptDeadline && (
              <span className="font-label text-[10px] uppercase tracking-wider text-secondary font-bold">
                Your guess
              </span>
            )}
            <input
              type="text"
              value={guess}
              onChange={(e) => setGuess(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleGuess()}
              placeholder="The secret word…"
              maxLength={100}
              autoFocus
              disabled={submitting}
              className="w-full bg-surface-container-lowest border-2 border-outline-variant/30 rounded-xl px-4 py-3 text-lg text-on-surface placeholder:text-outline/50 font-body focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
            />
            <button
              onClick={handleGuess}
              disabled={submitting || !guess.trim()}
              className="w-full bg-primary text-on-primary h-14 rounded-xl font-body font-bold tracking-wide hover:opacity-90 active:scale-[0.98] disabled:opacity-50 transition-all"
            >
              {submitting ? 'Checking…' : 'Submit guess'}
            </button>
            {error && <p className="text-center text-error text-sm font-body">{error}</p>}
          </div>
        )}

        {!isGuesser && !allDuplicates && (
          <div className="text-center space-y-2 mt-2">
            <p className="text-outline text-sm animate-pulse font-body">
              Watching {guesserPlayer?.name} think…
            </p>
            {isHost && (
              <button
                onClick={() => advanceRound(game.id).catch(() => {})}
                className="text-xs text-outline underline hover:text-on-surface-variant font-body"
              >
                Skip this round
              </button>
            )}
          </div>
        )}
      </div>
    </main>
  )
}
