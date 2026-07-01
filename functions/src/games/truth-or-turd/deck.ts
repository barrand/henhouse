import { createHash } from 'crypto'

export type TruthOrTurdAnswer = 'truth' | 'turd'

export interface TruthOrTurdBinaryQuestion {
  kind: 'binary'
  statement: string
  answer: TruthOrTurdAnswer
  explanation: string
  tags: string[]
  sourceRefs?: string[]
}

export interface TruthOrTurdChoice {
  id: string
  text: string
}

export interface TruthOrTurdMultipleChoiceQuestion {
  kind: 'multiple-choice'
  prompt: string
  choices: TruthOrTurdChoice[]
  correctChoiceId: string
  explanation: string
  tags: string[]
  sourceRefs: string[]
}

export type TruthOrTurdQuestion = TruthOrTurdBinaryQuestion | TruthOrTurdMultipleChoiceQuestion

export type DrawnTruthOrTurdQuestion = TruthOrTurdQuestion & { questionKey: string }

export function getTruthOrTurdQuestionText(question: TruthOrTurdQuestion): string {
  return question.kind === 'multiple-choice' ? question.prompt : question.statement
}

export function truthOrTurdQuestionKey(questionOrText: TruthOrTurdQuestion | string): string {
  const text = typeof questionOrText === 'string' ? questionOrText : getTruthOrTurdQuestionText(questionOrText)
  return createHash('md5').update(text.trim().toLowerCase()).digest('hex').slice(0, 16)
}

export function drawTruthOrTurdQuestion(
  questions: TruthOrTurdQuestion[],
  usedQuestionKeys: string[] = [],
  rng: () => number = Math.random,
): DrawnTruthOrTurdQuestion | null {
  const used = new Set(usedQuestionKeys)
  const available = uniqueQuestions(questions).filter((question) => {
    return !used.has(truthOrTurdQuestionKey(question))
  })
  if (available.length === 0) return null

  const question = available[Math.floor(rng() * available.length)]
  return {
    ...question,
    questionKey: truthOrTurdQuestionKey(question),
  }
}

export function findTruthOrTurdQuestion(
  questions: TruthOrTurdQuestion[],
  questionKey: string,
): DrawnTruthOrTurdQuestion | null {
  const question = uniqueQuestions(questions).find((candidate) => {
    return truthOrTurdQuestionKey(candidate) === questionKey
  })
  if (!question) return null
  return {
    ...question,
    questionKey,
  }
}

export function selectTruthOrTurdQuestions(
  questions: TruthOrTurdQuestion[],
  includePatrioticQuestions: boolean,
): TruthOrTurdQuestion[] {
  return uniqueQuestions(questions).filter((question) => {
    const isPatriotic = question.tags.includes('patriotic')
    return includePatrioticQuestions ? isPatriotic : !isPatriotic
  })
}

function uniqueQuestions(questions: TruthOrTurdQuestion[]): TruthOrTurdQuestion[] {
  const seen = new Set<string>()
  const unique: TruthOrTurdQuestion[] = []

  for (const question of questions) {
    const key = truthOrTurdQuestionKey(question)
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(question)
  }

  return unique
}
