// Build first: npm --prefix functions run build
// Live semantic validation: node scripts/test-flock-context-grouping.mjs
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import path from 'node:path'
import { readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'

const root = path.resolve(import.meta.dirname, '..')
const require = createRequire(path.join(root, 'functions/package.json'))
process.loadEnvFile(path.join(root, 'functions/.env'))
// The local frontend env uses the older key name. Keep the alias confined to
// this validation process; never write credentials or include them in output.
if (!process.env.TYPESAFE_API_KEY) {
  const local = parseEnv(readFileSync(path.join(root, '.env.production'), 'utf8'))
  process.env.TYPESAFE_API_KEY = local.TYPESAFE_API_KEY || local.JEV_API_KEY
}
const { DecisionService } = require('./lib/shared/decisionService.js')
const { clusterJevPairs } = require('./lib/shared/jevGrouping.js')
const cases = [
  ['Which fictional invention do you wish existed?', 'teleportation', 'a teleporter', true],
  ['Which fictional invention do you wish existed?', 'time travel', 'a time machine', true],
  ['What superpower would you choose?', 'flying', 'flight', true],
  ['What superpower would you choose?', 'flight', 'a jetpack', false],
  ['What is the best programming language?', 'JavaScript', 'TypeScript', false],
  ['What is your favorite food?', 'pizza', 'Italian food', false],
  ['What animal makes the best pet?', 'dog', 'perro', true],
  ['What animal makes the best pet?', 'dog', 'cat', false],
  ['Which device would you buy?', 'a teleporter', 'a time machine', false],
  ['Which city would you visit?', 'NYC', 'New York City', true],
]
const service = new DecisionService()
const results = []
// Use the production adapter, deadline, and clustering threshold. Each case is
// isolated so this evaluates semantics without unrelated batch-context effects.
for (const [question, left, right, expected] of cases) {
  const started = Date.now()
  try {
    const canonical = [left, right].sort()
    const decisions = await service.compareFlockBatch([
      { id: 'p0_1', question, left: canonical[0], right: canonical[1] },
    ], 2000, new AbortController().signal)
    const merged = clusterJevPairs(canonical, decisions).length === 1
    results.push({ question, left, right, expected, merged,
      sameProbability: decisions[0].metadata.probabilities.same,
      latencyMs: Date.now() - started, pass: merged === expected })
  } catch (error) {
    results.push({ question, left, right, expected, error: error.message, pass: false })
  }
}
console.table(results)
assert.ok(results.every(result => result.pass), 'Context grouping validation failed; see cases above')
const batch = await service.compareFlockBatch(cases.map(([question, left, right], index) => ({
  id: `case${index}`, question, left, right,
})), 2000, new AbortController().signal)
const batchResults = batch.map((decision, index) => {
  const probability = decision.metadata.probabilities.same
  const merged = decision.sameMeaning && probability >= .8
  return { id: decision.id, expected: cases[index][3], merged, sameProbability: probability,
    pass: merged === cases[index][3] }
})
console.table(batchResults)
assert.ok(batchResults.every(result => result.pass), 'Batched context grouping validation failed')
