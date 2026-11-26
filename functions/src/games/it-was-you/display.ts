import type { DisplayRound, Round } from './model'

export function itWasYouDisplay(round: Round): DisplayRound {
  return {
    kind: 'it-was-you',
    phase: round.phase,
    revision: round.revision,
    prompt: round.prompt,
    canSwap: round.canSwap,
    deadline: round.deadline,
    eligible: round.eligiblePlayerIds.length,
    writers: round.writerIds.length,
    submitted: round.submitted,
    candidateIds: round.candidateIds,
    answer: round.answer ? { id: round.answer.id, text: round.answer.text } : null,
    reveal: round.reveal,
    pointsThisRound: round.pointsThisRound,
    shortRound: round.shortRound,
  }
}
