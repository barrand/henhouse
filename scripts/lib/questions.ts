import * as fs from 'fs'
import * as path from 'path'

export type QuestionType = 'open' | 'multiple_choice'

export interface PresetQuestion {
  text: string
  type?: QuestionType
  options?: string[]
  tag?: string
  source?: 'preset' | 'patriotic'
}

export const QUESTIONS_PATH = path.resolve(__dirname, '../../functions/src/games/flock-together/data/questions.json')

export function loadQuestions(): PresetQuestion[] {
  const raw = fs.readFileSync(QUESTIONS_PATH, 'utf-8')
  return JSON.parse(raw) as PresetQuestion[]
}

export function saveQuestions(questions: PresetQuestion[]) {
  const cleaned = questions.map((q) => {
    const type = q.type ?? 'open'
    const base = type === 'multiple_choice'
      ? { text: q.text, type, options: q.options ?? [] }
      : { text: q.text, type }
    return {
      ...base,
      ...(q.tag ? { tag: q.tag } : {}),
      ...(q.source ? { source: q.source } : {}),
    }
  })
  fs.writeFileSync(QUESTIONS_PATH, JSON.stringify(cleaned, null, 2) + '\n')
}

// Levenshtein distance, capped. Used to reject near-duplicate options like ["Dog", "Dogs"].
export function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  if (m === 0) return n
  if (n === 0) return m
  const dp: number[] = new Array(n + 1)
  for (let j = 0; j <= n; j++) dp[j] = j
  for (let i = 1; i <= m; i++) {
    let prev = dp[0]
    dp[0] = i
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j]
      if (a[i - 1] === b[j - 1]) {
        dp[j] = prev
      } else {
        dp[j] = 1 + Math.min(prev, dp[j - 1], dp[j])
      }
      prev = tmp
    }
  }
  return dp[n]
}

export interface ValidationIssue {
  index: number
  text: string
  severity: 'error' | 'warn'
  message: string
}

const MAX_TEXT_LEN = 100
const MAX_OPTION_LEN = 80
const MIN_OPTION_DISTANCE = 3
const MIN_OPTIONS = 2
const MAX_OPTIONS = 4

export function validateQuestions(questions: PresetQuestion[]): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const seenTexts = new Map<string, number>()

  questions.forEach((q, index) => {
    const text = q.text?.trim() ?? ''
    if (!text) {
      issues.push({ index, text, severity: 'error', message: 'Empty text' })
      return
    }
    if (text.length > MAX_TEXT_LEN) {
      issues.push({ index, text, severity: 'error', message: `Text too long (${text.length}/${MAX_TEXT_LEN})` })
    }

    const normalized = text.toLowerCase().replace(/\s+/g, ' ').replace(/[?.!]+$/, '').trim()
    const prev = seenTexts.get(normalized)
    if (prev !== undefined) {
      issues.push({
        index,
        text,
        severity: 'error',
        message: `Duplicate of row ${prev} ("${questions[prev].text}")`,
      })
    } else {
      seenTexts.set(normalized, index)
    }

    const type = q.type ?? 'open'
    if (type !== 'open' && type !== 'multiple_choice') {
      issues.push({ index, text, severity: 'error', message: `Invalid type "${type}"` })
      return
    }

    if (type === 'multiple_choice') {
      const opts = q.options ?? []
      if (!Array.isArray(opts) || opts.length < MIN_OPTIONS || opts.length > MAX_OPTIONS) {
        issues.push({ index, text, severity: 'error', message: `MC must have ${MIN_OPTIONS}-${MAX_OPTIONS} options (has ${opts.length})` })
        return
      }
      const trimmed = opts.map((o) => (typeof o === 'string' ? o.trim() : ''))
      trimmed.forEach((opt, i) => {
        if (!opt) {
          issues.push({ index, text, severity: 'error', message: `Option ${i} empty` })
        } else if (opt.length > MAX_OPTION_LEN) {
          issues.push({
            index,
            text,
            severity: 'error',
            message: `Option ${i} too long ("${opt}", ${opt.length}/${MAX_OPTION_LEN})`,
          })
        }
      })

      // Pairwise near-duplicate check (distance >= 3 required)
      for (let i = 0; i < trimmed.length; i++) {
        for (let j = i + 1; j < trimmed.length; j++) {
          const a = trimmed[i].toLowerCase()
          const b = trimmed[j].toLowerCase()
          if (!a || !b) continue
          if (a === b) {
            issues.push({ index, text, severity: 'error', message: `Duplicate options: "${trimmed[i]}" == "${trimmed[j]}"` })
          } else if (levenshtein(a, b) < MIN_OPTION_DISTANCE) {
            issues.push({
              index,
              text,
              severity: 'warn',
              message: `Options "${trimmed[i]}" and "${trimmed[j]}" are very similar`,
            })
          }
        }
      }

      // Lazy option detection
      const lower = trimmed.map((o) => o.toLowerCase())
      const yesNoSet = new Set(['yes', 'no', 'maybe', 'sometimes'])
      const lazyCount = lower.filter((o) => yesNoSet.has(o)).length
      if (lazyCount >= 2 && trimmed.length >= 3) {
        issues.push({
          index,
          text,
          severity: 'warn',
          message: 'Options look lazy (Yes/No/Maybe variants) - consider more specific options',
        })
      }
    } else {
      // Open-ended: should NOT have options
      if (q.options && q.options.length > 0) {
        issues.push({ index, text, severity: 'warn', message: 'Open-ended question has options field (ignored)' })
      }
    }
  })

  return issues
}
