// Explicitly scoped release operations. Never prints credentials or raw envs.
import { createRequire } from 'node:module'
import { mkdir, writeFile, cp, symlink, readFile } from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'
const root=path.resolve(import.meta.dirname,'../../..')
const require=createRequire(import.meta.url)
const project='flock-together-game'
const mode=process.argv[2]
assert.ok(['inspect','stage','enable','disable','remove-plain-keys','smoke'].includes(mode),'Explicit release mode required')
const directory=path.join(root,'validation-runs/jev',new Date().toISOString().replace(/[-:.TZ]/g,'')+'-production-'+mode)
await mkdir(directory,{recursive:true})
if(mode==='stage') {
  const dest=path.join(directory,'functions')
  await mkdir(dest)
  for(const name of ['lib','package.json','package-lock.json']) await cp(path.join(root,'functions',name),path.join(dest,name),{recursive:true})
  await symlink(path.join(root,'functions/node_modules'),path.join(dest,'node_modules'),'junction')
  const config={functions:[{source:path.relative(root,dest).replaceAll('\\','/'),codebase:'default',ignore:['node_modules','.git','.env*']}],hosting:[{site:'chickenparty',public:'dist',ignore:['firebase.json','**/.*','**/node_modules/**'],rewrites:[{source:'**',destination:'/index.html'}]}],firestore:{rules:'firestore.rules'}}
  await writeFile(path.join(directory,'firebase.json'),JSON.stringify(config,null,2))
  const releaseConfig=path.join(root,'firebase.jev-release.json')
  await writeFile(releaseConfig,JSON.stringify(config,null,2))
  process.stdout.write(JSON.stringify({directory,config:releaseConfig,project,localEnvPreserved:true})+'\n')
} else {
  const auth=require('../../../node_modules/firebase-tools/lib/auth.js')
  const account=auth.getProjectDefaultAccount(root)??auth.getGlobalDefaultAccount()
  assert.ok(account?.tokens?.refresh_token,'Firebase CLI login is required')
  const credential={getAccessToken:async()=>{
    const token=await auth.getAccessToken(account.tokens.refresh_token,['https://www.googleapis.com/auth/cloud-platform'])
    return {access_token:token.access_token,expires_in:Math.max(1,Math.floor((token.expires_at-Date.now())/1000))}
  }}
  const decode=v=>'mapValue' in v?Object.fromEntries(Object.entries(v.mapValue.fields??{}).map(([k,x])=>[k,decode(x)])):'arrayValue' in v?(v.arrayValue.values??[]).map(decode):'integerValue' in v?Number(v.integerValue):Object.values(v)[0]
  const encode=v=>v===null?{nullValue:null}:typeof v==='boolean'?{booleanValue:v}:typeof v==='string'?{stringValue:v}:typeof v==='number'?{integerValue:String(v)}:Array.isArray(v)?{arrayValue:{values:v.map(encode)}}:{mapValue:{fields:Object.fromEntries(Object.entries(v).map(([k,x])=>[k,encode(x)]))}}
  const db={doc:document=>{
    assert.ok(document==='aiExperimentConfig/jev'||/^games\/[\w-]+$/.test(document),'Out-of-scope document')
    const url=`https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/${document}`
    const request=async(method='GET',data)=>{
      const token=await credential.getAccessToken()
      const mask=data?'?'+Object.keys(data).map(k=>'updateMask.fieldPaths='+encodeURIComponent(k)).join('&'):''
      const response=await fetch(url+mask,{method,headers:{Authorization:`Bearer ${token.access_token}`,'Content-Type':'application/json'},...(data?{body:JSON.stringify({fields:Object.fromEntries(Object.entries(data).map(([k,v])=>[k,encode(v)]))})}:{})})
      if(response.status===404&&method==='GET') return null
      assert.ok(response.ok,`Scoped Firestore ${method} failed: ${response.status}`)
      const body=await response.json();return Object.fromEntries(Object.entries(body.fields??{}).map(([k,v])=>[k,decode(v)]))
    }
    return {get:async()=>{const data=await request();return {data:()=>data}},set:data=>request('PATCH',data),update:async data=>{
      const current=await request()
      for(const [key,value] of Object.entries(data)) {
        const parts=key.split('.');let target=current
        for(const part of parts.slice(0,-1)) target=target[part]??={}
        target[parts.at(-1)]=value
      }
      return request('PATCH',Object.fromEntries([...new Set(Object.keys(data).map(k=>k.split('.')[0]))].map(k=>[k,current[k]])))
    }}
  }},ref=db.doc('aiExperimentConfig/jev')
  try {
    const before=(await ref.get()).data()??null
    await writeFile(path.join(directory,'control-before.json'),JSON.stringify(before,null,2))
    if(mode==='inspect'||mode==='remove-plain-keys') {
      const token=await credential.getAccessToken()
      const response=await fetch(`https://cloudfunctions.googleapis.com/v2/projects/${project}/locations/us-central1/functions`,{headers:{Authorization:`Bearer ${token.access_token}`}})
      assert.equal(response.status,200,'Unable to inspect deployed function metadata')
      const data=await response.json()
      const functions=data.functions.map(f=>({name:f.name.split('/').at(-1),state:f.state,environmentKeys:Object.keys(f.serviceConfig?.environmentVariables??{}),secretKeys:(f.serviceConfig?.secretEnvironmentVariables??[]).map(s=>s.key)}))
      if(mode==='remove-plain-keys') {
        const bound=new Set(['submitGuess','submitClue','submitAnswer','forceEndRound','processJevShadowJob'])
        const changes=[]
        for(const f of data.functions.filter(f=>bound.has(f.name.split('/').at(-1))&&f.serviceConfig?.environmentVariables?.TYPESAFE_API_KEY)) {
          const environmentVariables={...f.serviceConfig.environmentVariables};delete environmentVariables.TYPESAFE_API_KEY
          const update=await fetch(`https://cloudfunctions.googleapis.com/v2/${f.name}?updateMask=serviceConfig.environmentVariables`,{method:'PATCH',headers:{Authorization:`Bearer ${token.access_token}`,'Content-Type':'application/json'},body:JSON.stringify({name:f.name,serviceConfig:{environmentVariables}})})
          assert.ok(update.ok,`Failed to remove conflicting plain key from ${f.name.split('/').at(-1)}: ${update.status}`)
          const operation=await update.json()
          let done=operation
          for(let i=0;!done.done&&i<90;i++) {
            await new Promise(resolve=>setTimeout(resolve,2000))
            const status=await fetch(`https://cloudfunctions.googleapis.com/v2/${operation.name}`,{headers:{Authorization:`Bearer ${token.access_token}`}})
            assert.ok(status.ok,'Could not inspect environment update');done=await status.json()
          }
          assert.ok(done.done&&!done.error,'Environment update incomplete')
          changes.push(f.name.split('/').at(-1));process.stdout.write(`Removed conflicting plain TYPESAFE_API_KEY from ${changes.at(-1)}; other variables preserved\n`)
        }
        await writeFile(path.join(directory,'changes.json'),JSON.stringify({changes,localEnvPreserved:true},null,2))
      }
      await writeFile(path.join(directory,'metadata.json'),JSON.stringify({project,control:before,functions},null,2))
      process.stdout.write(JSON.stringify({directory,control:before,functions:functions.filter(f=>['submitGuess','submitClue','submitAnswer','forceEndRound','jevLiveContractCheck'].includes(f.name))})+'\n')
    } else if(mode==='enable'||mode==='disable') {
      if(mode==='enable') await ref.set({admissionEnabled:true,mode:'jev',approvedConfigVersion:'jev-playtest-v2',enabledOperations:{clue:true,guess:true,grouping:true}},{merge:true})
      else await ref.update({admissionEnabled:false,'enabledOperations.clue':false,'enabledOperations.guess':false,'enabledOperations.grouping':false})
      const after=(await ref.get()).data()
      await writeFile(path.join(directory,'control-after.json'),JSON.stringify(after,null,2))
      process.stdout.write(JSON.stringify({directory,control:after})+'\n')
    } else {
      // A fresh temporary actor verifies deployed Secret Manager binding and
      // callable transport; synthetic room checks are kept out of real games.
      const dotenv=await readFile(path.join(root,'.env.production'),'utf8')
      const key=dotenv.match(/^VITE_FIREBASE_API_KEY\s*=\s*["']?([^\r\n"']+)/m)?.[1]?.trim()
      assert.ok(key,'Missing public Firebase browser API key')
      const {initializeApp,deleteApp}=await import('firebase/app')
      const {getAuth,signInAnonymously,deleteUser}=await import('firebase/auth')
      const {getFunctions,httpsCallable}=await import('firebase/functions')
      const app=initializeApp({projectId:project,apiKey:key},'jev-release-smoke')
      const actor=await signInAnonymously(getAuth(app))
      const functions=getFunctions(app,'us-central1')
      const call=async(name,data={})=>(await httpsCallable(functions,name)(data)).data
      try {
        const capabilities=await call('jevExperimentCapabilities')
        assert.equal(capabilities.experimentalAvailable,true)
        assert.equal(capabilities.configVersion,'jev-playtest-v2')
        const contract=await call('jevLiveContractCheck')
        assert.equal(contract.model,'jev-1.13.0')
        const created=[]
        for(const name of ['fowlWordsCreateGame','flockCreateGame']) {
          const room=await call(name,{playerName:'Jev release smoke',experimental:true})
          created.push(room)
          const game=(await db.doc(`games/${room.gameId}`).get()).data()
          assert.equal(game.aiExperiment.mode,'jev');assert.equal(game.aiExperiment.configVersion,'jev-playtest-v2')
          await call(name==='flockCreateGame'?'flockAbandonGame':'fowlWordsAbandonGame',{gameId:room.gameId})
        }
        const legacy=await call('flockCreateGame',{playerName:'Legacy release smoke'})
        assert.equal((await db.doc(`games/${legacy.gameId}`).get()).data().aiExperiment.mode,'legacy')
        await call('flockAbandonGame',{gameId:legacy.gameId})
        const page=await fetch('https://chickenparty.web.app/jev',{cache:'no-store'})
        assert.equal(page.status,200)
        const html=await page.text();assert.ok(html.includes('/assets/'))
        const result={status:'pass',scope:'Deployed HTTP admission, room provider stamps, normal-room isolation, secret-bound live contract, /jev SPA availability. Gameplay validated separately in emulators.',capabilities,contract,temporaryRooms:created.map(r=>r.gameId)}
        await writeFile(path.join(directory,'report.json'),JSON.stringify(result,null,2))
        process.stdout.write(JSON.stringify({directory,...result})+'\n')
      } finally {await deleteUser(actor.user);await deleteApp(app)}
    }
  } finally { /* HTTP-only release operations hold no database connections. */ }
}
