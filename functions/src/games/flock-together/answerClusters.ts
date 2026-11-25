import { normalizeAnswer } from '../../shared/normalizeAnswer'
import type { FlockGroup } from '../../shared/sharedViewModel'

type Result = FlockGroup['type'] | 'no-answer'

export function buildClusters(round: {
  playerAnswers?: Record<string, string>
  results?: Record<string, Result>
  answerGroups?: string[]
  flockAnswer?: string[]
}, currentPlayerId: string | null = null) {
  const answers = round.playerAnswers ?? {}
  const results = round.results ?? {}
  const noAnswerIds = Object.keys(results).filter(id => results[id] === 'no-answer')
  const serverGroups = new Map<string, number>()
  for (const [index, encoded] of (round.answerGroups ?? []).entries()) {
    try {
      const group: unknown = JSON.parse(encoded)
      if (Array.isArray(group) && group.every(answer => typeof answer === 'string')) {
        for (const answer of group) serverGroups.set(answer, index)
      }
    } catch { /* Older rounds can display their raw answers. */ }
  }
  const groups = new Map<string, FlockGroup>()
  for (const id of Object.keys(results).sort()) {
    const result = results[id]
    const answer = answers[id]?.trim()
    if (result === 'no-answer' || !answer) continue
    const index = serverGroups.get(normalizeAnswer(answer))
    const key = index !== undefined ? `${result}:group:${index}`
      : result === 'flock' ? 'flock' : `${result}:raw:${answer}`
    const group = groups.get(key) ?? { id: key, answer, playerIds: [], type: result, variations: [] }
    group.playerIds.push(id)
    if (!group.variations.includes(answer)) group.variations.push(answer)
    groups.set(key, group)
  }
  const clusters = [...groups.values()].sort((a, b) => b.playerIds.length - a.playerIds.length || a.id.localeCompare(b.id, 'en'))
  for (const group of clusters) {
    const own = currentPlayerId && group.playerIds.includes(currentPlayerId) ? answers[currentPlayerId]?.trim() : ''
    group.answer = own || (group.type === 'flock' ? round.flockAnswer?.[0] : undefined) || group.answer
  }
  return { clusters, noAnswerIds }
}
