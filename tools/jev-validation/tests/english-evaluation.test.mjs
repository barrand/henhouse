import { test } from 'node:test'
import assert from 'node:assert/strict'
import { aliasMatch, assertExperimentBudget, metrics, prediction, sweep, trace, validateCorpus } from '../lib/english-evaluation.mjs'
import { diagnosticCases, openHoldout, aliasCards } from '../fixtures/english-experiment.mjs'
import { developmentReview, supplementalCases } from '../fixtures/english-review.mjs'
import { reviewPredictions } from '../lib/english-review.mjs'
import { supplementalResults, supplementalThresholds } from '../lib/english-supplemental.mjs'

test('supplemental comparison pins thresholds and never pools away original errors',()=>{
  const original=[row('old',true,.1,{candidate:'grounded',split:'development'})]
  const current=supplementalCases.map(c=>row(c.id,c.expected,c.expected?.99:.01,{...c,candidate:'grounded'}))
  const result=supplementalResults(current,original).find(r=>r.candidate==='grounded')
  assert.deepEqual(supplementalThresholds,{baseline:.51,grounded:.64})
  assert.equal(result.original.fn,1)
  assert.equal(result.supplemental.fn,0)
  assert.equal(result.supplemental.cases,22)
  assert.equal(result.disputed.length,2)
  assert.equal(result.promotionEligible,false)
})

test('representativeness review preserves all development labels and disputed flags',()=>{
  const cases=diagnosticCases()
  assert.equal(developmentReview.length,240)
  for(const source of cases) {
    const review=developmentReview.find(row=>row.id===source.id)
    assert.equal(review.expected,source.expected)
    assert.equal(review.ambiguous,source.ambiguous)
  }
  for(const [secret,guess,bucket] of [['candy','sweets','ordinary-language'],['candy','confectionery','specialist-name'],['moon','natural satellite','specialist-name'],['refrigerator','refrigerating appliance','descriptive-phrase']]) {
    const reviewed=developmentReview.find(row=>row.secret===secret&&row.guess===guess)
    assert.equal(reviewed.expected,true);assert.equal(reviewed.ambiguous,false);assert.equal(reviewed.bucket,bucket)
  }
})

test('review replay keeps original metrics, cannot promote, and rejects label drift',()=>{
  const cases=diagnosticCases().map((c,i)=>row(c.id,c.expected,i%2?.1:.99,{...c}))
  const before=structuredClone(cases)
  const reviewed=reviewPredictions(cases,.64)
  assert.deepEqual(reviewed.original,metrics(cases,.64))
  assert.equal(reviewed.promotionEligible,false)
  assert.deepEqual(cases,before)
  assert.equal(Object.values(reviewed.byBucket).reduce((n,m)=>n+m.cases,0),236)
  assert.throws(()=>reviewPredictions([{...cases[0],expected:false}],.64),/does not match/)
})

test('supplemental probes are unmeasured development data with no holdout family leakage',()=>{
  assert.equal(supplementalCases.length,24)
  assert.equal(supplementalCases.filter(row=>row.expected).length,12)
  assert.equal(supplementalCases.filter(row=>row.ambiguous).length,2)
  const heldTerms=new Set(openHoldout().map(row=>row.secret))
  for(const probe of supplementalCases) {
    assert.equal(probe.status,'not-measured')
    assert.ok(probe.definition?.trim())
    assert.equal(heldTerms.has(probe.secret),false)
    assert.equal(heldTerms.has(probe.guess),false)
  }
})

const row = (id,expected,p,extra={}) => ({id,secret:'bicycle',guess:'bike',expected,critical:true,ambiguous:false,category:'test',local:{decision:null,reason:'semantic-required'},providerCalled:true,choice:p>=.5?'correct':'incorrect',probability:p,latencyMs:100,...extra})
test('corpus is balanced and concepts/reversed pairs remain isolated',()=>{
  const dev=diagnosticCases(), held=openHoldout()
  assert.equal(validateCorpus(dev,held,aliasCards).heldOutFamilies,100)
  const contaminated=structuredClone(held);contaminated[0].secret=dev[0].secret
  assert.throws(()=>validateCorpus(dev,contaminated,aliasCards),/leakage/)
})
test('critical false rejection is governed by rate gate, not zero-error gate',()=>{
  const rows=Array.from({length:200},(_,i)=>row(String(i),i<100,i===0?.6:i<100?.99:.01))
  const result=metrics(rows,.75)
  assert.equal(result.fn,1);assert.equal(result.criticalFalseWins.length,0);assert.equal(result.accuracyPass,true)
  rows[100]=row('100',false,.99)
  assert.equal(metrics(rows,.75).accuracyPass,false)
})
test('winning label is required as well as probability',()=>{
  assert.equal(prediction(row('x',true,.8,{choice:'incorrect'}),.75,false,[]).accepted,false)
})
test('aliases are direct and secret-specific, never transitive',()=>{
  const cards=[{secret:'a',forms:['b']},{secret:'b',forms:['c']}]
  assert.equal(aliasMatch(cards,'a','b'),true);assert.equal(aliasMatch(cards,'a','c'),false)
})
test('replayed alias metrics never pretend the original provider call was skipped',()=>{
  const events=trace(row('x',true,.1),.75,true,aliasCards)
  assert.equal(events.find(e=>e.stage==='provider').skipped,false)
  assert.equal(events.find(e=>e.stage==='provider').replayWouldSkip,true)
  assert.equal(events.at(-1).source,'alias')
})
test('threshold sweep is offline and chooses higher threshold on equal recall',()=>{
  const rows=[row('positive',true,.99),row('negative',false,.01)]
  assert.equal(sweep(rows).selected.threshold,.99)
})
test('ambiguous cases do not pad the accuracy denominator',()=>{
  assert.equal(metrics([row('a',true,.99),row('b',false,.99,{ambiguous:true})],.75).cases,1)
})
test('rescue never accepts after expiry, on outage, or below eligibility band',()=>{
  const rescue={choice:'correct',probability:.99,threshold:.9,outage:false}
  assert.equal(prediction(row('a',true,.3,{rescue,latencyMs:1900}),.75,false,[]).accepted,true)
  for(const extra of [{latencyMs:2001},{outage:true},{probability:.24},{rescue:{...rescue,outage:true}}]) {
    assert.equal(prediction(row('a',true,.3,{rescue,...extra}),.75,false,[]).accepted,false)
  }
})
test('experiment and subrun budgets stop before dispatch and reserve token headroom',()=>{
  assert.doesNotThrow(()=>assertExperimentBudget(3999,999,9_936_000))
  for(const args of [[4000,0,0],[0,1000,0],[0,0,9_936_001]]) assert.throws(()=>assertExperimentBudget(...args),/budget-exhausted/)
})
