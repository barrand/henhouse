import { createHash } from 'node:crypto'
export const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')
export const normalizeAlias = value => value.normalize('NFC').trim().toLowerCase().replace(/\s+/g, ' ')

export function assertExperimentBudget(requests, stageRequests, stageTokens) {
  if (requests >= 4000 || stageRequests >= 1000 || stageTokens + 64000 > 10_000_000) throw new Error('budget-exhausted')
}

export function aliasMatch(cards, secret, guess) {
  const card = cards.find(row => normalizeAlias(row.secret) === normalizeAlias(secret))
  return !!card?.forms.some(form => normalizeAlias(form) === normalizeAlias(guess))
}

export function prediction(row, threshold, aliases, cards) {
  if (row.local.decision !== null) return { accepted: row.local.decision, source: 'local', reason: row.local.reason }
  if (aliases && aliasMatch(cards, row.secret, row.guess)) return { accepted: true, source: 'alias', reason: 'verified-direct-form' }
  if (row.outage) return { accepted: false, source: 'fallback', reason: row.errorCategory }
  if (row.choice === 'correct' && row.probability >= threshold) return { accepted: true, source: 'probability-policy', reason: 'winning-label-and-threshold' }
  if (row.rescue && !row.rescue.outage && row.probability >= .25 && row.probability < threshold && row.latencyMs <= 2000 && row.rescue.choice === 'correct' && row.rescue.probability >= row.rescue.threshold) return { accepted: true, source: 'rescue', reason: 'bounded-alternate-rubric' }
  return { accepted: false, source: 'probability-policy', reason: 'winning-label-and-threshold' }
}

export function metrics(rows, threshold, aliases = false, cards = []) {
  const scored = rows.filter(row => !row.ambiguous).map(row => ({ ...row, final: prediction(row, threshold, aliases, cards) }))
  const count = predicate => scored.filter(predicate).length
  const positives = count(row => row.expected), negatives = scored.length - positives
  const fp = count(row => !row.expected && row.final.accepted), fn = count(row => row.expected && !row.final.accepted)
  const accuracy = scored.length ? 1 - (fp + fn) / scored.length : 0
  const criticalFalseWins = scored.filter(row => row.critical && !row.expected && row.final.accepted).map(row => row.id)
  const live = scored.filter(row => row.providerCalled && row.final.source !== 'alias')
  const times = live.map(row => row.latencyMs).sort((a,b) => a-b)
  const p95 = times[Math.ceil(times.length * .95) - 1] ?? null
  const outages = live.filter(row => row.outage).length
  const errors = scored.filter(row => row.expected !== row.final.accepted).map(row => ({ id: row.id, secret: row.secret, guess: row.guess, expected: row.expected, decision: row.final, probability: row.probability ?? null }))
  const groups = key => Object.fromEntries([...new Set(scored.map(row => key(row)))].map(group => {
    const subset = scored.filter(row => key(row) === group)
    return [group, { cases: subset.length, errors: subset.filter(row => row.expected !== row.final.accepted).length }]
  }))
  const n = scored.length || 1, z = 1.96, d = 1 + z*z/n
  const center = (accuracy + z*z/(2*n))/d, margin = z*Math.sqrt(accuracy*(1-accuracy)/n + z*z/(4*n*n))/d
  const falseAcceptance = negatives ? fp/negatives : null, falseRejection = positives ? fn/positives : null
  return {
    cases: scored.length, positives, negatives, ambiguous: rows.length - scored.length,
    tp: positives-fn, tn: negatives-fp, fp, fn, accuracy, falseAcceptance, falseRejection,
    recall: positives ? (positives-fn)/positives : 0, wilson95: [Math.max(0,center-margin), Math.min(1,center+margin)],
    criticalFalseWins, errors, perCategory: groups(row => row.category), perStage: groups(row => row.final.source),
    semantic: {
      cases: count(row => row.local.decision === null),
      errors: count(row => row.local.decision === null && row.expected !== row.final.accepted),
      accuracy: count(row => row.local.decision === null) ? 1-count(row => row.local.decision === null && row.expected !== row.final.accepted)/count(row => row.local.decision === null) : null,
      falseWins: count(row => row.local.decision === null && !row.expected && row.final.accepted),
      falseRejections: count(row => row.local.decision === null && row.expected && !row.final.accepted),
    },
    providerOperations: live.length, outages, p95,
    accuracyPass: !!positives && !!negatives && accuracy >= .98 && falseAcceptance <= .01 && falseRejection <= .02 && !criticalFalseWins.length,
    performancePass: live.length >= 200 && p95 < 1000 && outages/live.length < .01 && times.every(t => t <= 2000),
  }
}

export function sweep(rows, aliases = false, cards = []) {
  const results = Array.from({ length: 50 }, (_, i) => {
    const threshold = (50+i)/100
    return { threshold, metrics: metrics(rows, threshold, aliases, cards) }
  })
  const passing = results.filter(row => row.metrics.accuracyPass)
    .sort((a,b) => b.metrics.recall-a.metrics.recall || a.metrics.falseAcceptance-b.metrics.falseAcceptance || b.threshold-a.threshold)
  return { selected: passing[0] ?? null, results }
}

