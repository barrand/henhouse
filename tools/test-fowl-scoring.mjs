// Run with: firebase emulators:exec --only auth,firestore --project demo-fowl-scoring "node tools/test-fowl-scoring.mjs"
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { initializeApp as clientApp, deleteApp } from 'firebase/app'
import { connectAuthEmulator, getAuth, signInAnonymously } from 'firebase/auth'
import { connectFirestoreEmulator, getFirestore, doc, getDoc, updateDoc, terminate } from 'firebase/firestore'

assert.match(process.env.FIRESTORE_EMULATOR_HOST ?? '', /^(127\.0\.0\.1|localhost):\d+$/)
assert.match(process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '', /^(127\.0\.0\.1|localhost):\d+$/)
const require = createRequire(new URL('../functions/package.json', import.meta.url))
const admin = require('firebase-admin')
admin.initializeApp({ projectId: 'demo-fowl-scoring' })
const db = admin.firestore()
const gemini = require('./lib/shared/gemini.js')
let providerCalls = 0
let groupingCalls = 0
let answerGate
gemini.classifyFowlWordsClue = async () => ({ allowed:true, reason:'single_word', tooCloseToSecret:false })
gemini.detectDuplicateClues = async (_secret, clues) => {
  groupingCalls++
  const groups = new Map()
  for (const [uid, clue] of Object.entries(clues)) { const key = clue.toLowerCase().replace(/s$/, ''); groups.set(key, [...groups.get(key) ?? [], uid]) }
  return { groups:[...groups.values()], reason:'local test fixture' }
}
gemini.evaluateGuess = async () => { providerCalls++; if (answerGate) await answerGate; return false }
const { fowlWordsScoringAction: action, fowlWordsUpdateScoring: settings, startScoringRound, scoringAvailable } = require('./lib/games/fowl-words/scoringEngine.js')
const { submitClue: legacySubmitClue, fowlWordsForceDedup: legacyForceDedup } = require('./lib/games/fowl-words/index.js')
const { recommendedRules } = require('./lib/games/fowl-words/rules.js')
const clients=[]
const invoke=(fn,uid,data)=>fn.run({auth:{uid},data})
const authHost=process.env.FIREBASE_AUTH_EMULATOR_HOST
const [fsHost,fsPort]=process.env.FIRESTORE_EMULATOR_HOST.split(':')
const [authName,authPort]=authHost.split(':')
async function client() {
  const app=clientApp({projectId:'demo-fowl-scoring',apiKey:'fake-key',authDomain:'localhost'},`test-${Date.now()}-${clients.length}`)
  const auth=getAuth(app); connectAuthEmulator(auth,`http://${authName}:${authPort}`,{disableWarnings:true})
  const fs=getFirestore(app); connectFirestoreEmulator(fs,fsHost,Number(fsPort))
  const user=(await signInAnonymously(auth)).user
  const c={app,fs,uid:user.uid}; clients.push(c); return c
}
let serial=0
async function room(mode='best-clues-first', count=6) {
  const host=await client()
  const id=`scoring-test-${Date.now()}-${serial++}`
  const players=[host.uid,...Array.from({length:count-1},(_,i)=>`giver-${i}`)]
  const rules=recommendedRules(mode)
  await db.doc(`games/${id}`).set({gameType:'fowl-words',hostId:host.uid,originalHostId:host.uid,playerIds:players,currentRound:0,currentGuesser:null,status:'lobby',scoringEngineVersion:1,scoringRules:rules,scoringRevision:0,settings:{totalRounds:3,secondsPerRound:60},aiExperiment:{mode:'legacy'}})
  for(const uid of players) await db.doc(`games/${id}/players/${uid}`).set({name:uid,score:0})
  await startScoringRound(id,host.uid,['volcano','ocean','forest','house','river','tree','cloud','stone','bird'])
  const state=db.doc(`games/${id}/rounds/1/private/state`)
  return {id,host,players,state,rules}
}
const read=async r=>(await r.state.get()).data()
const run=(r,uid,kind,extra={})=>invoke(action,uid,{gameId:r.id,roundNum:1,action:kind,...extra})
async function write(r,change){await r.state.update(change)}
async function openSubmission(r){await write(r,{selectionOpensAt:Date.now()-1});for(const uid of r.players.slice(1))await run(r,uid,'word-vote',{index:0});await write(r,{deadline:Date.now()-1});await run(r,r.host.uid,'tick')}
async function submit(r,clues){await openSubmission(r);for(let i=0;i<clues.length;i++)await run(r,r.players[i+1],'clue',{text:clues[i]})}
async function reveal(r,clues=['lava','eruption','mountain','rocks','rock']){await submit(r,clues);if((await read(r)).phase==='clue-voting'){await write(r,{deadline:Date.now()-1});await run(r,r.host.uid,'tick')}}
async function rejected(promise,code){await assert.rejects(promise,e=>!code||e.code===code)}
let checks=0
async function check(name,fn){await fn();checks++;console.log(`PASS ${name}`)}
try {
  await db.doc('fowlWordsConfig/scoring').set({bestCluesFirstEnabled:true})
  await check('private storage and own projections enforce role access',async()=>{
    const r=await room();await openSubmission(r)
    await run(r,r.players[1],'clue',{text:'lava'})
    const publicRound=(await getDoc(doc(r.host.fs,`games/${r.id}/rounds/1`))).data()
    assert.equal(publicRound.secretWord,'');assert.deepEqual(publicRound.wordOptions,[])
    const view=(await getDoc(doc(r.host.fs,`games/${r.id}/rounds/1/views/${r.host.uid}`))).data().engine
    assert.equal(view.secretWord,'');assert.deepEqual(view.board,[])
    assert.deepEqual((await db.doc(`games/${r.id}/rounds/1/views/${r.players[2]}`).get()).data().engine.board,[])
    for(const path of [`games/${r.id}/private/deck`,`games/${r.id}/rounds/1/private/state`,`games/${r.id}/rounds/1/views/${r.players[1]}`,'fowlWordsConfig/scoring'])await rejected(getDoc(doc(r.host.fs,path)),'permission-denied')
    await rejected(updateDoc(doc(r.host.fs,`games/${r.id}`),{scoringRules:recommendedRules()}),'permission-denied')
    await rejected(updateDoc(doc(r.host.fs,`games/${r.id}/players/${r.host.uid}`),{score:100}),'permission-denied')
    await rejected(invoke(legacySubmitClue,r.players[2],{gameId:r.id,roundNum:1,clue:'rock'}),'failed-precondition')
    await rejected(invoke(legacyForceDedup,r.host.uid,{gameId:r.id,roundNum:1}),'failed-precondition')
    assert.deepEqual((await db.doc(`games/${r.id}/rounds/1`).get()).data().cluesByPlayer,{})
    const outsider=await client();await rejected(getDoc(doc(outsider.fs,`games/${r.id}/rounds/1`)),'permission-denied')
    assert.equal((await db.doc(`games/${r.id}`).get()).data().cardsRemaining.length,0)
  })
  await check('ranking requires submission, excludes own clues, limits hearts and freezes deadlines',async()=>{
    const r=await room();await openSubmission(r)
    await run(r,r.players[1],'clue',{text:'lava'});await run(r,r.players[2],'clue',{text:'eruption'});await run(r,r.players[3],'clue',{text:'mountain'})
    const clues=(await read(r)).clues
    await rejected(run(r,r.players[4],'rank',{clueId:clues[0].id}))
    await rejected(run(r,r.players[1],'rank',{clueId:clues[0].id}))
    await run(r,r.players[1],'rank',{clueId:clues[1].id});await run(r,r.players[1],'rank',{clueId:clues[2].id})
    await run(r,r.players[4],'clue',{text:'heat'});await rejected(run(r,r.players[1],'rank',{clueId:(await read(r)).clues[3].id}))
    await run(r,r.players[5],'clue',{text:'smoke'});assert.equal((await read(r)).phase,'clue-voting')
    await write(r,{deadline:Date.now()-1});await rejected(run(r,r.players[1],'rank',{clueId:clues[1].id}))
    await run(r,r.host.uid,'tick');assert.equal((await read(r)).phase,'reveal')
    const ordered=await read(r)
    const first=ordered.groups.find(g=>g.id===ordered.queue[0])
    assert.ok([r.players[2],r.players[3]].includes(first.authorIds[0]))
    await rejected(run(r,r.players[1],'rank',{clueId:clues[0].id}))
  })
  await check('settings are host-only, stale-safe and applied next round',async()=>{
    const r=await room();const g=(await db.doc(`games/${r.id}`).get()).data();const next={...recommendedRules(),automaticAttempts:false,payouts:[8,4,2,1]}
    const req={gameId:r.id,expectedRound:1,expectedRevision:g.scoringRevision,rules:next}
    await rejected(invoke(settings,r.players[1],req),'permission-denied')
    await invoke(settings,r.host.uid,req)
    assert.equal((await read(r)).rules.mode,'best-clues-first')
    await rejected(invoke(settings,r.host.uid,req),'aborted')
    await write(r,{phase:'scored',correct:false})
    await startScoringRound(r.id,r.host.uid)
    assert.equal((await db.doc(`games/${r.id}/rounds/2/private/state`).get()).data().rules.mode,'classic')
    assert.deepEqual((await db.doc(`games/${r.id}`).get()).data().scoringRules.payouts,[8,4,2,1])
    const pending=(await db.doc(`games/${r.id}`).get()).data();assert.equal(pending.pendingScoringRules,undefined)
    await rejected(invoke(settings,r.host.uid,{...req,expectedRound:1,expectedRevision:pending.scoringRevision}),'aborted')
  })
  await check('availability prevents new selections but never interrupts selected rounds',async()=>{
    const r=await room('classic');await db.doc('fowlWordsConfig/scoring').set({bestCluesFirstEnabled:false});assert.equal(await scoringAvailable(),false)
    const g=(await db.doc(`games/${r.id}`).get()).data()
    await rejected(invoke(settings,r.host.uid,{gameId:r.id,expectedRound:1,expectedRevision:g.scoringRevision,rules:recommendedRules('best-clues-first')}))
    const selected=await room();await reveal(selected);assert.equal((await read(selected)).phase,'reveal')
    await db.doc('fowlWordsConfig/scoring').set({bestCluesFirstEnabled:true})
  })
  await check('concurrent skips advance once without provider calls; all clues appear by third attempt',async()=>{
    const r=await room('best-clues-first',8);await reveal(r,['lava','eruption','mountain','heat','smoke','rock','rocks'])
    const before=providerCalls
    await Promise.allSettled(Array.from({length:6},()=>run(r,r.host.uid,'skip',{expectedAttempt:1})))
    assert.equal((await read(r)).attempt,2);assert.equal(providerCalls,before)
    await run(r,r.host.uid,'skip',{expectedAttempt:2})
    const s=await read(r);assert.equal(s.attempt,3);assert.equal(s.shown.length,s.groups.length)
    await rejected(run(r,r.host.uid,'skip',{expectedAttempt:3}))
    await run(r,r.host.uid,'give-up',{expectedAttempt:3});assert.equal((await read(r)).correct,false)
    assert.equal((await read(r)).history.at(-1).kind,'give-up')
    for(const uid of r.players.slice(-2))assert.equal((await db.doc(`games/${r.id}/players/${uid}`).get()).data().score,-1)
  })
  await check('early correct guesses score exactly once and results reveal every author/clue',async()=>{
    const r=await room();await reveal(r)
    await Promise.allSettled([run(r,r.host.uid,'guess',{expectedAttempt:1,text:'volcano'}),run(r,r.host.uid,'guess',{expectedAttempt:1,text:'volcano'}),run(r,r.host.uid,'skip',{expectedAttempt:1})])
    let s=await read(r)
    if(s.phase!=='scored'){await run(r,r.host.uid,'guess',{expectedAttempt:s.attempt,text:'volcano'});s=await read(r)}
    assert.equal(s.correct,true)
    assert.equal((await db.doc(`games/${r.id}/players/${r.host.uid}`).get()).data().score,s.rules.payouts[s.attempt-1])
    const v=(await getDoc(doc(r.host.fs,`games/${r.id}/rounds/1/views/${r.host.uid}`))).data().engine
    assert.equal(v.secretWord,'volcano');assert.equal(v.groups.length,s.groups.length);assert.ok(v.groups.every(c=>c.authors.length))
    const before=(await db.doc(`games/${r.id}/players/${r.host.uid}`).get()).data().score
    await rejected(run(r,r.host.uid,'guess',{expectedAttempt:s.attempt,text:'volcano'}))
    assert.equal((await db.doc(`games/${r.id}/players/${r.host.uid}`).get()).data().score,before)
  })
  await check('late provider results cannot score after timeout recovery',async()=>{
    const r=await room();await reveal(r)
    let release;answerGate=new Promise(resolve=>{release=resolve})
    const pending=run(r,r.host.uid,'guess',{expectedAttempt:1,text:'crater'})
    for(let i=0;i<100&&!(await read(r)).claim;i++)await new Promise(resolve=>setTimeout(resolve,10))
    assert.ok((await read(r)).claim)
    await write(r,{'claim.expires':Date.now()-1});await run(r,r.players[1],'tick')
    release();answerGate=undefined;await pending
    assert.equal((await read(r)).attempt,2);assert.equal((await read(r)).history[0].kind,'timeout')
    assert.equal((await db.doc(`games/${r.id}/players/${r.host.uid}`).get()).data().score,0)
  })
  await check('Classic keeps speed, win-only Peer love and transactional Most Helpful',async()=>{
    const r=await room('classic');await reveal(r)
    const s=await read(r);const target=s.groups.find(g=>g.authorIds.includes(r.players[1]));const giver=r.players[2]
    await run(r,giver,'love',{clueId:target.id})
    await run(r,r.host.uid,'guess',{expectedAttempt:1,text:'volcano'})
    const before=(await db.doc(`games/${r.id}/players/${r.players[1]}`).get()).data().score
    assert.equal(before,14)
    await run(r,r.host.uid,'helpful',{clueId:target.id})
    assert.equal((await db.doc(`games/${r.id}/players/${r.players[1]}`).get()).data().score,before+5)
    await run(r,r.host.uid,'helpful',{clueId:target.id})
    assert.equal((await db.doc(`games/${r.id}/players/${r.players[1]}`).get()).data().score,before)
  })
  await check('all-duplicate and zero-clue rounds recover without getting stuck',async()=>{
    const r=await room();await reveal(r,['rock','rocks','rock','rocks','rock'])
    assert.equal((await read(r)).shown.length,0)
    await run(r,r.host.uid,'skip',{expectedAttempt:1});assert.equal((await read(r)).shown.length,1)
    const empty=await room();await openSubmission(empty);await write(empty,{deadline:Date.now()-1});await run(empty,empty.host.uid,'tick')
    assert.equal((await read(empty)).phase,'scored')
    const small=await room('best-clues-first',2);await submit(small,['lava'])
    assert.equal((await read(small)).phase,'reveal');assert.equal((await read(small)).shown.length,1)
  })
  await check('50-player rooms use the same relative schedule and private projections',async()=>{
    const r=await room('best-clues-first',50)
    const clues=r.players.slice(1).map((author,i)=>({id:`large-${i}`,author,text:`word${i}`,at:i}))
    await write(r,{phase:'clue-voting',secretWord:'volcano',clues,deadline:Date.now()-1})
    await run(r,r.host.uid,'tick')
    const s=await read(r)
    assert.equal(s.groups.length,49);assert.deepEqual(s.schedule,[10,30,49,49])
    const view=(await db.doc(`games/${r.id}/rounds/1/views/${r.host.uid}`).get()).data().engine
    assert.equal(view.groups.length,10);assert.equal(view.hiddenCount,39)
    await run(r,r.host.uid,'skip',{expectedAttempt:1});await run(r,r.host.uid,'skip',{expectedAttempt:2})
    assert.equal((await read(r)).shown.length,49)
  })
  await check('active legacy rounds finish unchanged before migration at the next boundary',async()=>{
    const r=await room('classic')
    await r.state.delete();await db.doc(`games/${r.id}/private/deck`).delete()
    await db.doc(`games/${r.id}/rounds/1`).set({status:'scored',secretWord:'legacy-word',currentAttempt:1})
    await db.doc(`games/${r.id}`).update({scoringEngineVersion:admin.firestore.FieldValue.delete(),scoringRules:admin.firestore.FieldValue.delete(),scoringRevision:0,cardsRemaining:['house','river','tree']})
    await invoke(settings,r.host.uid,{gameId:r.id,expectedRound:1,expectedRevision:0,rules:recommendedRules('best-clues-first')})
    assert.equal((await db.doc(`games/${r.id}/rounds/1`).get()).data().secretWord,'legacy-word')
    await startScoringRound(r.id,r.host.uid)
    assert.equal((await db.doc(`games/${r.id}/rounds/2/private/state`).get()).data().rules.mode,'best-clues-first')
    assert.deepEqual((await db.doc(`games/${r.id}`).get()).data().cardsRemaining,[])
  })
  await check('wrong answers and concurrent deadline nudges follow one ladder and score failure once',async()=>{
    const r=await room();await reveal(r)
    await run(r,r.host.uid,'guess',{expectedAttempt:1,text:'extremelylongwronganswer'})
    assert.equal((await read(r)).attempt,2);assert.equal((await read(r)).history[0].kind,'guess')
    await write(r,{deadline:Date.now()-1})
    await Promise.all([run(r,r.players[1],'tick'),run(r,r.players[2],'tick')])
    assert.equal((await read(r)).attempt,3)
    for(let i=0;i<2;i++){await write(r,{deadline:Date.now()-1});await run(r,r.players[1],'tick')}
    const final=await read(r);assert.equal(final.phase,'scored');assert.equal(final.correct,false)
    await run(r,r.host.uid,'tick')
    for(const id of r.players.slice(-2))assert.equal((await db.doc(`games/${r.id}/players/${id}`).get()).data().score,-1)
  })
  await check('concurrent deduplication nudges commit one frozen queue',async()=>{
    const r=await room();await submit(r,['lava','eruption','mountain','rock','rocks'])
    await write(r,{phase:'deduplication',deadline:0})
    const before=groupingCalls
    await Promise.all(Array.from({length:6},(_,i)=>run(r,r.players[i],'tick')))
    const s=await read(r)
    assert.equal(groupingCalls,before+1);assert.equal(s.phase,'reveal')
    assert.equal(new Set(s.queue).size,s.groups.length)
  })
  console.log(`Verified ${checks} emulator scenarios.`)
} finally {
  for(const c of clients){await terminate(c.fs);await deleteApp(c.app)}
  await admin.app().delete()
}
