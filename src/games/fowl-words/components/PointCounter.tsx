import { useEffect, useState } from 'react'
import { ATTEMPT_POINTS } from '../types'

interface Props {
  currentAttempt: number  // 1-based
  maxAttempts: number
}

const HEN_CONFIG = [
  { img: '/images/hen-neutral.svg',     anim: 'animate-hen-bob',       label: 'Best shot. Make it count.' },
  { img: '/images/hen-thinking.svg',    anim: 'animate-hen-bob',       label: 'Think it through…'         },
  { img: '/images/hen-embarrassed.svg', anim: '',                      label: 'Last shot…'                },
  { img: '/images/hen-embarrassed.svg', anim: '',                      label: 'No pressure…'              },
]

export default function PointCounter({ currentAttempt, maxAttempts }: Props) {
  const safeAttempt = Math.max(1, Math.min(currentAttempt, ATTEMPT_POINTS.length))
  const points = ATTEMPT_POINTS[safeAttempt - 1] ?? 0
  const hen = HEN_CONFIG[safeAttempt - 1] ?? HEN_CONFIG[HEN_CONFIG.length - 1]

  const [prevAttempt, setPrevAttempt] = useState(safeAttempt)
  const [popping, setPopping] = useState(false)

  useEffect(() => {
    if (safeAttempt !== prevAttempt) {
      setPopping(true)
      const t = setTimeout(() => {
        setPrevAttempt(safeAttempt)
        setPopping(false)
      }, 400)
      return () => clearTimeout(t)
    }
  }, [safeAttempt, prevAttempt])

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
    <div className={`rounded-2xl border-2 ${tint.bg} ${tint.border} px-4 py-3 transition-all shadow-sm`}>
      <div className="flex items-center gap-3">
        <img
          src={hen.img}
          alt=""
          className={`w-20 h-20 flex-shrink-0 ${popping ? 'animate-hen-pop' : hen.anim}`}
        />
        <div className="flex-1 min-w-0">
          <p className="font-label text-[10px] uppercase tracking-[0.2em] text-on-surface-variant font-bold">
            Attempt {safeAttempt} of {maxAttempts} · Guess for
          </p>
          <p className={`font-headline font-bold tabular-nums leading-none mt-0.5 text-4xl ${tint.text} transition-all`}>
            {points} <span className="text-xl">pts</span>
          </p>
          <p className="font-body text-xs text-on-surface-variant mt-0.5 italic">{hen.label}</p>
        </div>
      </div>
    </div>
  )
}
