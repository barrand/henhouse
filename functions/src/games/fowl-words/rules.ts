/** Shared, dependency-free rules for server scoring and host previews. */
export type ScoringMode = 'classic' | 'best-clues-first'
export interface ScoringRules {
  version: 1
  mode: ScoringMode
  payouts: number[]
  automaticAttempts: boolean
  revealAllBy: number
  openingPercent: number
  minimumOpening: number
  hearts: number
  votingSeconds: number
  duplicatePenalty: number
  fastPrizes: number[]
  peerLovePoints: number
  mostHelpfulPoints: number
}

export function recommendedRules(mode: ScoringMode = 'classic'): ScoringRules {
  const classic = mode === 'classic'
  return {
    version: 1, mode, payouts: classic ? [10, 5, 2, 1] : [10, 7, 4, 1],
    automaticAttempts: classic, revealAllBy: 3, openingPercent: 20, minimumOpening: 3,
    hearts: 2, votingSeconds: 10, duplicatePenalty: 1,
    fastPrizes: classic ? [3, 2, 1] : [], peerLovePoints: classic ? 1 : 0,
    mostHelpfulPoints: classic ? 5 : 0,
  }
}

export function validateRules(value: unknown): ScoringRules {
  if (!value || typeof value !== 'object') throw new Error('Rules are required')
  const r = value as ScoringRules
  const integer = (v: unknown, min: number, max: number) => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max
  if (r.version !== 1 || !['classic', 'best-clues-first'].includes(r.mode)) throw new Error('Unknown scoring preset')
  if (!Array.isArray(r.payouts) || r.payouts.length < 2 || r.payouts.length > 8
    || r.payouts.some((p, i) => !integer(p, 1, 100) || (i > 0 && p > r.payouts[i - 1]))) {
    throw new Error('Use 2–8 attempts with positive, non-increasing payouts (1–100)')
  }
  if (typeof r.automaticAttempts !== 'boolean' || (r.automaticAttempts && (r.mode !== 'classic' || r.payouts.length !== 4))) throw new Error('Automatic attempts requires the four-attempt Classic preset')
  if (!integer(r.revealAllBy, 2, r.payouts.length)) throw new Error('Reveal all must be between attempt 2 and the final attempt')
  if (!integer(r.openingPercent, 1, 100) || !integer(r.minimumOpening, 1, 50)) throw new Error('Choose an opening share of 1–100% and minimum of 1–50')
  if (!integer(r.hearts, 1, 10) || !integer(r.votingSeconds, 5, 60)) throw new Error('Choose 1–10 hearts and a 5–60 second voting window')
  if (!integer(r.duplicatePenalty, 0, 10) || !integer(r.peerLovePoints, 0, 10) || !integer(r.mostHelpfulPoints, 0, 20)
    || !Array.isArray(r.fastPrizes) || r.fastPrizes.length > 3 || r.fastPrizes.some(p => !integer(p, 0, 10))) throw new Error('Invalid award values')
  if (r.mode === 'best-clues-first' && (r.fastPrizes.length || r.peerLovePoints || r.mostHelpfulPoints)) throw new Error('Best Clues First uses recognition-only awards')
  return {
    version: 1, mode: r.mode, payouts: [...r.payouts], automaticAttempts: r.automaticAttempts,
    revealAllBy: r.revealAllBy, openingPercent: r.openingPercent, minimumOpening: r.minimumOpening,
    hearts: r.hearts, votingSeconds: r.votingSeconds, duplicatePenalty: r.duplicatePenalty,
    fastPrizes: [...r.fastPrizes], peerLovePoints: r.peerLovePoints, mostHelpfulPoints: r.mostHelpfulPoints,
  }
}

export function attemptCount(rules: ScoringRules, groupCount: number): number {
  return rules.automaticAttempts ? Math.max(3, Math.min(4, groupCount)) : rules.payouts.length
}

export function revealCounts(rules: ScoringRules, uniqueCount: number, groupCount: number): number[] {
  const attempts = attemptCount(rules, groupCount)
  const opening = rules.mode === 'classic' ? uniqueCount
    : Math.min(uniqueCount, Math.max(rules.minimumOpening, Math.ceil(uniqueCount * rules.openingPercent / 100)))
  const allBy = Math.min(rules.revealAllBy, attempts)
  return Array.from({ length: attempts }, (_, i) => Math.min(groupCount,
    opening + Math.ceil((groupCount - opening) * Math.min(i, allBy - 1) / (allBy - 1))))
}

export function secondsForAttempt(attempt: number): number { return attempt === 1 ? 60 : attempt === 2 ? 40 : 20 }

export interface ScoringGroup { id: string; authorIds: string[]; texts: string[]; duplicate: boolean }
export interface PointPart { kind: 'guess' | 'used' | 'fast' | 'dup' | 'love' | 'helpful'; points: number }

export function calculateScores(input: {
  rules: ScoringRules; groups: ScoringGroup[]; shown: string[]; guesser: string; correct: boolean;
  attempt: number; timestamps: Record<string, number>; love: Record<string, string[]>;
  helpful: string | null; giverCount: number
}): { scores: Record<string, number>; breakdown: Record<string, PointPart[]> } {
  const { rules, groups, shown, guesser, correct, attempt, timestamps, love, helpful, giverCount } = input
  const scores: Record<string, number> = { [guesser]: 0 }
  const breakdown: Record<string, PointPart[]> = { [guesser]: [] }
  const add = (id: string, kind: PointPart['kind'], points: number) => {
    scores[id] = (scores[id] ?? 0) + points
    breakdown[id] ??= []
    if (points) breakdown[id].push({ kind, points })
  }
  for (const group of groups) for (const id of group.authorIds) add(id, 'dup', group.duplicate ? -rules.duplicatePenalty : 0)
  if (!correct) return { scores, breakdown }
  const payout = rules.payouts[attempt - 1] ?? 0
  add(guesser, 'guess', payout)
  const visible = groups.filter(g => shown.includes(g.id))
  for (const group of visible) {
    for (const id of group.authorIds) {
      add(id, 'used', payout)
      if (rules.mode === 'classic') {
        const hearts = Object.values(love).filter(v => v.includes(group.id)).length
        add(id, 'love', hearts * rules.peerLovePoints)
        if (helpful === group.id && rules.mostHelpfulPoints) add(id, 'helpful', Math.max(1, Math.floor(rules.mostHelpfulPoints / group.authorIds.length)))
      }
    }
  }
  if (rules.mode === 'classic') {
    const authors = visible.flatMap(g => g.authorIds).sort((a, b) => (timestamps[a] ?? Infinity) - (timestamps[b] ?? Infinity) || a.localeCompare(b))
    const prizes = giverCount >= 5 ? rules.fastPrizes : rules.fastPrizes.slice(0, 1)
    prizes.forEach((points, i) => { if (authors[i]) add(authors[i], 'fast', points) })
  }
  return { scores, breakdown }
}
