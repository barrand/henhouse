import { GoogleGenerativeAI } from '@google/generative-ai'
import * as fs from 'fs'
import * as path from 'path'

const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? ''
if (!GEMINI_API_KEY) {
  console.error('Set GEMINI_API_KEY')
  process.exit(1)
}

const QUESTIONS_PATH = path.resolve(__dirname, '../functions/src/data/questions.json')

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY)
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

interface BankQuestion {
  text: string
  type?: 'open' | 'multiple_choice'
  options?: string[]
  tag?: string
}

interface Mismatch {
  index: number
  text: string
  options: string[]
}

function findMismatches(bank: BankQuestion[]): Mismatch[] {
  const out: Mismatch[] = []
  for (let i = 0; i < bank.length; i++) {
    const q = bank[i]
    if (q.type !== 'multiple_choice') continue
    const text = q.text
    const opts = q.options ?? []
    const m = text.match(/:\s*(.+?)\s*\?\s*$/) || text.match(/^([^?]*\bor\b[^?]*)\?/)
    if (!m) continue
    const inlinePart = m[1]
    const inlineItems = inlinePart.split(/,|\s+or\s+/).map((s) => s.trim()).filter(Boolean)
    if (inlineItems.length < 2) continue
    const overlap = opts.filter((o) => inlinePart.toLowerCase().includes(o.toLowerCase())).length
    if (overlap < inlineItems.length) {
      out.push({ index: i, text, options: opts })
    }
  }
  return out
}

async function rewriteTexts(items: Mismatch[]): Promise<Map<number, string>> {
  const prompt = `You are fixing questions for "Flock Together" where the question text has a stale inline list of options that no longer matches the real options.

For each question below, rewrite the TEXT so it no longer embeds an inline option list. The real options will be shown as tappable buttons below, so the question just needs to set up the scenario.

Rules:
- Keep the question's meaning and tone
- Remove phrases like ": A, B, or C?" or "A, B, or C?" at the end
- End with a question mark or colon
- Under 80 characters total (aim 40-60)
- Do NOT include any of the option names in the rewritten text unless they're part of the setup (not the choices)
- Keep the same vibe -- funny stays funny, gross stays gross

Examples:
- "Your voice permanently changes to: Morgan Freeman, Gilbert Gottfried, or Siri?" (options: Darth Vader, A Chipmunk, Game Show Announcer, Pirate Accent)
  -> "Your voice permanently changes to...?"
- "Pick your apocalypse buddy: a doctor, a mechanic, or a chef?" (options: Doctor, Mechanic, Farmer, Engineer, Scout)
  -> "Pick your apocalypse buddy"
- "Leaving voicemails: thoughtful or a waste of everyone's time?" (options: Thoughtful, Waste Of Time)
  -> "Leaving voicemails:"
- "Diagonal or straight, right way to cut a sandwich?" (options: Diagonal, Straight)
  -> "Right way to cut a sandwich?"

Questions:
${items.map((it, i) => `${i + 1}. Text: "${it.text}"\n   Real options: ${it.options.join(' | ')}`).join('\n\n')}

Return ONLY valid JSON:
{
  "rewrites": [
    { "index": 1, "text": "..." },
    ...
  ]
}`

  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 4000, temperature: 0.5 },
  })

  const parsed = JSON.parse(result.response.text())
  const out = new Map<number, string>()
  for (const r of parsed.rewrites ?? []) {
    if (typeof r.index !== 'number' || typeof r.text !== 'string') continue
    const item = items[r.index - 1]
    if (!item) continue
    const newText = r.text.trim()
    if (newText.length > 0 && newText.length <= 100) {
      out.set(item.index, newText)
    }
  }
  return out
}

async function main() {
  const bank: BankQuestion[] = JSON.parse(fs.readFileSync(QUESTIONS_PATH, 'utf-8'))
  const mismatches = findMismatches(bank)

  if (mismatches.length === 0) {
    console.log('No mismatches found.')
    return
  }

  console.log(`Found ${mismatches.length} text/option mismatches. Asking Gemini to rewrite the text...`)
  const rewrites = await rewriteTexts(mismatches)

  console.log(`\nReceived ${rewrites.size} rewrites:\n`)
  for (const m of mismatches) {
    const newText = rewrites.get(m.index)
    if (!newText) {
      console.log(`  SKIP [${m.index}] no rewrite: "${m.text}"`)
      continue
    }
    console.log(`  [${m.index}]`)
    console.log(`    before: "${m.text}"`)
    console.log(`    after:  "${newText}"`)
    console.log(`    opts:   ${m.options.join(' | ')}`)
    bank[m.index].text = newText
  }

  fs.writeFileSync(QUESTIONS_PATH, JSON.stringify(bank, null, 2) + '\n')
  console.log(`\nUpdated ${rewrites.size} question texts in questions.json`)
  console.log('Next: rebuild and redeploy (npm run build && firebase deploy)')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
