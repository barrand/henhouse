import { GoogleGenerativeAI } from '@google/generative-ai'
import * as fs from 'fs'
import * as path from 'path'

const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? ''
if (!GEMINI_API_KEY) {
  console.error('Set GEMINI_API_KEY environment variable')
  process.exit(1)
}

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY)
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

interface QuestionGrade {
  text: string
  type: 'open' | 'multiple_choice'
  options?: string[]
  convergenceGrade: 'A' | 'B' | 'C'
  convergenceGroupSize: number
  simulatedAnswers: string[]
  entertainmentScore: number
  laughFactor: number
  revealDrama: number
  retellability: number
  compositeLabel: string
}

interface BankQuestion {
  text: string
  type?: 'open' | 'multiple_choice'
  options?: string[]
}

/**
 * MC questions don't need Gemini to simulate -- options constrain the answer space.
 * Pick weighted by a rough heuristic: first option gets slight edge (cultural default),
 * but all are plausible. Returns a randomly-drawn set of 7 answers + largest group size.
 */
function simulateMcConvergence(q: BankQuestion): { answers: string[]; largestGroup: number } {
  const options = q.options ?? []
  if (options.length === 0) return { answers: [], largestGroup: 0 }

  // Weighted toward first option (typically the "default" for binaries)
  const weights = options.length === 2 ? [0.6, 0.4] : [0.5, 0.3, 0.2]
  const answers: string[] = []
  for (let i = 0; i < 7; i++) {
    const r = Math.random()
    let acc = 0
    for (let j = 0; j < options.length; j++) {
      acc += weights[j] ?? 1 / options.length
      if (r < acc) {
        answers.push(options[j])
        break
      }
    }
  }
  const counts = new Map<string, number>()
  for (const a of answers) counts.set(a, (counts.get(a) ?? 0) + 1)
  const largestGroup = Math.max(...counts.values())
  return { answers, largestGroup }
}

const BATCH_SIZE = 5
const DELAY_MS = 2500

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

async function simulateConvergence(questions: string[]): Promise<
  { answers: string[]; largestGroup: number }[]
> {
  const prompt = `You are simulating 7 different players in a party game called "Flock Together."

RULES: All players see the same question and try to write the SAME answer as the majority. Players are strategic -- they pick the most obvious/common answer, not a creative one. Players come from diverse backgrounds (ages 22-55, mixed genders, American cultural context).

For EACH question below, simulate 7 player answers. Players are TRYING to match each other, so most should converge, but realistic disagreement happens.

Questions:
${questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}

For each question, return the 7 answers and count the size of the largest matching group (treating minor spelling/plural differences as the same answer).

Return ONLY valid JSON:
{
  "results": [
    { "question_index": 0, "answers": ["ans1","ans2",...], "largest_group": 5 },
    ...
  ]
}`

  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: 'application/json' },
  })

  const parsed = JSON.parse(result.response.text())
  return parsed.results.map((r: { answers: string[]; largest_group: number }) => ({
    answers: r.answers,
    largestGroup: r.largest_group,
  }))
}

async function rateEntertainment(questions: string[]): Promise<
  { laugh: number; reveal: number; retell: number }[]
> {
  const prompt = `You are a veteran party game designer rating questions for "Flock Together" -- an adult game night game (tone: mildly edgy, funny, two-drinks-in humor).

Rate each question on three dimensions (1-5 scale):

1. LAUGH FACTOR: Does the question premise itself make adults smile or laugh before anyone answers?
   - 1 = dry/boring survey question
   - 3 = mildly amusing
   - 5 = people laugh just hearing the question

2. REVEAL DRAMA: When answers are revealed, will it spark debate, surprise, or roasting?
   - 1 = everyone says "oh, yeah, obvious"
   - 3 = some mild reactions
   - 5 = people immediately argue or crack up at outlier answers

3. RETELLABILITY: Would someone describe this question/round to a friend the next day?
   - 1 = completely forgettable
   - 3 = might mention it
   - 5 = "you have to hear what happened when we got this question"

Questions:
${questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}

Return ONLY valid JSON:
{
  "ratings": [
    { "question_index": 0, "laugh": 3, "reveal": 4, "retell": 3 },
    ...
  ]
}`

  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: 'application/json' },
  })

  const parsed = JSON.parse(result.response.text())
  return parsed.ratings.map((r: { laugh: number; reveal: number; retell: number }) => ({
    laugh: r.laugh,
    reveal: r.reveal,
    retell: r.retell,
  }))
}

function gradeConvergence(largestGroup: number): 'A' | 'B' | 'C' {
  if (largestGroup >= 5) return 'A'
  if (largestGroup >= 3) return 'B'
  return 'C'
}

function compositeLabel(convGrade: string, entScore: number): string {
  if (convGrade === 'A' && entScore >= 4) return 'STAR'
  if (convGrade !== 'C' && entScore >= 4) return 'KEEP'
  if (convGrade === 'A' && entScore >= 3) return 'KEEP'
  if (convGrade !== 'C' && entScore >= 3) return 'MAYBE'
  return 'CUT'
}

