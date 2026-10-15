import * as admin from 'firebase-admin'
import { FieldValue } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { randomUUID } from 'node:crypto'
import { recommendedRules, validateRules, revealCounts, calculateScores, secondsForAttempt } from './rules'
import type { ScoringRules } from './rules'
import { projectScoringView } from './scoringProtocol'
import type { ScoringState, AttemptEvent } from './scoringProtocol'
import { detectDuplicateClues, deterministicGuess, experimentalGuessLocal, evaluateGuess, classifyFowlWordsClue } from '../../shared/gemini'
import { validateClueForSubmission } from './clueValidation'
import { selectNextUnlockGroup } from './scoring'
import { DecisionService } from '../../shared/decisionService'
import { acceptsJevGuess, acceptsJevClue } from '../../shared/jevPolicy'
import { jevOperationEnabled } from '../../shared/aiExperiment'
import { JEV_CLUE_REJECTION_THRESHOLD } from './clueValidation'
import { evaluatePlaytestGuess, JEV_PLAYTEST_GUESS_THRESHOLD, JEV_PLAYTEST_VERSION } from '../../shared/jevPlaytest'
import { addFowlWordCooldownWrites } from './cooldowns'
import { typesafeApiKey } from '../../shared/secrets'
import { enqueueFowlWordsShadow } from '../../shared/jevShadow'

type Game = admin.firestore.DocumentData
const firestore = () => admin.firestore()
const gameRef = (id: string) => firestore().collection('games').doc(id)
const stateRef = (id: string, round: number) => gameRef(id).collection('rounds').doc(String(round)).collection('private').doc('state')
const fail = (message: string): never => { throw new HttpsError('failed-precondition', message) }

export async function scoringAvailable(): Promise<boolean> {
  const config = await firestore().collection('fowlWordsConfig').doc('scoring').get()
  return config.exists ? config.data()?.bestCluesFirstEnabled === true : process.env.FUNCTIONS_EMULATOR === 'true'
}

function scores(s: ScoringState, correct = s.correct) {
  return calculateScores({ rules: s.rules, groups: s.groups, shown: s.shown, guesser: s.guesser,
    correct, attempt: s.attempt, timestamps: Object.fromEntries(s.clues.map(c => [c.author, c.at])),
    love: s.love, helpful: s.helpful, giverCount: s.eligible.length - 1 })
}

/** All secrets and ballots remain private; own views are projections, not UI hiding. */
function writeState(tx: admin.firestore.Transaction, id: string, s: ScoringState): void {
  const ref = gameRef(id).collection('rounds').doc(String(s.roundNum))
  tx.set(stateRef(id, s.roundNum), s)
  tx.set(ref, {
    scoringVersion: 1, status: s.phase, rules: s.rules, eligiblePlayerIds: s.eligible,
    eligiblePlayerCount: s.eligible.length, currentAttempt: s.attempt, maxAttempts: s.maxAttempts,
    revision: FieldValue.increment(1),
    // Empty legacy fields prevent accidental legacy rendering of hidden data.
    secretWord: '', wordOptions: [], wordVotes: {}, cluesByPlayer: {}, clueGroups: [],
    visibleGroupIndexes: [], guessAttempts: [], tentativePoints: {}, pointsThisRound: {}, eliminationReason: '',
  })
  const tentative = scores(s, s.phase === 'scored' ? s.correct : true).scores
  for (const uid of s.eligible) tx.set(ref.collection('views').doc(uid), { engine: projectScoringView(s, uid, tentative) })
}

