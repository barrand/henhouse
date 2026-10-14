import { describe, expect, it, vi } from 'vitest'
import { DecisionService } from '../decisionService'

describe('harness candidate contract', () => {
  it.each(['simple', 'grounded'] as const)('uses one %s question and reviewed context only when requested', async rubric => {
    const calls: Array<{ request: { state: Record<string, unknown>; questions: Record<string, unknown> }; options: { retry: { maxRetries: number } } }> = []
    const client = { systemOne: (request: unknown, options: unknown) => {
      calls.push({request,options} as typeof calls[number])
      return {withResponse:async()=>({data:{model:'jev-1.13.0',usage:{input_tokens:10,output_tokens:1},answers:{correct:{type:'choice',choice:'correct',confidence:.9,probabilities:{correct:.9,incorrect:.1}}}},requestId:'synthetic'})}
    }}
    const service=new DecisionService(()=>client as never)
    const result=await service.evaluateFowlWordsGuess({secretWord:'car',guess:'automobile'},{rubric,definition:'A passenger automobile.',maxRetries:0})
    expect(result.correct).toBe(true)
    expect(calls).toHaveLength(1)
    expect(Object.keys(calls[0].request.questions)).toEqual(['correct'])
    expect(calls[0].request.state.intendedMeaning).toBe(rubric==='grounded'?'A passenger automobile.':undefined)
    expect(calls[0].options.retry.maxRetries).toBe(0)
  })
  it('rejects absent grounding before spending a request',async()=>{
    const factory=vi.fn()
    await expect(new DecisionService(factory).evaluateFowlWordsGuess({secretWord:'car',guess:'automobile'},{rubric:'grounded'})).rejects.toThrow('reviewed meaning')
    expect(factory).not.toHaveBeenCalled()
  })
  it('bounds a rescue request by the remaining operation deadline',async()=>{
    vi.useFakeTimers()
    try {
      const service=new DecisionService(()=>({systemOne:()=>({withResponse:()=>new Promise(()=>{})})}) as never)
      const pending=service.evaluateFowlWordsGuess({secretWord:'car',guess:'automobile'},{rubric:'simple',deadlineMs:100,maxRetries:0})
      const assertion=expect(pending).rejects.toThrow('total deadline')
      await vi.advanceTimersByTimeAsync(100)
      await assertion
    } finally {vi.useRealTimers()}
  })
})
