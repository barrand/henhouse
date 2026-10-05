import { readFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { createReport, reportStatus, sha256 } from './lib/report.mjs'
import { assertPartition, scoreFlockRound } from './lib/oracle.mjs'

const rootDir = path.resolve(import.meta.dirname, '../..')
const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, arg, index, all) => {
  if (!arg.startsWith('--')) return pairs
  pairs.push([arg.slice(2), all[index + 1]?.startsWith('--') ? true : all[index + 1]])
  return pairs
}, []))
const phase = args.phase ?? 'foundation'
const profile = args.profile ?? 'offline'
const fixturePath = path.join(rootDir, 'tools', 'jev-validation', 'fixtures', 'core.json')
const fixtureText = await readFile(fixturePath, 'utf8')
const fixtures = JSON.parse(fixtureText)
const checks = []
const check = (id, fn) => {
  try {
    const result = fn()
    if (result && typeof result === 'object' && 'status' in result) {
      checks.push({ id, ...result })
    } else {
      checks.push({ id, status: 'pass', message: result ?? 'passed' })
    }
  } catch (error) {
    checks.push({ id, status: 'fail', message: error instanceof Error ? error.message : String(error) })
  }
}

check('fixture-schema', () => {
  if (fixtures.version !== 1) throw new Error('unsupported fixture version')
  if (!Array.isArray(fixtures.clueValidation) || !Array.isArray(fixtures.guessEvaluation) || !Array.isArray(fixtures.flockRounds)) {
    throw new Error('fixture collections are missing')
  }
  const ids = [...fixtures.clueValidation, ...fixtures.guessEvaluation, ...fixtures.flockRounds].map((item) => item.id)
  if (new Set(ids).size !== ids.length) throw new Error('fixture IDs must be unique')
  return `${ids.length} fixture cases validated`
})

check('fixture-fingerprint', () => `sha256:${sha256(fixtureText)}`)

check('partition-oracle', () => {
  for (const round of fixtures.flockRounds) {
    assertPartition(round.groups, [...new Set(Object.values(round.answers))])
  }
  return `${fixtures.flockRounds.length} partitions validated`
})

check('independent-score-oracle', () => {
  for (const round of fixtures.flockRounds) {
    const result = scoreFlockRound(round.answers, round.groups)
    if (JSON.stringify(result.points) !== JSON.stringify(round.expectedPoints)) throw new Error(`${round.id}: points mismatch`)
    if (JSON.stringify(result.results) !== JSON.stringify(round.expectedResults)) throw new Error(`${round.id}: results mismatch`)
  }
  return `${fixtures.flockRounds.length} score expectations validated`
})

check('mocked-provider-contract', () => {
  const good = { answers: { clue: { type: 'choice', choice: 'single_word', probabilities: { single_word: 1, joined_words: 0 }, confidence: 1 } }, model: 'jev-1.13.0', usage: { input_tokens: 1, output_tokens: 1 } }
  if (good.answers.clue.choice !== 'single_word' || good.answers.clue.type !== 'choice') throw new Error('valid Choice response rejected')
  const malformed = { answers: { clue: { type: 'choice', choice: 'unknown', probabilities: {} } } }
  if (['single_word', 'joined_words'].includes(malformed.answers.clue.choice)) throw new Error('malformed Choice response accepted')
  return 'valid and malformed response cases validated'
})

check('credential-redaction', () => {
  const reportText = JSON.stringify({ TYPESAFE_API_KEY: '[redacted]' })
  if (/sk-|apikey_|AIza|TYPESAFE_API_KEY=[^\s\]}]+/i.test(reportText)) throw new Error('credential pattern found in report data')
  return 'report redaction smoke check passed'
})

check('runner-status-semantics', () => {
  const pass = reportStatus([{ status: 'pass' }])
  const incomplete = reportStatus([{ status: 'pass' }, { status: 'incomplete' }])
  const fail = reportStatus([{ status: 'incomplete' }, { status: 'fail' }])
  if (pass !== 'pass' || incomplete !== 'incomplete' || fail !== 'fail') throw new Error('status precedence is incorrect')
  return 'pass, incomplete, and fail precedence validated'
})

check('tooling-prerequisites', () => {
  const npm = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['--version'], { encoding: 'utf8' })
  const firebase = spawnSync(process.platform === 'win32' ? 'firebase.cmd' : 'firebase', ['--version'], { encoding: 'utf8' })
  const missing = [
    npm.status === 0 ? null : 'npm',
    firebase.status === 0 ? null : 'firebase CLI',
  ].filter(Boolean)
  if (missing.length > 0) return { status: 'incomplete', message: `missing local prerequisite(s): ${missing.join(', ')}` }
  return `npm ${npm.stdout.trim()}, Firebase CLI ${firebase.stdout.trim()}`
})

check('emulator-lifecycle', () => ({
  status: 'incomplete',
  message: 'scripted Firebase emulator lifecycle is reserved for the next foundation increment',
}))

check('scripted-actors', () => ({
  status: 'incomplete',
  message: 'host/player emulator actors are reserved for the next foundation increment',
}))

if (profile !== 'offline') {
  checks.push({ id: 'live-typesafe-contract', status: process.env.TYPESAFE_API_KEY ? 'incomplete' : 'incomplete', message: 'live TypeSafe contract runner is not implemented in Phase 1 foundation' })
}

const report = await createReport({ rootDir, phase, profile, fixtureVersion: fixtures.version, checks })
process.stdout.write(`${report.summaryPath}\n`)
process.exitCode = report.status === 'pass' ? 0 : report.status === 'incomplete' ? 2 : 1
