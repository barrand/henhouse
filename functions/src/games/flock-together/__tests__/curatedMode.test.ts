import { beforeEach, describe, expect, it, vi } from 'vitest'

const { db, tx, gameRef } = vi.hoisted(() => {
  const gameRef = { id: 'game' }
  const tx = { get: vi.fn(), update: vi.fn() }
  const db = { collection: vi.fn(() => ({ doc: () => gameRef })), runTransaction: vi.fn(async (fn) => fn(tx)) }
  return { db, tx, gameRef }
})
vi.mock('firebase-admin', () => ({ firestore: () => db }))
vi.mock('firebase-functions/v2/https', async (importOriginal) => ({
  ...await importOriginal<typeof import('firebase-functions/v2/https')>(),
  onCall: (handler: unknown) => handler,
}))

import { flockSetCuratedQuestions } from '../curatedMode'
const setMode = flockSetCuratedQuestions as unknown as (request: { auth?: { uid: string }; data: unknown }) => Promise<void>

describe('host-only curated selection', () => {
  const game = { gameType: 'flock-together', hostId: 'host', status: 'lobby' }
  beforeEach(() => {
    vi.clearAllMocks()
    tx.get.mockResolvedValue({ exists: true, data: () => game })
  })

  it.each([true, false])('allows the lobby host to set enabled=%s', async (enabled) => {
    await setMode({ auth: { uid: 'host' }, data: { gameId: 'game', enabled } })
    expect(tx.update).toHaveBeenCalledWith(gameRef, { curatedQuestions: enabled })
  })

  it('rejects a non-host', async () => {
    await expect(setMode({ auth: { uid: 'guest' }, data: { gameId: 'game', enabled: true } })).rejects.toMatchObject({ code: 'permission-denied' })
    expect(tx.update).not.toHaveBeenCalled()
  })

  it.each([{ status: 'playing' }, { status: 'finished' }, { questionSelectionLockedUntil: Date.now() + 120_000 }, { gameType: 'fowl-words' }])('rejects changes for %j', async (changes) => {
    tx.get.mockResolvedValue({ exists: true, data: () => ({ ...game, ...changes }) })
    await expect(setMode({ auth: { uid: 'host' }, data: { gameId: 'game', enabled: true } })).rejects.toMatchObject({ code: 'failed-precondition' })
    expect(tx.update).not.toHaveBeenCalled()
  })

  it('allows recovery after a timed-out start releases its selection lease', async () => {
    tx.get.mockResolvedValue({ exists: true, data: () => ({ ...game, questionSelectionLockedUntil: Date.now() - 1 }) })
    await setMode({ auth: { uid: 'host' }, data: { gameId: 'game', enabled: true } })
    expect(tx.update).toHaveBeenCalledWith(gameRef, { curatedQuestions: true })
  })

  it('requires authentication', async () => {
    await expect(setMode({ data: { gameId: 'game', enabled: true } })).rejects.toMatchObject({ code: 'unauthenticated' })
    expect(tx.update).not.toHaveBeenCalled()
  })

  it.each([null, {}, { gameId: 'game', enabled: 'true' }, { gameId: 'bad/path', enabled: true }])('rejects malformed input %j', async (data) => {
    await expect(setMode({ auth: { uid: 'host' }, data })).rejects.toMatchObject({ code: 'invalid-argument' })
  })

  it('rejects missing rooms', async () => {
    tx.get.mockResolvedValue({ exists: false })
    await expect(setMode({ auth: { uid: 'host' }, data: { gameId: 'game', enabled: true } })).rejects.toMatchObject({ code: 'not-found' })
  })
})