async function mutate(id: string, round: number, uid: string, change: (s: ScoringState, game: Game, tx: admin.firestore.Transaction) => void) {
  return firestore().runTransaction(async tx => {
    const [gs, ss] = await Promise.all([tx.get(gameRef(id)), tx.get(stateRef(id, round))])
    if (!gs.exists || !ss.exists) throw new HttpsError('not-found', 'Round not found')
    const game = gs.data()!
    const s = ss.data() as ScoringState
    if (game.gameType !== 'fowl-words' || game.scoringEngineVersion !== 1 || game.status !== 'playing' || game.currentRound !== round) fail('This round is no longer active')
    if (!s.eligible.includes(uid)) throw new HttpsError('permission-denied', 'You will join next round')
    const previous = { ...s.scores }
    change(s, game, tx)
    if (s.phase === 'scored') {
      const result = scores(s)
      s.scores = result.scores; s.breakdown = result.breakdown
      for (const [player, points] of Object.entries(s.scores)) {
        const delta = points - (previous[player] ?? 0)
        if (delta) tx.update(gameRef(id).collection('players').doc(player), { score: FieldValue.increment(delta) })
      }
    }
    writeState(tx, id, s)
  })
}

function finish(s: ScoringState, correct: boolean) {
  s.phase = 'scored'; s.correct = correct; s.deadline = 0; s.finishedAt = Date.now()
  delete s.claim; delete s.phaseClaim
}

function advance(s: ScoringState, event: AttemptEvent) {
  s.history.push(event)
  if (s.attempt >= s.maxAttempts) { finish(s, false); return }
  s.attempt++
  const shown = s.queue.slice(0, s.schedule[s.attempt - 1] ?? s.queue.length)
  s.newlyShown = shown.filter(id => !s.shown.includes(id)); s.shown = shown
  s.phase = 'reveal'; s.deadline = Date.now() + secondsForAttempt(s.attempt) * 1000
  delete s.claim
}

function assertAttempt(s: ScoringState, uid: string, expected: unknown) {
  if (s.guesser !== uid) throw new HttpsError('permission-denied', 'Only the guesser can do that')
  if (expected !== s.attempt) fail('The attempt changed. Please try again.')
  if (!['reveal', 'guess'].includes(s.phase) || s.claim) fail('Please wait for the current action')
  if (Date.now() >= s.deadline) fail('The timer expired')
}

function selectWord(s: ScoringState) {
  const tally = s.wordOptions.map((_, i) => Object.values(s.wordVotes).filter(v => v === i).length)
  const top = Math.max(...tally)
  const tied = s.wordOptions.map((_, i) => i).filter(i => tally[i] === top)
  s.secretWord = s.wordOptions[tied[Math.floor(Math.random() * tied.length)]]
  s.phase = 'word-selected'; s.deadline = Date.now() + 2500
}

export async function startScoringRound(id: string, uid: string, deck?: string[]): Promise<void> {
  await firestore().runTransaction(async tx => {
    const ref = gameRef(id)
    const gs = await tx.get(ref)
    if (!gs.exists) throw new HttpsError('not-found', 'Game not found')
    const g = gs.data()!
    if (g.gameType !== 'fowl-words') fail('This is not a Fowl Words game')
    const first = g.status === 'lobby'
    if (g.hostId !== uid) throw new HttpsError('permission-denied', 'Only the host can start a round')
    if (g.scoringEngineVersion !== 1) fail('Legacy game')
    const previous = first ? null : await tx.get(stateRef(id, g.currentRound))
    const legacyPrevious = !first && !previous?.exists ? await tx.get(ref.collection('rounds').doc(String(g.currentRound))) : null
    if (!first && (g.status !== 'playing' || (previous?.data()?.phase ?? legacyPrevious?.data()?.status) !== 'scored')) fail('Finish this round first')
    const next = first ? 1 : g.currentRound + 1
    if (next > g.settings.totalRounds) { tx.update(ref, { status: 'finished' }); return }
    const deckRef = ref.collection('private').doc('deck')
    const ds = await tx.get(deckRef)
    const players = await tx.get(ref.collection('players'))
    const remaining = first ? [...(deck ?? [])] : [...(ds.data()?.words ?? g.cardsRemaining ?? [])]
    const words = remaining.splice(0, 3)
    if (!words.length) fail('No words available')
    const eligible: string[] = [...g.playerIds]
    if (eligible.length < 2) fail('Need at least two players')
    const guesser = first ? uid : eligible[(eligible.indexOf(g.currentGuesser) + 1) % eligible.length]
    const rules = validateRules(g.pendingScoringRules ?? g.scoringRules ?? recommendedRules())
    const now = Date.now()
    const s: ScoringState = {
      version: 1, roundNum: next, rules, eligible, guesser, phase: 'word-selection', startedAt: now,
      selectionOpensAt: now + 4000, deadline: now + 19000, wordOptions: words, wordVotes: {}, secretWord: '',
      clues: [], rankingVotes: {}, love: {}, boo: {}, helpful: null, groups: [], queue: [], schedule: [],
      attempt: 1, maxAttempts: rules.payouts.length, shown: [], newlyShown: [], history: [],
      scores: {}, breakdown: {}, correct: false,
      playerScores: Object.fromEntries(players.docs.map(p => [p.id, p.data().score ?? 0])),
    }
    tx.set(deckRef, { words: remaining })
    tx.update(ref, { status: 'playing', currentRound: next, currentGuesser: guesser, cardsRemaining: [],
      scoringRules: rules, pendingScoringRules: FieldValue.delete(), scoringRevision: (g.scoringRevision ?? 0) + 1,
      scoringChangedRound: first || g.pendingScoringRules ? next : g.scoringChangedRound ?? 0 })
    writeState(tx, id, s)
    addFowlWordCooldownWrites(tx, g.originalHostId ?? g.hostId, words)
  })
}

