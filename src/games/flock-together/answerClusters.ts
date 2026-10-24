import type { RoundData, RoundResult } from './types.ts'
import { normalizeAnswer } from '../../../functions/src/shared/normalizeAnswer.ts'

export interface AnswerCluster {
  answer: string
  playerIds: string[]
  type: Exclude<RoundResult, 'no-answer'>
  variations: string[]
}

export function buildClusters(round: Pick<RoundData, 'playerAnswers' | 'results' | 'answerGroups' | 'flockAnswer'>, currentPlayerId: string | null) {
  const answers = round.playerAnswers ?? {}
  const results = round.results ?? {}
  const noAnswerIds = Object.keys(results).filter(id => results[id] === 'no-answer')
  const serverGroupByAnswer = new Map<string, number>()
  for (const [index, encoded] of (round.answerGroups ?? []).entries()) {
    try {
      const group: unknown = JSON.parse(encoded)
      if (Array.isArray(group) && group.every(answer => typeof answer === 'string')) {
        for (const answer of group) serverGroupByAnswer.set(answer, index)
      }
    } catch { /* Older or incomplete rounds can still display their raw answers. */ }
  }
  const groups = new Map<string, AnswerCluster>()
  for (const [id, result] of Object.entries(results)) {
    const answer = answers[id]?.trim()
    if (result === 'no-answer' || !answer) continue
    const serverGroup = serverGroupByAnswer.get(normalizeAnswer(answer))
    // Use the same partition that determined scores, including non-winning groups.
    const key = serverGroup !== undefined ? `${result}:group:${serverGroup}`
      : result === 'flock' ? 'flock' : `${result}:raw:${answer}`
    const cluster = groups.get(key) ?? { answer, playerIds: [], type: result, variations: [] }
    cluster.playerIds.push(id)
    if (!cluster.variations.includes(answer)) cluster.variations.push(answer)
    groups.set(key, cluster)
  }
  const clusters = [...groups.values()].sort((a, b) => b.playerIds.length - a.playerIds.length)
  for (const cluster of clusters) {
    const ownAnswer = currentPlayerId && cluster.playerIds.includes(currentPlayerId) ? answers[currentPlayerId]?.trim() : undefined
    cluster.answer = ownAnswer || (cluster.type === 'flock' ? round.flockAnswer?.[0] : undefined) || cluster.answer
  }
  return { clusters, noAnswerIds }
}
