import { createHash } from 'node:crypto'
import { onDocumentCreated } from 'firebase-functions/v2/firestore'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import * as admin from 'firebase-admin'
import { DecisionService } from './decisionService'
import { JEV_CONFIG_VERSION, jevOperationEnabled } from './aiExperiment'
import { typesafeApiKey } from './secrets'
import { acceptsJevClue, acceptsJevGuess } from './jevPolicy'

export type ShadowOperation = 'clue' | 'guess'
export type ShadowExpected = { accepted: boolean } | { correct: boolean }

export interface ShadowInput {
  gameId: string
  roundNum: number
  actorUid: string
  hostUid?: string
  operation: ShadowOperation
  clue?: string
  guess?: string
  secretWord: string
  expected: ShadowExpected
  attempt?: number
}

const db = admin.firestore
const SHADOW_SAMPLE_RATE = 0.1
const SHADOW_INPUT_TTL_MS = 7 * 24 * 60 * 60 * 1000

function stableDecisionId(input: ShadowInput): string {
  return [input.gameId, input.roundNum, input.actorUid, input.operation, input.attempt ?? '', input.clue ?? '', input.guess ?? ''].join('/')
}

export function shadowJobId(input: ShadowInput): string {
  return createHash('sha256').update(stableDecisionId(input)).digest('hex')
}

export function shouldSampleShadow(decisionId: string, rate = SHADOW_SAMPLE_RATE): boolean {
  if (rate >= 1) return true
  if (rate <= 0) return false
  const bucket = Number.parseInt(createHash('sha256').update(decisionId).digest('hex').slice(0, 8), 16) / 0xffffffff
  return bucket < rate
}

export async function enqueueFowlWordsShadow(input: ShadowInput): Promise<boolean> {
  if (!shouldSampleShadow(stableDecisionId(input), process.env.JEV_SHADOW_SAMPLE_RATE ? Number(process.env.JEV_SHADOW_SAMPLE_RATE) : SHADOW_SAMPLE_RATE)) return false
  const jobRef = db().collection('aiShadowJobs').doc(shadowJobId(input))
  await jobRef.create({
    schemaVersion: 1,
    kind: 'fowl-words',
    operation: input.operation,
    actorUid: input.actorUid,
    hostUid: input.hostUid ?? input.actorUid,
    gameId: input.gameId,
    roundNum: input.roundNum,
    attempt: input.attempt ?? null,
    input: {
      clue: input.clue ?? null,
      guess: input.guess ?? null,
      secretWord: input.secretWord,
    },
    expected: input.expected,
    configVersion: JEV_CONFIG_VERSION,
    status: 'pending',
    createdAt: Timestamp.now(),
    inputExpiresAt: Timestamp.fromMillis(Date.now() + SHADOW_INPUT_TTL_MS),
  }).catch((error: unknown) => {
    if (error && typeof error === 'object' && 'code' in error && (error as { code?: number }).code === 6) return
    throw error
  })
  return true
}

function disagreementCategory(operation: ShadowOperation, expected: ShadowExpected, candidate: boolean): string {
  if (operation === 'clue') {
    const legacy = (expected as { accepted: boolean }).accepted
    return legacy === candidate ? 'agreement' : legacy ? 'jev_rejected_legacy_accepted' : 'jev_accepted_legacy_rejected'
  }
  const legacy = (expected as { correct: boolean }).correct
  return legacy === candidate ? 'agreement' : legacy ? 'jev_rejected_legacy_correct' : 'jev_accepted_legacy_incorrect'
}

