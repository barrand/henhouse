import { describe, expect, it, vi } from 'vitest'
import { clusterJevPairs, groupAnswersWithJev, validateJevPartition } from '../jevGrouping'
import { DecisionService, AnswerPairDecision, AnswerPairInput } from '../decisionService'
import { playtestGuessOptions } from '../jevPlaytest'

const pair=(id:string,p:number):AnswerPairDecision=>({id,sameMeaning:p>=.5,metadata:{provider:'jev',latencyMs:1,fallbackUsed:false,probabilities:{same:p,different:1-p}}})
describe('Jev playtest grouping',()=>{
  it('splits contradictory chains and is independent of submission order',()=>{
    const decisions=[pair('p0_1',.95),pair('p1_2',.9),pair('p0_2',.1)]
    expect(clusterJevPairs(['c','a','b'],decisions)).toEqual([['a','b'],['c']])
    expect(clusterJevPairs(['b','c','a'],decisions)).toEqual([['a','b'],['c']])
  })
  it('resolves tied merges canonically and ignores low probability/different labels',()=>{
    expect(clusterJevPairs(['a','b','c'],[pair('p0_1',.9),pair('p1_2',.9),pair('p0_2',.1)])).toEqual([['a','b'],['c']])
    expect(clusterJevPairs(['a','b'],[pair('p0_1',.79)])).toEqual([['a'],['b']])
    expect(clusterJevPairs(['a','b'],[{...pair('p0_1',.99),sameMeaning:false}])).toEqual([['a'],['b']])
  })
  it.each([{groups:[['a','a']]},{groups:[['a'],['alien']]},{groups:[[]]},{groups:[['a']]}])('strictly rejects invalid partition $groups',({groups})=>{
    expect(()=>validateJevPartition(groups,['a','b'])).toThrow('partition')
  })
  it('makes no request for one normalized group',async()=>{
    const service={compareFlockBatch:vi.fn()}
    expect(await groupAnswersWithJev('q',['a','a'],service as never)).toEqual([['a']])
    expect(service.compareFlockBatch).not.toHaveBeenCalled()
  })
  it('compares every pair with batches <=16 and concurrency <=4 at 40 players',async()=>{
    let active=0,peak=0;const seen:string[]=[]
    const service={compareFlockBatch:async(inputs:AnswerPairInput[])=>{
      active++;peak=Math.max(peak,active);expect(inputs.length).toBeLessThanOrEqual(16)
      await new Promise(r=>setTimeout(r,1));active--;seen.push(...inputs.map(p=>p.id))
      return inputs.map(p=>pair(p.id,.1))
    }}
    const answers=Array.from({length:40},(_,i)=>`answer${i}`)
    expect(await groupAnswersWithJev('q',answers,service as never)).toHaveLength(40)
    expect(seen).toHaveLength(780);expect(new Set(seen).size).toBe(780);expect(peak).toBeLessThanOrEqual(4)
  })
  it('rejects partial, duplicate and failed matrices without returning partial groups',async()=>{
    for(const compareFlockBatch of [async()=>[],async()=>[pair('unknown',.99)],async()=>{throw Error('outage')}]) {
      await expect(groupAnswersWithJev('q',['a','b'],{compareFlockBatch} as never)).rejects.toThrow()
    }
  })
  it('bounds the whole grouping and aborts requests on timeout',async()=>{
    vi.useFakeTimers()
    try {
      let aborted=false
      const service={compareFlockBatch:(_p:unknown,_d:unknown,signal:AbortSignal)=>{
        signal.addEventListener('abort',()=>{aborted=true});return new Promise(()=>{})
      }}
      const pending=groupAnswersWithJev('q',['a','b'],service as never,100)
      const assertion=expect(pending).rejects.toThrow('deadline')
      await vi.advanceTimersByTimeAsync(100);await assertion;expect(aborted).toBe(true)
    } finally {vi.useRealTimers()}
  })
  it('validates batch response IDs, distributions and model',async()=>{
    const valid={type:'choice',choice:'same',confidence:.9,probabilities:{same:.9,different:.1}}
    for(const [model,answers] of [['jev-1.13.0',{p0_1:valid}],['wrong',{p0_1:valid}],['jev-1.13.0',{p0_1:valid,extra:valid}],['jev-1.13.0',{p0_1:{...valid,probabilities:{same:2,different:-1}}}] ] as const) {
      const service=new DecisionService(()=>({systemOne:()=>({withResponse:async()=>({data:{model,usage:{input_tokens:1,output_tokens:1},answers}})})}) as never)
      const result=service.compareFlockBatch([{id:'p0_1',question:'q',left:'a',right:'b'}],1000,new AbortController().signal)
      if(model==='jev-1.13.0'&&Object.keys(answers).length===1&&answers.p0_1.probabilities.same===.9) expect(await result).toHaveLength(1)
      else await expect(result).rejects.toThrow('Malformed')
    }
  })
  it('uses frozen reviewed meanings only, with simple rubric for unknown words',()=>{
    expect(playtestGuessOptions(' Refrigerator ')).toMatchObject({rubric:'grounded',definition:expect.any(String)})
    expect(playtestGuessOptions('unreviewed-secret')).toEqual({rubric:'simple'})
  })
})