async function deduplicate(id: string, round: number, uid: string) {
  const claim = randomUUID()
  let snapshot: ScoringState | undefined
  await mutate(id, round, uid, s => {
    snapshot = undefined
    if (s.phase !== 'deduplication') return
    if (s.phaseClaim && s.phaseClaim.expires > Date.now() && s.phaseClaim.id !== claim) return
    s.phaseClaim = { id: claim, expires: Date.now() + 45000 }; snapshot = structuredClone(s)
  })
  if (!snapshot) return
  const input = snapshot as ScoringState
  let grouped: string[][]
  try {
    const result = await detectDuplicateClues(input.secretWord, Object.fromEntries(input.clues.map(c => [c.author, c.text])))
    grouped = result.groups
  } catch (error) {
    // Leave the lease recoverable; never silently promote unknown duplicates.
    await mutate(id, round, uid, s => { if (s.phaseClaim?.id === claim) delete s.phaseClaim })
    throw error
  }
  await mutate(id, round, uid, s => {
    if (s.phase !== 'deduplication' || s.phaseClaim?.id !== claim) return
    const byAuthor = new Map(s.clues.map(c => [c.author, c]))
    s.groups = grouped.map(ids => ({ id: randomUUID(), authorIds: ids,
      texts: ids.map(id => byAuthor.get(id)!.text), duplicate: ids.length > 1 }))
    const tally = (author: string) => Object.values(s.rankingVotes).filter(ids => ids.includes(byAuthor.get(author)!.id)).length
    const jitter = new Map(s.groups.map(g => [g.id, Math.random()]))
    const unique = s.groups.filter(g => !g.duplicate).sort((a, b) => s.rules.mode === 'classic' ? 0
      : tally(b.authorIds[0]) - tally(a.authorIds[0]) || jitter.get(a.id)! - jitter.get(b.id)!)
    const legacyGroups = s.groups.map(g => ({ playerIds: g.authorIds, clueTexts: g.texts, isDuplicate: g.duplicate }))
    const selected = unique.map(g => s.groups.indexOf(g))
    while (selected.length < s.groups.length) {
      const idx = selectNextUnlockGroup(legacyGroups, selected, s.playerScores, Object.fromEntries(s.clues.map(c => [c.author, c.at])))
      if (idx < 0) break
      selected.push(idx)
    }
    s.queue = selected.map(i => s.groups[i].id)
    s.schedule = revealCounts(s.rules, unique.length, s.groups.length)
    s.maxAttempts = s.schedule.length
    s.shown = s.queue.slice(0, s.schedule[0]); s.newlyShown = [...s.shown]
    delete s.phaseClaim
    if (!s.groups.length) { finish(s, false); return }
    s.phase = 'reveal'; s.deadline = Date.now() + secondsForAttempt(1) * 1000
  })
}

