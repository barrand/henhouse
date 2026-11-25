export interface ReactionCounts {
  loves: Record<string, number>
  boos: Record<string, number>
}

export function combineReactionCounts(shards: Partial<ReactionCounts>[]): ReactionCounts {
  const totals: ReactionCounts = { loves: {}, boos: {} }
  for (const shard of shards) {
    for (const kind of ['loves', 'boos'] as const) {
      for (const [id, count] of Object.entries(shard[kind] ?? {})) {
        totals[kind][id] = (totals[kind][id] ?? 0) + count
      }
    }
  }
  return totals
}

export function applyReactionCounts<T extends { id: string; loves: number; boos: number }>(groups: T[], counts: ReactionCounts) {
  return groups.map(group => ({
    ...group,
    loves: Math.max(0, counts.loves[group.id] ?? 0),
    boos: Math.max(0, counts.boos[group.id] ?? 0),
  }))
}
