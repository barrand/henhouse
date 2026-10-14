import { createRequire } from 'node:module'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { aliasCards, developmentCards, diagnosticCases, openHoldout, labelHistory, disputedLocalRules } from '../fixtures/english-experiment.mjs'
import { aliasMatch, assertExperimentBudget, comparisonMarkdown, hash, metrics, sweep, trace, validateCorpus } from '../lib/english-evaluation.mjs'
import { evidenceFingerprint } from '../lib/report.mjs'
const root = path.resolve(import.meta.dirname, '../../..')
const require = createRequire(path.join(root, 'functions/package.json'))
const { DecisionService, JEV_MODEL } = require('./lib/shared/decisionService.js')
const { TypeSafeClient } = require('@typesafe-ai/sdk')
const { deterministicGuess, experimentalGuessLocal, isObviouslySameAsSecretWord } = {
  ...require('./lib/shared/gemini.js'), ...require('./lib/games/fowl-words/clueValidation.js'),
}
const development = diagnosticCases()
const heldForSchemaOnly = openHoldout()
const coverage = validateCorpus(development,heldForSchemaOnly,aliasCards)
const sealedHash = hash(heldForSchemaOnly)
const command = process.argv.includes('--offline') ? 'offline' : 'live'
const directory = path.join(root,'validation-runs/jev',new Date().toISOString().replace(/[-:.TZ]/g,'')+'-english-experiment')
await mkdir(directory,{recursive:true})
const evidence = await evidenceFingerprint(root)
const rubricHash = hash(await readFile(path.join(root,'functions/src/shared/decisionService.ts'),'utf8'))
const report = { status: 'incomplete', model: JEV_MODEL, coverage, evidence, rubricHash, aliasHash: hash(aliasCards), sealedHash, labelHistory, localAudit: disputedLocalRules.map(row => ({ ...row, currentRejects: isObviouslySameAsSecretWord(row.clue,row.secret) })), stages: [], limits: { perStageRequests: 1000, perStageTokens: 10_000_000, experimentRequests: 4000 }, requests: 0, inputTokens: 0, selection: null, heldOut: [] }
const priorIndex=process.argv.indexOf('--prior')
if(priorIndex>=0) {
  const priorPath=path.resolve(process.argv[priorIndex+1])
  const prior=JSON.parse(await readFile(path.join(priorPath,'report.json'),'utf8'))
  if(prior.heldOut?.length && prior.sealedHash===sealedHash) throw new Error('Retuning requires a new independent holdout')
  if(prior.heldOut?.length) {
    const oldPredictions=JSON.parse(await readFile(path.join(priorPath,'predictions.json'),'utf8'))
    const exposedFamilies=new Set(oldPredictions.filter(row=>row.split==='held-out').map(row=>row.family))
    if(heldForSchemaOnly.some(row=>exposedFamilies.has(row.family))) throw new Error('New holdout must use unexposed concept families, not reworded old cases')
  }
  report.priorRun=priorPath; report.priorRequests=prior.requests
  report.requests=prior.requests;report.inputTokens=prior.inputTokens
}
const captured = []
const requestEvents = []
let stageRequests = 0, stageTokens = 0, budgetExhausted = false
async function save() {
  if(report.stages.length) Object.assign(report.stages.at(-1),{requests:stageRequests,inputTokens:stageTokens})
  await writeFile(path.join(directory,'report.json'), JSON.stringify(report,null,2))
  await writeFile(path.join(directory,'predictions.json'), JSON.stringify(captured,null,2))
  await writeFile(path.join(directory,'requests.jsonl'),requestEvents.map(event=>JSON.stringify(event)).join('\n'))
  await writeFile(path.join(directory,'resources.json'),JSON.stringify({aliases:aliasCards,developmentMeanings:developmentCards,model:JEV_MODEL,rubricHash,sealedHash},null,2))
  await writeFile(path.join(directory,'comparison.md'),comparisonMarkdown(report))
  await writeFile(path.join(directory,'summary.md'), `# English decision experiment\n\nStatus: ${report.status}\n\n${report.reason ?? 'Experiment in progress.'}\n\nRequests: ${report.requests}\nInput tokens (successful responses): ${report.inputTokens}\n\n${report.stages.map(s => `- ${s.name}: ${s.status ?? 'recorded'}`).join('\n')}\n\nSelection: ${JSON.stringify(report.selection)}\n\nFull details: report.json and predictions.json\n`)
}
function stage(name) {
  if(report.stages.length) Object.assign(report.stages.at(-1),{requests:stageRequests,inputTokens:stageTokens,finishedAt:new Date().toISOString()})
  stageRequests=0; stageTokens=0
  report.stages.push({ name,startedAt:new Date().toISOString() })
  process.stdout.write(`${name}\n`)
}
try {
  if (command === 'offline') {
    report.reason = 'Offline corpus, policy-label history, and local-rule audit completed; live strategy comparison is required.'
    report.stages.push({name:'schema-and-routing',status:'pass'})
    await save(); process.stdout.write(directory+'\n'); process.exitCode=2
  } else {
    if (!process.env.TYPESAFE_API_KEY) process.loadEnvFile(path.join(root,'functions/.env'))
    if (!process.env.TYPESAFE_API_KEY?.trim()) throw new Error('missing-credential')
    const client = new TypeSafeClient({apiKey: process.env.TYPESAFE_API_KEY,logLevel:'off',fetch:async(url,init)=>{
      try {assertExperimentBudget(report.requests,stageRequests,stageTokens)} catch {budgetExhausted=true;throw new Error('budget-exhausted')}
      report.requests++; stageRequests++
      const event={number:report.requests,stage:report.stages.at(-1).name,body:JSON.parse(init.body),startedAt:new Date().toISOString()}
      requestEvents.push(event)
      try {
        const response=await fetch(url,init)
        event.status=response.status;event.finishedAt=new Date().toISOString()
        return response
      } catch(error) {event.errorCategory='transport-error';event.finishedAt=new Date().toISOString();throw error}
    }})
    const service = new DecisionService(()=>client)
    const cache = new Map()
    async function evaluate(fixture,candidate,aliases=false) {
      const key = `${candidate}/${fixture.id}`
      if (cache.has(key)) return cache.get(key)
      const start = Date.now()
      const row = { ...fixture, candidate, local: experimentalGuessLocal(fixture.secret,fixture.guess), legacyDecision: deterministicGuess(fixture.secret,fixture.guess), providerCalled:false, outage:false, latencyMs:0 }
      if (row.local.decision === null && !(aliases && aliasMatch(aliasCards,row.secret,row.guess))) {
        row.providerCalled=true
        try {
          const decision = await service.evaluateFowlWordsGuess({secretWord:fixture.secret,guess:fixture.guess},candidate==='baseline'?undefined:{rubric:candidate,definition:fixture.definition})
          row.choice=decision.correct?'correct':'incorrect'; row.probability=decision.metadata.probabilities.correct; row.probabilities=decision.metadata.probabilities
          const tokens=decision.metadata.inputTokens??0; report.inputTokens+=tokens;stageTokens+=tokens
        } catch {
          if (budgetExhausted) throw new Error('budget-exhausted')
          row.outage=true;row.errorCategory='provider-error'
        }
      }
      row.latencyMs=Date.now()-start
      cache.set(key,row); captured.push(row)
      if(captured.length%50===0) { process.stdout.write(`Captured ${captured.length}; requests=${report.requests}\n`); await save() }
      return row
    }
    async function rescue(row,baseThreshold,alternate) {
      if(row.ambiguous || row.local.decision!==null || row.outage || row.probability < .25 || row.probability >= baseThreshold || row.latencyMs>=2000) return row
      const rescued={...row,rescue:{alternate,timingMode:'replayed-first-plus-live-second',threshold:.75,outage:false}}
      const start=Date.now()
      try {
        const decision=await service.evaluateFowlWordsGuess({secretWord:row.secret,guess:row.guess},{rubric:alternate,definition:row.definition,deadlineMs:2000-row.latencyMs,maxRetries:0})
        rescued.rescue.choice=decision.correct?'correct':'incorrect';rescued.rescue.probability=decision.metadata.probabilities.correct
        const tokens=decision.metadata.inputTokens??0;report.inputTokens+=tokens;stageTokens+=tokens
      } catch {
        if(budgetExhausted) throw new Error('budget-exhausted')
        rescued.rescue.outage=true
      }
      rescued.latencyMs=row.latencyMs+Date.now()-start
      return rescued
    }
    stage('screen-120')
    const screening = development.slice(0,120)
    const screens = {}
    for(const candidate of ['baseline','simple','grounded']) {
      const rows=[]
      for(const fixture of screening) rows.push(await evaluate(fixture,candidate))
      screens[candidate]=sweep(rows)
    }
    report.screening=screens
    const provisional = candidate => screens[candidate].selected ?? screens[candidate].results.find(r=>r.threshold===.75)
    const challengers=['simple','grounded'].sort((a,b)=>{
      const x=provisional(a).metrics,y=provisional(b).metrics
      return Number(y.accuracyPass)-Number(x.accuracyPass) || x.fp-y.fp || x.fn-y.fn || (x.p95??Infinity)-(y.p95??Infinity) || a.localeCompare(b)
    })
    const challenger=challengers[0]
    stage('expand-240-and-alias-replay')
    const comparisons=[]
    for(const candidate of ['baseline',challenger]) {
      const rows=[]
      for(const fixture of development) rows.push(await evaluate(fixture,candidate))
      for(const aliases of [false,true]) {
        const result=sweep(rows,aliases,aliasCards)
        comparisons.push({candidate,aliases,...result})
      }
    }
    report.development=comparisons
    if(!comparisons.some(c=>c.selected)) {
      const base=comparisons.filter(c=>c.candidate===challenger).sort((a,b)=>Number(a.aliases)-Number(b.aliases))[0]
      const provisional=[...base.results].sort((a,b)=>a.metrics.fp-b.metrics.fp||a.metrics.fn-b.metrics.fn||b.threshold-a.threshold)[0]
      const originals=development.map(fixture=>cache.get(`${challenger}/${fixture.id}`))
      if(originals.some(row=>row.expected&&!row.ambiguous&&row.probability>=.25&&row.probability<provisional.threshold)) {
        stage('conditional-rescue-development')
        const alternate=challenger==='grounded'?'simple':'grounded'
        const rescued=[]
        for(const row of originals) rescued.push(await rescue(row,provisional.threshold,alternate))
        const results=[]
        for(let percent=50;percent<=99;percent++) {
          for(const row of rescued) if(row.rescue) row.rescue.threshold=percent/100
          results.push({threshold:percent/100,metrics:metrics(rescued,provisional.threshold,false,aliasCards)})
        }
        const passing=results.filter(r=>r.metrics.accuracyPass).sort((a,b)=>b.metrics.recall-a.metrics.recall||a.metrics.falseAcceptance-b.metrics.falseAcceptance||b.threshold-a.threshold)
        for(const row of rescued) if(row.rescue) {
          row.rescue.threshold=passing[0]?.threshold??.75
          row.trace=trace(row,provisional.threshold,false,aliasCards)
        }
        report.rescueExperiment={candidate:challenger,alternate,baseThreshold:provisional.threshold,results,selected:passing[0]??null,rows:rescued}
        if(passing.length) comparisons.push({candidate:challenger,aliases:false,rescue:{alternate,baseThreshold:provisional.threshold,rescueThreshold:passing[0].threshold},selected:{threshold:provisional.threshold,metrics:passing[0].metrics}})
      }
    }
    const eligible=comparisons.filter(c=>c.selected).sort((a,b)=>{
      const x=a.selected.metrics,y=b.selected.metrics
      return y.recall-x.recall || x.falseAcceptance-y.falseAcceptance || Number(!!a.rescue)-Number(!!b.rescue) || (y.perStage.alias?.cases??0)-(x.perStage.alias?.cases??0) || (x.p95??Infinity)-(y.p95??Infinity) || Number(a.aliases)-Number(b.aliases)
    })
    if(!eligible.length) {
      report.status='fail'
      report.reason='No development candidate/threshold meets accuracy and false-win/rejection gates. Holdout remains sealed; conditional rescue results are recorded when eligible failures justified testing it.'
      report.deferred = { threeWay: 'Deferred: no scored related-word false wins observed in this comparison.', multiQuestion: 'Deferred: no evidence yet that a relatedness veto addresses the observed false rejections.' }
    } else {
      const winner=eligible[0]
      report.selection={candidate:winner.candidate,aliases:winner.aliases,threshold:winner.selected.threshold,rescue:winner.rescue??null,rubricHash,aliasHash:report.aliasHash,sealedHash,model:JEV_MODEL}
      await writeFile(path.join(directory,'selection.json'),JSON.stringify(report.selection,null,2))
      await save()
      const holdout=openHoldout()
      if(hash(holdout)!==sealedHash) throw new Error('holdout-seal-mismatch')
      for(let execution=1;execution<=3;execution++) {
        stage(`held-out-${execution}`)
        cache.clear()
        const rows=[]
        for(const fixture of holdout) {
          const operationStarted=Date.now()
          let row=await evaluate(fixture,winner.candidate,winner.aliases)
          const original=row
          if(winner.rescue) {
            row.latencyMs=Math.max(row.latencyMs,Date.now()-operationStarted)
            row=await rescue(row,winner.selected.threshold,winner.rescue.alternate)
            if(row.rescue) {row.rescue.threshold=winner.rescue.rescueThreshold;row.rescue.timingMode='sequential-live'}
            row.latencyMs=Date.now()-operationStarted
          }
          row.execution=execution
          if(row!==original) captured[captured.indexOf(original)]=row
          rows.push(row)
        }
        const result=metrics(rows,winner.selected.threshold,winner.aliases,aliasCards)
        for(const row of rows) row.trace=trace(row,winner.selected.threshold,winner.aliases,aliasCards)
        report.heldOut.push({execution,...result})
        await save()
      }
      const passing=report.heldOut.every(result=>result.accuracyPass&&result.performancePass)
      report.status=passing?'incomplete':'fail'
      report.reason=passing?'English semantic gates pass three executions. Multilingual gates and HTTP game validation still block FW-5 promotion.':'Frozen candidate failed an English held-out gate; preserve all results and obtain a fresh holdout before retuning.'
    }
    for(const row of captured) if(!row.trace) row.trace=trace(row,.75,false,aliasCards)
    report.recommendation=report.selection ? 'Validate the frozen selection; English success alone does not authorize promotion.' : 'Prefer the grounded rubric for further development; keep gameplay unchanged because no configuration passes. Do not expand aliases to patch observed failures without a separately versioned review.'
    await save()
    process.stdout.write(JSON.stringify({directory,status:report.status,requests:report.requests,selection:report.selection,reason:report.reason})+'\n')
    process.exitCode=report.status==='fail'?1:2
  }
} catch(error) {
  report.status='incomplete';report.reason=error.message==='budget-exhausted'?'Experiment budget exhausted; holdout evidence is incomplete.':error.message==='missing-credential'?'Local server credential unavailable.':'Experiment could not complete; inspect runner and corpus checks.'
  await save();process.stdout.write(JSON.stringify({directory,status:report.status,reason:report.reason})+'\n');process.exitCode=2
}
