import { randomUUID } from 'node:crypto'
import * as admin from 'firebase-admin'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { groupAnswersWithJev } from '../../shared/jevGrouping'
import { jevOperationEnabled } from '../../shared/aiExperiment'
import { normalizeAnswer } from '../../shared/normalizeAnswer'
import { getRoundEligiblePlayerIds } from '../../shared/roundEligibility'
import { scoreRoundAnswers } from './scoring'

// A new invocation may reclaim an expired reveal; late results cannot commit.
export async function scoreJevRound(gameId: string, roundNum: number) {
  const db=admin.firestore(), gameRef=db.doc(`games/${gameId}`), roundRef=gameRef.collection('rounds').doc(String(roundNum))
  const claim=randomUUID()
  const claimed=await db.runTransaction(async tx=>{
    const [g,r]=await Promise.all([tx.get(gameRef),tx.get(roundRef)])
    const game=g.data(), round=r.data()
    if(!game || !round || game.status!=='playing' || game.currentRound!==roundNum) return false
    if(round.status!=='answering' && !(round.status==='revealing' && (round.scoringExpiresAt?.toMillis?.()??Infinity)<=Date.now())) return false
    tx.update(roundRef,{status:'revealing',scoringClaim:claim,scoringExpiresAt:Timestamp.fromMillis(Date.now()+10_000)})
    return true
  })
  if(!claimed) return
  const [g,r,a]=await Promise.all([gameRef.get(),roundRef.get(),roundRef.collection('answers').get()])
  const game=g.data()!, round=r.data()!, eligible=getRoundEligiblePlayerIds(round,game)
  const raw: Record<string,string>={}, normalized: Record<string,string>={}
  for(const d of a.docs) if(eligible.includes(d.id)) {raw[d.id]=d.data().text;normalized[d.id]=normalizeAnswer(raw[d.id])}
  const canonical=[...new Set(Object.values(normalized))].sort()
  let groups=canonical.map(answer=>[answer]), source=round.type==='multiple_choice'?'multiple-choice':'normalization-match'
  if(round.type!=='multiple_choice' && canonical.length>1) {
    source='deterministic-fallback'
    try {
      if(await jevOperationEnabled(game.originalHostId??game.hostId,'grouping')) {
        groups=await groupAnswersWithJev(round.question,canonical)
        source='jev'
      }
    } catch { /* Fail closed to normalized groups for the entire round. */ }
  }
  // Player counts, not unique answer counts, determine display order and scores.
  const count=(group:string[])=>Object.values(normalized).filter(a=>group.includes(a)).length
  groups.sort((a,b)=>count(b)-count(a)||(JSON.stringify(a)<JSON.stringify(b)?-1:1))
  const scored=scoreRoundAnswers(normalized,groups,eligible)
  const flock=scored.flockGroupIndex>=0?groups[scored.flockGroupIndex]:[]
  const representative=Object.keys(raw).sort().find(pid=>flock.includes(normalized[pid]))
  await db.runTransaction(async tx=>{
    const [currentGame,currentRound]=await Promise.all([tx.get(gameRef),tx.get(roundRef)])
    const current=currentRound.data()
    if(currentGame.data()?.status!=='playing' || currentGame.data()?.currentRound!==roundNum || current?.status!=='revealing' || current.scoringClaim!==claim || current.scoringExpiresAt.toMillis()<=Date.now()) return
    tx.update(roundRef,{status:'scored',answerGroups:groups.map(g=>JSON.stringify(g)),flockAnswer:representative?[raw[representative]]:[],results:scored.results,pointsThisRound:scored.pointsThisRound,playerAnswers:raw,commentary:'',groupSource:source,scoringClaim:FieldValue.delete(),scoringExpiresAt:FieldValue.delete()})
    for(const [pid,pts] of Object.entries(scored.pointsThisRound)) if(pts) tx.update(gameRef.collection('players').doc(pid),{score:FieldValue.increment(pts)})
  })
}
