import { describe, expect, it, vi } from 'vitest'

const { collection } = vi.hoisted(() => ({ collection: vi.fn() }))
vi.mock('firebase-admin', () => ({ firestore: () => ({ collection }) }))

import { drawQuestion } from '../questions'

describe('standard question draw', () => {
  it.each([false, true])('fetches sources concurrently and preserves patriotic preference (%s)', async (patriotic) => {
    const reads: string[] = []
    const releaseReads: Array<() => void> = []
    const markPoolUsed = vi.fn(async () => undefined)
    const markCooldown = vi.fn(async () => undefined)
    const queryFor = (source?: string): object => ({
      where: (field: string, _operator: string, value: unknown) => queryFor(field === 'source' ? String(value) : source),
      limit: () => queryFor(source),
      get: async () => {
        reads.push(source!)
        await new Promise<void>((resolve) => {
          releaseReads.push(resolve)
          // Every independent source query must start before any can complete.
          if (releaseReads.length === 4) releaseReads.forEach((release) => release())
        })
        const docs = source === 'preset' || source === 'patriotic' ? [{
          id: source,
          ref: { update: markPoolUsed },
          data: () => ({ text: `${source} question`, source, type: 'open', questionKey: source }),
        }] : []
        return { empty: !docs.length, docs }
      },
    })
    collection.mockImplementation((name: string) => {
      if (name === 'games') return { doc: () => ({ collection: () => queryFor() }) }
      return {
        where: () => ({ get: async () => ({ docs: [] }) }),
        doc: () => ({ set: markCooldown }),
      }
    })

    const result = await drawQuestion('game', [], patriotic)
    expect(reads).toEqual(['ai-generated', 'custom', 'preset', 'patriotic'])
    expect(result?.source).toBe(patriotic ? 'patriotic' : 'preset')
    expect(markPoolUsed).toHaveBeenCalledExactlyOnceWith({ used: true })
    expect(markCooldown).toHaveBeenCalledOnce()
  }, 1000)
})
