import { DecisionService, AnswerPairInput, AnswerPairDecision } from './decisionService'

export function validateJevPartition(groups: string[][], expected: string[]): string[][] {
  const flat = groups.flat()
  if (groups.some(g => !g.length) || flat.length !== expected.length || new Set(flat).size !== flat.length || flat.some(s => !expected.includes(s))) throw new Error('Invalid Jev partition')
  return groups
}
export function clusterJevPairs(answers: string[], decisions: AnswerPairDecision[], threshold = .8): string[][] {
  const canonical = [...new Set(answers)].sort()
  const probabilities = new Map(decisions.map(d => [d.id, d.sameMeaning ? d.metadata.probabilities?.same ?? 0 : 0]))
  const pairId = (a: string, b: string) => `p${canonical.indexOf(a)}_${canonical.indexOf(b)}`
  let groups = canonical.map(a => [a])
  while (true) {
    const eligible: Array<{ i: number; j: number; score: number; key: string }> = []
    for (let i=0;i<groups.length;i++) for (let j=i+1;j<groups.length;j++) {
      const score = Math.min(...groups[i].flatMap(a => groups[j].map(b => probabilities.get(a < b ? pairId(a,b) : pairId(b,a)) ?? 0)))
      if (score >= threshold) eligible.push({i,j,score,key:JSON.stringify([...groups[i],...groups[j]].sort())})
    }
    eligible.sort((a,b)=>b.score-a.score || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    if (!eligible.length) break
    const {i,j}=eligible[0]
    groups=groups.filter((_,index)=>index!==i&&index!==j).concat([[...groups[i],...groups[j]].sort()])
  }
  groups.sort((a,b)=>JSON.stringify(a)<JSON.stringify(b)?-1:1)
  return validateJevPartition(groups, canonical)
}
export async function groupAnswersWithJev(question: string, answers: string[], service = new DecisionService(), budgetMs = 2000): Promise<string[][]> {
  const canonical = [...new Set(answers)].sort()
  if (canonical.length > 40 || canonical.some(a=>a.length>500) || question.length>2000) throw new Error('Grouping input exceeds playtest limits')
  if (canonical.length < 2) return canonical.map(a=>[a])
  const pairs: AnswerPairInput[]=[]
  for(let i=0;i<canonical.length;i++) for(let j=i+1;j<canonical.length;j++) pairs.push({id:`p${i}_${j}`,question,left:canonical[i],right:canonical[j]})
  const batches=Array.from({length:Math.ceil(pairs.length/16)},(_,i)=>pairs.slice(i*16,(i+1)*16))
  const decisions: AnswerPairDecision[]=[]
  const controller=new AbortController(), deadline=Date.now()+budgetMs
  let cursor=0
  const workers=Array.from({length:Math.min(4,batches.length)},async()=>{
    while(cursor<batches.length) {
      if(controller.signal.aborted || Date.now()>=deadline) throw new Error('Grouping deadline exceeded')
      const batch=batches[cursor++]
      decisions.push(...await service.compareFlockBatch(batch,deadline-Date.now(),controller.signal))
    }
  })
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([Promise.all(workers), new Promise<never>((_,reject)=>{
      timer=setTimeout(()=>{controller.abort();reject(new Error('Grouping deadline exceeded'))},budgetMs)
    })])
    if(decisions.length!==pairs.length || new Set(decisions.map(d=>d.id)).size!==pairs.length || decisions.some(d=>!pairs.some(p=>p.id===d.id))) throw new Error('Incomplete pair matrix')
    return clusterJevPairs(canonical,decisions)
  } finally { if(timer) clearTimeout(timer);controller.abort() }
}
