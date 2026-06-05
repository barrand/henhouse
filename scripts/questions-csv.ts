import * as fs from 'fs'
import * as path from 'path'
import { loadQuestions, saveQuestions, validateQuestions, PresetQuestion } from './lib/questions'

const CSV_PATH = path.resolve(__dirname, 'questions.csv')
const REPORT_PATH = path.resolve(__dirname, 'question-report.json')

const OPTIONS_DELIM = '|'

// Columns in order. The first five are what you edit. The rest are
// read-only hints from the grader; the importer ignores them.
const CSV_HEADERS = [
  'delete',
  'rewrite',
  'text',
  'type',
  'options',
  'tag',
  'auto_label',
  'suggested_options',
  'simulated_answers',
  'grade',
]

function csvEscape(value: string): string {
  if (value === '') return ''
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

function toCsvRow(values: string[]): string {
  return values.map(csvEscape).join(',')
}

function parseCsv(content: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let i = 0
  const text = content.replace(/\r\n/g, '\n')

  while (i < text.length) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        inQuotes = false
        i++
        continue
      }
      field += ch
      i++
    } else {
      if (ch === '"') {
        inQuotes = true
        i++
      } else if (ch === ',') {
        row.push(field)
        field = ''
        i++
      } else if (ch === '\n') {
        row.push(field)
        rows.push(row)
        row = []
        field = ''
        i++
      } else {
        field += ch
        i++
      }
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((r) => r.length > 0 && !(r.length === 1 && r[0] === ''))
}

interface ReportEntry {
  text: string
  convergenceGrade?: string
  simulatedAnswers?: string[]
  compositeLabel?: string
}

type AutoLabel =
  | ''
  | 'SKIP (auto)'
  | 'MC-binary (strong)'
  | 'MC-ternary (strong)'
  | 'MC (suggested)'
  | 'Open (strong default)'
  | 'Open (free-form)'
  | 'Open (no data)'
  | 'Open (weak signal)'

const BINARY_RE = /^would you rather\s+(.+?)\s+or\s+(.+?)\s*\??\s*$/i
const TRAILING_OR_RE = /\b(\w[\w'-]*)\s+or\s+(\w[\w'-]*)\s*\??\s*$/i

function detectBinary(text: string): [string, string] | null {
  const wyr = text.match(BINARY_RE)
  if (wyr) {
    const a = titleCase(wyr[1])
    const b = titleCase(wyr[2])
    if (a && b && a.length <= 40 && b.length <= 40 && a.toLowerCase() !== b.toLowerCase()) return [a, b]
  }
  const simple = text.match(TRAILING_OR_RE)
  if (simple) {
    const a = titleCase(simple[1])
    const b = titleCase(simple[2])
    if (a.toLowerCase() !== b.toLowerCase()) return [a, b]
  }
  return null
}

function classify(q: PresetQuestion, entry: ReportEntry | undefined): { label: AutoLabel; suggested: string[] } {
  if (q.type === 'multiple_choice') return { label: '', suggested: [] }

  const binary = detectBinary(q.text)

  if (entry?.compositeLabel === 'CUT' || entry?.convergenceGrade === 'D' || entry?.convergenceGrade === 'F') {
    return { label: 'SKIP (auto)', suggested: binary ?? [] }
  }

  if (binary) {
    return { label: 'MC-binary (strong)', suggested: binary }
  }

  const sims = entry?.simulatedAnswers ?? []
  if (sims.length === 0) return { label: 'Open (no data)', suggested: [] }

  const counts = new Map<string, { count: number; display: string }>()
  for (const raw of sims) {
    const key = normalizeForMatch(raw)
    if (!key) continue
    const existing = counts.get(key)
    if (existing) existing.count++
    else counts.set(key, { count: 1, display: titleCase(raw) })
  }
  const sorted = [...counts.values()].sort((a, b) => b.count - a.count)
  const total = sims.length
  const topPct = sorted[0] ? (sorted[0].count / total) * 100 : 0
  const top3Pct = sorted.slice(0, 3).reduce((s, x) => s + x.count, 0) / total * 100

  if (topPct > 85) return { label: 'Open (strong default)', suggested: [] }
  if (top3Pct >= 90 && sorted.length >= 3 && topPct <= 70) {
    return { label: 'MC-ternary (strong)', suggested: sorted.slice(0, 3).map((s) => s.display) }
  }
  if (top3Pct < 60) return { label: 'Open (free-form)', suggested: [] }
  return { label: 'MC (suggested)', suggested: sorted.slice(0, 3).map((s) => s.display) }
}

function normalizeForMatch(s: string): string {
  return s.trim().toLowerCase().replace(/^(the |a |an )/, '').replace(/[.!?]+$/, '').replace(/\s+/g, ' ')
}

function titleCase(s: string): string {
  const trimmed = s.trim().replace(/[.!?]+$/, '')
  if (!trimmed) return trimmed
  if (/[A-Z]/.test(trimmed) && /[a-z]/.test(trimmed)) return trimmed
  return trimmed.replace(/\w\S*/g, (w) => w[0].toUpperCase() + w.slice(1))
}

function loadReportIndex(): Map<string, ReportEntry> {
  if (!fs.existsSync(REPORT_PATH)) return new Map()
  const report = JSON.parse(fs.readFileSync(REPORT_PATH, 'utf-8'))
  const index = new Map<string, ReportEntry>()
  for (const e of report.questions ?? []) {
    index.set(normalizeForMatch(e.text), e)
  }
  return index
}

