/** Shared copy, helpers, and display for ❤️ Peer love · ⭐ Most Helpful · 👎 Boo */

import type { MouseEvent, ReactNode } from 'react'

export const SCORE_CHIP_SHELL =
  'inline-flex shrink-0 items-center gap-0.5 rounded-full bg-surface-container-high border border-outline-variant/50 px-1.5 py-px text-[9px] font-bold font-label text-on-surface-variant whitespace-nowrap'

export function ScoreChip({
  icon,
  iconClassName = '',
  title,
  children,
}: {
  icon?: string
  iconClassName?: string
  title?: string
  children: ReactNode
}) {
  return (
    <span className={SCORE_CHIP_SHELL} title={title}>
      {icon && <span className={iconClassName} aria-hidden>{icon}</span>}
      {children}
    </span>
  )
}

export const GIVER_REVEAL_HINT =
  '❤️ Love great clues (+1 if we win) · 👎 Boo one bad clue'

export function guesserResultVoteHint(isCorrect: boolean): string {
  if (isCorrect) return '⭐ Award Most Helpful (+5) · 👎 Boo the worst clue'
  return '👎 Boo the worst clue'
}

export function mostHelpfulSplitPts(authorCount: number): number {
  return Math.max(1, Math.floor(5 / authorCount))
}

export function countGroupPeerLoves(
  cluePeerLoveVotes: Record<string, Record<string, true>> | undefined,
  groupIdx: number,
): number {
  if (!cluePeerLoveVotes) return 0
  return Object.values(cluePeerLoveVotes).filter((loves) => loves[String(groupIdx)] === true).length
}

export function myLovedGroups(
  cluePeerLoveVotes: Record<string, Record<string, true>> | undefined,
  playerId: string | undefined,
): Set<number> {
  if (!cluePeerLoveVotes || !playerId) return new Set()
  const myLoves = cluePeerLoveVotes[playerId]
  if (!myLoves) return new Set()
  return new Set(Object.keys(myLoves).map(Number))
}

export function countGroupPeerBoos(
  cluePeerBooVotes: Record<string, number> | undefined,
  groupIdx: number,
): number {
  if (!cluePeerBooVotes) return 0
  return Object.values(cluePeerBooVotes).filter((v) => v === groupIdx).length
}

export function effectivePeerLoveVotes(
  cluePeerLoveVotes: Record<string, Record<string, true>> | undefined,
  clueStarVotes: Record<string, number> | undefined,
): Record<string, Record<string, true>> {
  const result: Record<string, Record<string, true>> = { ...(cluePeerLoveVotes ?? {}) }
  if (!clueStarVotes) return result
  for (const [voterId, groupIdx] of Object.entries(clueStarVotes)) {
    const existing = result[voterId]
    if (!existing || Object.keys(existing).length === 0) {
      result[voterId] = { [String(groupIdx)]: true }
    }
  }
  return result
}

export function effectivePeerBooVotes(
  cluePeerBooVotes: Record<string, number> | undefined,
  clueThumbsDownVotes: Record<string, number> | undefined,
): Record<string, number> {
  return cluePeerBooVotes ?? clueThumbsDownVotes ?? {}
}

export function effectiveMostHelpfulVote(
  guesserMostHelpfulVote: number | null | undefined,
  guesserStarVote: number | null | undefined,
): number | null {
  return guesserMostHelpfulVote ?? guesserStarVote ?? null
}

export function effectiveGuesserBoo(
  guesserBooVote: number | null | undefined,
  guesserThumbsDownVote: number | null | undefined,
): number | null {
  return guesserBooVote ?? guesserThumbsDownVote ?? null
}

export function PeerLoveChip({ count }: { count: number }) {
  if (count <= 0) return null
  return (
    <ScoreChip
      icon="❤️"
      title={`${count} peer love${count !== 1 ? 's' : ''} · +${count} pt each if we win`}
    >
      {count}
    </ScoreChip>
  )
}

export function PeerLoveChipPlaceholder() {
  return (
    <span className={`${SCORE_CHIP_SHELL} invisible`} aria-hidden="true">
      <span>❤️</span>
      <span>0</span>
    </span>
  )
}

export function PeerBooChip({ count }: { count: number }) {
  if (count <= 0) return null
  return (
    <ScoreChip
      icon="👎"
      title={`${count} boo${count !== 1 ? 's' : ''} from the flock`}
    >
      {count}
    </ScoreChip>
  )
}

export function PeerBooChipPlaceholder() {
  return (
    <span className={`${SCORE_CHIP_SHELL} invisible`} aria-hidden="true">
      <span>👎</span>
      <span>0</span>
    </span>
  )
}

