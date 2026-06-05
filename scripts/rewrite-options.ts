import { GoogleGenerativeAI } from '@google/generative-ai'
import * as fs from 'fs'
import * as path from 'path'

const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? ''
if (!GEMINI_API_KEY) {
  console.error('Set GEMINI_API_KEY environment variable')
  process.exit(1)
}

const CSV_PATH = path.resolve(__dirname, 'questions.csv')

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY)
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

// -- CSV helpers (mirrored from questions-csv.ts to keep this script standalone) --

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

// -- Rewrite logic --

type Mode = 'rewrite' | 'expand'

interface RewriteTarget {
  rowIndex: number
  text: string
  currentOptions: string[]
  mode: Mode
}

interface RewriteResult {
  options: string[]
}

async function rewriteBatch(targets: RewriteTarget[]): Promise<Map<number, RewriteResult>> {
  const prompt = `You are tuning multiple-choice options for "Flock Together", a party game where players tap the SAME option as the majority.

Each question has an ACTION of either "REWRITE" (replace all options) or "EXPAND" (keep existing options as-is, add 1-3 more to reach 4-5 total).

CRITICAL: If the question TEXT embeds a list of options (e.g. "Pick your pet: cat, dog, or fish?"), your options MUST either match those embedded items exactly, OR you must assume the text will be rewritten separately to remove the embedded list. Do not swap the embedded options for unrelated ones, or the question will read as "Pick your pet: cat, dog, or fish?" with buttons for Hamster/Turtle/Snake and confuse players. When unsure, keep options aligned to what the text mentions.

Shared rules for ALL options (new or existing):
- PUNCHY: each option under 30 characters, aim for 15-20
- DISTINCT: options must be clearly different ideas, not variations ("Thin cut" vs "Thin and crispy" = BAD)
- DEBATABLE: every option should be a plausible "majority" answer - no throwaway jokes
- Family-friendly: no alcohol, drugs, clubbing, adult-only content
- Use title case

REWRITE mode rules (number of options, strict):
- 2 options ONLY for true binaries: "Yes or no?", "X or Y?" with no natural third
- 4 options for ALL superlatives, "name a...", "best/worst X". Default to 4.
- 3 is a fallback -- avoid unless exactly 3 answers dominate the cultural space
- MAXIMUM 4 OPTIONS. Never return 5 or more.

EXPAND mode rules:
- KEEP every existing option exactly as given (same spelling, same wording). Do not edit them.
- Add 1-2 NEW options after the existing ones to reach 3-4 total.
- If the existing options are already 4, do not add more -- return the options unchanged.
- If the existing options are 2 AND the question is a true binary (yes/no, clear A vs B), do not add more.
- MAXIMUM 4 OPTIONS. Never return 5 or more.
- New options must be genuinely new, not rephrasings of existing ones.
- New options must feel like they belong alongside the existing ones in tone and style.

Examples:
- REWRITE "What is the best type of french fry?" with ["Shoestring", "Thin cut", "Thin and crispy"]
  -> ["Shoestring", "Waffle", "Curly", "Steak Fry", "Crinkle"] (full replacement, 5 distinct shapes)
- EXPAND "What is the best type of french fry?" with ["Shoestring", "Waffle", "Curly"]
  -> ["Shoestring", "Waffle", "Curly", "Crinkle", "Steak Fry"] (keep all 3 existing, add 2 new)
- EXPAND "Is cereal a soup?" with ["Yes", "No"]
  -> ["Yes", "No"] (true binary - no expansion)
- EXPAND "Name a pizza topping everyone argues about" with ["Pineapple", "Anchovies"]
  -> ["Pineapple", "Anchovies", "Olives", "Mushrooms"] (keep existing, add 2)

Questions:
${targets.map((t, i) => `${i + 1}. ACTION: ${t.mode.toUpperCase()}\n   Question: ${t.text}\n   Current options: ${t.currentOptions.join(' | ')}`).join('\n\n')}

Return ONLY valid JSON:
{
  "rewrites": [
    { "index": 1, "options": ["Opt A", "Opt B", "Opt C"] },
    ...
  ]
}`

  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      maxOutputTokens: 8000,
      temperature: 0.7,
    },
  })

  const text = result.response.text()
  const parsed = JSON.parse(text)

  const out = new Map<number, RewriteResult>()
  for (const r of parsed.rewrites ?? []) {
    if (typeof r.index !== 'number') continue
    const target = targets[r.index - 1]
    if (!target) continue
    const opts = Array.isArray(r.options) ? r.options.map((s: unknown) => String(s).trim()).filter(Boolean) : []
    // Enforce max 4 even if Gemini returns more
    const capped = opts.slice(0, 4)
    if (capped.length >= 2) {
      out.set(target.rowIndex, { options: capped })
    }
  }
  return out
}

