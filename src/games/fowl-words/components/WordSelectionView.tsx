import { useEffect, useRef, useState } from 'react'
import type { GameData, PlayerData, RoundData } from '../types'
import { submitWordVote, finalizeWordSelection, beginClueSubmission } from '../service'

interface Props {
  game: GameData
  round: RoundData
  players: PlayerData[]
  currentPlayerId: string | null
  isGuesser: boolean
  isHost: boolean
}

export default function WordSelectionView({ game, round, players, currentPlayerId, isGuesser, isHost }: Props) {
  const [myVote, setMyVote] = useState<number | null>(null)
  const [voting, setVoting] = useState(false)
  const [timeLeft, setTimeLeft] = useState(15)
  const finalizedRef = useRef(false)
  const beganClueSubmissionRef = useRef(false)

  const guesserPlayer = players.find((p) => p.id === game.currentGuesser)
  const totalVotes = Object.keys(round.wordVotes ?? {}).length
  const nonGuesserCount = players.length - 1
  const roundNum = round.id ? parseInt(round.id) : game.currentRound
  const isWordSelected = round.status === 'word-selected'
  const selectedWordIndex = round.selectedWordIndex ?? (
    round.secretWord
      ? (round.wordOptions ?? []).findIndex((word) => word.toLowerCase() === round.secretWord.toLowerCase())
      : -1
  )
  const serverVote = currentPlayerId ? round.wordVotes?.[currentPlayerId] : undefined
  const effectiveMyVote = myVote ?? (typeof serverVote === 'number' ? serverVote : null)

  // Countdown timer
  useEffect(() => {
    if (round.status !== 'word-selection') return
    if (!round.wordSelectionDeadline) return
    finalizedRef.current = false

    const deadlineMs = round.wordSelectionDeadline.seconds * 1000

    const tick = () => {
      const remaining = Math.max(0, Math.ceil((deadlineMs - Date.now()) / 1000))
      setTimeLeft(remaining)
      if (remaining === 0 && !finalizedRef.current) {
        finalizedRef.current = true
        finalizeWordSelection(game.id, roundNum).catch(() => {})
      }
    }

    tick()
    const interval = setInterval(tick, 500)
    return () => clearInterval(interval)
  }, [round.status, round.wordSelectionDeadline, game.id, roundNum])

  useEffect(() => {
    if (round.status !== 'word-selected') return
    if (!round.wordSelectedDeadline) return
    beganClueSubmissionRef.current = false

    const deadlineMs = round.wordSelectedDeadline.seconds * 1000

    const tick = () => {
      const remaining = Math.max(0, Math.ceil((deadlineMs - Date.now()) / 1000))
      setTimeLeft(remaining)
      if (remaining === 0 && !beganClueSubmissionRef.current) {
        beganClueSubmissionRef.current = true
        beginClueSubmission(game.id, roundNum)
          .catch(() => {})
          .finally(() => {
            beganClueSubmissionRef.current = false
          })
      }
    }

    tick()
    const interval = setInterval(tick, 250)
    return () => clearInterval(interval)
  }, [round.status, round.wordSelectedDeadline, game.id, roundNum])

  const handleVote = async (idx: number) => {
    if (isWordSelected || voting || idx === effectiveMyVote) return  // no-op if tapping the same word again
    setMyVote(idx)
    setVoting(true)
    try {
      await submitWordVote(game.id, game.currentRound, idx)
    } catch {
      setMyVote(null)
    } finally {
      setVoting(false)
    }
  }

  const voteTally = [0, 1, 2].map((idx) =>
    Object.values(round.wordVotes ?? {}).filter((v) => v === idx).length
  )

  // Guesser view — blind waiting screen
  if (isGuesser) {
    return (
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-10">
        <div className="max-w-md w-full text-center space-y-5">
          <img
            src="/images/generated-comic/hen-thinking.png"
            alt=""
            className={`w-24 h-24 mx-auto ${isWordSelected ? 'animate-hen-pop' : 'animate-hen-bob'}`}
          />
          <h2 className="font-headline text-2xl font-bold text-on-surface">
            {isWordSelected ? 'Word locked in…' : 'Picking your word…'}
          </h2>
          <p className="text-on-surface-variant font-body">
            {isWordSelected
              ? 'The others are getting ready to write clues. Still no peeking.'
              : 'The others are voting on which word to give you. Sit tight.'}
          </p>
          <div className="flex justify-center gap-2 mt-4">
            <span className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
          <p className="text-xs text-outline font-body">{timeLeft}s remaining</p>
        </div>
      </main>
    )
  }

  // Clue-giver view — word cards + voting
  return (
    <main className="flex-1 flex flex-col px-4 py-6">
      <div className="max-w-md w-full mx-auto space-y-5">
        {/* Header */}
        <div className="text-center">
          <h2 className="font-headline text-2xl font-bold text-on-surface">
            {isWordSelected ? (
              <>
                The flock picked{' '}
                <span className="text-primary">this one!</span>
              </>
            ) : (
              <>
                Pick a word for{' '}
                <span className="text-primary">{guesserPlayer?.name}</span>!
              </>
            )}
          </h2>
          <p className="text-on-surface-variant text-sm mt-1 font-body">
            {isWordSelected
              ? 'Get ready to write a clue for the spotlight word.'
              : "Choose the one that'll make for the most fun round."}
          </p>
        </div>

        {/* Timer */}
        <div className={`flex items-center justify-center gap-3 ${isWordSelected ? 'animate-hen-pop' : ''}`}>
          <div
            className={`font-headline text-4xl font-bold tabular-nums transition-colors ${
              isWordSelected ? 'text-primary' : timeLeft <= 5 ? 'text-error' : timeLeft <= 10 ? 'text-tertiary' : 'text-primary'
            }`}
          >
            {timeLeft}
          </div>
          <div className="text-on-surface-variant text-sm font-body">
            {isWordSelected ? 'starting clues' : `${totalVotes}/${nonGuesserCount} voted`}
          </div>
        </div>

        {/* Word cards */}
        <div className="grid grid-cols-3 gap-3">
          {(round.wordOptions ?? []).map((word, idx) => {
            const isMyPick = effectiveMyVote === idx
            const isSelected = isWordSelected && selectedWordIndex === idx
            const isDimmed = isWordSelected && !isSelected
            const voteCount = voteTally[idx]

            return (
              <button
                key={idx}
                onClick={() => handleVote(idx)}
                disabled={voting || isWordSelected}
                className={`relative flex min-h-32 flex-col items-center justify-center overflow-visible rounded-2xl border-2 px-3 py-5 font-body transition-all ${
                  isSelected
                    ? 'bg-primary-fixed border-primary text-on-primary-fixed scale-[1.08] animate-word-selected-card shadow-xl'
                    : isDimmed
                      ? 'bg-surface-container-lowest border-outline-variant/50 text-outline opacity-45 scale-95'
                      : isMyPick
                        ? 'bg-primary border-primary text-on-primary shadow-[0_8px_24px_rgba(0,0,0,0.3)] scale-[1.04] active:scale-[0.97]'
                        : 'bg-surface-container-lowest border-outline-variant/30 text-on-surface hover:border-primary/50 hover:bg-primary-fixed/20 active:scale-[0.97]'
                }`}
              >
                {isSelected && (
                  <span className="pointer-events-none absolute inset-0 z-0">
                    <span className="absolute left-2 top-2 text-primary animate-word-spark">✦</span>
                    <span className="absolute right-3 top-4 text-tertiary animate-word-spark-delayed">✶</span>
                    <span className="absolute bottom-3 left-1/2 text-secondary animate-word-spark-late">✦</span>
                  </span>
                )}
                <span className="font-headline text-base font-bold text-center leading-tight">
                  {word}
                </span>
                {voteCount > 0 && (
                  <span
                    className={`mt-2 text-xs font-bold tabular-nums ${
                      isSelected ? 'text-on-primary-fixed-variant' : isMyPick ? 'text-on-primary/80' : 'text-primary'
                    }`}
                  >
                    {voteCount} vote{voteCount !== 1 ? 's' : ''}
                  </span>
                )}
                {isMyPick && !isWordSelected && (
                  <span className="absolute -top-2 left-1/2 -translate-x-1/2 bg-tertiary-container text-on-tertiary-container text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full font-label">
                    Yours
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {isWordSelected ? (
          <p className="text-center text-primary text-xs font-bold uppercase tracking-wider font-label">
            Spotlight word locked
          </p>
        ) : effectiveMyVote === null ? (
          <p className="text-center text-outline text-xs font-body">
            Tap to vote — {guesserPlayer?.name} can't see this screen
          </p>
        ) : (
          <p className="text-center text-outline text-xs font-body">
            {totalVotes < nonGuesserCount
              ? `Waiting for ${nonGuesserCount - totalVotes} more vote${nonGuesserCount - totalVotes !== 1 ? 's' : ''}… Tap to change your pick.`
              : 'All voted! Finalizing…'}
          </p>
        )}

        {/* Host skip button */}
        {isHost && !isWordSelected && (
          <button
            onClick={() => finalizeWordSelection(game.id, roundNum).catch(() => {})}
            className="w-full bg-surface-container-low border border-outline-variant/30 text-on-surface-variant h-10 rounded-xl font-body text-sm hover:opacity-80 active:scale-[0.98] transition-all"
          >
            Skip stragglers · Pick now
          </button>
        )}
      </div>
    </main>
  )
}
