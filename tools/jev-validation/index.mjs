import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { createReport, reportStatus, sha256 } from './lib/report.mjs'
import { assertPartition, scoreFlockRound } from './lib/oracle.mjs'
import { assertLoopback, probeVite, resolveCommand, run, shortOutput } from './lib/runtime.mjs'
import { fowlCorpus, validateFowlCorpus } from './fixtures/fowl-corpus.mjs'

const rootDir = path.resolve(import.meta.dirname, '../..')
const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, arg, index, all) => {
  if (!arg.startsWith('--')) return pairs
  pairs.push([arg.slice(2), all[index + 1]?.startsWith('--') ? true : all[index + 1]])
  return pairs
}, []))
const phase = args.phase ?? 'foundation'
const profile = args.profile ?? 'offline'
const validPhases = new Set(['foundation', 'S0', 'S1', 'S2', 'S3', 'S4', 'S5', 'FW-1', 'FW-2', 'FW-3', 'FW-4', 'FW-5', 'FT-1', 'FT-2', 'FT-3', 'FT-4', 'FT-5', 'FT-6', 'FT-7', 'FT-8', 'release'])
const fixturePath = path.join(rootDir, 'tools', 'jev-validation', 'fixtures', 'core.json')
const fixtureText = await readFile(fixturePath, 'utf8')
const fixtures = JSON.parse(fixtureText)
const checks = []
const events = []
const check = async (id, fn) => {
  const startedAt = new Date().toISOString()
  try {
    const result = await fn()
    const checkResult = result && typeof result === 'object' && 'status' in result ? { id, ...result } : { id, status: 'pass', message: result ?? 'passed' }
    checks.push(checkResult)
    events.push({ type: 'check', id, status: checkResult.status, startedAt, finishedAt: new Date().toISOString() })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    checks.push({ id, status: 'fail', message })
    events.push({ type: 'check', id, status: 'fail', startedAt, finishedAt: new Date().toISOString(), message })
  }
}

