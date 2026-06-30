import { createHash } from 'crypto'

export type TruthOrTurdAnswer = 'truth' | 'turd'

export interface TruthOrTurdQuestion {
  statement: string
  answer: TruthOrTurdAnswer
  explanation: string
  tags: string[]
}

export interface DrawnTruthOrTurdQuestion extends TruthOrTurdQuestion {
  questionKey: string
}

export function truthOrTurdQuestionKey(statement: string): string {
  return createHash('md5').update(statement.trim().toLowerCase()).digest('hex').slice(0, 16)
}

export function drawTruthOrTurdQuestion(
  questions: TruthOrTurdQuestion[],
  usedQuestionKeys: string[] = [],
  rng: () => number = Math.random,
): DrawnTruthOrTurdQuestion | null {
  const used = new Set(usedQuestionKeys)
  const available = uniqueQuestions(questions).filter((question) => {
    return !used.has(truthOrTurdQuestionKey(question.statement))
  })
  if (available.length === 0) return null

  const question = available[Math.floor(rng() * available.length)]
  return {
    ...question,
    questionKey: truthOrTurdQuestionKey(question.statement),
  }
}

export function findTruthOrTurdQuestion(
  questions: TruthOrTurdQuestion[],
  questionKey: string,
): DrawnTruthOrTurdQuestion | null {
  const question = uniqueQuestions(questions).find((candidate) => {
    return truthOrTurdQuestionKey(candidate.statement) === questionKey
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
    const key = truthOrTurdQuestionKey(question.statement)
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(question)
  }

  return unique
}
