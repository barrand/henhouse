import { metrics, prediction } from './english-evaluation.mjs'

// Pin the original diagnostic operating points before new predictions. Never
// threshold-sweep the small supplemental set or replace original failures.
export const supplementalThresholds = { baseline: .51, grounded: .64 }
export function supplementalResults(rows, historical) {
  return Object.entries(supplementalThresholds).map(([candidate, threshold]) => {
    const current = rows.filter(row => row.candidate === candidate)
    const original = historical.filter(row => row.candidate === candidate && row.split === 'development')
    return {
      candidate, threshold, supplemental: metrics(current, threshold), original: metrics(original, threshold),
      disputed: current.filter(row => row.ambiguous).map(row => ({ secret: row.secret, guess: row.guess, ...prediction(row, threshold, false, []) })),
      // Never pool a repeated regression with historical cases as independent data.
      promotionEligible: false,
    }
  })
}
export function supplementalMarkdown(report) {
  const lines = ['# Supplemental English probes', '', `Status: ${report.status}. ${report.reason ?? 'In progress.'}`, '',
    'Fixed diagnostic thresholds from the prior run; no aliases, rescue calls, threshold sweeps, or holdout inference.', '',
    '| Candidate | Threshold | New valid rejected | New false wins | Original valid rejected | Original false wins | Provider operations | p95 |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |']
  for (const result of report.supplementalCandidates ?? []) {
    const m = result.supplemental, o = result.original
    lines.push(`| ${result.candidate} | ${result.threshold} | ${m.fn}/${m.positives} | ${m.fp}/${m.negatives} | ${o.fn}/${o.positives} | ${o.fp}/${o.negatives} | ${m.providerOperations} | ${m.p95 ?? 'n/a'}ms |`)
  }
  lines.push('', '## Errors and policy questions', '')
  for (const result of report.supplementalCandidates ?? []) {
    for (const error of result.supplemental.errors) lines.push(`- ${result.candidate}: ${error.secret} → ${error.guess}; expected ${error.expected ? 'accept' : 'reject'}, ${error.decision.source}, probability ${error.probability ?? 'n/a'}.`)
    for (const row of result.disputed) lines.push(`- ${result.candidate}: ${row.secret} → ${row.guess}; policy-disputed, candidate ${row.accepted ? 'accepted' : 'rejected'} (${row.source}); not scored.`)
  }
  lines.push('', `Actual requests this run: ${report.requests - (report.priorRequests ?? 0)}. Cumulative requests: ${report.requests}. Successful-response input tokens this run: ${report.inputTokens - (report.priorInputTokens ?? 0)}.`, '',
    'Small development sample; original failures remain counted separately. Refrigerator/freezer repeats a regression. Local decisions are not model successes. Latency is direct harness operation timing, not HTTP gameplay timing. No promotion is authorized.')
  return lines.join('\n')+'\n'
}
