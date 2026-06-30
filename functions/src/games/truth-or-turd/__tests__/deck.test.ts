import { describe, expect, it } from 'vitest'
import { drawTruthOrTurdQuestion, findTruthOrTurdQuestion, truthOrTurdQuestionKey, TruthOrTurdQuestion } from '../deck'

const questions: TruthOrTurdQuestion[] = [
  { statement: 'A chicken can dream.', answer: 'truth', explanation: 'Birds show sleep patterns associated with dreaming.', source: 'preset' },
  { statement: 'The moon is made of cheese.', answer: 'turd', explanation: 'It is rock, not dairy.', source: 'preset' },
  { statement: 'A chicken can dream.', answer: 'truth', explanation: 'Duplicate statement should be ignored.', source: 'preset' },
]

describe('Truth or Turd deck', () => {
  it('draws an unused unique question', () => {
    const used = [truthOrTurdQuestionKey('A chicken can dream.')]
    const drawn = drawTruthOrTurdQuestion(questions, used, () => 0)

    expect(drawn?.statement).toBe('The moon is made of cheese.')
    expect(drawn?.questionKey).toBe(truthOrTurdQuestionKey('The moon is made of cheese.'))
  })

  it('returns null when all unique questions are used', () => {
    const used = questions.map((question) => truthOrTurdQuestionKey(question.statement))

    expect(drawTruthOrTurdQuestion(questions, used)).toBeNull()
  })

  it('finds a question by stable key', () => {
    const key = truthOrTurdQuestionKey('The moon is made of cheese.')

    expect(findTruthOrTurdQuestion(questions, key)?.answer).toBe('turd')
  })
})
