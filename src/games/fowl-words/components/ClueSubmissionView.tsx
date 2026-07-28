import { useState, useEffect, useRef, type KeyboardEvent, type PointerEvent } from 'react'
import type { GameData, PlayerData, RoundData } from '../types'
import { submitClue, forceDedup, advanceRound } from '../service'

interface Props {
  game: GameData
  round: RoundData
  players: PlayerData[]
  currentPlayer: PlayerData | null
  isGuesser: boolean
  isHost: boolean
}

const CANONICAL_MULTI_WORD_CLUES = new Set([
  'bluecheese',
  'birthdaycake',
  'chocolatecake',
  'highschool',
  'hotdog',
  'icecream',
  'peanutbutter',
  'redapple',
])

function clueFormatError(rawClue: string): string | null {
  const clue = rawClue.normalize('NFC').trim()
  if (!clue) return null
  if (/[\p{Cf}\uFE0E\uFE0F\u{E0100}-\u{E01EF}]/u.test(clue)) return 'Use letters only — no hidden characters.'
  if (/\p{Extended_Pictographic}/u.test(clue)) return 'Emoji are not clues — use one word.'
  if (/\s/u.test(clue)) return 'One word only — remove the spaces.'
  if (!/^[\p{L}\p{M}]+$/u.test(clue)) return 'Use letters only — no numbers or symbols.'
  if (CANONICAL_MULTI_WORD_CLUES.has(clue.toLocaleLowerCase('en-US'))) {
    return 'That looks like more than one word. Try a single word instead.'
  }
  return null
}

