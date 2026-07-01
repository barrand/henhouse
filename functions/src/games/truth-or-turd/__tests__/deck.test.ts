import { describe, expect, it } from 'vitest'
import {
  drawTruthOrTurdQuestion,
  findTruthOrTurdQuestion,
  getTruthOrTurdQuestionText,
  selectTruthOrTurdQuestions,
  truthOrTurdQuestionKey,
  TruthOrTurdQuestion,
} from '../deck'

const questions: TruthOrTurdQuestion[] = [
  { kind: 'binary', statement: 'A chicken can dream.', answer: 'truth', explanation: 'Birds show sleep patterns associated with dreaming.', tags: ['animals'] },
  { kind: 'binary', statement: 'The moon is made of cheese.', answer: 'turd', explanation: 'It is rock, not dairy.', tags: ['space'] },
  { kind: 'binary', statement: 'A chicken can dream.', answer: 'truth', explanation: 'Duplicate statement should be ignored.', tags: ['animals'] },
  {
    kind: 'multiple-choice',
    prompt: 'What was the Liberty Bell originally known as?',
    choices: [
      { id: 'a', text: 'The Pennsylvania State House Bell' },
      { id: 'b', text: 'The Philadelphia Freedom Bell' },
      { id: 'c', text: 'The Continental Congress Bell' },
      { id: 'd', text: 'The Old North Bell' },
    ],
    correctChoiceId: 'a',
    explanation: 'It hung in the Pennsylvania State House.',
    tags: ['patriotic', 'symbols'],
    sourceRefs: ['https://www.nps.gov/inde/learn/historyculture/stories-libertybell.htm'],
  },
]

describe('Truth or Turd deck', () => {
  it('draws an unused unique question', () => {
    const used = [truthOrTurdQuestionKey('A chicken can dream.')]
    const drawn = drawTruthOrTurdQuestion(questions, used, () => 0)

    expect(drawn && getTruthOrTurdQuestionText(drawn)).toBe('The moon is made of cheese.')
    expect(drawn?.questionKey).toBe(truthOrTurdQuestionKey('The moon is made of cheese.'))
  })

  it('returns null when all unique questions are used', () => {
    const used = questions.map((question) => truthOrTurdQuestionKey(question))

    expect(drawTruthOrTurdQuestion(questions, used)).toBeNull()
  })

  it('finds a question by stable key', () => {
    const key = truthOrTurdQuestionKey('The moon is made of cheese.')
    const found = findTruthOrTurdQuestion(questions, key)

    expect(found?.kind).toBe('binary')
    expect(found?.kind === 'binary' ? found.answer : undefined).toBe('turd')
  })

  it('filters patriotic questions from a single tagged bank', () => {
    expect(selectTruthOrTurdQuestions(questions, false).map(getTruthOrTurdQuestionText)).toEqual([
      'A chicken can dream.',
      'The moon is made of cheese.',
    ])
    expect(selectTruthOrTurdQuestions(questions, true).map(getTruthOrTurdQuestionText)).toEqual([
      'What was the Liberty Bell originally known as?',
    ])
  })
})
