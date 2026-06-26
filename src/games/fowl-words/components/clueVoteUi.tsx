/** Shared copy, helpers, and display for ❤️ Peer love · ⭐ Most Helpful · 👎 Boo */

import type { MouseEvent } from 'react'

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
    <span
      className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-love-container px-1.5 py-px text-[9px] font-bold font-label text-on-love-container whitespace-nowrap"
      title={`${count} peer love${count !== 1 ? 's' : ''} · +${count} pt each if we win`}
    >
      ❤️ {count}
    </span>
  )
}

export function PeerBooChip({ count }: { count: number }) {
  if (count <= 0) return null
  return (
    <span
      className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-error-container px-1.5 py-px text-[9px] font-bold font-label text-on-error-container whitespace-nowrap"
      title={`${count} boo${count !== 1 ? 's' : ''} from the flock`}
    >
      👎 {count}
    </span>
  )
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
  active, perAuthor, authorCount,
}: { active: boolean; perAuthor: number; authorCount: number }) {
  return (
    <div className={`flex-1 h-9 flex flex-col items-center justify-center gap-0 rounded-lg font-label shrink-0 ${
      active ? 'bg-primary-fixed shadow-sm' : 'bg-surface-container-low opacity-60'
    }`}>
      <StarIcon filled={active} className={active ? 'text-on-primary-fixed' : 'text-outline opacity-40'} />
      {active && (
        <span className="text-[9px] font-bold text-on-primary-fixed leading-none">
          {authorCount > 1 ? `+${perAuthor} each` : `+${perAuthor}`}
        </span>
      )}
    </div>
  )
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
  const className = `${wide ? 'flex-[2]' : 'flex-1'} h-9 flex flex-col items-center justify-center gap-0 rounded-lg font-label shrink-0 transition-all ${
    isActive ? 'bg-error-container shadow-sm' : 'bg-surface-container-low'
  } ${!hasBoo && !interactive ? 'opacity-60' : ''} ${interactive ? 'active:scale-[0.97]' : ''}`

  const content = (
    <>
      <span className={`text-base leading-none ${hasBoo || isActive ? '' : 'grayscale opacity-40'}`}>👎</span>
      {!interactive && giverBooCount > 0 && (
        <span className="text-[9px] font-bold text-error leading-none">{giverBooCount}</span>
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
