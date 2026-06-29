import { useState, useEffect, useRef } from 'react'
import type { GameData, RoundData, PlayerData } from '../types'
import { submitAnswer, skipQuestion, forceEndRound } from '../service'

interface Props {
  game: GameData
  round: RoundData
  isHost: boolean
  players: PlayerData[]
  /** When set, restores "already answered" UI if this player is in answeredPlayerIds */
  currentPlayerId?: string | null
  /** Dev preview: skip Firebase calls and host auto-end on timer expiry */
  previewMode?: boolean
}

export default function QuestionDisplay({
  game,
  round,
  isHost,
  players,
  currentPlayerId = null,
  previewMode = false,
}: Props) {
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
    if (!currentPlayerId) return
    if (answeredIds.has(currentPlayerId)) {
      setSubmitted(true)
      const existing = round.playerAnswers?.[currentPlayerId]
      if (existing) setAnswer(existing)
    }
  }, [currentPlayerId, round.id, round.playerAnswers, round.answeredPlayerIds])

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
    if (previewMode || !expired || !isHost || endRoundTriggered.current) return
    endRoundTriggered.current = true
    forceEndRound(game.id).catch((err) =>
      console.error('Failed to force end round:', err)
    )
  }, [expired, isHost, game.id, previewMode])

  const handleSubmit = async (rawAnswer?: string) => {
    const finalAnswer = (rawAnswer ?? answer).trim()
    if (!finalAnswer || submitted || submitting || expired) return
    if (previewMode) {
      setAnswer(finalAnswer)
      setSubmitted(true)
      return
    }
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
    if (previewMode) return
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
    if (previewMode) return
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

      <div className="rounded-2xl border-2 p-6 text-center shadow-sm relative bg-surface-container-lowest border-outline-variant/60">
        {round.source === 'patriotic' && (
          <div className="absolute top-3 right-3 text-2xl" aria-hidden>🇺🇸</div>
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
            <img src="/images/generated-comic/hen-sleeping.png" alt="" className="w-20 h-20 mx-auto mb-2 animate-hen-bob" />
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
                  className="bg-surface-container-low border-2 border-outline-variant/60 hover:border-primary hover:bg-primary/10 active:scale-95 disabled:opacity-50 rounded-xl px-4 py-4 text-lg font-body font-semibold text-on-surface transition-all text-center leading-snug"
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
              className="w-full bg-surface-container-low border-2 border-outline rounded-xl px-4 py-3 text-lg text-on-surface placeholder:text-outline/50 font-body focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
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
          <div className="text-center py-4 rounded-xl border border-outline-variant/50 bg-surface-container-low px-4">
            <img src="/images/generated-comic/hen-thinking.png" alt="" className="w-20 h-20 mx-auto mb-2 animate-hen-bob" />
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
      <div className="mt-6 bg-surface-container-lowest rounded-xl border border-outline-variant/60 p-4">
        <p className="text-xs font-bold uppercase tracking-widest text-secondary mb-3 font-label">
          {answeredIds.size} of {players.length} answered
        </p>
        <ul className="grid grid-cols-2 gap-x-4 gap-y-2">
          {players.map((p) => {
            const hasAnswered = answeredIds.has(p.id)
            return (
              <li key={p.id} className="flex items-center gap-1.5 min-w-0">
                <span
                  className={`material-symbols-outlined text-base shrink-0 ${
                    hasAnswered ? 'text-primary' : 'text-outline-variant'
                  }`}
                  style={hasAnswered ? { fontVariationSettings: "'FILL' 1" } : undefined}
                >
                  {hasAnswered ? 'check_circle' : 'radio_button_unchecked'}
                </span>
                <span className="text-sm font-body min-w-0 flex items-baseline gap-0.5">
                  <span className={`truncate ${hasAnswered ? 'text-on-surface' : 'text-outline'}`}>
                    {p.name}
                  </span>
                  {!hasAnswered && (
                    <span className="text-outline text-xs shrink-0"> (waiting)</span>
                  )}
                </span>
              </li>
            )
          })}
        </ul>
      </div>

      {isHost && !expired && answeredIds.size > 0 && (
        <div className="mt-4 space-y-2">
          <button
            onClick={handleEndRound}
            className="w-full border-2 border-secondary text-secondary h-12 rounded-xl font-body font-semibold tracking-wide hover:bg-secondary-fixed/20 active:scale-95 transition-all flex items-center justify-center gap-2"
          >
            <span>{confirmEndRound ? 'Tap again to stop waiting' : 'Stop Waiting'}</span>
            {!confirmEndRound && (
              <span className="font-label text-[10px] font-bold uppercase tracking-[0.2em] opacity-70">
                · Host only
              </span>
            )}
          </button>
          <p className="mt-2 text-center text-xs text-outline font-body">
            Stop waiting and score answers — anyone who hasn&apos;t answered yet gets none.
          </p>
        </div>
      )}
    </div>
  )
}
