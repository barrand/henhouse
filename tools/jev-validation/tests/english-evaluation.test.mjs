import { test } from 'node:test'
import assert from 'node:assert/strict'
import { aliasMatch, assertExperimentBudget, metrics, prediction, sweep, trace, validateCorpus } from '../lib/english-evaluation.mjs'
import { diagnosticCases, openHoldout, aliasCards } from '../fixtures/english-experiment.mjs'

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
