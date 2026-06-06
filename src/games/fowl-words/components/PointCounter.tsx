import { useEffect, useState } from 'react'
import { ATTEMPT_POINTS } from '../types'

interface Props {
  currentAttempt: number  // 1-based
  maxAttempts: number
}

export default function PointCounter({ currentAttempt, maxAttempts }: Props) {
  const safeAttempt = Math.max(1, Math.min(currentAttempt, ATTEMPT_POINTS.length))
  const points = ATTEMPT_POINTS[safeAttempt - 1] ?? 0

  // Tick-down flash animation when the value drops
  const [prevPoints, setPrevPoints] = useState(points)
  const [flashing, setFlashing] = useState(false)
  useEffect(() => {
    if (points !== prevPoints) {
      setFlashing(true)
      const t = setTimeout(() => {
        setPrevPoints(points)
        setFlashing(false)
      }, 700)
      return () => clearTimeout(t)
    }
  }, [points, prevPoints])

  // Color shift as points drop — uses Flock-aligned tokens
  const tint = (() => {
    switch (points) {
      case 10: return { bg: 'bg-primary-fixed/40', border: 'border-primary-fixed-dim', text: 'text-primary' }
      case 5:  return { bg: 'bg-tertiary-container/60', border: 'border-tertiary', text: 'text-on-tertiary-container' }
      case 2:  return { bg: 'bg-error-container/40', border: 'border-error/50', text: 'text-error' }
      case 1:  return { bg: 'bg-error-container/60', border: 'border-error', text: 'text-error' }
      default: return { bg: 'bg-surface-container-low', border: 'border-outline-variant/30', text: 'text-on-surface-variant' }
    }
  })()

  return (
    <div
      className={`rounded-2xl border-2 ${tint.bg} ${tint.border} px-6 py-3 text-center transition-all shadow-sm ${
        flashing ? 'scale-105 animate-pulse' : 'scale-100'
      }`}
    >
      <p className="font-label text-[10px] uppercase tracking-[0.2em] text-on-surface-variant font-bold">
        Attempt {safeAttempt} of {maxAttempts} · Guess for
      </p>
      <p className={`font-headline font-bold tabular-nums leading-none mt-1 ${tint.text} ${flashing ? 'text-7xl' : 'text-6xl'} transition-all`}>
        {points} <span className="text-3xl">pts</span>
      </p>
    </div>
  )
}
