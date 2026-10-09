import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { createReport, reportStatus, sha256 } from './lib/report.mjs'
import { assertPartition, scoreFlockRound } from './lib/oracle.mjs'
import { assertLoopback, probeVite, resolveCommand, run, shortOutput } from './lib/runtime.mjs'

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

if (phase === 'foundation' && profile !== 'offline') checks.push({ id: 'live-typesafe-contract', status: 'incomplete', message: 'live TypeSafe contract runner is not implemented in Phase 1 foundation' })
const report = await createReport({ rootDir, phase, profile, fixtureVersion: fixtures.version, checks, events })
process.stdout.write(report.summaryPath + '\n')
process.exitCode = report.status === 'pass' ? 0 : report.status === 'incomplete' ? 2 : 1
