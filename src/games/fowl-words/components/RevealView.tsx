import { useState, useEffect, useRef } from 'react'
import type { GameData, PlayerData, RoundData } from '../types'
import { submitGuess, unlockFirst, advanceRound, submitClueStarVote } from '../service'
import PointCounter from './PointCounter'

interface Props {
  game: GameData
  round: RoundData
  players: PlayerData[]
  currentPlayer: PlayerData | null
  isGuesser: boolean
  isHost: boolean
}

export default function RevealView({ game, round, players, currentPlayer, isGuesser, isHost }: Props) {
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
    <main className="flex-1 flex flex-col px-4 py-4">
      <div className="max-w-md w-full mx-auto space-y-3">
        {/* Secret word visible to non-guessers only — Flock-style premium card */}
        {!isGuesser && (
          <div className="bg-primary-fixed border-2 border-primary-fixed-dim rounded-2xl px-4 py-3 text-center shadow-sm">
            <p className="font-label text-[10px] uppercase tracking-[0.2em] text-on-primary-fixed-variant font-bold mb-0.5">
              The secret word
            </p>
            <p className="font-headline text-3xl font-bold text-on-primary-fixed tracking-tight">
              {round.secretWord}
            </p>
          </div>
        )}

        {/* Point counter — compact bar for guesser, full card for givers */}
        <PointCounter currentAttempt={round.currentAttempt} maxAttempts={round.maxAttempts} compact={isGuesser} />

        {/* Heading */}
        {isGuesser ? (
          <div className="text-center">
            <h2 className="font-headline text-lg font-bold text-on-surface">
              {allDuplicates
                ? 'All clues are duplicates!'
                : round.currentAttempt === 1
                ? 'Your clues'
                : 'New clue unlocked!'}
            </h2>
            <p className="text-on-surface-variant text-xs mt-0.5 font-body">
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
            <img src="/images/hen-embarrassed.svg" alt="" className="w-16 h-16 mx-auto" />
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
        {!allDuplicates && <div className={isGuesser ? "grid grid-cols-2 gap-2" : "space-y-2"}>
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
                  className={`relative bg-surface-container-lowest rounded-2xl border-2 shadow-sm transition-all ${
                    isGuesser ? 'px-3 py-2.5' : 'px-4 py-3'
                  } ${
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
                  <p className={`font-headline font-bold text-on-surface text-center ${isGuesser ? 'text-lg' : 'text-xl'}`}>
                    {displayText}
                  </p>
                  {showVariants && (
                    <p className="text-[10px] text-outline text-center mt-0.5 italic font-body">
                      same word, different spelling
                    </p>
                  )}
                  <p className={`text-on-surface-variant text-center font-body ${isGuesser ? 'text-[10px] mt-0.5' : 'text-xs mt-1'}`}>
                    {group.playerIds.length === 1
                      ? `from ${playerName(group.playerIds[0])}`
                      : `from ${group.playerIds.map(playerName).join(', ')}`}
                  </p>
                  {/* Star button — givers only, cannot star own clue */}
                  {!isGuesser && (() => {
                    const isOwnClue = currentPlayer ? group.playerIds.includes(currentPlayer.id) : false
                    const myVote = currentPlayer ? (round.clueStarVotes?.[currentPlayer.id] ?? null) : null
                    const isMyVote = myVote === idx
                    const starCount = Object.values(round.clueStarVotes ?? {}).filter((v) => v === idx).length
                    return (
                      <div className="flex justify-center mt-2">
                        <button
                          disabled={isOwnClue}
                          onClick={() => {
                            if (!isOwnClue && currentPlayer) {
                              submitClueStarVote(game.id, game.currentRound, idx).catch(() => {})
                            }
                          }}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold font-label transition-all ${
                            isOwnClue
                              ? 'opacity-30 cursor-default text-outline'
                              : isMyVote
                              ? 'bg-tertiary-container text-on-tertiary-container scale-105 shadow-sm'
                              : 'bg-surface-container-low text-on-surface-variant hover:bg-tertiary-container/50 active:scale-95'
                          }`}
                        >
                          <img src="/images/star-vote.svg" alt="" className={`w-4 h-4 ${isMyVote ? '' : 'opacity-40'}`} />
                          {starCount > 0 && <span>{starCount}</span>}
                        </button>
                      </div>
                    )
                  })()}
                </div>
              )
            }

            // Locked / eliminated group (non-guessers only) — compact single row
            const isPlayerInDupGroup = currentPlayer && group.playerIds.includes(currentPlayer.id)
            return (
              <div
                key={idx}
                className={`rounded-xl border px-4 py-2 transition-all flex items-center gap-3 ${
                  isPlayerInDupGroup
                    ? 'bg-error/10 border-error/40 ring-1 ring-error/30'
                    : 'bg-surface-container-low border-outline-variant/30 opacity-70'
                }`}
              >
                {isPlayerInDupGroup && (
                  <img src="/images/hen-embarrassed.svg" alt="" className="w-8 h-8 flex-shrink-0 animate-hen-pop" />
                )}
                <div className="flex-1 min-w-0">
                  <p className={`font-headline text-base font-medium line-through leading-tight ${
                    isPlayerInDupGroup ? 'text-error' : 'text-on-surface-variant'
                  }`}>
                    {displayText}
                  </p>
                  <p className="text-[10px] text-outline font-body truncate">
                    {isPlayerInDupGroup ? '😭 yours · ' : ''}from {group.playerIds.map(playerName).join(', ')} · duplicate
                  </p>
                </div>
              </div>
            )
          })}
        </div>}

        {/* Guesser's input — sticky at bottom so clue grid is scrollable above it */}
        {isGuesser && !allDuplicates && (
          <div className="sticky bottom-0 bg-background pt-2 pb-1 -mx-4 px-4">
          <div className="bg-surface-container-lowest rounded-2xl border-2 border-outline-variant/30 px-4 py-3 space-y-2.5 shadow-[0_-4px_16px_rgba(0,0,0,0.3)]">
            {/* Previous wrong guesses */}
            {round.guessAttempts?.length > 0 && (
              <div className="text-center space-y-1">
                <p className="font-label text-[10px] uppercase tracking-wider text-error font-bold">Wrong so far</p>
                <p className="text-sm text-on-surface-variant font-body">
                  {round.guessAttempts.join(', ')}
                </p>
              </div>
            )}
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
          </div>
        )}

        {!isGuesser && !allDuplicates && (
          <div className="text-center space-y-2 mt-2">
            {round.guessAttempts?.length > 0 && (
              <div className="space-y-1">
                <p className="font-label text-[10px] uppercase tracking-wider text-error font-bold">Wrong so far</p>
                <p className="text-sm text-on-surface-variant font-body">
                  {round.guessAttempts.join(', ')}
                </p>
              </div>
            )}
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
