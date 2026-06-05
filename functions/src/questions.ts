import * as admin from 'firebase-admin'

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

export async function seedQuestionPool(gameId: string, includePatrioticQuestions: boolean = false) {
  const db = getDb()
  const questions = (await import('./data/questions.json')).default as PresetQuestion[]

  // Filter out patriotic questions if not enabled
  const filtered = includePatrioticQuestions
    ? questions
    : questions.filter((q) => q.source !== 'patriotic')

  const BATCH_SIZE = 400
  for (let i = 0; i < filtered.length; i += BATCH_SIZE) {
    const batch = db.batch()
    const chunk = filtered.slice(i, i + BATCH_SIZE)
    for (const q of chunk) {
      const ref = db.collection('games').doc(gameId).collection('questionPool').doc()
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
      })
    }
    await batch.commit()
  }
}

const SOURCE_WEIGHTS: Record<string, number> = {
  'ai-generated': 3,
  'custom': 3,
  'preset': 1,
  'patriotic': 0.5,
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

export async function drawQuestion(
  gameId: string,
  recentTags: string[] = [],
): Promise<DrawnQuestion | null> {
  const db = getDb()
  const poolRef = db.collection('games').doc(gameId).collection('questionPool')

  let chosen = await weightedDraw(poolRef, recentTags)
  if (chosen) return chosen

  const allSnap = await poolRef.get()
  if (allSnap.empty) return null

  const resetBatch = db.batch()
  allSnap.docs.forEach((d) => resetBatch.update(d.ref, { used: false }))
  await resetBatch.commit()

  return weightedDraw(poolRef, recentTags)
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
): Promise<DrawnQuestion | null> {
  const sources = Object.keys(SOURCE_WEIGHTS)
  const buckets: Record<string, FirebaseFirestore.QueryDocumentSnapshot[]> = {}

  for (const source of sources) {
    const snap = await poolRef
      .where('used', '==', false)
      .where('source', '==', source)
      .limit(50)
      .get()
    if (!snap.empty) {
      buckets[source] = snap.docs
    }
  }

  const availableSources = Object.keys(buckets)
  if (availableSources.length === 0) return null

  const weightedPool: string[] = []
  for (const source of availableSources) {
    const weight = SOURCE_WEIGHTS[source] ?? 1
    for (let i = 0; i < weight; i++) {
      weightedPool.push(source)
    }
  }

  const pickedSource = weightedPool[Math.floor(Math.random() * weightedPool.length)]
  const docs = buckets[pickedSource]

  const lastTag = recentTags.length > 0 ? recentTags[recentTags.length - 1] : null
  const candidates = docs.filter((d) => {
    const tag = d.data().tag ?? null
    if (tag && tag === lastTag) return false
    if (isTagOnCooldown(tag, recentTags)) return false
    return true
  })

  const pool = candidates.length > 0 ? candidates : docs
  const chosen = pool[Math.floor(Math.random() * pool.length)]

  await chosen.ref.update({ used: true })
  const data = chosen.data()
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
