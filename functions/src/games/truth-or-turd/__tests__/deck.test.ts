import { describe, expect, it } from 'vitest'
import {
  drawTruthOrTurdQuestion,
  findTruthOrTurdQuestion,
  selectTruthOrTurdQuestions,
  truthOrTurdQuestionKey,
  TruthOrTurdQuestion,
} from '../deck'

const questions: TruthOrTurdQuestion[] = [
  { statement: 'A chicken can dream.', answer: 'truth', explanation: 'Birds show sleep patterns associated with dreaming.', tags: ['animals'] },
  { statement: 'The moon is made of cheese.', answer: 'turd', explanation: 'It is rock, not dairy.', tags: ['space'] },
  { statement: 'A chicken can dream.', answer: 'truth', explanation: 'Duplicate statement should be ignored.', tags: ['animals'] },
  { statement: 'The Liberty Bell cracked.', answer: 'truth', explanation: 'It has a famous crack.', tags: ['patriotic', 'symbols'] },
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

  it('filters patriotic questions from a single tagged bank', () => {
    expect(selectTruthOrTurdQuestions(questions, false).map((question) => question.statement)).toEqual([
      'A chicken can dream.',
      'The moon is made of cheese.',
    ])
    expect(selectTruthOrTurdQuestions(questions, true).map((question) => question.statement)).toEqual([
      'The Liberty Bell cracked.',
    ])
  })
})
