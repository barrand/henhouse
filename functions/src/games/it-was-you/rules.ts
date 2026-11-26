import { randomInt } from 'node:crypto'
import { MAX_WRITERS, type VoteCounts } from './model'

export function shuffle<T>(values: readonly T[], random = randomInt): T[] {
  const result = [...values]
  for (let i = result.length - 1; i > 0; i--) {
    const j = random(i + 1)
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

export function chooseWriters(ids: string[], opportunities: Readonly<Record<string, number>>): string[] {
  return shuffle(ids)
    .sort((a, b) => (opportunities[a] ?? 0) - (opportunities[b] ?? 0))
    .slice(0, MAX_WRITERS)
}

export function tallyVotes(ballots: { voterId: string; candidateId: string }[], authorId: string) {
  const counts: VoteCounts = {}
  for (const { candidateId } of ballots) counts[candidateId] = (counts[candidateId] ?? 0) + 1
  const highest = Math.max(0, ...Object.values(counts))
  const leaders = Object.keys(counts).filter(id => counts[id] === highest).sort()
  const roomCorrect = leaders.length === 1 && leaders[0] === authorId
  const points = Object.fromEntries(ballots
    .filter(({ voterId, candidateId }) => voterId !== authorId && candidateId === authorId)
    .map(({ voterId }) => [voterId, roomCorrect ? 2 : 1]))
  return { counts, leaders, points }
}
