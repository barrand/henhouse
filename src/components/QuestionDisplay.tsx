import { useState, useEffect, useRef } from 'react'
import type { GameData, RoundData, PlayerData } from '../types'
import { submitAnswer, skipQuestion, forceEndRound } from '../lib/gameService'

interface Props {
  game: GameData
  round: RoundData
  isHost: boolean
  players: PlayerData[]
}

export default function QuestionDisplay({ game, round, isHost, players }: Props) {
  const [answer, setAnswer] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [timeLeft, setTimeLeft] = useState(0)
  const [expired, setExpired] = useState(false)
  const [confirmEndRound, setConfirmEndRound] = useState(false)
  const endRoundTriggered = useRef(false)

  const answeredIds = new Set(round.answeredPlayerIds ?? [])

  // New question (same round # after skip, or next round): reset local UI so players can answer again.
  useEffect(() => {
    setSubmitted(false)
    setAnswer('')
    setConfirmEndRound(false)
    setExpired(false)
    endRoundTriggered.current = false
  }, [round.id, round.question, round.deadline.seconds, round.deadline.nanoseconds])

  useEffect(() => {
    if (!round.deadline) return

    const deadlineMs = round.deadline.seconds * 1000 + (round.deadline.nanoseconds ?? 0) / 1e6
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((deadlineMs - Date.now()) / 1000))
      setTimeLeft(remaining)
      if (remaining <= 0) {
        setExpired(true)
      } else {
        setExpired(false)
      }
    }
    tick()
    const interval = setInterval(tick, 250)
    return () => clearInterval(interval)
  }, [round.deadline])

  useEffect(() => {
    if (expired && isHost && !endRoundTriggered.current) {
      endRoundTriggered.current = true
      forceEndRound(game.id).catch((err) =>
        console.error('Failed to force end round:', err)
      )
    }
  }, [expired, isHost, game.id])

  const handleSubmit = async (rawAnswer?: string) => {
    const finalAnswer = (rawAnswer ?? answer).trim()
    if (!finalAnswer || submitted || submitting || expired) return
    setSubmitting(true)
    try {
      await submitAnswer(game.id, game.currentRound, finalAnswer)
      setAnswer(finalAnswer)
      setSubmitted(true)
    } catch (err) {
      console.error('Failed to submit answer:', err)
    } finally {
      setSubmitting(false)
    }
  }

  const handleSkip = async () => {
    try {
      await skipQuestion(game.id)
    } catch (err) {
      console.error('Failed to skip:', err)
    }
  }

  const handleEndRound = async () => {
    if (!confirmEndRound) {
      setConfirmEndRound(true)
      return
    }
    try {
      await forceEndRound(game.id)
    } catch (err) {
      console.error('Failed to end round:', err)
    }
  }

  const timerPercent = round.deadline
    ? Math.max(0, (timeLeft / game.settings.secondsPerRound) * 100)
    : 100

  return (
    <div className="flex-1 flex flex-col px-4 py-6">
      <div className="text-center mb-4">
        <p className="text-xs font-label uppercase tracking-widest text-secondary mb-1">Round timer</p>
        <p className={`font-headline text-3xl font-bold tabular-nums ${expired ? 'text-error' : 'text-on-surface'}`}>
          {expired ? "TIME'S UP!" : `0:${String(timeLeft).padStart(2, '0')}`}
        </p>
        <div className="mt-2 h-2 bg-surface-container-high rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-250 ${expired ? 'bg-error' : 'bg-primary'}`}
            style={{ width: `${timerPercent}%` }}
          />
        </div>
      </div>

      <div className={`rounded-2xl border-2 p-6 text-center shadow-sm relative ${
        round.source === 'patriotic'
          ? 'bg-gradient-to-br from-red-50 to-blue-50 border-red-200'
          : 'bg-surface-container-lowest border-outline-variant/30'
      }`}>
        {round.source === 'patriotic' && (
          <div className="absolute top-3 right-3 text-2xl">🇺🇸</div>
        )}
        <p className="font-headline text-xl font-bold text-on-surface leading-relaxed">
          {round.question}
        </p>
        {round.source === 'custom' && round.submittedBy && (
          <p className="mt-2 text-xs text-outline font-body">
            submitted by {players.find((p) => p.id === round.submittedBy)?.name ?? 'a player'}
          </p>
        )}
      </div>

      {isHost && !expired && (
        <button
          onClick={handleSkip}
          className="mt-2 text-sm text-outline underline hover:text-on-surface-variant self-center font-body"
        >
          Skip question
        </button>
      )}

      <div className="mt-6 space-y-3">
        {expired && !submitted ? (
          <div className="text-center py-4">
            <p className="text-error font-bold text-lg font-body">Too slow!</p>
            <p className="text-outline mt-1 font-body">You didn't answer in time.</p>
          </div>
        ) : !submitted ? (
          round.type === 'multiple_choice' && round.options && round.options.length >= 2 ? (
            <div
              className={
                round.options.length === 2
                  ? 'grid grid-cols-1 sm:grid-cols-2 gap-3'
                  : round.options.length === 4
                  ? 'grid grid-cols-2 gap-3'
                  : 'flex flex-col gap-3'
              }
            >
              {round.options.map((opt) => (
                <button
                  key={opt}
                  onClick={() => handleSubmit(opt)}
                  disabled={submitting}
                  className="bg-surface-container-lowest border-2 border-outline-variant/40 hover:border-primary hover:bg-primary/10 active:scale-95 disabled:opacity-50 rounded-xl px-4 py-4 text-lg font-body font-semibold text-on-surface transition-all text-center leading-snug"
                >
                  {opt}
                </button>
              ))}
            </div>
          ) : (
          <>
            <input
              type="text"
              placeholder="Your answer..."
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              className="w-full bg-surface-container-lowest border-2 border-outline-variant/30 rounded-xl px-4 py-3 text-lg text-on-surface placeholder:text-outline/50 font-body focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
              maxLength={100}
              autoFocus
            />
            <button
              onClick={() => handleSubmit()}
              disabled={!answer.trim() || submitting}
              className="w-full bg-primary text-on-primary h-14 rounded-xl font-body font-semibold tracking-wide shadow-[0_12px_32px_rgba(0,0,0,0.4)] hover:opacity-90 active:scale-95 disabled:opacity-50 transition-all"
            >
              {submitting ? 'Clucking in...' : 'CLUCK IN'}
            </button>
          </>
          )
        ) : (
          <div className="text-center py-4 rounded-xl border border-outline-variant/20 bg-surface-container-low/50 px-4">
            <p className="font-headline text-lg font-semibold text-on-surface">You&apos;re clucked in</p>
            {round.type === 'multiple_choice' && answer && (
              <p className="mt-2 inline-block rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-sm font-body font-semibold text-primary">
                {answer}
              </p>
            )}
            <p className="text-on-surface-variant text-sm font-body mt-2">
              Waiting for the rest of the flock. Your answer only appears at the reveal.
            </p>
            <p
              className={`mt-3 font-headline text-2xl font-bold tabular-nums ${expired ? 'text-error' : 'text-primary'}`}
              aria-live="polite"
            >
              {expired ? "TIME'S UP" : `0:${String(timeLeft).padStart(2, '0')} left`}
            </p>
          </div>
        )}
      </div>

      {/* Player answer status list */}
      <div className="mt-6 bg-surface-container-lowest rounded-xl border border-outline-variant/20 p-4">
        <p className="text-xs font-bold uppercase tracking-widest text-secondary mb-3 font-label">
          {answeredIds.size} of {players.length} answered
        </p>
        <ul className="space-y-2">
          {players.map((p) => {
            const hasAnswered = answeredIds.has(p.id)
            return (
              <li key={p.id} className="flex items-center justify-between">
                <span className={`text-sm font-body ${hasAnswered ? 'text-on-surface' : 'text-outline'}`}>
                  {p.name}
                </span>
                {hasAnswered ? (
                  <span className="material-symbols-outlined text-primary text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                ) : (
                  <span className="text-xs text-outline italic font-body">waiting...</span>
                )}
              </li>
            )
          })}
        </ul>

        {isHost && !expired && answeredIds.size > 0 && (
          <button
            onClick={handleEndRound}
            className="mt-4 w-full border-2 border-secondary text-secondary h-12 rounded-xl font-body font-semibold tracking-wide hover:bg-secondary-fixed/20 active:scale-95 transition-all"
          >
            {confirmEndRound ? 'Are you sure? Tap again to end round' : 'End Round'}
          </button>
        )}
      </div>
    </div>
  )
}
