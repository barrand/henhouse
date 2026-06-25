import { useState, useEffect, useRef } from 'react'
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

export default function ClueSubmissionView({ game, round, players, currentPlayer, isGuesser, isHost }: Props) {
  const [clue, setClue] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [timeLeft, setTimeLeft] = useState(60)
  const clueRef = useRef(clue)
  const autoSubmittedRef = useRef(false)
  const hostForcedRef = useRef(false)

  // Keep ref in sync so the timer callback can read current value
  useEffect(() => { clueRef.current = clue }, [clue])

  // Countdown timer — auto-submit on expiry
  useEffect(() => {
    if (!round.clueSubmissionDeadline) return
    autoSubmittedRef.current = false
    hostForcedRef.current = false

    const deadlineMs = round.clueSubmissionDeadline.seconds * 1000

    const tick = async () => {
      const remaining = Math.max(0, Math.ceil((deadlineMs - Date.now()) / 1000))
      setTimeLeft(remaining)

      if (remaining === 0) {
        // Givers: auto-submit whatever they've typed (if anything and not yet submitted)
        if (!isGuesser && !autoSubmittedRef.current && !myClueSubmitted) {
          autoSubmittedRef.current = true
          const currentClue = clueRef.current.trim()
          if (currentClue && currentClue.split(/\s+/).length === 1) {
            try { await submitClue(game.id, game.currentRound, currentClue) } catch { /* ignore */ }
          }
        }
        // Host: force dedup after a short grace period (2s after individual auto-submits)
        if (isHost && !hostForcedRef.current) {
          hostForcedRef.current = true
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
  }, [round.clueSubmissionDeadline?.seconds]) // eslint-disable-line react-hooks/exhaustive-deps

  const myClueSubmitted = currentPlayer?.id && !!round.cluesByPlayer[currentPlayer.id]
  const cluesCount = Object.keys(round.cluesByPlayer).length
  const nonGuesserCount = players.length - 1
  const guesserPlayer = players.find((p) => p.id === game.currentGuesser)

  const isMultiWord = clue.trim().split(/\s+/).length > 1
  const secretWordLower = round.secretWord?.toLowerCase().trim() ?? ""
  const clueIsPartOfWord = !!(secretWordLower && clue.trim().toLowerCase().length > 0 && secretWordLower.includes(clue.trim().toLowerCase()))

  const handleSubmit = async () => {
    if (!clue.trim()) return setError("Pop in a clue first")
    if (isMultiWord) return setError("One word only — that’s the whole game!")
    if (clueIsPartOfWord) return setError("Your clue can’t be part of the secret word")
    setError("")
    setSubmitting(true)
    try {
      await submitClue(game.id, game.currentRound, clue)
      setClue("")
    } catch (err: any) {
      setError(err.message ?? "Couldn’t send your clue")
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
    } catch (err: any) {
      setError(err.message ?? "Couldn’t skip the wait")
    }
  }

  const givers = players.filter((p) => p.id !== game.currentGuesser)

  // GUESSER VIEW: blind, just wait
  if (isGuesser) {
    return (
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-10">
        <div className="max-w-md w-full text-center space-y-6">
          <img src="/images/hen-blindfold.svg" alt="" className="w-28 h-28 mx-auto animate-hen-bob" />
          <h2 className="font-headline text-3xl font-bold text-on-surface">No peeking!</h2>
          <p className="text-on-surface-variant font-body">
            Keep your eyes on your own screen. The flock is writing clues for you.
          </p>
          <div className="bg-surface-container-lowest border border-outline-variant/20 rounded-2xl px-4 py-3">
            <p className="text-xs font-bold uppercase tracking-widest text-secondary mb-2 font-label">
              {cluesCount} of {nonGuesserCount} ready
            </p>
            <ul className="space-y-1">
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
        {/* Secret Word Banner — uses Flock's premium card pattern */}
        <div className="bg-primary-fixed/50 border-2 border-primary-fixed-dim rounded-2xl p-6 text-center shadow-sm">
          <p className="font-label text-[10px] uppercase tracking-[0.2em] text-primary mb-2 font-bold">
            Secret word for {guesserPlayer?.name ?? 'the guesser'}
          </p>
          <p className="font-headline text-5xl font-bold text-on-surface tracking-tight">
            {round.secretWord}
          </p>
        </div>

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
                {isMultiWord && (
                  <span className="font-label text-[10px] uppercase tracking-wider text-error font-bold">
                    Too many words!
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
                onChange={(e) => setClue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                placeholder="One word…"
                maxLength={30}
                autoFocus
                className={`mt-1 w-full bg-surface-container-lowest border-2 rounded-xl px-4 py-3 text-lg text-on-surface placeholder:text-outline/50 font-body focus:ring-2 outline-none transition-all ${
                  isMultiWord || clueIsPartOfWord
                    ? 'border-error focus:ring-error/20 focus:border-error'
                    : 'border-outline-variant/30 focus:ring-primary/20 focus:border-primary'
                }`}
              />
            </label>
            <button
              onClick={handleSubmit}
              disabled={submitting || !clue.trim() || isMultiWord || clueIsPartOfWord}
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
          <div className="bg-surface-container-lowest rounded-2xl border-2 border-primary/30 px-4 py-3 shadow-sm space-y-3">
            <div className="flex items-center gap-3">
              <span className="text-2xl">✅</span>
              <div>
                <p className="font-headline text-base font-bold text-primary leading-tight">Clue locked in!</p>
                <p className="text-xs font-bold uppercase tracking-widest text-secondary font-label">
                  {cluesCount} of {nonGuesserCount} ready
                </p>
              </div>
            </div>
            <div className="border-t border-outline-variant/20 pt-2">
              <ul className="space-y-1">
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
