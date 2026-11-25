import { FLOCK_REVEAL_MS, FOWL_DEBRIEF_MS } from '../../functions/src/shared/sharedViewModel'
import type { FlockGroup } from '../../functions/src/shared/sharedViewModel'

export function flockReveal(groups: FlockGroup[], revealAt: number, now: number) {
  const elapsed = revealAt ? now - revealAt : Infinity
  const tiers = [...new Set(groups.filter(group => group.type !== 'flock').map(group => group.playerIds.length))].sort((a, b) => a - b)
  const waves = groups.length >= 8 && tiers.length === 1 && tiers[0] === 1
  const beats = new Map(groups.map((group, index) => {
    if (group.type === 'flock') return [group.id, FLOCK_REVEAL_MS] as const
    const tier = tiers.indexOf(group.playerIds.length)
    const beat = waves ? 400 + (Math.floor(index / 2) % 4) * 850
      : 400 + tier * (3400 / Math.max(1, tiers.length - 1))
    return [group.id, beat] as const
  }))
  return {
    landed: elapsed >= FLOCK_REVEAL_MS,
    visible: (id: string) => elapsed >= (beats.get(id) ?? 0),
    fresh: (id: string) => elapsed >= (beats.get(id) ?? 0) && elapsed - (beats.get(id) ?? 0) < 700,
    outcomeFresh: elapsed >= FLOCK_REVEAL_MS && elapsed < FLOCK_REVEAL_MS + 700,
  }
}

export function fowlReveal(revealAt: number, now: number) {
  const elapsed = revealAt ? now - revealAt : Infinity
  return { word: elapsed >= 0, landed: elapsed >= FOWL_DEBRIEF_MS,
    wordFresh: elapsed >= 0 && elapsed < 650, landedFresh: elapsed >= FOWL_DEBRIEF_MS && elapsed < FOWL_DEBRIEF_MS + 650 }
}
