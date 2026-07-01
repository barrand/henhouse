import { useEffect, useRef, useState } from 'react'
import type { GameData, PlayerData, RoundData, TruthOrTurdAnswer, TruthOrTurdChoice, TruthOrTurdSubmittedAnswer } from '../types'
import { forceReveal, submitAnswer } from '../service'

interface Props {
  game: GameData
  round: RoundData
  players: PlayerData[]
  isHost: boolean
  currentPlayerId: string | null
}

const ANSWER_COPY: Record<TruthOrTurdAnswer, { label: string; helper: string; icon: string }> = {
  truth: { label: 'Truth', helper: 'Sounds legit', icon: 'verified' },
  turd: { label: 'Turd', helper: 'Total nonsense', icon: 'compost' },
}

export default function AnsweringView({ game, round, players, isHost, currentPlayerId }: Props) {
  const [selected, setSelected] = useState<TruthOrTurdSubmittedAnswer | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [timeLeft, setTimeLeft] = useState(0)
  const [expired, setExpired] = useState(false)
  const [confirmReveal, setConfirmReveal] = useState(false)
  const revealTriggered = useRef(false)

  const answeredIds = new Set(round.answeredPlayerIds ?? [])
  const alreadyAnswered = currentPlayerId ? answeredIds.has(currentPlayerId) : false

  useEffect(() => {
    setSelected(null)
    setSubmitting(false)
    setExpired(false)
    setConfirmReveal(false)
    revealTriggered.current = false
  }, [round.id, round.questionKey, round.deadline.seconds, round.deadline.nanoseconds])

  useEffect(() => {
    if (!round.deadline) return
    const deadlineMs = round.deadline.seconds * 1000 + (round.deadline.nanoseconds ?? 0) / 1e6
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((deadlineMs - Date.now()) / 1000))
      setTimeLeft(remaining)
      setExpired(remaining <= 0)
    }
    tick()
    const interval = setInterval(tick, 250)
    return () => clearInterval(interval)
  }, [round.deadline])

  useEffect(() => {
    if (!isHost || !expired || revealTriggered.current) return
    revealTriggered.current = true
    forceReveal(game.id).catch((err) => {
      console.error('Failed to reveal round:', err)
      revealTriggered.current = false
    })
  }, [expired, game.id, isHost])

  const handleSubmit = async (answer: TruthOrTurdSubmittedAnswer) => {
    if (submitting || alreadyAnswered || expired) return
    setSelected(answer)
    setSubmitting(true)
    try {
      await submitAnswer(game.id, game.currentRound, answer)
    } catch (err) {
      console.error('Failed to submit answer:', err)
      setSelected(null)
    } finally {
      setSubmitting(false)
    }
  }

  const handleForceReveal = async () => {
    if (!confirmReveal) {
      setConfirmReveal(true)
      return
    }
    try {
      await forceReveal(game.id)
    } catch (err) {
      console.error('Failed to reveal round:', err)
    }
  }

  const timerPercent = Math.max(0, (timeLeft / game.settings.secondsPerRound) * 100)
  const isPatrioticRound = round.tags?.includes('patriotic') || round.source === 'patriotic'
  const isMultipleChoice = round.kind === 'multiple-choice'
  const prompt = isMultipleChoice ? round.prompt : round.statement
  const selectedLabel = selected
    ? isMultipleChoice
      ? round.choices?.find((choice) => choice.id === selected)?.text ?? selected
      : ANSWER_COPY[selected as TruthOrTurdAnswer]?.label ?? selected
    : null

  const renderChoiceButton = (choice: TruthOrTurdChoice, index: number) => {
    const active = selected === choice.id
    const letter = String.fromCharCode(65 + index)
    return (
      <button
        key={choice.id}
        type="button"
        onClick={() => handleSubmit(choice.id)}
        disabled={submitting || alreadyAnswered || expired}
        className={`rounded-2xl border-2 p-4 text-left transition-all active:scale-[0.98] disabled:opacity-55 ${
          active
            ? 'bg-primary-fixed border-primary text-on-primary-fixed animate-answer-card-lock'
            : 'bg-surface-container-low border-outline-variant/60 hover:border-primary hover:bg-primary/10 text-on-surface'
        }`}
      >
        <span className="flex items-center gap-3">
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 font-headline text-lg font-bold ${
            active ? 'border-primary text-on-primary-fixed bg-primary/20' : 'border-outline-variant text-secondary'
          }`}>
            {letter}
          </span>
          <span className="font-body text-base font-semibold leading-snug">{choice.text}</span>
        </span>
      </button>
    )
  }

  return (
    <main className="flex-1 flex flex-col px-4 py-6">
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

      <section className="rounded-2xl border-2 p-6 text-center shadow-sm relative bg-surface-container-lowest border-outline-variant/60">
        {isPatrioticRound && (
          <div className="absolute top-3 right-3 text-2xl" aria-hidden>🇺🇸</div>
        )}
        <img src="/images/generated-comic/truth-or-turd-thinking.png" alt="" className="w-20 h-20 mx-auto mb-3 animate-hen-bob" />
        <p className="font-headline text-xl font-bold text-on-surface leading-relaxed">
          {prompt}
        </p>
      </section>

      <div className={`mt-6 grid grid-cols-1 gap-3 ${isMultipleChoice ? '' : 'sm:grid-cols-2'}`}>
        {isMultipleChoice
          ? (round.choices ?? []).map(renderChoiceButton)
          : (['truth', 'turd'] as const).map((answer) => {
              const copy = ANSWER_COPY[answer]
              const active = selected === answer
              return (
                <button
                  key={answer}
                  type="button"
                  onClick={() => handleSubmit(answer)}
                  disabled={submitting || alreadyAnswered || expired}
                  className={`rounded-2xl border-2 p-5 text-left transition-all active:scale-[0.98] disabled:opacity-55 ${
                    active
                      ? 'bg-primary-fixed border-primary text-on-primary-fixed animate-answer-card-lock'
                      : 'bg-surface-container-low border-outline-variant/60 hover:border-primary hover:bg-primary/10 text-on-surface'
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-3xl">{copy.icon}</span>
                    <span>
                      <span className="block font-headline text-2xl font-bold">{copy.label}</span>
                      <span className="block text-sm font-body text-on-surface-variant">{copy.helper}</span>
                    </span>
                  </span>
                </button>
              )
            })}
      </div>

      {alreadyAnswered || selected ? (
        <div className="mt-5 text-center py-4 rounded-xl border border-outline-variant/60 bg-surface-container-low px-4">
          <p className="font-headline text-lg font-semibold text-on-surface">You&apos;re clucked in</p>
          {selected && (
            <p className="mt-2 inline-block rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-sm font-body font-semibold text-primary">
              {selectedLabel}
            </p>
          )}
          <p className="text-on-surface-variant text-sm font-body mt-2">
            Waiting for the rest of the flock. Answers stay hidden until the reveal.
          </p>
        </div>
      ) : expired ? (
        <div className="mt-5 text-center py-4">
          <img src="/images/generated-comic/hen-sleeping.png" alt="" className="w-20 h-20 mx-auto mb-2 animate-hen-bob" />
          <p className="text-error font-bold text-lg font-body">Too slow!</p>
          <p className="text-on-surface-variant mt-1 font-body">No answer this round.</p>
        </div>
      ) : null}

      <section className="mt-6 bg-surface-container-lowest rounded-xl border border-outline-variant/60 p-4">
        <p className="text-xs font-bold uppercase tracking-widest text-secondary mb-3 font-label">
          {answeredIds.size} of {players.length} answered
        </p>
        <ul className="grid grid-cols-2 gap-x-4 gap-y-2">
          {players.map((player) => {
            const hasAnswered = answeredIds.has(player.id)
            return (
              <li key={player.id} className="flex items-center gap-1.5 min-w-0">
                <span
                  className={`material-symbols-outlined text-base shrink-0 ${hasAnswered ? 'text-primary' : 'text-outline-variant'}`}
                  style={hasAnswered ? { fontVariationSettings: "'FILL' 1" } : undefined}
                >
                  {hasAnswered ? 'check_circle' : 'radio_button_unchecked'}
                </span>
                <span className={`text-sm font-body truncate ${hasAnswered ? 'text-on-surface' : 'text-outline'}`}>
                  {player.name}
                </span>
              </li>
            )
          })}
        </ul>
      </section>

      {isHost && !expired && answeredIds.size > 0 && (
        <div className="mt-4 space-y-2">
          <button
            type="button"
            onClick={handleForceReveal}
            className="w-full border-2 border-secondary text-secondary h-12 rounded-xl font-body font-semibold tracking-wide hover:bg-secondary-fixed/20 active:scale-95 transition-all flex items-center justify-center gap-2"
          >
            <span>{confirmReveal ? 'Tap again to reveal' : 'Stop Waiting'}</span>
            {!confirmReveal && (
              <span className="font-label text-[10px] font-bold uppercase tracking-[0.2em] opacity-70">
                Host only
              </span>
            )}
          </button>
          <p className="text-center text-xs text-outline font-body">
            Reveal now and score anyone who has not answered as no answer.
          </p>
        </div>
      )}
    </main>
  )
}
