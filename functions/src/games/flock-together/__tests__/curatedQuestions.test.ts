import { beforeEach, describe, expect, it, vi } from 'vitest'
import curatedData from '../data/curated-questions.json'
import standard from '../data/questions.json'

const { database } = vi.hoisted(() => ({ database: { collection: vi.fn(), batch: vi.fn() } }))
vi.mock('firebase-admin', () => ({ firestore: () => database }))

import { drawQuestion, seedQuestionPool, orderCuratedQuestions } from '../questions'

const curated: { text: string; type?: string; options?: string[]; tag?: string }[] = curatedData

describe('curated question playlist', () => {
  it('prioritizes six open questions in a ten-question curated game without losing or mutating questions', () => {
    const source = Array.from({ length: 8 }, (_, i) => ({ type: 'open', id: `open-${i}` }))
      .concat(Array.from({ length: 22 }, (_, i) => ({ type: 'multiple_choice', id: `choice-${i}` })))
    const random = vi.spyOn(Math, 'random').mockReturnValue(0)
    try {
      const result = orderCuratedQuestions(source)
      expect(new Set(result.map((question) => question.id))).toEqual(new Set(source.map((question) => question.id)))
      expect(result).not.toEqual(source)
      expect(source.map((question) => question.id)).toEqual([
        ...Array.from({ length: 8 }, (_, i) => `open-${i}`),
        ...Array.from({ length: 22 }, (_, i) => `choice-${i}`),
      ])
      expect(result.slice(0, 10).filter((question) => question.type === 'open')).toHaveLength(6)
      expect(result.slice(0, 10).filter((question) => question.type === 'multiple_choice')).toHaveLength(4)
    } finally { random.mockRestore() }
  })

  it('preserves the deliberate order of a ten-question playlist', () => {
    const source = Array.from({ length: 10 }, (_, i) => ({ type: 'open', id: i }))
    expect(orderCuratedQuestions(source)).toEqual(source)
  })
  const entries = new Map<string, Record<string, any>>()
  let nextId = 0
  const ref = (id: string) => ({
    id,
    update: async (values: Record<string, unknown>) => {
      entries.set(id, { ...entries.get(id), ...values })
    },
  })
  const pool = {
    doc: (id?: string) => ref(id ?? `random-${nextId++}`),
    get: async () => ({
      docs: [...entries].reverse().map(([id, values]) => ({ id, ref: ref(id), data: () => values })),
    }),
  }

  beforeEach(() => {
    entries.clear()
    nextId = 0
    database.collection.mockImplementation((name: string) => {
      if (name !== 'games') throw new Error('Curated draws must not access global cooldowns')
      return { doc: () => ({ collection: () => pool }) }
    })
    database.batch.mockImplementation(() => ({
      set: (doc: { id: string }, values: Record<string, unknown>) => entries.set(doc.id, values),
      commit: async () => undefined,
    }))
  })

  it('plays only the curated bank without repeats, even with custom/preset questions present', async () => {
    entries.set('custom', { text: 'Not in this playlist', source: 'custom', used: false })
    entries.set('preset', { text: 'Also not in this playlist', source: 'preset', used: false })
    await seedQuestionPool('game', true, true)
    const expected = [...entries.values()].filter(question => Number.isInteger(question.curatedOrder)).sort((a, b) => a.curatedOrder - b.curatedOrder)
    const played = []
    for (let i = 0; i < curated.length; i++) {
      const question = await drawQuestion('game', ['who-in-room'], true, true)
      played.push(question?.text)
      expect(question?.type).toBe(expected[i].type)
      expect(question?.options).toEqual(expected[i].options ?? null)
    }
    expect(played).toEqual(expected.map((question) => question.text))
    expect(new Set(played)).toEqual(new Set(curated.map((question) => question.text)))
    expect(await drawQuestion('game', [], false, true)).toBeNull()
    expect(entries.get('custom')?.used).toBe(false)
    expect(entries.get('preset')?.used).toBe(false)
  })

  it('keeps a failed-start retry from duplicating the playlist', async () => {
    await seedQuestionPool('game', false, true)
    await seedQuestionPool('game', false, true)
    expect(entries.size).toBe(curated.length)
  })

  it('a skipped question remains used and the next draw moves forward', async () => {
    await seedQuestionPool('game', false, true)
    expect((await drawQuestion('game', [], false, true))?.text).toBe(entries.get('curated-0')?.text)
    expect((await drawQuestion('game', [], false, true))?.text).toBe(entries.get('curated-1')?.text)
    expect(entries.get('curated-0')?.used).toBe(true)
  })

  it('leaves standard-mode seeding on the original bank', async () => {
    await seedQuestionPool('game')
    expect(entries.size).toBe(standard.filter((question) => question.source !== 'patriotic').length)
    expect([...entries.values()].every((question) => question.curatedOrder === undefined)).toBe(true)
  })

  it('has at least a full game of distinct questions with valid answer formats', () => {
    expect(curated.length).toBeGreaterThanOrEqual(10)
    expect(new Set(curated.map((question) => question.text)).size).toBe(curated.length)
    for (const question of curated) {
      expect(question.text.trim().length).toBeGreaterThan(0)
      if (question.type === 'multiple_choice') {
        expect(question.options!.length).toBeGreaterThanOrEqual(2)
        expect(question.options!.length).toBeLessThanOrEqual(4)
        expect(new Set(question.options).size).toBe(question.options!.length)
        expect(question.options!.every((option) => option.length <= 80)).toBe(true)
      }
    }
  })
})