async function main() {
  const questionsPath = path.resolve(__dirname, '../functions/src/data/questions.json')
  const rawQuestions: BankQuestion[] = JSON.parse(fs.readFileSync(questionsPath, 'utf-8'))

  // Partition: MC gets deterministic simulation, open-ended needs Gemini
  const openQuestions = rawQuestions.filter((q) => (q.type ?? 'open') === 'open')
  const mcQuestions = rawQuestions.filter((q) => q.type === 'multiple_choice')

  console.log(
    `Grading ${rawQuestions.length} questions (${openQuestions.length} open via Gemini, ${mcQuestions.length} MC via local simulation)...`,
  )

  const grades: QuestionGrade[] = []

  // Handle MC questions locally -- no Gemini needed
  for (const q of mcQuestions) {
    const conv = simulateMcConvergence(q)
    // MC convergence is structurally guaranteed; entertainment still needs Gemini.
    grades.push({
      text: q.text,
      type: 'multiple_choice',
      options: q.options,
      convergenceGrade: gradeConvergence(conv.largestGroup),
      convergenceGroupSize: conv.largestGroup,
      simulatedAnswers: conv.answers,
      entertainmentScore: 0, // Will be populated below
      laughFactor: 0,
      revealDrama: 0,
      retellability: 0,
      compositeLabel: 'PENDING',
    })
  }

  // Rate entertainment for MC questions in one pass (convergence already known)
  if (mcQuestions.length > 0) {
    for (let i = 0; i < mcQuestions.length; i += BATCH_SIZE) {
      const batch = mcQuestions.slice(i, i + BATCH_SIZE).map((q) => q.text)
      try {
        const ents = await rateEntertainment(batch)
        for (let j = 0; j < batch.length; j++) {
          const grade = grades.find((g) => g.text === batch[j])
          if (!grade) continue
          const ent = ents[j] ?? { laugh: 0, reveal: 0, retell: 0 }
          const entAvg = +((ent.laugh + ent.reveal + ent.retell) / 3).toFixed(1)
          grade.entertainmentScore = entAvg
          grade.laughFactor = ent.laugh
          grade.revealDrama = ent.reveal
          grade.retellability = ent.retell
          grade.compositeLabel = compositeLabel(grade.convergenceGrade, entAvg)
        }
      } catch (err) {
        console.error(`  MC entertainment batch failed: ${err}`)
      }
      if (i + BATCH_SIZE < mcQuestions.length) await sleep(DELAY_MS)
    }
  }

  // Open-ended questions: full Gemini flow
  const openTexts = openQuestions.map((q) => q.text)
  const totalBatches = Math.ceil(openTexts.length / BATCH_SIZE)

  for (let i = 0; i < openTexts.length; i += BATCH_SIZE) {
    const batchNum = Math.floor(i / BATCH_SIZE) + 1
    const batch = openTexts.slice(i, i + BATCH_SIZE)
    console.log(`  Open batch ${batchNum}/${totalBatches} (questions ${i + 1}-${i + batch.length})...`)

    let convergenceResults: { answers: string[]; largestGroup: number }[]
    let entertainmentResults: { laugh: number; reveal: number; retell: number }[]

    try {
      ;[convergenceResults, entertainmentResults] = await Promise.all([
        simulateConvergence(batch),
        rateEntertainment(batch),
      ])
    } catch (err) {
      console.error(`  ERROR on batch ${batchNum}, skipping: ${err}`)
      for (const q of batch) {
        grades.push({
          text: q,
          type: 'open',
          convergenceGrade: 'C',
          convergenceGroupSize: 0,
          simulatedAnswers: [],
          entertainmentScore: 0,
          laughFactor: 0,
          revealDrama: 0,
          retellability: 0,
          compositeLabel: 'ERROR',
        })
      }
      await sleep(DELAY_MS)
      continue
    }

    for (let j = 0; j < batch.length; j++) {
      const conv = convergenceResults[j] ?? { answers: [], largestGroup: 0 }
      const ent = entertainmentResults[j] ?? { laugh: 0, reveal: 0, retell: 0 }
      const entAvg = +((ent.laugh + ent.reveal + ent.retell) / 3).toFixed(1)
      const convGrade = gradeConvergence(conv.largestGroup)

      grades.push({
        text: batch[j],
        type: 'open',
        convergenceGrade: convGrade,
        convergenceGroupSize: conv.largestGroup,
        simulatedAnswers: conv.answers,
        entertainmentScore: entAvg,
        laughFactor: ent.laugh,
        revealDrama: ent.reveal,
        retellability: ent.retell,
        compositeLabel: compositeLabel(convGrade, entAvg),
      })
    }

    if (i + BATCH_SIZE < openTexts.length) {
      await sleep(DELAY_MS)
    }
  }

  grades.sort((a, b) => {
    const labelOrder: Record<string, number> = { STAR: 0, KEEP: 1, MAYBE: 2, CUT: 3, ERROR: 4 }
    const la = labelOrder[a.compositeLabel] ?? 5
    const lb = labelOrder[b.compositeLabel] ?? 5
    if (la !== lb) return la - lb
    return b.entertainmentScore - a.entertainmentScore
  })

  const summary = {
    total: grades.length,
    stars: grades.filter((g) => g.compositeLabel === 'STAR').length,
    keeps: grades.filter((g) => g.compositeLabel === 'KEEP').length,
    maybes: grades.filter((g) => g.compositeLabel === 'MAYBE').length,
    cuts: grades.filter((g) => g.compositeLabel === 'CUT').length,
    errors: grades.filter((g) => g.compositeLabel === 'ERROR').length,
  }

  const report = { summary, questions: grades }
  const outPath = path.resolve(__dirname, 'question-report.json')
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2))

  console.log('\n=== GRADING COMPLETE ===')
  console.log(`STAR  (A/B conv + 4+ ent):  ${summary.stars}`)
  console.log(`KEEP  (solid on both axes):  ${summary.keeps}`)
  console.log(`MAYBE (borderline):          ${summary.maybes}`)
  console.log(`CUT   (fails one or both):   ${summary.cuts}`)
  console.log(`ERROR (API failures):        ${summary.errors}`)
  console.log(`\nReport written to: ${outPath}`)
}

main().catch(console.error)