function exportCsv() {
  const questions = loadQuestions()
  const reportIndex = loadReportIndex()

  const summary: Record<string, number> = {}

  const lines = [toCsvRow(CSV_HEADERS)]
  for (const q of questions) {
    const type = q.type ?? 'open'
    const reportEntry = reportIndex.get(normalizeForMatch(q.text))
    const { label, suggested } = classify(q, reportEntry)

    summary[label || '(already MC)'] = (summary[label || '(already MC)'] ?? 0) + 1

    lines.push(
      toCsvRow([
        '', // delete column - user marks with x
        '', // rewrite column - user marks with x
        q.text,
        type,
        (q.options ?? []).join(OPTIONS_DELIM),
        q.tag ?? '',
        label,
        suggested.join(OPTIONS_DELIM),
        (reportEntry?.simulatedAnswers ?? []).join(' | '),
        reportEntry?.convergenceGrade ?? '',
      ]),
    )
  }
  fs.writeFileSync(CSV_PATH, lines.join('\n') + '\n')

  console.log(`Exported ${questions.length} questions to:`)
  console.log(`  ${CSV_PATH}\n`)

  console.log('Auto-label breakdown:')
  for (const [label, count] of Object.entries(summary).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${count.toString().padStart(4)}  ${label}`)
  }
  console.log()
  console.log(`COLUMNS YOU EDIT:`)
  console.log(`  delete   - put "x" to remove the question on next import`)
  console.log(`  rewrite  - "x" = fully replace options; "m" = keep existing, add more (run: npm run csv:rewrite)`)
  console.log(`  text     - the question text`)
  console.log(`  type     - "open" or "multiple_choice"`)
  console.log(`  options  - pipe-separated, e.g. Cats|Dogs  (2-5 options)`)
  console.log(`  tag      - optional, usually leave blank`)
  console.log()
  console.log(`READ-ONLY HINTS (importer ignores):`)
  console.log(`  auto_label          - classifier's guess at best type`)
  console.log(`  suggested_options   - options you can copy if you convert to MC`)
  console.log(`  simulated_answers   - what Gemini predicted players would say`)
  console.log(`  grade               - convergence grade (A/B/C)`)
  console.log()
  console.log(`Tip: sort by auto_label in your spreadsheet to batch-review similar questions.`)
  console.log()
  console.log(`When done: npm run csv:import`)
}

function importCsv() {
  if (!fs.existsSync(CSV_PATH)) {
    console.error(`Not found: ${CSV_PATH}`)
    console.error(`Run "npm run csv:export" first.`)
    process.exit(1)
  }

  const content = fs.readFileSync(CSV_PATH, 'utf-8')
  const rows = parseCsv(content)
  if (rows.length === 0) {
    console.error('CSV is empty.')
    process.exit(1)
  }

  const header = rows[0].map((h) => h.trim().toLowerCase())
  const idx = {
    delete: header.indexOf('delete'),
    text: header.indexOf('text'),
    type: header.indexOf('type'),
    options: header.indexOf('options'),
    tag: header.indexOf('tag'),
  }
  if (idx.text === -1) {
    console.error(`CSV missing "text" column. Found: ${header.join(', ')}`)
    process.exit(1)
  }

  const questions: PresetQuestion[] = []
  let deletedCount = 0

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]
    const text = (row[idx.text] ?? '').trim()
    if (!text) continue

    // Skip rows marked for deletion
    const deleteFlag = idx.delete !== -1 ? (row[idx.delete] ?? '').trim().toLowerCase() : ''
    if (deleteFlag && deleteFlag !== '0' && deleteFlag !== 'no' && deleteFlag !== 'false') {
      deletedCount++
      continue
    }

    const rawType = idx.type !== -1 ? (row[idx.type] ?? '').trim().toLowerCase() : 'open'
    const type = rawType === 'mc' || rawType === 'multiple_choice' ? 'multiple_choice' : 'open'

    const rawOptions = idx.options !== -1 ? (row[idx.options] ?? '').trim() : ''
    const options = rawOptions
      ? rawOptions.split(OPTIONS_DELIM).map((s) => s.trim()).filter(Boolean)
      : undefined

    const tag = idx.tag !== -1 ? (row[idx.tag] ?? '').trim() : ''

    const q: PresetQuestion = {
      text,
      type,
      ...(type === 'multiple_choice' && options ? { options } : {}),
      ...(tag ? { tag } : {}),
    }
    questions.push(q)
  }

  const issues = validateQuestions(questions)
  const errors = issues.filter((i) => i.severity === 'error')
  if (errors.length > 0) {
    console.error(`Refusing to import - ${errors.length} errors:`)
    for (const e of errors.slice(0, 20)) {
      console.error(`  row ${e.index + 2}: ${e.message}: "${e.text}"`)
    }
    if (errors.length > 20) console.error(`  ...and ${errors.length - 20} more`)
    process.exit(1)
  }

  const previousCount = loadQuestions().length
  saveQuestions(questions)

  const mc = questions.filter((q) => q.type === 'multiple_choice').length
  const open = questions.length - mc
  const delta = questions.length - previousCount

  console.log(`Imported successfully.`)
  console.log(`  Total: ${questions.length} (${open} open, ${mc} multiple choice)`)
  if (delta !== 0) {
    console.log(`  Change from previous: ${delta > 0 ? '+' : ''}${delta}`)
  }
  if (deletedCount > 0) {
    console.log(`  Deleted (delete column marked): ${deletedCount}`)
  }

  const warnings = issues.filter((i) => i.severity === 'warn')
  if (warnings.length > 0) {
    console.log(`\n${warnings.length} warnings (non-fatal):`)
    for (const w of warnings.slice(0, 10)) {
      console.log(`  row ${w.index + 2}: ${w.message}`)
    }
  }
}

const cmd = process.argv[2]
if (cmd === 'export') {
  exportCsv()
} else if (cmd === 'import') {
  importCsv()
} else {
  console.error('Usage: npx tsx questions-csv.ts [export|import]')
  process.exit(1)
}