/** Shared vote-button + card-border styling (Reveal + Result) */
export const VOTE_COUNT_CLASS = 'text-[9px] font-bold leading-none text-on-surface-variant'

export const CARD_VOTE_TRANSITION = 'transition-[border-color,background-color,box-shadow]'

export function loveVoteBtnClass(active: boolean, interactive = true) {
  return `flex-1 h-9 flex flex-col items-center justify-center gap-0 rounded-lg font-label shrink-0 ${CARD_VOTE_TRANSITION} ${
    interactive ? 'active:scale-[0.97]' : ''
  } ${active ? 'bg-love/15 ring-1 ring-inset ring-love/50' : 'bg-surface-container-low'}`
}

export function booVoteBtnClass(active: boolean, opts?: { wide?: boolean; interactive?: boolean }) {
  const wide = opts?.wide ?? false
  const interactive = opts?.interactive ?? true
  return `${wide ? 'flex-[2]' : 'flex-1'} h-9 flex flex-col items-center justify-center gap-0 rounded-lg font-label shrink-0 ${CARD_VOTE_TRANSITION} ${
    interactive ? 'active:scale-[0.97]' : ''
  } ${active ? 'bg-surface-container-high ring-1 ring-inset ring-outline-variant/80' : 'bg-surface-container-low'}`
}

export function starVoteBtnClass(active: boolean, interactive = true) {
  return `flex-1 h-9 flex flex-col items-center justify-center gap-0 rounded-lg font-label shrink-0 ${CARD_VOTE_TRANSITION} ${
    interactive ? 'active:scale-[0.97]' : ''
  } ${active ? 'bg-primary/15 ring-1 ring-inset ring-primary/50' : 'bg-surface-container-low'}`
}

export function clueCardBorderClass(opts: {
  hiddenDuplicate?: boolean
  isMostHelpful?: boolean
  isMyLoved?: boolean
  isMyBoo?: boolean
  isGuesserBoo?: boolean
  justUnlocked?: boolean
  visibleCorrect?: boolean
}): string {
  if (opts.hiddenDuplicate) return 'bg-surface-container-low border-outline-variant/50'
  if (opts.isMostHelpful) return 'border-primary/50 bg-primary/5'
  if (opts.isMyLoved) return 'border-love/50 bg-love/5'
  if (opts.isMyBoo || opts.isGuesserBoo) return 'border-outline-variant/60'
  if (opts.justUnlocked) return 'border-tertiary'
  if (opts.visibleCorrect) return 'border-primary/40'
  return 'border-outline-variant/60'
}

export function StarIcon({ filled = false, className = '' }: { filled?: boolean; className?: string }) {
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

export function MostHelpfulCell({
  active, perAuthor, authorCount, interactive, onClick, ariaLabel, title,
}: {
  active: boolean
  perAuthor: number
  authorCount: number
  interactive?: boolean
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void
  ariaLabel?: string
  title?: string
}) {
  const className = `${starVoteBtnClass(active, !!interactive)}${!interactive && !active ? ' opacity-60' : ''}`
  const content = (
    <>
      <StarIcon filled={active} className={active ? 'text-primary' : 'text-outline opacity-40'} />
      {active && (
        <span className={VOTE_COUNT_CLASS}>
          {authorCount > 1 ? `+${perAuthor} each` : `+${perAuthor}`}
        </span>
      )}
    </>
  )
  if (interactive && onClick) {
    return (
      <button type="button" onClick={onClick} aria-label={ariaLabel} title={title} className={className}>
        {content}
      </button>
    )
  }
  return <div className={className}>{content}</div>
}

export function BooCell({
  giverBooCount, guesserBoo, interactive, isActive, wide, onClick,
}: {
  giverBooCount: number
  guesserBoo: boolean
  interactive?: boolean
  isActive?: boolean
  wide?: boolean
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void
}) {
  const hasBoo = giverBooCount > 0 || guesserBoo
  const className = `${booVoteBtnClass(!!isActive, { wide, interactive })}${
    !hasBoo && !interactive ? ' opacity-60' : ''
  }`

  const content = (
    <>
      <span className={`text-base leading-none ${hasBoo || isActive ? '' : 'grayscale opacity-40'}`}>👎</span>
      {!interactive && giverBooCount > 0 && (
        <span className={VOTE_COUNT_CLASS}>{giverBooCount}</span>
      )}
    </>
  )

  if (interactive && onClick) {
    return (
      <button type="button" onClick={onClick} aria-label="Boo this clue" title="Boo the worst clue (no points lost)" className={className}>
        {content}
      </button>
    )
  }
  return <div className={className}>{content}</div>
}
