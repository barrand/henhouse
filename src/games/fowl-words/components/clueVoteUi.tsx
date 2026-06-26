/** Shared copy + display for giver nods vs guesser MVP star. */

import type { MouseEvent } from 'react'

export const GIVER_REVEAL_VOTE_HINT =
  '👍 Nod a great clue (+1 pt each if we win) · 👎 Shame a bad one'

export function guesserResultVoteHint(isCorrect: boolean): string {
  if (isCorrect) {
    return '⭐ One MVP star (+5 split) · 👎 Shame the worst · pick different clues'
  }
  return '👎 Shame the worst clue'
}

export function nodLabel(count: number): string {
  return count === 1 ? '1 nod' : `${count} nods`
}

interface ClueReactionStripProps {
  giverNodCount: number
  giverDownCount: number
  guesserMvp: boolean
  guesserShamed: boolean
  mvpPerAuthor?: number
  authorCount?: number
}

/** Compact readout above clue-card vote buttons — separates giver nods from guesser star. */
export function ClueReactionStrip({
  giverNodCount,
  giverDownCount,
  guesserMvp,
  guesserShamed,
  mvpPerAuthor = 0,
  authorCount = 1,
}: ClueReactionStripProps) {
  const hasContent =
    giverNodCount > 0 || giverDownCount > 0 || guesserMvp || guesserShamed
  if (!hasContent) return null

  return (
    <div className="mb-1 flex flex-wrap items-center justify-center gap-x-1.5 gap-y-0.5 text-[9px] font-label font-bold leading-tight">
      {giverNodCount > 0 && (
        <span className="text-primary whitespace-nowrap">
          👍 {nodLabel(giverNodCount)} (+{giverNodCount} each)
        </span>
      )}
      {guesserMvp && (
        <span className="text-primary whitespace-nowrap">
          ⭐ +5 MVP
          {authorCount > 1 && mvpPerAuthor > 0 ? ` (+${mvpPerAuthor} each)` : ''}
        </span>
      )}
      {giverDownCount > 0 && (
        <span className="text-error whitespace-nowrap">👎 {giverDownCount} shame</span>
      )}
      {guesserShamed && (
        <span className="text-error whitespace-nowrap">👎</span>
      )}
    </div>
  )
}

interface StarIconProps {
  filled?: boolean
  className?: string
}

export function StarIcon({ filled = false, className = '' }: StarIconProps) {
  return (
    <span
      className={`material-symbols-outlined text-[22px] leading-none ${className}`}
      style={filled ? { fontVariationSettings: "'FILL' 1" } : undefined}
      aria-hidden
    >
      star
    </span>
  )
}

/** Read-only giver nod tally — always shown on result cards so nods aren't hidden behind guesser controls. */
export function GiverNodCell({ count }: { count: number }) {
  return (
    <div
      className={`flex-1 h-9 flex flex-col items-center justify-center gap-0 rounded-lg bg-surface-container-low font-label shrink-0 ${
        count > 0 ? '' : 'opacity-60'
      }`}
      title={count > 0 ? `${nodLabel(count)} · +${count} pt each for authors` : 'No giver nods'}
    >
      <span className={`text-base leading-none ${count > 0 ? '' : 'grayscale opacity-40'}`}>👍</span>
      {count > 0 ? (
        <span className="text-[9px] font-bold text-primary leading-none">+{count} ea</span>
      ) : (
        <span className="text-[8px] text-outline leading-none">—</span>
      )}
    </div>
  )
}

/** Read-only MVP star when guesser already picked this clue. */
export function GuesserMvpCell({
  active,
  perAuthor,
  authorCount,
}: {
  active: boolean
  perAuthor: number
  authorCount: number
}) {
  return (
    <div
      className={`flex-1 h-9 flex flex-col items-center justify-center gap-0 rounded-lg font-label shrink-0 ${
        active ? 'bg-primary-fixed shadow-sm' : 'bg-surface-container-low opacity-60'
      }`}
    >
      <StarIcon
        filled={active}
        className={active ? 'text-on-primary-fixed' : 'text-outline opacity-40'}
      />
      {active ? (
        <span className="text-[9px] font-bold text-on-primary-fixed leading-none">
          +5{authorCount > 1 ? ` (+${perAuthor})` : ''}
        </span>
      ) : (
        <span className="text-[8px] text-outline leading-none">—</span>
      )}
    </div>
  )
}

/** Read-only shame tally from givers (+ guesser on result). */
export function ShameCell({
  giverCount,
  guesserShamed,
  interactive,
  isActive,
  wide,
  onClick,
}: {
  giverCount: number
  guesserShamed: boolean
  interactive?: boolean
  isActive?: boolean
  wide?: boolean
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void
}) {
  const hasShame = giverCount > 0 || guesserShamed
  const className = `${wide ? 'flex-[2]' : 'flex-1'} h-9 flex flex-col items-center justify-center gap-0 rounded-lg font-label shrink-0 transition-all ${
    isActive ? 'bg-error-container shadow-sm' : 'bg-surface-container-low'
  } ${!hasShame && !interactive ? 'opacity-60' : ''} ${interactive ? 'active:scale-[0.97]' : ''}`

  const content = (
    <>
      <span className={`text-base leading-none ${hasShame || isActive ? '' : 'grayscale opacity-40'}`}>👎</span>
      {giverCount > 0 ? (
        <span className="text-[9px] font-bold text-error leading-none">{giverCount}</span>
      ) : !guesserShamed && !interactive ? (
        <span className="text-[8px] text-outline leading-none">—</span>
      ) : null}
    </>
  )

  if (interactive && onClick) {
    return (
      <button type="button" onClick={onClick} title="Shame this clue" className={className}>
        {content}
      </button>
    )
  }

  return <div className={className}>{content}</div>
}
