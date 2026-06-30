import * as fs from 'fs'
import * as path from 'path'
import { PresetQuestion, loadQuestions, saveQuestions, validateQuestions } from './lib/questions'

type ReviewRating = 'g' | 'x' | 'rq' | 'rg' | 'ra'

type ReviewRow = {
  rowNum: number
  id: number
  source: string
  type: 'open' | 'multiple_choice'
  question: string
  options: string[]
  rating: ReviewRating
}

type RewriteProposal = {
  question?: string
  options?: string[]
  note: string
}

type RewriteReviewRow = {
  id: number
  rowNum: number
  rating: ReviewRating
  source: string
  type: 'open' | 'multiple_choice'
  currentQuestion: string
  proposedQuestion: string
  currentOptions: string[]
  proposedOptions: string[]
  note: string
}

const DEFAULT_REVIEW_CSV = '/Users/bbarrand/Downloads/questions-review - questions-review.csv.csv'
const OUTPUT_DIR = path.resolve(__dirname, 'review-output')
const APPROVED_REWRITE_IDS = new Set<number>([213])

const REWRITE_PROPOSALS: Record<number, RewriteProposal> = {
  7: {
    question: 'What is the worst thing to hear a doctor say right before your appointment starts?',
    options: ['We made a mistake', "I have no idea what's going on", 'Can somebody pull up the manual?'],
    note: 'Softens the genuinely grim medical angle and keeps the humor in awkward incompetence.',
  },
  38: {
    options: ['Karen', 'Khaleesi', 'Braxton'],
    note: 'Replaces the darkest options with names that are more playful and still likely to converge.',
  },
  39: {
    question: 'What word is hardest to say while still sounding intimidating?',
    options: ['Bubbles', 'Marshmallow', 'Giggles'],
    note: 'Keeps the same answer set but gives the question a clearer comedic frame.',
  },
  213: {
    options: ['Yes, everyone gets the full process', 'No, the video is enough', 'Yes, but keep it brief'],
    note: 'Shortens the options to fit validation limits while keeping the constitutional split intact.',
  },
}

