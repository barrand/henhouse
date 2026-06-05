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

interface Target {
  index: number
  text: string
  options: string[]
}

/**
 * Find any MC question whose text embeds a comma/or-separated list of choices
 * in the form "...: X, Y, or Z?" or "...X, Y, or Z?" at the end. The list may
 * be part of the current options or different -- either way, the inline list
 * duplicates the buttons and makes the UI confusing.
 */
function findQuestionsWithInlineOptions(bank: BankQuestion[]): Target[] {
  const out: Target[] = []
  for (let i = 0; i < bank.length; i++) {
    const q = bank[i]
    if (q.type !== 'multiple_choice') continue
    const text = q.text

    // Pattern 1: "something: X, Y, or Z?" (colon-introduced list)
    // Pattern 2: "setup X, Y, or Z?" (bare list at end)
    const colonMatch = text.match(/:\s*([^:?]+?\bor\b[^?]+?)\?\s*$/)
    const bareMatch = !colonMatch && text.match(/,\s*([^,?]+?,\s*[^,?]+?\bor\b[^?]+?)\?\s*$/)
    const match = colonMatch || bareMatch
    if (!match) continue

    const listPart = match[1]
    const items = listPart.split(/,|\s+or\s+/).map((s) => s.trim()).filter(Boolean)
    if (items.length < 2) continue

    out.push({ index: i, text, options: q.options ?? [] })
  }
  return out
}

async function rewriteTextsBatch(items: Target[]): Promise<Map<number, string>> {
  const prompt = `You are cleaning up questions for "Flock Together", a party game where options appear as tappable buttons BELOW the question text.

The questions below each embed an inline option list in the text (e.g. "Pick X: A, B, or C?"). This is redundant because the real options appear as buttons. Your job: rewrite each question's TEXT to remove the inline list.

Rules:
- Keep the question's setup and meaning
- Remove the ": A, B, or C?" or similar trailing list
- End with a question mark, colon, or period
- Under 80 characters, aim 30-60
- Do NOT include option names in the new text -- they belong on the buttons
- Keep the same tone (funny, gross, weird - whatever the original vibe was)

Examples:
- "Pick your new ringtone that you can never change: a baby crying, a dial-up modem, or the Macarena?"
  -> "Pick your new ringtone (you can never change it)"
- "Your car horn is replaced with one sound: a goat scream, a fart, or the Macarena?"
  -> "Your car horn is replaced with one sound"
- "Would you rather fight 1 horse-sized duck or 100 duck-sized horses?"
  -> "Would you rather fight..." (this one has a natural cut too)
- "Pick your apocalypse buddy: a doctor, a mechanic, or a chef?"
  -> "Pick your apocalypse buddy:"

Questions:
${items.map((it, i) => `${i + 1}. Text: "${it.text}"\n   Current buttons: ${it.options.join(' | ')}`).join('\n\n')}

Return ONLY valid JSON:
{
  "rewrites": [
    { "index": 1, "text": "..." },
    ...
  ]
}`

  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 6000, temperature: 0.4 },
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

const BATCH_SIZE = 10

async function main() {
  const bank: BankQuestion[] = JSON.parse(fs.readFileSync(QUESTIONS_PATH, 'utf-8'))
  const targets = findQuestionsWithInlineOptions(bank)

  if (targets.length === 0) {
    console.log('No questions with inline option lists found.')
    return
  }

  console.log(`Found ${targets.length} questions with inline option lists. Rewriting text...`)

  for (let i = 0; i < targets.length; i += BATCH_SIZE) {
    const batch = targets.slice(i, i + BATCH_SIZE)
    console.log(`  Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(targets.length / BATCH_SIZE)}...`)
    try {
      const rewrites = await rewriteTextsBatch(batch)
      for (const t of batch) {
        const newText = rewrites.get(t.index)
        if (!newText) {
          console.log(`  SKIP [${t.index}] no rewrite: "${t.text}"`)
          continue
        }
        console.log(`  [${t.index}]`)
        console.log(`    before: "${t.text}"`)
        console.log(`    after:  "${newText}"`)
        bank[t.index].text = newText
      }
    } catch (err) {
      console.error(`  Batch failed:`, err)
    }
  }

  fs.writeFileSync(QUESTIONS_PATH, JSON.stringify(bank, null, 2) + '\n')
  console.log(`\nDone. Updated ${targets.length} question texts.`)
  console.log('Next: firebase deploy --only functions')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