export const fowlWordsScoringCapabilities = onCall(async request => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first')
  return { bestCluesFirstEnabled: await scoringAvailable() }
})

export const fowlWordsUpdateScoring = onCall(async request => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first')
  const { gameId, expectedRound, expectedRevision, rules, cancel = false } = request.data
  if (typeof gameId !== 'string' || !Number.isInteger(expectedRound) || !Number.isInteger(expectedRevision) || typeof cancel !== 'boolean') throw new HttpsError('invalid-argument', 'Invalid settings request')
  let parsed: ScoringRules | undefined
  try { if (!cancel) parsed = validateRules(rules) } catch (e) { throw new HttpsError('invalid-argument', (e as Error).message) }
  const available = await scoringAvailable()
  await firestore().runTransaction(async tx => {
    const ref = gameRef(gameId); const snap = await tx.get(ref)
    if (!snap.exists) throw new HttpsError('not-found', 'Game not found')
    const g = snap.data()!
    if (g.gameType !== 'fowl-words') fail('This is not a Fowl Words game')
    if (g.hostId !== uid) throw new HttpsError('permission-denied', 'Only the host can change scoring')
    if (!['lobby', 'playing'].includes(g.status)) fail('This game has ended')
    if (g.currentRound !== expectedRound || (g.scoringRevision ?? 0) !== expectedRevision) throw new HttpsError('aborted', 'The round or settings changed. Review and save again.')
    if (parsed?.mode === 'best-clues-first' && !available && (g.pendingScoringRules ?? g.scoringRules)?.mode !== 'best-clues-first') fail('Best Clues First is not enabled')
    const update: admin.firestore.UpdateData<admin.firestore.DocumentData> = { scoringRevision: (g.scoringRevision ?? 0) + 1 }
    if (g.status === 'lobby') {
      update.scoringEngineVersion = 1
      update.scoringRules = parsed ?? g.scoringRules ?? recommendedRules()
    } else {
      update.pendingScoringRules = cancel ? FieldValue.delete() : parsed
      if (!cancel) update.scoringEngineVersion = 1
    }
    tx.update(ref, update)
  })
})