function parseCsv(content: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  const text = content.replace(/\r\n/g, '\n')

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += ch
      }
      continue
    }

    if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      row.push(field)
      field = ''
    } else if (ch === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else {
      field += ch
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  return rows.filter((r) => !(r.length === 1 && r[0] === ''))
}

function normalizeType(value: string): 'open' | 'multiple_choice' {
  const raw = value.trim().toLowerCase()
  return raw === 'multiple_choice' ? 'multiple_choice' : 'open'
}

function normalizeRating(value: string): ReviewRating {
  const rating = value.trim().toLowerCase()
  if (rating === 'g' || rating === 'x' || rating === 'rq' || rating === 'rg' || rating === 'ra') {
    return rating
  }
  throw new Error(`Unsupported rating "${value}"`)
}

function toQuestion(row: ReviewRow, current: PresetQuestion, proposal?: RewriteProposal): PresetQuestion {
  const type = proposal?.options || row.type === 'multiple_choice' ? 'multiple_choice' : row.type
  const text = (proposal?.question ?? row.question).trim()
  const options = (proposal?.options ?? row.options).map((opt) => opt.trim()).filter(Boolean)

  const question: PresetQuestion = {
    text,
    type,
  }

  if (type === 'multiple_choice') question.options = options
  if (current.tag) question.tag = current.tag

  const source = row.source.trim() || current.source || ''
  if (source === 'preset' || source === 'patriotic') {
    question.source = source
  }

  return question
}

function toReviewMarkdown(rows: RewriteReviewRow[]): string {
  const lines: string[] = [
    '# Rewrite Review',
    '',
    'These rows were excluded from the direct import and need approval before we write them into the question bank.',
    '',
  ]

  for (const row of rows) {
    lines.push(`## Row ${row.id} (${row.rating})`)
    lines.push('')
    lines.push(`Current: ${row.currentQuestion}`)
    lines.push(`Proposed: ${row.proposedQuestion}`)
    if (row.currentOptions.length > 0) {
      lines.push(`Current options: ${row.currentOptions.join(' | ')}`)
    }
    if (row.proposedOptions.length > 0) {
      lines.push(`Proposed options: ${row.proposedOptions.join(' | ')}`)
    }
    lines.push(`Why: ${row.note}`)
    lines.push('')
  }

  return lines.join('\n')
}

function toValidationMarkdown(
  title: string,
  issues: { index: number; text: string; message: string }[],
): string {
  const lines = [`# ${title}`, '']
  if (issues.length === 0) {
    lines.push('No validation errors.')
    lines.push('')
    return lines.join('\n')
  }

  lines.push(`Validation errors: ${issues.length}`)
  lines.push('')
  for (const issue of issues) {
    lines.push(`- Row ${issue.index + 1}: ${issue.text}`)
    lines.push(`  ${issue.message}`)
  }
  lines.push('')
  return lines.join('\n')
}

function toReviewCsv(rows: RewriteReviewRow[]): string {
  const header = [
    'id',
    'rating',
    'source',
    'type',
    'current_question',
    'proposed_question',
    'current_options',
    'proposed_options',
    'note',
    'approved',
  ]

  const escape = (value: string) => {
    if (!/[",\n\r]/.test(value)) return value
    return `"${value.replace(/"/g, '""')}"`
  }

  const body = rows.map((row) => [
    String(row.id),
    row.rating,
    row.source,
    row.type,
    row.currentQuestion,
    row.proposedQuestion,
    row.currentOptions.join(' | '),
    row.proposedOptions.join(' | '),
    row.note,
    '',
  ].map(escape).join(','))

  return [header.join(','), ...body].join('\n') + '\n'
}

function main() {
  const csvPath = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_REVIEW_CSV
  const apply = process.argv.includes('--apply')
  if (!fs.existsSync(csvPath)) {
    throw new Error(`Review CSV not found: ${csvPath}`)
  }

  const currentQuestions = loadQuestions()
  const rows = parseCsv(fs.readFileSync(csvPath, 'utf8'))
  const header = rows[0].map((cell) => cell.trim())
  const idx = Object.fromEntries(header.map((name, i) => [name, i]))

  const reviewRows: ReviewRow[] = rows.slice(1).map((row, i) => {
    const options = [row[idx.option1], row[idx.option2], row[idx.option3], row[idx.option4]]
      .map((cell) => (cell ?? '').trim())
      .filter(Boolean)

    return {
      rowNum: i + 2,
      id: Number(row[idx.id]),
      source: (row[idx.source] ?? '').trim(),
      type: normalizeType(row[idx.type] ?? 'open'),
      question: (row[idx.question] ?? '').trim(),
      options,
      rating: normalizeRating(row[idx.rating] ?? ''),
    }
  })

  if (reviewRows.length !== currentQuestions.length) {
    throw new Error(`Row count mismatch: review CSV has ${reviewRows.length}, current bank has ${currentQuestions.length}`)
  }

  const approvedOnly: PresetQuestion[] = []
  const withProposals: PresetQuestion[] = []
  const rewriteReviewRows: RewriteReviewRow[] = []
  const counts: Record<ReviewRating, number> = { g: 0, x: 0, rq: 0, rg: 0, ra: 0 }

  for (const row of reviewRows) {
    counts[row.rating]++
    const current = currentQuestions[row.id - 1]
    if (!current) throw new Error(`No current question found for row id ${row.id}`)

    if (row.rating === 'x') continue

    if (row.rating === 'g') {
      const q = toQuestion(row, current)
      approvedOnly.push(q)
      withProposals.push(q)
      continue
    }

    if (APPROVED_REWRITE_IDS.has(row.id)) {
      const proposal = REWRITE_PROPOSALS[row.id]
      if (!proposal) throw new Error(`Missing rewrite proposal for approved row id ${row.id}`)

      const proposedQuestion = toQuestion(row, current, proposal)
      withProposals.push(proposedQuestion)
      rewriteReviewRows.push({
        id: row.id,
        rowNum: row.rowNum,
        rating: row.rating,
        source: row.source || current.source || '',
        type: row.type,
        currentQuestion: row.question,
        proposedQuestion: proposedQuestion.text,
        currentOptions: row.options,
        proposedOptions: proposedQuestion.options ?? [],
        note: proposal.note,
      })
    } else {
      // Unapproved rewrite rows are treated as deletes for the fresh import.
    }
  }

  const approvedIssues = validateQuestions(approvedOnly)
  const proposedIssues = validateQuestions(withProposals)
  const approvedErrors = approvedIssues.filter((issue) => issue.severity === 'error')
  const proposedErrors = proposedIssues.filter((issue) => issue.severity === 'error')

  fs.mkdirSync(OUTPUT_DIR, { recursive: true })

  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'questions-hand-review-approved-only.json'),
    JSON.stringify(approvedOnly, null, 2) + '\n',
  )
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'questions-hand-review-with-proposed-rewrites.json'),
    JSON.stringify(withProposals, null, 2) + '\n',
  )
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'questions-hand-review-rewrite-review.md'),
    toReviewMarkdown(rewriteReviewRows),
  )
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'questions-hand-review-rewrite-review.csv'),
    toReviewCsv(rewriteReviewRows),
  )
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'questions-hand-review-approved-validation.md'),
    toValidationMarkdown('Approved-Only Validation', approvedErrors),
  )
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'questions-hand-review-proposed-validation.md'),
    toValidationMarkdown('Proposed Validation', proposedErrors),
  )
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'questions-hand-review-summary.json'),
    JSON.stringify({
      csvPath,
      currentQuestionCount: currentQuestions.length,
      approvedQuestionCount: approvedOnly.length,
      proposedQuestionCount: withProposals.length,
      rewriteReviewCount: rewriteReviewRows.length,
      readyToImportApprovedOnly: approvedErrors.length === 0,
      readyToImportWithProposals: proposedErrors.length === 0,
      counts,
      approvedErrors,
      proposedErrors,
      approvedWarnings: approvedIssues.filter((issue) => issue.severity === 'warn'),
      proposedWarnings: proposedIssues.filter((issue) => issue.severity === 'warn'),
    }, null, 2) + '\n',
  )

  console.log(`Wrote review artifacts to ${OUTPUT_DIR}`)
  console.log(`  Approved only: ${approvedOnly.length} questions`)
  console.log(`  With proposed rewrites: ${withProposals.length} questions`)
  console.log(`  Rewrite review rows: ${rewriteReviewRows.length}`)
  console.log(`  Approved-only validation errors: ${approvedErrors.length}`)
  console.log(`  Proposed validation errors: ${proposedErrors.length}`)

  if (apply) {
    if (proposedErrors.length > 0) {
      throw new Error(`Refusing to apply: proposed bank still has ${proposedErrors.length} validation error(s)`)
    }
    saveQuestions(withProposals)
    console.log('  Applied proposed bank to functions/src/games/flock-together/data/questions.json')
  }
}

main()
