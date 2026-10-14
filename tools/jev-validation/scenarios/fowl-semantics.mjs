import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { fowlCorpus, validateFowlCorpus } from '../fixtures/fowl-corpus.mjs'
import { evidenceFingerprint } from '../lib/report.mjs'
const require = createRequire(new URL('../../../functions/package.json', import.meta.url))
const { DecisionService, JEV_MODEL } = require('./lib/shared/decisionService.js')
const { TypeSafeClient } = require('@typesafe-ai/sdk')
const { validateClueForSubmission } = require('./lib/games/fowl-words/clueValidation.js')
const { deterministicGuess } = require('./lib/shared/gemini.js')
const { acceptsJevClue, acceptsJevGuess } = require('./lib/shared/jevPolicy.js')
const root = path.resolve(import.meta.dirname, '../../..')
if (!process.env.TYPESAFE_API_KEY) process.loadEnvFile(path.join(root, 'functions/.env'))
if (!process.env.TYPESAFE_API_KEY?.trim()) throw new Error('Server credential unavailable')
const corpus = fowlCorpus()
const coverage = validateFowlCorpus(corpus)
if (process.argv.includes('--challenge-only')) {
  corpus.clues = corpus.clues.filter(r => r.split === 'challenge')
  corpus.guesses = corpus.guesses.filter(r => r.split === 'challenge')
}
const runDir = path.join(root, 'validation-runs/jev', new Date().toISOString().replace(/[-:.TZ]/g, '') + '-semantics')
await mkdir(runDir, { recursive: true })
let requests = 0, inputTokens = 0
const client = new TypeSafeClient({ apiKey: process.env.TYPESAFE_API_KEY, logLevel: 'off', fetch: async (url, init) => {
  if (requests >= 1000 || inputTokens + 64000 > 10_000_000) throw new Error('Live budget exhausted')
  requests++
  return fetch(url, init)
} })
const service = new DecisionService(() => client)
const results = []
for (const operation of ['clues', 'guesses']) {
  // Development is recorded separately; provisional threshold is never silently
  // tuned on holdout. A failed gate requires a new reviewed configuration.
  for (const row of corpus[operation]) {
    let decision, predicted, provider = false, outage = false
    const start = Date.now()
    if (operation === 'clues') {
      const validation = await validateClueForSubmission(row.clue, row.secret, async (clue, secretWord) => {
        provider = true
        try {
          decision = await service.classifyFowlWordsClue({ clue, secretWord })
          inputTokens += decision.metadata.inputTokens ?? 0
          return { allowed: acceptsJevClue(decision), reason: 'single_word', tooCloseToSecret: false }
        } catch { outage = true; return null }
      })
      predicted = validation.valid
    } else {
      predicted = deterministicGuess(row.secret, row.guess)
      if (predicted === null) {
        provider = true
        try {
          decision = await service.evaluateFowlWordsGuess({ guess: row.guess, secretWord: row.secret })
          inputTokens += decision.metadata.inputTokens ?? 0
          predicted = acceptsJevGuess(decision)
        } catch { outage = true; predicted = false }
      }
    }
    results.push({ id: row.id, split: row.split, category: row.category, critical: row.critical, expected: row.expected, predicted, provider, outage, latencyMs: Date.now() - start, probabilities: decision?.metadata.probabilities })
    if (results.length % 50 === 0) process.stdout.write(`Evaluated ${results.length}/${corpus.clues.length + corpus.guesses.length}; requests=${requests}\n`)
  }
}
function metrics(rows, operation) {
  const held = rows.filter(r => r.split === (process.argv.includes('--challenge-only') ? 'challenge' : 'held-out'))
  const tp = held.filter(r => r.expected && r.predicted).length, tn = held.filter(r => !r.expected && !r.predicted).length
  const fp = held.filter(r => !r.expected && r.predicted).length, fn = held.filter(r => r.expected && !r.predicted).length
  const live = rows.filter(r => r.provider), times = live.map(r => r.latencyMs).sort((a,b) => a-b)
  const p95 = times[Math.ceil(times.length * .95)-1] ?? null
  const accuracy = (tp+tn)/held.length, falseAcceptance = fp/(tn+fp), falseRejection = fn/(tp+fn)
  const outages = live.filter(r => r.outage).length
  const criticalErrors = held.filter(r => r.critical && r.expected !== r.predicted && (operation === 'clues' || !r.expected)).map(r => r.id)
  const perCategory = Object.fromEntries([...new Set(held.map(r => r.category))].map(category => [category, { cases: held.filter(r => r.category === category).length, errors: held.filter(r => r.category === category && r.expected !== r.predicted).length }]))
  const z = 1.96, n = held.length, denominator = 1 + z*z/n
  const center = (accuracy+z*z/(2*n))/denominator
  const margin = z*Math.sqrt(accuracy*(1-accuracy)/n+z*z/(4*n*n))/denominator
  return { heldOut: held.length, tp, tn, fp, fn, accuracy, wilson95: [center-margin, center+margin], falseAcceptance, falseRejection, perCategory, criticalErrors, liveOperations: live.length, outages, p95, pass: accuracy >= .98 && falseAcceptance <= .01 && falseRejection <= .02 && !criticalErrors.length && live.length >= 200 && p95 < 1000 && outages/live.length < .01 }
}
const clueIds = new Set(corpus.clues.map(r => r.id))
const developmentSweep = []
for (let percent = 50; percent <= 99; percent++) {
  const threshold = percent / 100
  const development = results.filter(r => r.split === 'development' && !clueIds.has(r.id))
  const errors = development.filter(r => r.expected !== (r.provider ? !r.outage && (r.probabilities?.correct ?? 0) >= threshold : r.predicted))
  const falseWins = errors.filter(r => !r.expected)
  developmentSweep.push({ threshold, errors: errors.map(r => r.id), passesCriticalGate: development.length >= 100 && !falseWins.some(r => r.critical) })
}
const report = { status: 'incomplete', reason: 'Thresholds remain provisional. Promotion requires a development threshold that passes, fresh independent holdout after rubric tuning, and the complete supported game matrix.', evidence: await evidenceFingerprint(root), model: JEV_MODEL, threshold: .75, developmentSweep, corpusHash: createHash('sha256').update(JSON.stringify(corpus)).digest('hex'), coverage, requests, inputTokens, metrics: { clues: metrics(results.filter(r => clueIds.has(r.id)), 'clues'), guesses: metrics(results.filter(r => !clueIds.has(r.id)), 'guesses') } }
await writeFile(path.join(runDir, 'semantic-results.json'), JSON.stringify(results, null, 2))
await writeFile(path.join(runDir, 'report.json'), JSON.stringify(report, null, 2))
await writeFile(path.join(runDir, 'summary.md'), `# Fowl Words live semantic evaluation\n\nStatus: ${report.status}\n\n${report.reason}\n\nModel: ${JEV_MODEL}\nRequests: ${requests}\nInput tokens: ${inputTokens}\n\n\`\`\`json\n${JSON.stringify(report.metrics,null,2)}\n\`\`\`\n`)
process.stdout.write(JSON.stringify({ runDir, status: report.status, model: report.model, requests, inputTokens, metrics: report.metrics }) + '\n')
process.exitCode = Object.values(report.metrics).every(m => m.pass) ? 2 : 1
