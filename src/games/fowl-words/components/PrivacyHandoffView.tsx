import { useEffect, useRef, useState } from 'react'
import type { GameData, RoundData } from '../types'
import { skipWordSelectionPrivacyHandoff } from '../service'

interface Props {
  game: GameData
  round: RoundData
  guesserName: string
  isHost: boolean
  onComplete: () => void
}

function timestampMillis(timestamp: RoundData['wordSelectionStartsAt']): number | null {
  if (!timestamp) return null
  return timestamp.seconds * 1000 + Math.floor(timestamp.nanoseconds / 1_000_000)
}

export default function PrivacyHandoffView({ game, round, guesserName, isHost, onComplete }: Props) {
  const [timeLeft, setTimeLeft] = useState(4)
  const [skipping, setSkipping] = useState(false)
  const completedRef = useRef(false)
  const roundNum = round.id ? parseInt(round.id) : game.currentRound

  useEffect(() => {
    const startsAt = timestampMillis(round.wordSelectionStartsAt)
    if (!startsAt) {
      onComplete()
      return
    }
    completedRef.current = false

    const tick = () => {
      const remaining = Math.max(0, Math.ceil((startsAt - Date.now()) / 1000))
      setTimeLeft(remaining)
      if (remaining === 0 && !completedRef.current) {
        completedRef.current = true
        onComplete()
      }
    }

    tick()
    const interval = setInterval(tick, 250)
    return () => clearInterval(interval)
  }, [onComplete, round.wordSelectionStartsAt])

  const handleSkip = async () => {
    if (skipping) return
    setSkipping(true)
    try {
      await skipWordSelectionPrivacyHandoff(game.id, roundNum)
      onComplete()
    } finally {
      setSkipping(false)
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-6 py-10 bg-surface linen-texture">
      <div className="max-w-md w-full text-center space-y-5">
        <h1 className="font-headline text-4xl font-bold text-on-surface tracking-tight">
          {guesserName}, close your eyes.
        </h1>
        <p className="font-headline text-2xl font-bold text-primary">No peeking.</p>
        <p className="font-headline text-5xl font-bold text-on-surface tabular-nums">{timeLeft}</p>
        {isHost && (
          <button
            type="button"
            onClick={handleSkip}
            disabled={skipping}
            className="text-sm text-on-surface-variant underline underline-offset-4 hover:text-on-surface disabled:opacity-50 font-body"
          >
            {skipping ? 'Starting vote…' : 'Skip'}
          </button>
        )}
      </div>
    </main>
  )
}