const BATCH_SIZE = 10

async function main() {
  if (!fs.existsSync(CSV_PATH)) {
    console.error(`Not found: ${CSV_PATH}. Run 'npm run csv:export' first.`)
    process.exit(1)
  }

  const rows = parseCsv(fs.readFileSync(CSV_PATH, 'utf-8'))
  if (rows.length < 2) {
    console.error('CSV empty.')
    process.exit(1)
  }

  const header = rows[0]
  const idx: Record<string, number> = {}
  header.forEach((h, i) => (idx[h.trim().toLowerCase()] = i))

  for (const col of ['text', 'type', 'options', 'rewrite']) {
    if (idx[col] === undefined) {
      console.error(`Missing column "${col}". Re-export with 'npm run csv:export' to refresh columns.`)
      process.exit(1)
    }
  }

  const targets: RewriteTarget[] = []
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]
    while (row.length < header.length) row.push('')

    const flag = (row[idx.rewrite] ?? '').trim().toLowerCase()
    if (!flag || flag === '0' || flag === 'no' || flag === 'false') continue

    const mode: Mode = flag === 'm' ? 'expand' : 'rewrite'

    const text = (row[idx.text] ?? '').trim()
    if (!text) continue

    // If type is "open" and row is flagged, interpret as "convert to MC + generate options from scratch"
    const type = (row[idx.type] ?? '').trim().toLowerCase()
    const isMc = type === 'multiple_choice' || type === 'mc'

    const optionsStr = (row[idx.options] ?? '').trim()
    const currentOptions = optionsStr.split('|').map((s) => s.trim()).filter(Boolean)

    targets.push({
      rowIndex: r,
      text,
      currentOptions,
      mode: isMc ? mode : 'rewrite', // open -> always generate fresh (rewrite mode)
    })
  }

  if (targets.length === 0) {
    console.log('No rows marked in the rewrite column. Nothing to do.')
    return
  }

  const rewriteCount = targets.filter((t) => t.mode === 'rewrite').length
  const expandCount = targets.filter((t) => t.mode === 'expand').length
  console.log(`Processing ${targets.length} question(s): ${rewriteCount} rewrite (x), ${expandCount} expand (+)...`)

  const updates = new Map<number, RewriteResult>()
  for (let i = 0; i < targets.length; i += BATCH_SIZE) {
    const batch = targets.slice(i, i + BATCH_SIZE)
    console.log(`  Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(targets.length / BATCH_SIZE)}...`)
    try {
      const result = await rewriteBatch(batch)
      for (const [k, v] of result) updates.set(k, v)
    } catch (err) {
      console.error(`  Batch failed:`, err)
    }
  }

  // Apply updates back to rows + clear the rewrite flag
  for (const [rowIndex, { options }] of updates) {
    const row = rows[rowIndex]
    const before = row[idx.options]
    const beforeType = row[idx.type]
    row[idx.options] = options.join('|')
    // If the row was open, flip to multiple_choice since we just generated options for it
    if ((row[idx.type] ?? '').trim().toLowerCase() === 'open') {
      row[idx.type] = 'multiple_choice'
    }
    row[idx.rewrite] = '' // clear so re-runs don't repeat
    const typeChange = beforeType !== row[idx.type] ? ` (type: ${beforeType} -> ${row[idx.type]})` : ''
    console.log(`  row ${rowIndex + 1}: "${row[idx.text]}"${typeChange}`)
    console.log(`    before: ${before}`)
    console.log(`    after:  ${options.join(' | ')}`)
  }

  const lines = rows.map((r) => r.map(csvEscape).join(','))
  fs.writeFileSync(CSV_PATH, lines.join('\n') + '\n')

  console.log(`\nRewrote ${updates.size} of ${targets.length} flagged rows.`)
  console.log(`Rewrite column cleared for successfully updated rows.`)
  console.log(`\nNext step: npm run csv:import`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