export async function evaluateShadowJob(snapshot: FirebaseFirestore.DocumentSnapshot, service = new DecisionService()): Promise<void> {
    // Read current state, not the immutable trigger event. Concurrent deliveries
    // may perform inference twice, but only one transactional completion counts.
    snapshot = await snapshot.ref.get()
    if (!snapshot.exists) return
    const job = snapshot.data() as Partial<ShadowInput> & {
      status?: string
      input?: { clue?: string; guess?: string; secretWord?: string }
      expected?: ShadowExpected
      configVersion?: string
      inputExpiresAt?: { toMillis?: () => number }
    }
    if (job.status !== 'pending' || job.configVersion !== JEV_CONFIG_VERSION || !job.input || !job.expected) return
    if (job.inputExpiresAt?.toMillis?.() !== undefined && Date.now() > job.inputExpiresAt.toMillis!()) {
      await finishWithoutInference(snapshot.ref, 'expired')
      return
    }
    const operation = job.operation as ShadowOperation
    const actorUid = job.hostUid ?? job.actorUid
    if (!actorUid || !['clue', 'guess'].includes(operation) || !await jevOperationEnabled(actorUid, operation)) {
      await finishWithoutInference(snapshot.ref, 'skipped')
      return
    }

    try {
      let candidate: boolean
      let latencyMs: number | undefined
      let fallbackUsed = false
      if (operation === 'clue') {
        const result = await service.classifyFowlWordsClue({ clue: job.input.clue ?? '', secretWord: job.input.secretWord ?? '' })
        candidate = acceptsJevClue(result)
        latencyMs = result.metadata.latencyMs
        fallbackUsed = result.metadata.fallbackUsed
      } else {
        const result = await service.evaluateFowlWordsGuess({ secretWord: job.input.secretWord ?? '', guess: job.input.guess ?? '' })
        candidate = acceptsJevGuess(result)
        latencyMs = result.metadata.latencyMs
        fallbackUsed = result.metadata.fallbackUsed
      }
      const category = disagreementCategory(operation, job.expected, candidate)
      await db().runTransaction(async (tx) => {
      const current = await tx.get(snapshot.ref)
      if (current.data()?.status !== 'pending' || !current.data()?.input) return
      tx.update(snapshot.ref, {
        status: 'complete',
        result: { candidate, category, latencyMs: latencyMs ?? null, fallbackUsed },
        input: FieldValue.delete(),
        completedAt: Timestamp.now(),
      })
      tx.set(db().collection('aiShadowAggregates').doc(`${new Date().toISOString().slice(0, 10)}_${operation}`), {
        categories: { [category]: FieldValue.increment(1) },
        latency: { [category]: { count: FieldValue.increment(1), sumMs: FieldValue.increment(latencyMs ?? 0) } },
        updatedAt: Timestamp.now(),
      }, { merge: true })
      })
    } catch {
      await db().runTransaction(async (tx) => {
        const current = await tx.get(snapshot.ref)
        if (current.data()?.status !== 'pending') return
        tx.update(snapshot.ref, { status: 'failed', input: FieldValue.delete(), errorCategory: 'provider_error', completedAt: Timestamp.now() })
      })
    }
}

export const processJevShadowJob = onDocumentCreated(
  { document: 'aiShadowJobs/{jobId}', secrets: [typesafeApiKey], retry: true },
  async (event) => { if (event.data) await evaluateShadowJob(event.data) },
)

async function finishWithoutInference(ref: FirebaseFirestore.DocumentReference, status: string) {
  await db().runTransaction(async tx => {
    const current = await tx.get(ref)
    if (current.data()?.status !== 'pending') return
    tx.update(ref, { status, input: FieldValue.delete(), completedAt: Timestamp.now() })
  })
}

export const expireJevShadowInputs = onSchedule('every 24 hours', async () => {
  const expired = await db().collection('aiShadowJobs')
    .where('inputExpiresAt', '<=', Timestamp.now())
    .limit(200)
    .get()
  if (expired.empty) return
  await db().runTransaction(async tx => {
    const current = await Promise.all(expired.docs.map(document => tx.get(document.ref)))
    for (const document of current) {
      if (!document.exists) continue
      tx.update(document.ref, {
        status: document.data()!.status === 'pending' ? 'expired' : document.data()!.status,
        input: FieldValue.delete(),
        inputExpiresAt: FieldValue.delete(),
        inputExpiredAt: Timestamp.now(),
      })
    }
    })
})
