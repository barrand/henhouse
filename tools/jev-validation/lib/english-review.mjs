import { hash, metrics } from './english-evaluation.mjs'
import { developmentReview, reviewVersion, supplementalCases } from '../fixtures/english-review.mjs'

export function reviewPredictions(rows, threshold) {
  const reviews = new Map(developmentReview.map(row => [row.id, row]))
  const reviewed = rows.map(row => {
    const review = reviews.get(row.id)
    if (!review || review.secret !== row.secret || review.guess !== row.guess || review.expected !== row.expected || review.ambiguous !== row.ambiguous) {
      throw new Error(`Review does not match saved case: ${row.id}`)
    }
    return { ...row, representativeness: review.bucket }
  })
  return {
    threshold, original: metrics(rows, threshold),
    byBucket: Object.fromEntries([...new Set(reviewed.map(row => row.representativeness))].map(bucket =>
      [bucket, metrics(reviewed.filter(row => row.representativeness === bucket), threshold)])),
    disputed: reviewed.filter(row => row.ambiguous).map(row => ({ id: row.id, secret: row.secret, guess: row.guess })),
    // Explicitly not a release decision or a new threshold-selection dataset.
    promotionEligible: false,
  }
}

export function reviewArtifact(predictions, report) {
  const development = predictions.filter(row => row.split === 'development')
  return {
    version: reviewVersion, reviewHash: hash(developmentReview), predictionHash: hash(predictions),
    modelCalls: 0, labelsChanged: 0, exclusionsAdded: 0,
    limitation: 'Post-prediction reviewer judgment, not measured player frequency; bucket scores cannot replace original promotion gates. Simple has screening cases only.',
    cases: developmentReview, supplemental: supplementalCases,
    candidates: Object.fromEntries([...new Set(development.map(row => row.candidate))].map(candidate => {
      const stored = report.development.find(row => row.candidate === candidate && !row.aliases)
      const best = stored?.results.filter(row => !row.metrics.criticalFalseWins.length)
        .sort((a,b) => a.metrics.fn-b.metrics.fn || a.metrics.fp-b.metrics.fp || b.threshold-a.threshold)[0]
      return [candidate, reviewPredictions(development.filter(row => row.candidate === candidate), best?.threshold ?? .75)]
    })),
  }
}

export function reviewMarkdown(review) {
  const lines = ['# Development representativeness review', '',
    'No labels changed, no new exclusions, no new API calls. Original results and release gates remain authoritative. Buckets are reviewer judgments, not measured gameplay frequency.', '',
    '| Candidate | Bucket | Scored cases | Valid rejected | Incorrect accepted |',
    '| --- | --- | ---: | ---: | ---: |']
  for (const [name, result] of Object.entries(review.candidates)) {
    for (const [bucket, m] of [['ALL (original)', result.original], ...Object.entries(result.byBucket)]) {
      lines.push(`| ${name} @ ${result.threshold} | ${bucket} | ${m.cases}${m.ambiguous ? ` (+${m.ambiguous} already disputed)` : ''} | ${m.positives ? `${m.fn}/${m.positives}` : 'n/a'} | ${m.negatives ? `${m.fp}/${m.negatives}` : 'n/a'} |`)
    }
  }
  lines.push('## Remaining rejected valid guesses', '')
  for (const [name, result] of Object.entries(review.candidates)) {
    for (const error of result.original.errors.filter(row => row.expected)) {
      const card = review.cases.find(row => row.id === error.id)
      lines.push(`- ${name}: ${error.secret} → ${error.guess} (${card.bucket}; original valid label retained).`)
    }
  }
  lines.push('', '## Next development probes', '',
    'These are additional, unmeasured cases, not evidence of improvement. Two subtype questions are explicitly disputed. Existing freezer/refrigerator is an intentional regression repeat, not additional independent evidence.', '',
    '| Secret | Guess | Expected | Status |', '| --- | --- | --- | --- |')
  for (const row of review.supplemental) lines.push(`| ${row.secret} | ${row.guess} | ${row.ambiguous ? 'policy review' : row.expected ? 'accept' : 'reject'} | ${row.status} |`)
  lines.push('', review.limitation, '', 'No winner has been established by this review. Do not open the holdout based on a favorable subset.')
  return lines.join('\n')+'\n'
}
