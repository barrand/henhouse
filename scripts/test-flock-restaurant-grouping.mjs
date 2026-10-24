import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const require = createRequire(path.join(root, 'functions/package.json'))
process.loadEnvFile(path.join(root, 'functions/.env'))
const { DecisionService } = require('./lib/shared/decisionService.js')
const { groupAnswersWithJev } = require('./lib/shared/jevGrouping.js')
const { normalizeAnswer } = require('./lib/shared/normalizeAnswer.js')
const { scoreRoundAnswers } = require('./lib/games/flock-together/scoring.js')
const question = 'What is the most popular restaurant chain?'
const raw = ["McDonald's", 'mcdonalds', 'mcdonalsd', "McDonal's", 'mickeedees', 'Mickey D’s', 'Burger King', 'Chick-fil-A']
const normalized = Object.fromEntries(raw.map((answer, index) => [`player-${index}`, normalizeAnswer(answer)]))
const decisions = []
const service = new DecisionService()
const recordingService = { compareFlockBatch: async (...args) => {
  const result = await service.compareFlockBatch(...args)
  decisions.push(...result.map((decision) => ({ ...args[0].find(pair => pair.id === decision.id), ...decision })))
  return result
} }
const started = Date.now()
let report
try {
  const groups = await groupAnswersWithJev(question, Object.values(normalized), recordingService)
  const scoring = scoreRoundAnswers(normalized, groups, Object.keys(normalized))
  const expected = [...new Set(Object.values(normalized).slice(0, 6))].sort()
  const matched = groups.some(group => JSON.stringify([...group].sort()) === JSON.stringify(expected))
  report = { status: matched && groups.length === 3 ? 'pass' : 'mismatch', question, latencyMs: Date.now() - started,
    normalization: raw.map((answer, index) => ({ raw: answer, normalized: normalized[`player-${index}`] })),
    groups, scoring, decisions }
} catch (error) {
  report = { status: 'error', question, latencyMs: Date.now() - started, error: error.message, decisions }
}
const directory = path.join(root, 'validation-runs/jev', `${new Date().toISOString().replace(/[-:.TZ]/g, '')}-restaurant-grouping`)
await mkdir(directory, { recursive: true })
await writeFile(path.join(directory, 'report.json'), JSON.stringify(report, null, 2))
console.log(JSON.stringify({ directory, ...report }, null, 2))
assert.equal(report.status, 'pass', 'Restaurant variants should group together, with other chains separate; see report')