export default function ClueSubmissionView({ game, round, players, currentPlayer, isGuesser, isHost }: Props) {
  const [clue, setClue] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [timeLeft, setTimeLeft] = useState(60)
  const [isPeeking, setIsPeeking] = useState(false)
  const clueRef = useRef(clue)
  const autoSubmittedRef = useRef(false)
  const timeoutForcedRef = useRef(false)
  const myClueSubmittedRef = useRef(false)

  // Keep ref in sync so the timer callback can read current value
  useEffect(() => { clueRef.current = clue }, [clue])
  useEffect(() => { myClueSubmittedRef.current = !!(currentPlayer?.id && round.cluesByPlayer[currentPlayer.id]) }, [currentPlayer?.id, round.cluesByPlayer])

  // Countdown timer — auto-submit on expiry
  useEffect(() => {
    if (!round.clueSubmissionDeadline) return
    autoSubmittedRef.current = false
    timeoutForcedRef.current = false

    const deadlineMs = round.clueSubmissionDeadline.seconds * 1000

    const tick = async () => {
      const remaining = Math.max(0, Math.ceil((deadlineMs - Date.now()) / 1000))
      setTimeLeft(remaining)

      if (remaining === 0) {
        // Givers: auto-submit whatever they've typed (if anything and not yet submitted)
        if (!isGuesser && !autoSubmittedRef.current && !myClueSubmittedRef.current) {
          autoSubmittedRef.current = true
          const currentClue = clueRef.current.trim()
          if (currentClue && !clueFormatError(currentClue)) {
            try { await submitClue(game.id, game.currentRound, currentClue) } catch { /* ignore */ }
          }
        }
        // Any client can nudge dedup after deadline; backend keeps it idempotent.
        if (!timeoutForcedRef.current) {
          timeoutForcedRef.current = true
          setTimeout(async () => {
            try {
              await forceDedup(game.id, game.currentRound)
            } catch { /* ignore — might already be past clue-submission */ }
          }, 2000)
        }
      }
    }

    tick()
    const interval = setInterval(tick, 500)
    return () => clearInterval(interval)
  }, [game.id, game.currentRound, isGuesser, round.clueSubmissionDeadline])

  const myClueSubmitted = currentPlayer?.id && !!round.cluesByPlayer[currentPlayer.id]
  const cluesCount = Object.keys(round.cluesByPlayer).length
  const nonGuesserCount = players.length - 1

  const normalizedClue = clue.normalize('NFC').trim()
  const formatError = clueFormatError(clue)
  const secretWordLower = round.secretWord?.toLowerCase().trim() ?? ""
  const clueIsPartOfWord = !!(secretWordLower && normalizedClue.length > 0 && secretWordLower.includes(normalizedClue.toLowerCase()))

  useEffect(() => {
    if (myClueSubmitted) setIsPeeking(false)
  }, [myClueSubmitted])

  const handleSubmit = async () => {
    if (!normalizedClue) return setError("Pop in a clue first")
    if (formatError) return setError(formatError)
    if (clueIsPartOfWord) return setError("Your clue can’t be part of the secret word")
    setError("")
    setSubmitting(true)
    setIsPeeking(false)
    try {
      await submitClue(game.id, game.currentRound, normalizedClue)
      setClue("")
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Couldn’t send your clue"
      setError(message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleHostSkip = async () => {
    try {
      if (cluesCount === 0) {
        await advanceRound(game.id)
      } else {
        await forceDedup(game.id, game.currentRound)
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Couldn’t skip the wait"
      setError(message)
    }
  }

  const givers = players.filter((p) => p.id !== game.currentGuesser)

  const revealSecretWord = (event: PointerEvent<HTMLButtonElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    setIsPeeking(true)
  }

  const hideSecretWord = () => setIsPeeking(false)

  const handlePeekKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault()
      setIsPeeking(true)
    }
  }

  const handlePeekKeyUp = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault()
      setIsPeeking(false)
    }
  }

  const giverStatusList = (
    <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/60 p-4">
      <p className="text-xs font-bold uppercase tracking-widest text-secondary mb-3 font-label">
        {cluesCount} of {nonGuesserCount} ready
      </p>
      <ul className="grid grid-cols-2 gap-x-4 gap-y-2">
        {givers.map((p) => {
          const hasClue = !!round.cluesByPlayer[p.id]
          return (
            <li key={p.id} className="flex items-center gap-1.5 min-w-0">
              <span
                className={`material-symbols-outlined text-base shrink-0 ${
                  hasClue ? 'text-primary' : 'text-outline-variant'
                }`}
                style={hasClue ? { fontVariationSettings: "'FILL' 1" } : undefined}
              >
                {hasClue ? 'check_circle' : 'radio_button_unchecked'}
              </span>
              <span className="text-sm font-body min-w-0 flex items-baseline gap-0.5">
                <span className={`truncate ${hasClue ? 'text-on-surface' : 'text-outline'}`}>
                  {p.name}
                </span>
                {!hasClue && (
                  <span className="text-outline text-xs shrink-0"> (waiting)</span>
                )}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )

  // GUESSER VIEW: blind, just wait
  if (isGuesser) {
    return (
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-10">
        <div className="max-w-md w-full text-center space-y-6">
          <img src="/images/generated-comic/hen-blindfold.png" alt="" className="w-28 h-28 mx-auto animate-hen-bob" />
          <h2 className="font-headline text-3xl font-bold text-on-surface">No peeking!</h2>
          <p className="text-on-surface-variant font-body">
            Keep your eyes on your own screen. The flock is writing clues for you.
          </p>
          {giverStatusList}
          {isHost && cluesCount < nonGuesserCount && (
            <button
              onClick={handleHostSkip}
              className="text-xs text-outline underline hover:text-on-surface-variant font-body"
            >
              {cluesCount === 0 ? 'Skip this round' : 'Not waiting for stragglers · Skip ahead'}
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
        <button
          type="button"
          onPointerDown={revealSecretWord}
          onPointerUp={hideSecretWord}
          onPointerCancel={hideSecretWord}
          onLostPointerCapture={hideSecretWord}
          onBlur={hideSecretWord}
          onKeyDown={handlePeekKeyDown}
          onKeyUp={handlePeekKeyUp}
          aria-pressed={isPeeking}
          className="w-full h-28 flex flex-col justify-center rounded-2xl border-2 border-outline-variant/60 bg-surface-container-low px-5 py-4 text-center touch-none select-none transition-colors focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
        >
          <span className="flex items-center justify-center gap-2 text-secondary">
            <span className="material-symbols-outlined text-lg" aria-hidden="true">
              {isPeeking ? 'visibility' : 'visibility_off'}
            </span>
            <span className="font-label text-[10px] uppercase tracking-[0.2em] font-bold">Secret word</span>
          </span>
          {isPeeking && round.secretWord ? (
            <span className="block mt-2 font-headline text-4xl font-bold text-on-surface tracking-tight animate-hen-pop">
              {round.secretWord}
            </span>
          ) : (
            <span className="block mt-2 text-sm text-on-surface-variant font-body">
              Press and hold to peek
            </span>
          )}
        </button>

        {/* Clue submission timer */}
        {round.clueSubmissionDeadline && !myClueSubmitted && (
          <div className="flex items-center justify-center gap-2">
            <span className={`font-headline text-3xl font-bold tabular-nums transition-colors ${
              timeLeft <= 10 ? 'text-error' : timeLeft <= 20 ? 'text-tertiary' : 'text-primary'
            }`}>
              {timeLeft}s
            </span>
            <span className="text-on-surface-variant text-sm font-body">to submit your clue</span>
          </div>
        )}

        {/* Clue Input or Submitted State */}
        {!myClueSubmitted ? (
          <div className="bg-surface-container-lowest rounded-2xl border-2 border-outline-variant/30 p-5 space-y-3 shadow-sm">
            <label className="block">
              <div className="flex justify-between items-center mb-1">
                <span className="font-label text-[10px] uppercase tracking-wider text-secondary font-bold">
                  Your clue · ONE word only
                </span>
                {formatError && (
                  <span className="font-label text-[10px] uppercase tracking-wider text-error font-bold">
                    Fix your clue
                  </span>
                )}
                {clueIsPartOfWord && (
                  <span className="font-label text-[10px] uppercase tracking-wider text-error font-bold">
                    Cannot use the secret!
                  </span>
                )}
              </div>
              <input
                type="text"
                value={clue}
                onChange={(e) => {
                  setClue(e.target.value)
                  setError('')
                }}
                onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                placeholder="One word…"
                maxLength={30}
                autoFocus
                className={`mt-1 w-full bg-surface-container-lowest border-2 rounded-xl px-4 py-3 text-lg text-on-surface placeholder:text-outline/50 font-body focus:ring-2 outline-none transition-all ${
                  !!formatError || clueIsPartOfWord
                    ? 'border-error focus:ring-error/20 focus:border-error'
                  : 'border-outline-variant/30 focus:ring-primary/20 focus:border-primary'
                }`}
              />
              {formatError && (
                <p className="mt-2 text-error text-sm font-body">{formatError}</p>
              )}
            </label>
            <button
              onClick={handleSubmit}
              disabled={submitting || !normalizedClue || !!formatError || clueIsPartOfWord}
              className="w-full bg-primary text-on-primary h-14 rounded-xl font-body font-bold tracking-wide hover:opacity-90 active:scale-[0.98] disabled:opacity-50 transition-all"
            >
              {submitting ? 'Checking clue…' : 'Lock it in'}
            </button>
            {error && <p className="text-center text-error text-sm font-body">{error}</p>}
            <p className="text-xs text-outline text-center font-body">
              One real word. No emoji or words mashed together.
            </p>
          </div>
        ) : (
          <div className="text-center py-4 rounded-xl border border-outline-variant/50 bg-surface-container-low px-4">
            <img src="/images/generated-comic/hen-thinking.png" alt="" className="w-20 h-20 mx-auto mb-2 animate-hen-bob" />
            <p className="font-headline text-lg font-semibold text-on-surface">Clue locked in</p>
            <p className="text-on-surface-variant text-sm font-body mt-2">
              Waiting for the rest of the flock. Your clue stays hidden until the reveal.
            </p>
          </div>
        )}

        {!isGuesser && giverStatusList}

        {isHost && cluesCount < nonGuesserCount && (
          <div className="text-center">
            <button
              onClick={handleHostSkip}
              className="text-xs text-outline underline hover:text-on-surface-variant font-body"
            >
              {cluesCount === 0 ? 'Skip this round' : 'Skip stragglers · Move on'}
            </button>
          </div>
        )}
      </div>
    </main>
  )
}
