import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import path from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'
import { evidenceFingerprint } from '../lib/report.mjs'
const root=path.resolve(import.meta.dirname,'../../..')
assert.match(process.env.FIRESTORE_EMULATOR_HOST??'',/^(localhost|127\.0\.0\.1):\d+$/)
const require=createRequire(path.join(root,'functions/package.json'))
const live=process.argv.includes('--live')
if(live) process.loadEnvFile(path.join(root,'functions/.env'))
const api=require('./lib/index.js'), admin=require('firebase-admin')
const {Timestamp}=require('firebase-admin/firestore')
const {DecisionService}=require('./lib/shared/decisionService.js')
const {scoreJevRound}=require('./lib/games/flock-together/jevScoring.js')
const gemini=require('./lib/shared/gemini.js')
let geminiCalls=0,requests=0,inputTokens=0
gemini.groupAnswersWithGemini=async()=>{geminiCalls++;throw Error('Gemini blocked')}
const actualFetch=globalThis.fetch
globalThis.fetch=async(...args)=>{
  const provider=String(args[0]).includes('typesafe')
  if(provider && requests>=500) throw Error('Playtest validation request budget exceeded')
  if(provider) requests++
  const response=await actualFetch(...args)
  if(provider) {
    if(response.ok) {const body=await response.clone().json();inputTokens+=body.usage?.input_tokens??0}
  }
  return response
}
const realCompare=DecisionService.prototype.compareFlockBatch
if(!live) DecisionService.prototype.compareFlockBatch=async inputs=>inputs.map(p=>({id:p.id,sameMeaning:[p.left,p.right].sort().join('/')==='bicycle/bike',metadata:{provider:'jev',latencyMs:0,fallbackUsed:false,probabilities:{same:[p.left,p.right].sort().join('/')==='bicycle/bike'?.99:.01}}}))
const db=admin.firestore(), checks=[],games=[]
const call=(name,uid,data)=>api[name].run({auth:{uid},data})
const started=Date.now()
try {
  await db.doc('aiExperimentConfig/jev').set({admissionEnabled:true,mode:'jev',approvedConfigVersion:'jev-playtest-v2',enabledOperations:{clue:true,guess:true,grouping:true}})
  for(const count of [5,10,20,30,40]) {
    const host=`flock-host-${count}`
    const created=await call('flockCreateGame',host,{playerName:'Synthetic host',experimental:true})
    const gameRef=db.doc(`games/${created.gameId}`)
    const players=[host,...Array.from({length:count-1},(_,i)=>`flock-${count}-${i}`)]
    for(const uid of players.slice(1)) await call('joinGame',uid,{code:created.code,playerName:uid})
    await assert.rejects(()=>call('updateCategories',host,{gameId:created.gameId,categories:['birds']}))
    await call('flockStartGame',host,{gameId:created.gameId})
    const timings=[]
    for(let n=1;n<=10;n++) {
      const roundRef=gameRef.collection('rounds').doc(String(n))
      await roundRef.update({question:'Name a pedal-powered two-wheeled vehicle.',type:'open',options:null,deadline:Timestamp.fromMillis(Date.now()+60_000)})
      const majority=count-1
      for(let i=0;i<count;i++) await call('submitAnswer',players[i],{gameId:created.gameId,roundNum:n,answer:i===count-1?'car':i%2?'bike':'bicycle'})
      const round=(await roundRef.get()).data()
      assert.equal(round.status,'scored');assert.equal(round.commentary,'');assert.equal(round.groupSource,'jev')
      assert.equal(Object.values(round.pointsThisRound).filter(p=>p===1).length,majority)
      assert.equal(round.pointsThisRound[players.at(-1)],-1)
      const before=(await gameRef.collection('players').get()).docs.map(d=>[d.id,d.data().score]).sort()
      await Promise.all(Array.from({length:4},()=>call('forceEndRound',host,{gameId:created.gameId})))
      assert.deepEqual((await gameRef.collection('players').get()).docs.map(d=>[d.id,d.data().score]).sort(),before)
      for(let i=0;i<count;i++) assert.equal((await gameRef.collection('players').doc(players[i]).get()).data().score,n*(i===count-1?-1:1))
      timings.push({round:n,groups:round.answerGroups.length})
      await call('flockAdvanceRound',host,{gameId:created.gameId})
    }
    assert.equal((await gameRef.get()).data().status,'finished')
    games.push({players:count,rounds:timings});process.stdout.write(`PASS ${count} players, 10 rounds, cumulative scores and duplicate reveal\n`)
  }
  // Recovery, controls and outages use mocked provider faults even in live mode.
  const g=db.doc('games/flock-recovery'),r=g.collection('rounds').doc('1')
  await g.set({status:'playing',hostId:'h',originalHostId:'h',currentRound:1,playerIds:['h','p','q'],aiExperiment:{mode:'jev'}})
  for(const uid of ['h','p','q']) await g.collection('players').doc(uid).set({score:0})
  await r.set({status:'answering',question:'q',type:'open',eligiblePlayerIds:['h','p','q']})
  for(const [uid,text] of [['h','bike'],['p','bicycle'],['q','car']]) await r.collection('answers').doc(uid).set({text})
  let release, entered
  const ready=new Promise(resolve=>{entered=resolve}),gate=new Promise(resolve=>{release=resolve})
  DecisionService.prototype.compareFlockBatch=async inputs=>{entered();await gate;return inputs.map(p=>({id:p.id,sameMeaning:true,metadata:{probabilities:{same:.99}}}))}
  const late=scoreJevRound(g.id,1);await ready
  await r.update({scoringExpiresAt:Timestamp.fromMillis(1)})
  DecisionService.prototype.compareFlockBatch=async()=>{throw Error('synthetic outage')}
  await scoreJevRound(g.id,1);release();await late
  assert.equal((await r.get()).data().groupSource,'deterministic-fallback')
  assert.deepEqual((await r.get()).data().pointsThisRound,{h:0,p:0,q:0})
  checks.push('expired claim recovery discards late results; outage discards whole matrix')
  await r.update({status:'answering'})
  await db.doc('aiExperimentConfig/jev').update({'enabledOperations.grouping':false})
  DecisionService.prototype.compareFlockBatch=async()=>{throw Error('must not call disabled provider')}
  await scoreJevRound(g.id,1)
  assert.equal((await r.get()).data().groupSource,'deterministic-fallback')
  checks.push('runtime kill switch falls back deterministically')
  assert.equal(geminiCalls,0)
  const directory=path.join(root,'validation-runs/jev',new Date().toISOString().replace(/[-:.TZ]/g,'')+'-flock-playtest')
  await mkdir(directory,{recursive:true})
  const report={status:'pass',profile:live?'live':'mock',scope:'Firestore emulator callable handlers, five player counts x ten rounds, synthetic questions, three unique answers. Not HTTP/browser or 40-unique-answer live performance evidence.',evidence:await evidenceFingerprint(root),games,checks,requests,inputTokens,geminiCalls,elapsedMs:Date.now()-started}
  await writeFile(path.join(directory,'report.json'),JSON.stringify(report,null,2))
  process.stdout.write(JSON.stringify({directory,status:report.status,requests,inputTokens})+'\n')
} finally {DecisionService.prototype.compareFlockBatch=realCompare;globalThis.fetch=actualFetch;await admin.app().delete()}