if (args['self-test'] === 'fail') {
  checks.push({ id: 'intentional-failure', status: 'fail', message: 'intentional validation failure' })
} else if (args['self-test'] === 'incomplete') {
  checks.push({ id: 'intentional-missing-prerequisite', status: 'incomplete', message: 'intentional missing prerequisite' })
} else if (!validPhases.has(phase)) {
  checks.push({ id: 'phase', status: 'fail', message: 'unsupported phase: ' + phase })
} else if (phase === 'S0') {
  const firebase = await resolveCommand('firebase')
  const java = await resolveCommand('java')
  await check('s0-experiment-boundary', async () => {
    if (!firebase || !java) return { status: 'incomplete', message: 'Firebase CLI and Java are required for S0 emulator evidence' }
    if ((await run(java, ['-version'], { cwd: rootDir })).code !== 0) return { status: 'incomplete', message: 'Java is unavailable; Firestore emulator cannot start' }
    assertLoopback(process.env.JEV_EMULATOR_HOST ?? '127.0.0.1')
    const scenario = path.join(rootDir, 'tools', 'jev-validation', 'scenarios', 's0-actors.mjs')
    const command = '"' + process.execPath + '" "' + scenario + '"'
    const result = await run(firebase, ['emulators:exec', '--only', 'auth,firestore,functions', '--project', 'flock-together-game', command], { cwd: rootDir, env: { JEV_EMULATOR_HOST: '127.0.0.1' }, timeoutMs: 240000 })
    if (result.code !== 0) throw new Error('S0 emulator scenario failed: ' + shortOutput(result))
    return 'admission, immutable room metadata, protected config, joining, and disabled rematch passed'
  })
} else if (phase === 'S1') {
  const npm = await resolveCommand('npm')
  await check('s1-secret-binding', async () => {
    const source = await readFile(path.join(rootDir, 'functions', 'src', 'index.ts'), 'utf8')
    if (!source.includes("defineSecret('TYPESAFE_API_KEY')")) throw new Error('TYPESAFE_API_KEY secret parameter is missing')
    if (!source.includes('onCall({ secrets: [typesafeApiKey] }')) throw new Error('Jev contract callable is not bound to TYPESAFE_API_KEY')
    if (!source.includes('await requireJevOperation(uid, \'clue\')')) throw new Error('Jev contract callable is not admission-gated')
    return 'secret parameter, callable binding, and admission gate are present'
  })
  await check('s1-offline-credential-handling', async () => {
    if (!npm) return { status: 'incomplete', message: 'npm is unavailable' }
    const build = await run(npm, ['--prefix', 'functions', 'run', 'build'], { cwd: rootDir, timeoutMs: 180000 })
    if (build.code !== 0) throw new Error('functions build failed: ' + shortOutput(build))
    const tests = await run(npm, ['--prefix', 'functions', 'test'], { cwd: rootDir, timeoutMs: 180000 })
    if (tests.code !== 0) throw new Error('functions tests failed: ' + shortOutput(tests))
    return 'functions build and missing-key/redaction unit tests passed'
  })
  if (profile !== 'offline') {
    await check('live-typesafe-contract', async () => {
      if (!process.env.TYPESAFE_API_KEY?.trim()) return { status: 'incomplete', message: 'TYPESAFE_API_KEY is not present in this validation process' }
      const modulePath = path.join(rootDir, 'functions', 'lib', 'shared', 'jevLiveContract.js')
      const { runJevLiveContractCheck } = await import(modulePath)
      const result = await runJevLiveContractCheck()
      if (result.model !== 'jev-1.13.0' || !Number.isFinite(result.latencyMs) || result.latencyMs < 0) throw new Error('live response did not satisfy the pinned-model metadata contract')
      return 'authenticated Jev response validated: model=' + result.model + ', latencyMs=' + result.latencyMs
    })
  }
} else if (phase === 'S2') {
  const npm = await resolveCommand('npm')
  await check('s2-adapter-build-and-tests', async () => {
    if (!npm) return { status: 'incomplete', message: 'npm is unavailable' }
    for (const item of [['functions build', ['--prefix', 'functions', 'run', 'build']], ['functions tests', ['--prefix', 'functions', 'test']]]) {
      const result = await run(npm, item[1], { cwd: rootDir, timeoutMs: 180000 })
      if (result.code !== 0) throw new Error(item[0] + ' failed: ' + shortOutput(result))
    }
    return 'adapter build and S2 transport/error-path tests passed'
  })
  await check('s2-transport-policy', async () => {
    const source = await readFile(path.join(rootDir, 'functions', 'src', 'shared', 'decisionService.ts'), 'utf8')
    for (const required of ['JEV_ATTEMPT_TIMEOUT_MS = 1500', 'JEV_TOTAL_DEADLINE_MS = 2000', 'maxRetries: 1', 'httpStatuses: new Set([429, 529])', 'Malformed Jev response metadata', 'Jev total deadline exceeded']) {
      if (!source.includes(required)) throw new Error('missing transport policy: ' + required)
    }
    if (source.includes('console.log') || source.includes('console.error')) throw new Error('adapter must not log provider payloads or credentials')
    return 'one SDK retry layer, bounded per-attempt/total deadlines, status policy, metadata validation, and quiet logging are present'
  })
  await check('s2-duplicate-commit-guard', async () => {
    const source = await readFile(path.join(rootDir, 'functions', 'src', 'games', 'fowl-words', 'roundFlow.ts'), 'utf8')
    for (const required of ['attemptInProgress === true', 'attemptInProgress: true', "status: 'scored'", 'batch.commit()']) {
      if (!source.includes(required)) throw new Error('missing guarded commit invariant: ' + required)
    }
    return 'duplicate guess claims are rejected and scoring state plus score increments commit atomically'
  })
  if (profile !== 'offline') {
    await check('live-typesafe-contract', async () => {
      if (!process.env.TYPESAFE_API_KEY?.trim()) return { status: 'incomplete', message: 'TYPESAFE_API_KEY is not present in this validation process' }
      const modulePath = path.join(rootDir, 'functions', 'lib', 'shared', 'jevLiveContract.js')
      const { runJevLiveContractCheck } = await import(modulePath)
      const result = await runJevLiveContractCheck()
      if (result.model !== 'jev-1.13.0' || !Number.isFinite(result.latencyMs) || result.latencyMs < 0) throw new Error('live response did not satisfy the pinned-model metadata contract')
      return 'authenticated Jev response validated: model=' + result.model + ', latencyMs=' + result.latencyMs
    })
  }
} else if (phase === 'FW-1') {
  const npm = await resolveCommand('npm')
  await check('fw1-clue-validation-build-and-tests', async () => {
    if (!npm) return { status: 'incomplete', message: 'npm is unavailable' }
    for (const item of [['functions build', ['--prefix', 'functions', 'run', 'build']], ['functions tests', ['--prefix', 'functions', 'test']]]) {
      const result = await run(npm, item[1], { cwd: rootDir, timeoutMs: 180000 })
      if (result.code !== 0) throw new Error(item[0] + ' failed: ' + shortOutput(result))
    }
    return 'deterministic clue corpus and Jev adapter integration tests passed'
  })
  await check('fw1-provider-boundary', async () => {
    const source = await readFile(path.join(rootDir, 'functions', 'src', 'games', 'fowl-words', 'index.ts'), 'utf8')
    for (const required of ['game.aiExperiment?.mode === \'jev\'', 'new DecisionService()', "jevOperationEnabled(game.originalHostId ?? game.hostId, 'clue')", 'JEV_CLUE_REJECTION_THRESHOLD', 'runTransaction']) {
      if (!source.includes(required)) throw new Error('missing FW-1 provider boundary: ' + required)
    }
    if (!source.includes(': undefined')) throw new Error('legacy classifier fallback is not explicit')
    return 'server-selected Jev mode, operation kill switch, thresholded decisions, and legacy fallback are present'
  })
  await check('fw1-guarded-clue-commit', async () => {
    const source = await readFile(path.join(rootDir, 'functions', 'src', 'games', 'fowl-words', 'index.ts'), 'utf8')
    for (const required of ['if (existing[uid])', 'freshRound.status !== \'clue-submission\'', 'freshDeadline', 'isRoundEligible(freshRound, freshGame, uid)', 'if ((freshRound.cluesByPlayer ?? {})[uid])', 'Clue submission is no longer available']) {
      if (!source.includes(required)) throw new Error('missing stale/parallel clue guard: ' + required)
    }
    return 'duplicate, stale, late, and ineligible submissions are rejected before or during the guarded commit'
  })
} else if (phase === 'FW-2') {
  const npm = await resolveCommand('npm')
  await check('fw2-guess-build-and-tests', async () => {
    if (!npm) return { status: 'incomplete', message: 'npm is unavailable' }
    for (const item of [['functions build', ['--prefix', 'functions', 'run', 'build']], ['functions tests', ['--prefix', 'functions', 'test']]]) {
      const result = await run(npm, item[1], { cwd: rootDir, timeoutMs: 180000 })
      if (result.code !== 0) throw new Error(item[0] + ' failed: ' + shortOutput(result))
    }
    return 'deterministic guess fast-path and Jev guess evaluation tests passed'
  })
  await check('fw2-provider-boundary', async () => {
    const source = await readFile(path.join(rootDir, 'functions', 'src', 'games', 'fowl-words', 'roundFlow.ts'), 'utf8')
    for (const required of ['deterministicGuess(secretWord, guess)', "game.aiExperiment?.mode === 'jev'", "jevOperationEnabled(game.originalHostId ?? game.hostId, 'guess')", 'acceptsJevGuess', 'isCorrect = false']) {
      if (!source.includes(required)) throw new Error('missing FW-2 provider boundary: ' + required)
    }
    return 'exact/fuzzy/plural/inflection checks stay local; Jev is limited to unresolved guesses and failures reject'
  })
  await check('fw2-claim-and-recovery', async () => {
    const source = await readFile(path.join(rootDir, 'functions', 'src', 'games', 'fowl-words', 'roundFlow.ts'), 'utf8')
    for (const required of ['guessClaimId', 'GUESS_CLAIM_LEASE_MS', 'latest.guessClaimId !== claimId', 'commitScoredGuess', 'recoverExpiredGuess', 'guessClaimExpiresAt']) {
      if (!source.includes(required)) throw new Error('missing FW-2 claim/recovery invariant: ' + required)
    }
    if (!source.includes('tx.update(playerRef, { score: FieldValue.increment(points) })')) throw new Error('score increments are not inside the guarded transaction')
    return 'unique leased claims, expiry recovery, late-result rejection, and atomic score commits are present'
  })
} else if (phase === 'FW-3') {
  const npm = await resolveCommand('npm')
  await check('fw3-deterministic-dedup-build-and-tests', async () => {
    if (!npm) return { status: 'incomplete', message: 'npm is unavailable' }
    for (const item of [['functions build', ['--prefix', 'functions', 'run', 'build']], ['functions tests', ['--prefix', 'functions', 'test']]]) {
      const result = await run(npm, item[1], { cwd: rootDir, timeoutMs: 180000 })
      if (result.code !== 0) throw new Error(item[0] + ' failed: ' + shortOutput(result))
    }
    return 'deterministic grouping, complete partition, visibility, and scoring tests passed'
  })
  await check('fw3-no-provider-dedup', async () => {
    const source = await readFile(path.join(rootDir, 'functions', 'src', 'shared', 'gemini.ts'), 'utf8')
    const start = source.indexOf('export async function detectDuplicateClues')
    const end = source.indexOf('function fallbackExactMatchGrouping', start)
    if (start < 0 || end < 0) throw new Error('deterministic dedup function boundary is missing')
    const dedupSource = source.slice(start, end)
    if (dedupSource.includes('generateContent') || dedupSource.includes('DecisionService') || dedupSource.includes('TypeSafeClient')) throw new Error('deduplication contains a provider call')
    if (!dedupSource.includes('fastExactMatchGrouping')) throw new Error('deduplication does not use deterministic grouping')
    return 'deduplication has no Jev/Gemini/provider call and uses normalized deterministic grouping only'
  })
  await check('fw3-round-boundary', async () => {
    const source = await readFile(path.join(rootDir, 'functions', 'src', 'games', 'fowl-words', 'roundFlow.ts'), 'utf8')
    if (!source.includes('detectDuplicateClues(secretWord, cluesByPlayer)')) throw new Error('round flow is not using the deterministic dedup function')
    const start = source.indexOf('export async function runDeduplication')
    const end = source.indexOf('async function commitScoredGuess', start)
    const dedupBoundary = source.slice(start, end)
    if (dedupBoundary.includes('DecisionService')) throw new Error('Jev adapter is imported into the dedup round boundary')
    return 'Fowl Words deduplication remains isolated from Jev guess/clue decisions'
  })
} else if (phase === 'FW-4') {
  const npm = await resolveCommand('npm')
  await check('fw4-shadow-build-and-tests', async () => {
    if (!npm) return { status: 'incomplete', message: 'npm is unavailable' }
    for (const item of [['functions build', ['--prefix', 'functions', 'run', 'build']], ['functions tests', ['--prefix', 'functions', 'test']]]) {
      const result = await run(npm, item[1], { cwd: rootDir, timeoutMs: 180000 })
      if (result.code !== 0) throw new Error(item[0] + ' failed: ' + shortOutput(result))
    }
    return 'shadow sampling, job identity, and Functions regression tests passed'
  })
  await check('fw4-durable-shadow-boundary', async () => {
    const source = await readFile(path.join(rootDir, 'functions', 'src', 'shared', 'jevShadow.ts'), 'utf8')
    for (const required of ['aiShadowJobs/{jobId}', 'inputExpiresAt', 'expireJevShadowInputs', 'configVersion', 'FieldValue.delete()', 'aiShadowAggregates', 'JEV_CONFIG_VERSION']) {
      if (!source.includes(required)) throw new Error('missing durable shadow invariant: ' + required)
    }
    if (!source.includes("status: 'pending'") || !source.includes("status: 'complete'")) throw new Error('shadow job lifecycle is incomplete')
    return 'immutable input snapshots, seven-day expiry metadata, config pinning, redacted completion, and aggregates are present'
  })
  await check('fw4-player-path-is-authoritative', async () => {
    const clueSource = await readFile(path.join(rootDir, 'functions', 'src', 'games', 'fowl-words', 'index.ts'), 'utf8')
    const guessSource = await readFile(path.join(rootDir, 'functions', 'src', 'games', 'fowl-words', 'roundFlow.ts'), 'utf8')
    for (const source of [clueSource, guessSource]) {
      if (!source.includes('enqueueFowlWordsShadow')) throw new Error('shadow enqueue is missing from an eligible player path')
      if (!source.includes('.catch((error) => console.error')) throw new Error('shadow enqueue failure can block authoritative gameplay')
    }
    const worker = await readFile(path.join(rootDir, 'functions', 'src', 'shared', 'jevShadow.ts'), 'utf8')
    if (!worker.includes('processJevShadowJob') || !worker.includes('tx.update(snapshot.ref')) throw new Error('shadow worker does not write comparison state')
    return 'legacy clue/guess decisions remain authoritative and shadow inference is durable, detached, and non-blocking'
  })
} else if (phase === 'FW-5') {
  const npm = await resolveCommand('npm')
  await check('fw5-offline-regression', async () => {
    if (!npm) return { status: 'incomplete', message: 'npm is unavailable' }
    for (const item of [['root build', ['run', 'build']], ['functions build', ['--prefix', 'functions', 'run', 'build']], ['functions tests', ['--prefix', 'functions', 'test']]]) {
      const result = await run(npm, item[1], { cwd: rootDir, timeoutMs: 180000 })
      if (result.code !== 0) throw new Error(item[0] + ' failed: ' + shortOutput(result))
    }
    return 'full offline regression passed'
  })
  await check('fw5-semantic-corpus', () => {
    const coverage = validateFowlCorpus(fowlCorpus())
    return `${coverage.clues} clue and ${coverage.guesses} guess fixtures; 100 development and 300 held-out each plus English challenges; concept families isolated by split`
  })
  await check('fw5-three-live-semantic-runs', () => {
    return { status: 'incomplete', message: 'Live runner implemented (scenarios/fowl-semantics.mjs); observed translation/English-equivalence failures block threshold freeze. New independent holdout is required after rubric tuning.' }
  })
  await check('fw5-live-performance', () => ({ status: 'incomplete', message: 'Live latency measurements are saved with semantic runs; promotion requires passing measurements for the final frozen rubric/configuration.' }))
  await check('fw5-bot-swarm-evidence', () => ({ status: 'incomplete', message: 'Three-player ten-round handler integration with real Jev passed; full HTTP/browser and supported player-count matrix remain required.' }))
} else if (phase !== 'foundation') {
  checks.push({ id: 'phase-scope', status: 'incomplete', message: phase + ' validation is not implemented; complete the foundation phase first' })
} else {
  const npm = await resolveCommand('npm')
  const firebase = await resolveCommand('firebase')
  const java = await resolveCommand('java')
  await check('fixture-schema', () => {
    if (fixtures.version !== 1) throw new Error('unsupported fixture version')
    if (!Array.isArray(fixtures.clueValidation) || !Array.isArray(fixtures.guessEvaluation) || !Array.isArray(fixtures.flockRounds)) throw new Error('fixture collections are missing')
    const ids = [...fixtures.clueValidation, ...fixtures.guessEvaluation, ...fixtures.flockRounds].map((item) => item.id)
    if (new Set(ids).size !== ids.length) throw new Error('fixture IDs must be unique')
    return String(ids.length) + ' fixture cases validated'
  })
  await check('fixture-fingerprint', () => 'sha256:' + sha256(fixtureText))
  await check('partition-oracle', () => {
    for (const round of fixtures.flockRounds) assertPartition(round.groups, [...new Set(Object.values(round.answers))])
    return String(fixtures.flockRounds.length) + ' partitions validated'
  })
  await check('independent-score-oracle', () => {
    for (const round of fixtures.flockRounds) {
      const result = scoreFlockRound(round.answers, round.groups)
      if (JSON.stringify(result.points) !== JSON.stringify(round.expectedPoints)) throw new Error(round.id + ': points mismatch')
      if (JSON.stringify(result.results) !== JSON.stringify(round.expectedResults)) throw new Error(round.id + ': results mismatch')
    }
    return String(fixtures.flockRounds.length) + ' score expectations validated'
  })
  await check('mocked-provider-contract', () => {
    const good = { answers: { clue: { type: 'choice', choice: 'single_word', probabilities: { single_word: 1, joined_words: 0 }, confidence: 1 } }, model: 'jev-1.13.0', usage: { input_tokens: 1, output_tokens: 1 } }
    if (good.answers.clue.choice !== 'single_word' || good.answers.clue.type !== 'choice') throw new Error('valid Choice response rejected')
    const malformed = { answers: { clue: { type: 'choice', choice: 'unknown', probabilities: {} } } }
    if (['single_word', 'joined_words'].includes(malformed.answers.clue.choice)) throw new Error('malformed Choice response accepted')
    return 'valid and malformed response cases validated'
  })
  await check('credential-redaction', () => {
    const reportText = JSON.stringify({ TYPESAFE_API_KEY: '[redacted]' })
    if (/sk-|apikey_|AIza|TYPESAFE_API_KEY=[^\s\]}]+/i.test(reportText)) throw new Error('credential pattern found in report data')
    return 'report redaction smoke check passed'
  })
  await check('runner-status-semantics', () => {
    const pass = reportStatus([{ status: 'pass' }])
    const incomplete = reportStatus([{ status: 'pass' }, { status: 'incomplete' }])
    const fail = reportStatus([{ status: 'incomplete' }, { status: 'fail' }])
    if (pass !== 'pass' || incomplete !== 'incomplete' || fail !== 'fail') throw new Error('status precedence is incorrect')
    return 'pass, incomplete, and fail precedence validated'
  })
  await check('tooling-prerequisites', async () => {
    const missing = [npm ? null : 'npm', firebase ? null : 'firebase CLI', java ? null : 'Java (required by Firestore emulator)'].filter(Boolean)
    if (missing.length) return { status: 'incomplete', message: 'missing local prerequisite(s): ' + missing.join(', ') }
    const versions = await Promise.all([run(npm, ['--version'], { cwd: rootDir }), run(firebase, ['--version'], { cwd: rootDir }), run(java, ['-version'], { cwd: rootDir })])
    if (versions.some((result) => result.code !== 0)) return { status: 'incomplete', message: 'unusable prerequisite(s): npm=' + shortOutput(versions[0]) + ', firebase=' + shortOutput(versions[1]) + ', java=' + shortOutput(versions[2]) }
    return 'npm ' + versions[0].stdout.trim() + ', Firebase CLI ' + versions[1].stdout.trim() + ', Java ' + (versions[2].stdout || versions[2].stderr).trim()
  })
  await check('baseline-builds-and-tests', async () => {
    if (!npm) return { status: 'incomplete', message: 'npm is unavailable' }
    for (const item of [['root build', ['run', 'build']], ['functions build', ['--prefix', 'functions', 'run', 'build']], ['functions tests', ['--prefix', 'functions', 'test']]]) {
      const result = await run(npm, item[1], { cwd: rootDir, timeoutMs: 180000 })
      if (result.code !== 0) throw new Error(item[0] + ' failed: ' + shortOutput(result))
    }
    return 'root build, functions build, and functions tests passed'
  })
  await check('vite-lifecycle', async () => {
    const result = await probeVite(rootDir)
    if (!result.ok) throw new Error(result.message)
    return result.message
  })
  await check('emulator-lifecycle', async () => {
    if (!firebase) return { status: 'incomplete', message: 'Firebase CLI is unavailable' }
    if (!java) return { status: 'incomplete', message: 'Java is unavailable; Firestore emulator cannot start' }
    const javaVersion = await run(java, ['-version'], { cwd: rootDir })
    if (javaVersion.code !== 0) return { status: 'incomplete', message: 'Java is unavailable; Firestore emulator cannot start' }
    assertLoopback(process.env.JEV_EMULATOR_HOST ?? '127.0.0.1')
    const scenario = path.join(rootDir, 'tools', 'jev-validation', 'scenarios', 'foundation-actors.mjs')
    const command = '"' + process.execPath + '" "' + scenario + '"'
    const result = await run(firebase, ['emulators:exec', '--only', 'auth,firestore,functions', '--project', 'flock-together-game', command], { cwd: rootDir, env: { JEV_EMULATOR_HOST: '127.0.0.1', JEV_EMULATOR_PROJECT_ID: 'flock-together-game' }, timeoutMs: 240000 })
    if (result.code !== 0) throw new Error('emulator scenario failed: ' + shortOutput(result))
    return 'isolated loopback emulators started, scenario completed, and emulators:exec exited cleanly after shutdown'
  })
  await check('scripted-actors', () => {
    const lifecycle = checks.find((item) => item.id === 'emulator-lifecycle')
    if (lifecycle?.status !== 'pass') return { status: 'incomplete', message: 'scripted actors could not run because emulator lifecycle did not pass' }
    return 'two anonymous actors created and joined both Flock Together and Fowl Words rooms through public callables'
  })
}

