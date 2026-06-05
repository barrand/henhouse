import * as fs from 'fs'
import * as path from 'path'

const CSV_PATH = path.resolve(__dirname, 'questions.csv')

function csvEscape(value: string): string {
  if (value === '') return ''
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
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

// Match yes/no style questions: "Is X?", "Are X?", "Can X?", etc.
// IMPORTANT: reject if the text also contains " or " mid-sentence (that means it's A/B, not Y/N).
const YES_NO_START_RE = /^(is|are|can|does|do|should|was|were|will|has|have|did)\b/i
const HAS_OR_RE = /\bor\b/i
const EXPLICIT_YN_RE = /\byes\s+or\s+no\b/i

function looksYesNo(text: string): boolean {
  if (EXPLICIT_YN_RE.test(text)) return true
  if (!YES_NO_START_RE.test(text)) return false
  // Strip the explicit Y/N phrase and check if " or " still appears -> means A-or-B question
  const stripped = text.replace(EXPLICIT_YN_RE, '')
  if (HAS_OR_RE.test(stripped)) return false
  return /\?\s*$/.test(text)
}

const MAX_OPTION_LEN = 40

// Strip leading filler like "Have" from options derived from "Would you rather have X or Y"
function cleanOption(opt: string): string {
  return opt.replace(/^(have|be|get|live|go|do|make|see|try|take)\s+/i, (m) => {
    const rest = opt.slice(m.length)
    return rest.length >= 3 ? '' : m
  }).trim()
}

// Apply suggested options only if they all fit within the length limit. Otherwise,
// return null so the caller can skip conversion (leaving the question open-ended
// for manual review).
function prepareOptions(suggested: string): string[] | null {
  const cleaned = suggested
    .split('|')
    .map((o) => cleanOption(o))
    .filter(Boolean)
  if (cleaned.length < 2) return null
  if (cleaned.some((o) => o.length > MAX_OPTION_LEN)) return null
  return cleaned
}

function main() {
  const content = fs.readFileSync(CSV_PATH, 'utf-8')
  const rows = parseCsv(content)
  if (rows.length < 2) {
    console.error('CSV empty.')
    process.exit(1)
  }

  const header = rows[0]
  const idx: Record<string, number> = {}
  header.forEach((h, i) => {
    idx[h.trim().toLowerCase()] = i
  })

  const required = ['text', 'type', 'options', 'auto_label', 'suggested_options']
  for (const col of required) {
    if (idx[col] === undefined) {
      console.error(`Missing column: ${col}`)
      process.exit(1)
    }
  }

  let convertedStrong = 0
  let convertedSuggested = 0
  let convertedYesNo = 0
  let alreadyMc = 0
  let skippedOptionTooLong = 0

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]
    while (row.length < header.length) row.push('')

    const text = (row[idx.text] ?? '').trim()
    const currentType = (row[idx.type] ?? '').trim().toLowerCase()
    const label = (row[idx.auto_label] ?? '').trim()
    const suggested = (row[idx.suggested_options] ?? '').trim()

    if (currentType === 'multiple_choice') {
      alreadyMc++
      continue
    }
    if (!text) continue

    // Case 1: "Yes or no" explicitly stated in text -> always Yes|No MC (overrides everything)
    if (EXPLICIT_YN_RE.test(text)) {
      row[idx.type] = 'multiple_choice'
      row[idx.options] = 'Yes|No'
      convertedYesNo++
      continue
    }

    // Case 2: strong MC labels with suggested options -> apply (with cleanup)
    if (
      (label === 'MC-binary (strong)' || label === 'MC-ternary (strong)') &&
      suggested
    ) {
      const cleaned = prepareOptions(suggested)
      if (!cleaned) {
        skippedOptionTooLong++
        continue
      }
      row[idx.type] = 'multiple_choice'
      row[idx.options] = cleaned.join('|')
      convertedStrong++
      continue
    }

    // Case 3: MC (suggested) with options -> apply
    if (label === 'MC (suggested)' && suggested) {
      const cleaned = prepareOptions(suggested)
      if (!cleaned) {
        skippedOptionTooLong++
        continue
      }
      row[idx.type] = 'multiple_choice'
      row[idx.options] = cleaned.join('|')
      convertedSuggested++
      continue
    }

    // Case 4: unambiguous yes/no question -> Yes|No
    if (looksYesNo(text) && !suggested) {
      row[idx.type] = 'multiple_choice'
      row[idx.options] = 'Yes|No'
      convertedYesNo++
      continue
    }
  }

  const lines = rows.map((r) => r.map(csvEscape).join(','))
  fs.writeFileSync(CSV_PATH, lines.join('\n') + '\n')

  console.log('Applied suggestions to questions.csv:')
  console.log(`  ${convertedStrong}  strong MC (MC-binary / MC-ternary) -> applied with suggested options`)
  console.log(`  ${convertedSuggested}  MC (suggested) -> applied with suggested options`)
  console.log(`  ${convertedYesNo}  yes/no questions detected -> converted to Yes|No`)
  console.log(`  ${skippedOptionTooLong}  skipped (one or more suggested options >${MAX_OPTION_LEN} chars - review manually)`)
  console.log(`  ${alreadyMc}  already multiple_choice (unchanged)`)
  console.log()
  console.log('Next step:')
  console.log('  1. Open questions.csv to spot-check the changes')
  console.log('  2. Run: npm run csv:import')
}

main()
