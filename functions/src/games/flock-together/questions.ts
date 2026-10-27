import * as admin from 'firebase-admin'
import { Timestamp, FieldValue } from 'firebase-admin/firestore'
import { createHash } from 'crypto'

function getDb() {
  return admin.firestore()
}

type PresetQuestion = {
  text: string
  tag?: string
  type?: 'open' | 'multiple_choice'
  options?: string[]
  source?: 'preset' | 'patriotic'
}

const COOLDOWN_MS = 48 * 60 * 60 * 1000 // 48 hours

const CURATED_GAME_SIZE = 10
const CURATED_OPEN_QUESTION_TARGET = 6

function shuffle<T>(items: T[]): T[] {
  const shuffled = [...items]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

export function orderCuratedQuestions<T extends { type?: string }>(questions: T[]): T[] {
  if (questions.length <= CURATED_GAME_SIZE) return [...questions]

  // The curated mode demonstrates matching free-form answers, so make a ten-round
  // game start with a 6/4 open-to-choice mix whenever the bank can support it.
  // Shuffle within each group to keep every game feeling fresh, then shuffle the
  // remaining questions for later rounds or future larger game sizes.
  const openQuestions = shuffle(questions.filter((question) => question.type !== 'multiple_choice'))
  const choiceQuestions = shuffle(questions.filter((question) => question.type === 'multiple_choice'))
  const featuredOpenCount = Math.min(CURATED_OPEN_QUESTION_TARGET, openQuestions.length)
  const featuredChoiceCount = Math.min(CURATED_GAME_SIZE - featuredOpenCount, choiceQuestions.length)
  const featured = [
    ...openQuestions.slice(0, featuredOpenCount),
    ...choiceQuestions.slice(0, featuredChoiceCount),
  ]
  const remaining = shuffle([
    ...openQuestions.slice(featuredOpenCount),
    ...choiceQuestions.slice(featuredChoiceCount),
  ])

  return [...featured, ...remaining]
}

export function questionKey(text: string): string {
  return createHash('md5').update(text.trim().toLowerCase()).digest('hex').slice(0, 16)
}

export async function seedQuestionPool(gameId: string, includePatrioticQuestions: boolean = false, curatedQuestions: boolean = false) {
  const db = getDb()

  const questions = (curatedQuestions
    ? (await import('./data/curated-questions.json')).default
    : (await import('./data/questions.json')).default) as PresetQuestion[]

  // Filter out patriotic questions if not enabled
  // A larger curated bank supplies a different ten-question game each time.
  // Keep a ten-question playlist's deliberate order for existing small packs.
  const filtered = curatedQuestions
    ? orderCuratedQuestions(questions)
    : includePatrioticQuestions ? questions : questions.filter((q) => q.source !== 'patriotic')

  const BATCH_SIZE = 400
  for (let i = 0; i < filtered.length; i += BATCH_SIZE) {
    const batch = db.batch()
    const chunk = filtered.slice(i, i + BATCH_SIZE)
    for (const [index, q] of chunk.entries()) {
      // Stable ids make a failed start safe to retry without duplicating the curated set.
      const pool = db.collection('games').doc(gameId).collection('questionPool')
      const ref = curatedQuestions ? pool.doc(`curated-${i + index}`) : pool.doc()
      const type = q.type ?? 'open'
      const source = q.source ?? 'preset'
      batch.set(ref, {
        text: q.text,
        source,
        tag: q.tag ?? null,
        type,
        options: type === 'multiple_choice' ? q.options ?? null : null,
        used: false,
        submittedBy: null,
        category: null,
        questionKey: questionKey(q.text),
        ...(curatedQuestions ? { curatedOrder: i + index } : {}),
      })
    }
    await batch.commit()
  }
}

const SOURCE_WEIGHTS: Record<string, number> = {
  'ai-generated': 3,
  'custom': 3,
  'preset': 1,
  // 'patriotic' is intentionally excluded: patriotic questions are drawn only
  // on patriotic rounds and never enter the normal weighted draw.
}

const TAG_COOLDOWNS: Record<string, number> = {
  'who-in-room': 4,
  'mildly-unhinged': 3,
  'patriotic': 2,
}

export type DrawnQuestion = {
  text: string
  source: string
  tag: string | null
  submittedBy: string | null
  poolDocId: string
  type: 'open' | 'multiple_choice'
  options: string[] | null
}

// Returns the set of question keys that are still within the 48-hour cooldown window
async function fetchActiveCooldowns(db: FirebaseFirestore.Firestore): Promise<Set<string>> {
  const cutoff = Timestamp.fromMillis(Date.now() - COOLDOWN_MS)
  const snap = await db.collection('flockQuestionCooldowns').where('lastUsedAt', '>', cutoff).get()
  const keys = new Set<string>()
  snap.docs.forEach((d) => keys.add(d.id))
  return keys
}

// Marks a question as used in both the per-game pool and the global 48hr cooldown tracker
async function markQuestionUsed(
  db: FirebaseFirestore.Firestore,
  poolDocRef: FirebaseFirestore.DocumentReference,
  qKey: string,
  text: string,
): Promise<void> {
  await Promise.all([
    poolDocRef.update({ used: true }),
    db.collection('flockQuestionCooldowns').doc(qKey).set({
      lastUsedAt: FieldValue.serverTimestamp(),
      text,
    }),
  ])
}

export async function drawQuestion(
  gameId: string,
  recentTags: string[] = [],
  preferPatrioticQuestion: boolean = false,
  curatedQuestions: boolean = false,
): Promise<DrawnQuestion | null> {
  const db = getDb()
  const poolRef = db.collection('games').doc(gameId).collection('questionPool')
  if (curatedQuestions) return drawCuratedQuestion(poolRef)
  const cooldowns = await fetchActiveCooldowns(db)

  let chosen = await weightedDraw(poolRef, recentTags, cooldowns, preferPatrioticQuestion)
  if (chosen) return chosen

  // All available questions are either used in this game or on 48hr cooldown.
  // Reset the per-game pool and try again — passing original cooldowns so recently-played
  // questions are still avoided even after the reset.
  const allSnap = await poolRef.get()
  if (allSnap.empty) return null

  const resetBatch = db.batch()
  allSnap.docs.forEach((d) => resetBatch.update(d.ref, { used: false }))
  await resetBatch.commit()

  return weightedDraw(poolRef, recentTags, cooldowns, preferPatrioticQuestion)
}

async function drawCuratedQuestion(poolRef: FirebaseFirestore.CollectionReference): Promise<DrawnQuestion | null> {
  // Curated games have their own ordered playlist. Custom submissions, tag spacing,
  // and global cooldowns must never change this deliberately chosen sequence.
  const snap = await poolRef.get()
  const chosen = snap.docs
    .filter((doc) => !doc.data().used && Number.isInteger(doc.data().curatedOrder))
    .sort((a, b) => a.data().curatedOrder - b.data().curatedOrder)[0]
  if (!chosen) return null
  const data = chosen.data()
  await chosen.ref.update({ used: true })
  return {
    text: data.text,
    source: data.source,
    tag: data.tag ?? null,
    submittedBy: null,
    poolDocId: chosen.id,
    type: data.type === 'multiple_choice' ? 'multiple_choice' : 'open',
    options: data.type === 'multiple_choice' ? data.options : null,
  }
}

function isTagOnCooldown(tag: string | null, recentTags: string[]): boolean {
  if (!tag) return false
  const cooldown = TAG_COOLDOWNS[tag]
  if (!cooldown) return false
  const recent = recentTags.slice(-cooldown)
  return recent.includes(tag)
}

async function weightedDraw(
  poolRef: FirebaseFirestore.CollectionReference,
  recentTags: string[],
  cooldowns: Set<string>,
  preferPatrioticQuestion: boolean,
): Promise<DrawnQuestion | null> {
  const db = getDb()
  const sources = Object.keys(SOURCE_WEIGHTS)
  const buckets: Record<string, FirebaseFirestore.QueryDocumentSnapshot[]> = {}

  // Fetch unused questions per source and filter out those still on 48hr cooldown
  await Promise.all([...sources, 'patriotic'].map(async (source) => {
    const snap = await poolRef
      .where('used', '==', false)
      .where('source', '==', source)
      .limit(50)
      .get()
    if (!snap.empty) {
      const available = snap.docs.filter((d) => {
        if (Number.isInteger(d.data().curatedOrder)) return false
        const key = d.data().questionKey as string | undefined
        return !key || !cooldowns.has(key)
      })
      if (available.length > 0) buckets[source] = available
    }
  }))

  let candidateDocs: FirebaseFirestore.QueryDocumentSnapshot[]

  const drawingPatriotic = preferPatrioticQuestion && buckets['patriotic']?.length > 0

  if (drawingPatriotic) {
    // Patriotic questions are still available for this patriotic round.
    candidateDocs = buckets['patriotic']
  } else {
    // Either this is a normal round, or patriotic questions are exhausted/on cooldown.
    // Fall back to a weighted draw across all non-patriotic sources.
    const fallbackSources = sources.filter((source) => buckets[source])
    if (fallbackSources.length === 0) return null

    const weightedPool: string[] = []
    for (const source of fallbackSources) {
      const weight = SOURCE_WEIGHTS[source] ?? 1
      for (let i = 0; i < weight; i++) weightedPool.push(source)
    }
    const pickedSource = weightedPool[Math.floor(Math.random() * weightedPool.length)]
    candidateDocs = buckets[pickedSource]
  }

  if (!candidateDocs || candidateDocs.length === 0) return null

  // Apply tag cooldowns for variety within a session.
  // Skip tag filtering on patriotic draws — every question carries the 'patriotic'
  // tag, so the cooldown would fire constantly and add no value.
  const lastTag = recentTags.length > 0 ? recentTags[recentTags.length - 1] : null
  const tagFiltered = drawingPatriotic
    ? candidateDocs
    : candidateDocs.filter((d) => {
        const tag = d.data().tag ?? null
        if (tag && tag === lastTag) return false
        if (isTagOnCooldown(tag, recentTags)) return false
        return true
      })

  const pool = tagFiltered.length > 0 ? tagFiltered : candidateDocs
  const chosen = pool[Math.floor(Math.random() * pool.length)]

  const data = chosen.data()
  const qKey = (data.questionKey as string | undefined) ?? questionKey(data.text as string)
  await markQuestionUsed(db, chosen.ref, qKey, data.text as string)

  const type: 'open' | 'multiple_choice' = data.type === 'multiple_choice' ? 'multiple_choice' : 'open'
  return {
    text: data.text,
    source: data.source,
    tag: data.tag ?? null,
    submittedBy: data.submittedBy ?? null,
    poolDocId: chosen.id,
    type,
    options: type === 'multiple_choice' && Array.isArray(data.options) ? data.options : null,
  }
}