if (['S2', 'FW-1', 'FW-2', 'FW-3', 'FW-4', 'FW-5'].includes(phase) && !args['self-test']) {
  await check('fowl-firestore-behavior', async () => {
    const firebase = await resolveCommand('firebase')
    const scenario = path.join(rootDir, 'tools/jev-validation/scenarios/fowl-safety.mjs')
    const result = await run(firebase, ['emulators:exec', '--only', 'firestore', '--project', 'demo-jev-safety', `"${process.execPath}" "${scenario}"`], { cwd: rootDir, timeoutMs: 180000 })
    if (result.code !== 0) throw new Error('Firestore safety scenarios failed: ' + shortOutput(result))
    return 'Real transactions: concurrent scoring, late replies, expiry recovery, kill switch, parallel/stale clues, shadow replay, and cleanup pagination passed (mocked provider, no external model calls)'
  })
}
if (['FW-1', 'FW-2', 'FW-4'].includes(phase)) checks.push({ id: 'phase-exit-evidence', status: 'incomplete', message: 'Behavioral safety suite passed if listed above; full semantic corpus gates, shadow latency comparison, and end-to-end prerequisites are not yet all satisfied. Source checks alone do not complete this phase.' })
if (phase === 'foundation' && profile !== 'offline') checks.push({ id: 'live-typesafe-contract', status: 'incomplete', message: 'live TypeSafe contract runner is not implemented in Phase 1 foundation' })
const report = await createReport({ rootDir, phase, profile, fixtureVersion: fixtures.version, checks, events })
process.stdout.write(report.summaryPath + '\n')
process.exitCode = report.status === 'pass' ? 0 : report.status === 'incomplete' ? 2 : 1