type Action = 'word-vote' | 'tick' | 'clue' | 'rank' | 'guess' | 'skip' | 'give-up' | 'love' | 'boo' | 'helpful'
export const fowlWordsScoringAction = onCall({ secrets: [typesafeApiKey] }, async request => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first')
  const { gameId: id, roundNum: round, action, expectedAttempt, text, clueId, index } = request.data as {
    gameId: string; roundNum: number; action: Action; expectedAttempt?: number; text?: string; clueId?: string; index?: number
  }
  if (typeof id !== 'string' || !Number.isInteger(round) || round < 1 || !['word-vote','tick','clue','rank','guess','skip','give-up','love','boo','helpful'].includes(action)) throw new HttpsError('invalid-argument', 'Invalid round action')

  if (action === 'clue') {
    const [gs, ss] = await Promise.all([gameRef(id).get(), stateRef(id, round).get()])
    if (!gs.exists || !ss.exists) throw new HttpsError('not-found', 'Round not found')
    const s = ss.data() as ScoringState; const g = gs.data()!
    if (g.gameType !== 'fowl-words' || g.scoringEngineVersion !== 1 || g.status !== 'playing' || g.currentRound !== round) fail('This round is no longer active')
    if (!s.eligible.includes(uid) || s.guesser === uid) throw new HttpsError('permission-denied', 'Only eligible givers submit clues')
    if (s.phase !== 'clue-submission' || s.deadline <= Date.now() || s.clues.some(c => c.author === uid)) fail('Clue submission is closed')
    let semanticClue = false
    const validation = await validateClueForSubmission(text, s.secretWord, g.aiExperiment?.mode === 'jev' ? async clue => {
      if (!await jevOperationEnabled(g.originalHostId ?? g.hostId, 'clue')) return null
      const decision = await new DecisionService().classifyFowlWordsClue({ clue, secretWord: s.secretWord })
      const accepted = acceptsJevClue(decision)
      return { allowed: accepted, reason: 'single_word' as const,
        tooCloseToSecret: decision.tooCloseToSecret && (decision.metadata.probabilities?.too_close ?? 0) >= JEV_CLUE_REJECTION_THRESHOLD }
    } : g.aiExperiment?.mode === 'shadow' ? async (clue, word) => {
      semanticClue = true
      return classifyFowlWordsClue(clue, word)
    } : undefined)
    if (g.aiExperiment?.mode === 'shadow' && semanticClue) {
      await enqueueFowlWordsShadow({ gameId: id, roundNum: round, actorUid: uid,
        hostUid: g.originalHostId ?? g.hostId, operation: 'clue', clue: String(text).trim(),
        secretWord: s.secretWord, expected: { accepted: validation.valid } }).catch(() => console.error('Could not enqueue scoring clue shadow'))
    }
    if (!validation.valid) throw new HttpsError('invalid-argument', validation.reason === 'too-close-to-secret' ? 'Choose a clue less like the secret word' : 'Use one real word, up to 50 letters')
    await mutate(id, round, uid, current => {
      if (current.phase !== 'clue-submission' || current.deadline <= Date.now() || current.clues.some(c => c.author === uid)) fail('Clue submission is closed')
      current.clues.push({ id: randomUUID(), author: uid, text: validation.clue, at: Date.now() })
      if (current.clues.length === current.eligible.length - 1) closeSubmissions(current)
    })
  } else if (action === 'guess') {
    if (typeof text !== 'string' || !text.trim() || text.length > 100) throw new HttpsError('invalid-argument', 'Enter a guess up to 100 characters')
    const claim = randomUUID()
    let secret = ''; let game: Game = {}; let claimedAttempt = 0
    await mutate(id, round, uid, (s, g) => {
      assertAttempt(s, uid, expectedAttempt)
      secret = s.secretWord; game = g; claimedAttempt = s.attempt
      s.claim = { id: claim, expires: Date.now() + 20000, attempt: s.attempt }; s.phase = 'guess'
    })
    let correct = false
    let semanticGuess = false
    try {
      const playtest = game.aiExperiment?.mode === 'jev' && game.aiExperiment?.configVersion === JEV_PLAYTEST_VERSION
      const local = playtest ? experimentalGuessLocal(secret, text).decision : deterministicGuess(secret, text)
      semanticGuess = local === null
      if (local !== null) correct = local
      else if (game.aiExperiment?.mode === 'jev') {
        if (await jevOperationEnabled(game.originalHostId ?? game.hostId, 'guess')) {
          const result = playtest ? await evaluatePlaytestGuess(secret, text) : await new DecisionService().evaluateFowlWordsGuess({ secretWord: secret, guess: text })
          correct = acceptsJevGuess(result, playtest ? JEV_PLAYTEST_GUESS_THRESHOLD : undefined)
        }
      } else correct = await evaluateGuess(secret, text)
    } catch { correct = false }
    if (game.aiExperiment?.mode === 'shadow' && semanticGuess) {
      await enqueueFowlWordsShadow({ gameId: id, roundNum: round, actorUid: uid,
        hostUid: game.originalHostId ?? game.hostId, operation: 'guess', guess: text.trim(),
        secretWord: secret, attempt: claimedAttempt, expected: { correct } }).catch(() => console.error('Could not enqueue scoring guess shadow'))
    }
    await mutate(id, round, uid, s => {
      if (s.claim?.id !== claim || s.attempt !== claimedAttempt || s.claim.expires < Date.now()) return
      const event: AttemptEvent = { attempt: s.attempt, kind: 'guess', text: text.trim(), correct }
      if (correct) { s.history.push(event); finish(s, true) } else advance(s, event)
    })
  } else {
    await mutate(id, round, uid, (s, g) => {
      if (action === 'word-vote') {
        if (s.phase !== 'word-selection' || s.guesser === uid || Date.now() < s.selectionOpensAt || Date.now() >= s.deadline) fail('Word voting is closed')
        if (!Number.isInteger(index) || index! < 0 || index! >= s.wordOptions.length) throw new HttpsError('invalid-argument', 'Choose a word')
        s.wordVotes[uid] = index!
        if (Object.keys(s.wordVotes).length === s.eligible.length - 1) selectWord(s)
      } else if (action === 'rank') {
        if (s.rules.mode !== 'best-clues-first' || !['clue-submission','clue-voting'].includes(s.phase) || Date.now() >= s.deadline || !s.clues.some(c => c.author === uid)) fail('Ranking votes are closed')
        const target = s.clues.find(c => c.id === clueId)
        if (!target || target.author === uid) throw new HttpsError('invalid-argument', 'Back another giver’s clue')
        const votes = s.rankingVotes[uid] ?? []
        if (!votes.includes(target.id) && votes.length >= s.rules.hearts) fail('Remove a heart before backing another clue')
        s.rankingVotes[uid] = votes.includes(target.id) ? votes.filter(v => v !== target.id) : [...votes, target.id]
      } else if (action === 'skip' || action === 'give-up') {
        assertAttempt(s, uid, expectedAttempt)
        if (action === 'skip') {
          if (s.attempt >= s.maxAttempts || s.shown.length >= s.groups.length) fail('No further clues to reveal; choose Give up')
          advance(s, { attempt: s.attempt, kind: 'skip' })
        } else {
          if (s.attempt < s.maxAttempts && s.shown.length < s.groups.length) fail('More clues are available; choose Skip')
          s.history.push({ attempt: s.attempt, kind: 'give-up' }); finish(s, false)
        }
      } else if (action === 'tick') {
        const now = Date.now()
        if (s.claim) {
          if (now >= s.claim.expires) advance(s, { attempt: s.attempt, kind: 'timeout' })
        } else if (s.phase === 'word-selection' && now >= s.deadline) selectWord(s)
        else if (s.phase === 'word-selected' && now >= s.deadline) { s.phase = 'clue-submission'; s.deadline = now + 60000 }
        else if (s.phase === 'clue-submission' && (now >= s.deadline || g.hostId === uid)) closeSubmissions(s)
        else if (s.phase === 'clue-voting' && now >= s.deadline) { s.phase = 'deduplication'; s.deadline = 0 }
        else if (['reveal','guess'].includes(s.phase) && now >= s.deadline) advance(s, { attempt: s.attempt, kind: 'timeout' })
      } else {
        const target = s.groups.find(c => c.id === clueId)
        if (!target || target.authorIds.includes(uid)) throw new HttpsError('invalid-argument', 'Choose another giver’s clue')
        const guessing = ['reveal','guess'].includes(s.phase)
        if (action === 'helpful') {
          if (s.guesser !== uid || s.phase !== 'scored' || !s.correct || !s.shown.includes(target.id)) fail('Most Helpful is available after a win')
          s.helpful = s.helpful === target.id ? null : target.id
        } else if (action === 'love') {
          if (!guessing || Date.now() >= s.deadline || s.guesser === uid || !s.shown.includes(target.id) || s.rules.mode !== 'classic') fail('Peer love is not available here')
          const votes = s.love[uid] ?? []
          s.love[uid] = votes.includes(target.id) ? votes.filter(v => v !== target.id) : [...votes, target.id]
        } else {
          if (!((guessing && s.guesser !== uid) || (s.phase === 'scored' && s.guesser === uid))) fail('Boo is not available here')
          if (!s.shown.includes(target.id)) fail('Choose a shown clue')
          if (s.boo[uid] === target.id) delete s.boo[uid]; else s.boo[uid] = target.id
        }
      }
    })
  }
  const latest = (await stateRef(id, round).get()).data() as ScoringState | undefined
  if (latest?.phase === 'deduplication') await deduplicate(id, round, uid)
  return { ok: true }
})

function closeSubmissions(s: ScoringState) {
  if (s.rules.mode === 'best-clues-first' && s.clues.length > 1) {
    s.phase = 'clue-voting'; s.deadline = Date.now() + s.rules.votingSeconds * 1000
  } else { s.phase = 'deduplication'; s.deadline = 0 }
}