export function validateCorpus(development, heldOut, aliases) {
  for (const [name, rows, size, half] of [['development', development, 240, 120], ['held-out', heldOut, 400, 200]]) {
    if (rows.length !== size || rows.filter(r => r.expected).length !== half) throw new Error(`${name}: size or balance mismatch`)
    if (new Set(rows.map(r => r.id)).size !== size || new Set(rows.map(r => hash([r.secret,r.guess]))).size !== size) throw new Error(`${name}: duplicate cases`)
    if (new Set(rows.map(r => r.family)).size < 30) throw new Error(`${name}: insufficient families`)
    if (rows.some(r => !r.rationale || !r.definition)) throw new Error(`${name}: missing policy or meaning`)
  }
  const devSecrets = new Set(development.map(r => normalizeAlias(r.secret)))
  if (heldOut.some(r => devSecrets.has(normalizeAlias(r.secret)))) throw new Error('Secret family leakage')
  const developmentTerms = new Set(development.flatMap(r => [normalizeAlias(r.secret),normalizeAlias(r.guess)]))
  if (heldOut.some(r => developmentTerms.has(normalizeAlias(r.secret)))) throw new Error('Held-out concept appeared as a development guess')
  const pairs = new Set(development.map(r => hash([normalizeAlias(r.secret),normalizeAlias(r.guess)].sort())))
  if (heldOut.some(r => pairs.has(hash([normalizeAlias(r.secret),normalizeAlias(r.guess)].sort())))) throw new Error('Reversed pair leakage')
  if (aliases.length !== 30 || new Set(aliases.map(r => r.secret)).size !== 30) throw new Error('Alias set must contain 30 distinct secrets')
  return { development: development.length, screening: 120, heldOut: heldOut.length, heldOutFamilies: new Set(heldOut.map(r => r.family)).size, aliases: aliases.length }
}

export function trace(row, threshold, aliases, cards) {
  const match = aliases && aliasMatch(cards,row.secret,row.guess)
  return [
    { stage: 'input', secret: row.secret, guess: row.guess },
    { stage: 'local-rule', ...row.local, legacyDecision: row.legacyDecision },
    { stage: 'alias', enabled: aliases, match: !!match, skipped: row.local.decision !== null },
    { stage: 'provider', skipped: !row.providerCalled, replayWouldSkip: !!match, ...(row.providerCalled ? { choice: row.choice, probabilities: row.probabilities, errorCategory: row.errorCategory } : {}) },
    { stage: 'probability-policy', threshold, skipped: row.local.decision !== null || match || row.outage },
    ...(row.rescue ? [{ stage: 'rescue', ...row.rescue }] : []),
    { stage: 'final', ...prediction(row,threshold,aliases,cards) },
  ]
}

export function comparisonMarkdown(report) {
  const lines=['# English strategy comparison','',`Status: ${report.status}`, '', report.reason??'Experiment in progress.', '', '| Strategy | Best zero-false-win threshold | Correct rejected | Incorrect accepted | Accuracy | p95 |','| --- | ---: | ---: | ---: | ---: | ---: |']
  for(const candidate of report.development??[]) {
    if(!candidate.results) continue
    const best=[...candidate.results].filter(row=>!row.metrics.criticalFalseWins.length).sort((a,b)=>a.metrics.fn-b.metrics.fn||a.metrics.fp-b.metrics.fp||b.threshold-a.threshold)[0]
    if(!best) continue
    const m=best.metrics
    lines.push(`| ${candidate.candidate}${candidate.aliases?' + aliases (replay)':''} | ${best.threshold.toFixed(2)} | ${m.fn}/${m.positives} (${(100*m.falseRejection).toFixed(2)}%) | ${m.fp}/${m.negatives} | ${(100*m.accuracy).toFixed(2)}% | ${m.p95??'n/a'}ms |`)
  }
  lines.push('','These are development results, not held-out release evidence. Thresholds are diagnostic unless selection.json exists. Alias replay does not measure actual latency savings.','',`HTTP requests including prior runs: ${report.requests}. Successful-response input tokens: ${report.inputTokens}.`,'',`Fresh held-out executions: ${report.heldOut?.length??0}.`)
  if(report.rescueExperiment) {
    const r=report.rescueExperiment
    const best=[...r.results].sort((a,b)=>a.metrics.fp-b.metrics.fp||a.metrics.fn-b.metrics.fn||b.threshold-a.threshold)[0]
    lines.push('',`Rescue: ${r.rows.filter(row=>row.rescue).length} additional calls; best diagnostic result ${best.metrics.fn} false rejections and ${best.metrics.fp} false wins. Development timing combines recorded first-call time and a live second call; prospective held-out rescue must execute sequentially.`)
  }
  lines.push('','## Recommendation','',report.recommendation??'No development recommendation yet.','', 'The holdout is not evaluated until a passing development selection is frozen. English success does not remove the multilingual or game-validation requirements.')
  return lines.join('\n')+'\n'
}
