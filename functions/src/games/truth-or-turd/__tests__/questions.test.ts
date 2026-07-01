import { describe, expect, it } from 'vitest'
import questions from '../data/questions.json'

type Question = {
  kind?: string
  statement?: string
  answer?: string
  prompt?: string
  choices?: Array<{ id?: string; text?: string }>
  correctChoiceId?: string
  explanation?: string
  tags?: string[]
  sourceRefs?: string[]
}

function questionText(question: Question) {
  return question.kind === 'multiple-choice' ? question.prompt : question.statement
}

describe('Truth or Turd question bank', () => {
  it('has structurally valid questions with unique prompts', () => {
    const seen = new Set<string>()

    for (const question of questions as Question[]) {
      expect(question.kind, questionText(question)).toMatch(/^(binary|multiple-choice)$/)
      expect(question.explanation, questionText(question)).toBeTruthy()
      expect(question.tags?.length, questionText(question)).toBeGreaterThan(0)

      const text = questionText(question)
      expect(text, JSON.stringify(question)).toBeTruthy()
      const key = text!.trim().toLowerCase()
      expect(seen.has(key), text).toBe(false)
      seen.add(key)

      if (question.kind === 'binary') {
        expect(question.statement, text).toBeTruthy()
        expect(question.answer, text).toMatch(/^(truth|turd)$/)
      } else {
        expect(question.prompt, text).toBeTruthy()
        expect(question.choices?.length, text).toBe(4)
        expect(question.correctChoiceId, text).toBeTruthy()
        expect(question.sourceRefs?.length, text).toBeGreaterThan(0)

        const ids = new Set<string>()
        const choiceTexts = new Set<string>()
        for (const choice of question.choices ?? []) {
          expect(choice.id, text).toBeTruthy()
          expect(choice.text, text).toBeTruthy()
          expect(ids.has(choice.id!), text).toBe(false)
          expect(choiceTexts.has(choice.text!.trim().toLowerCase()), text).toBe(false)
          ids.add(choice.id!)
          choiceTexts.add(choice.text!.trim().toLowerCase())
        }
        expect(ids.has(question.correctChoiceId!), text).toBe(true)
      }
    }
  })

  it('uses multiple-choice questions for the 60-question patriotic bank', () => {
    const patriotic = (questions as Question[]).filter((question) => question.tags?.includes('patriotic'))

    expect(patriotic).toHaveLength(60)
    expect(patriotic.every((question) => question.kind === 'multiple-choice')).toBe(true)
  })
})
