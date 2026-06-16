import { useEffect, useRef, useState } from 'react'
import type { GameData, PlayerData, RoundData } from '../types'
import { submitWordVote, finalizeWordSelection } from '../service'

interface Props {
  game: GameData
  round: RoundData
  players: PlayerData[]
  isGuesser: boolean
  isHost: boolean
}

export default function WordSelectionView({ game, round, players, isGuesser, isHost }: Props) {
  const [myVote, setMyVote] = useState<number | null>(null)
  const [voting, setVoting] = useState(false)
  const [timeLeft, setTimeLeft] = useState(15)
  const finalizedRef = useRef(false)

  const guesserPlayer = players.find((p) => p.id === game.currentGuesser)
  const totalVotes = Object.keys(round.wordVotes ?? {}).length
  const nonGuesserCount = players.length - 1

  // Countdown timer
  useEffect(() => {
    if (!round.wordSelectionDeadline) return
    finalizedRef.current = false

    const deadlineMs = round.wordSelectionDeadline.seconds * 1000

    const tick = () => {
      const remaining = Math.max(0, Math.ceil((deadlineMs - Date.now()) / 1000))
      setTimeLeft(remaining)
      if (remaining === 0 && !finalizedRef.current) {
        finalizedRef.current = true
        finalizeWordSelection(game.id, round.id ? parseInt(round.id) : game.currentRound).catch(() => {})
      }
    }

    tick()
    const interval = setInterval(tick, 500)
    return () => clearInterval(interval)
  }, [round.wordSelectionDeadline, game.id, game.currentRound, round.id])

  const handleVote = async (idx: number) => {
    if (voting || idx === myVote) return  // no-op if tapping the same word again
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
          <img src="/images/hen-thinking.svg" alt="" className="w-24 h-24 mx-auto animate-hen-bob" />
          <h2 className="font-headline text-2xl font-bold text-on-surface">
            Picking your word…
          </h2>
          <p className="text-on-surface-variant font-body">
            The others are voting on which word to give you. Sit tight.
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
            Pick a word for{' '}
            <span className="text-primary">{guesserPlayer?.name}</span>!
          </h2>
          <p className="text-on-surface-variant text-sm mt-1 font-body">
            Choose the one that'll make for the most fun round.
          </p>
        </div>

        {/* Timer */}
        <div className="flex items-center justify-center gap-3">
          <div
            className={`font-headline text-4xl font-bold tabular-nums transition-colors ${
              timeLeft <= 5 ? 'text-error' : timeLeft <= 10 ? 'text-tertiary' : 'text-primary'
            }`}
          >
            {timeLeft}
          </div>
          <div className="text-on-surface-variant text-sm font-body">
            {totalVotes}/{nonGuesserCount} voted
          </div>
        </div>

        {/* Word cards */}
        <div className="grid grid-cols-3 gap-3">
          {(round.wordOptions ?? []).map((word, idx) => {
            const isMyPick = myVote === idx
            const voteCount = voteTally[idx]

            return (
              <button
                key={idx}
                onClick={() => handleVote(idx)}
                disabled={voting}
                className={`relative flex flex-col items-center justify-center rounded-2xl border-2 px-3 py-5 font-body transition-all active:scale-[0.97] ${
                  isMyPick
                    ? 'bg-primary border-primary text-on-primary shadow-[0_8px_24px_rgba(0,0,0,0.3)] scale-[1.04]'
                    : 'bg-surface-container-lowest border-outline-variant/30 text-on-surface hover:border-primary/50 hover:bg-primary-fixed/20'
                }`}
              >
                <span className="font-headline text-base font-bold text-center leading-tight">
                  {word}
                </span>
                {voteCount > 0 && (
                  <span
                    className={`mt-2 text-xs font-bold tabular-nums ${
                      isMyPick ? 'text-on-primary/80' : 'text-primary'
                    }`}
                  >
                    {voteCount} vote{voteCount !== 1 ? 's' : ''}
                  </span>
                )}
                {isMyPick && (
                  <span className="absolute -top-2 left-1/2 -translate-x-1/2 bg-tertiary-container text-on-tertiary-container text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full font-label">
                    ✓ yours
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {myVote === null ? (
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
        {isHost && (
          <button
            onClick={() => finalizeWordSelection(game.id, game.currentRound).catch(() => {})}
            className="w-full bg-surface-container-low border border-outline-variant/30 text-on-surface-variant h-10 rounded-xl font-body text-sm hover:opacity-80 active:scale-[0.98] transition-all"
          >
            Skip stragglers · Pick now
          </button>
        )}
      </div>
    </main>
  )
}
