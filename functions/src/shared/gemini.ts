import { GoogleGenerativeAI } from '@google/generative-ai'

function getModel() {
  const apiKey = process.env.GEMINI_API_KEY ?? ''
  if (!apiKey) throw new Error('GEMINI_API_KEY not set')
  const genAI = new GoogleGenerativeAI(apiKey)
  return genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })
}

// ── Flock Together ────────────────────────────────────────────────────────────

export interface GeminiGroupResult {
  groups: string[][]
  commentary: string
}

export async function groupAnswersWithGemini(question: string, answers: string[]): Promise<GeminiGroupResult> {
  if (answers.length === 0) return { groups: [], commentary: '' }
  if (answers.length === 1) return { groups: [answers], commentary: '' }

  const model = getModel()

  const prompt = `You are scoring a casual party game called Flock Together. Players answered: "${question}"

Answers: ${JSON.stringify(answers)}

Do TWO things:

1. GROUP answers that mean the SAME THING, even if written differently. This is a casual phone game -- players type fast and sloppy. Be generous with matching:

ALWAYS group these together:
- Typos/misspellings: "bagette" = "baguette", "chickn" = "chicken"
- Plurals: "dog" = "dogs", "cookie" = "cookies"
- Articles: "a cat" = "cat" = "the cat"
- Abbreviations: "MJ" = "Michael Jordan", "NYC" = "New York" = "new york city"
- Capitalization: "paris" = "Paris"
- Spacing: "ice cream" = "icecream" = "ice-cream"
- Shorthand: "mac and cheese" = "mac & cheese" = "mac n cheese"
- Informal versions: "gonna" = "going to", "fave" = "favorite"
- Close enough for a party game: "chocolate chip" = "chocolate chip cookies"

NEVER group things that are genuinely DIFFERENT answers:
- "Lisa" and "Manon" are DIFFERENT (different people)
- "Pizza" and "Pasta" are DIFFERENT (different foods)
- "BMW" and "Mercedes" are DIFFERENT (different brands)
- "Lion" and "Tiger" are DIFFERENT (different animals)

When in doubt for this casual party game, lean toward GROUPING rather than splitting. Players get frustrated when obvious matches are missed.
Sort groups largest to smallest. Each answer in exactly one group.

2. Write ONE short, funny COMMENTARY sentence (max 15 words) to spark debate among the players. Roast an outlier, note a surprising consensus, or be playfully sarcastic.

Return ONLY valid JSON: {"groups":[["ans1","ans2"],["ans3"]],"commentary":"your witty comment here"}`

  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: 'application/json',
    },
  })

  const text = result.response.text()
  const parsed = JSON.parse(text)

  if (!parsed.groups || !Array.isArray(parsed.groups)) {
    throw new Error('Invalid Gemini response: missing groups array')
  }

  return { groups: parsed.groups, commentary: parsed.commentary ?? '' }
}

export interface GeneratedQuestion {
  text: string
  category: string
  type?: 'open' | 'multiple_choice'
  options?: string[]
}

export async function generateQuestionsFromCategories(categories: string[]): Promise<GeneratedQuestion[]> {
  if (categories.length === 0) return []

  const model = getModel()

  const prompt = `You are writing questions for "Flock Together" -- a mobile party game where players type the SAME answer as the majority on their phones. Generate 10 short questions themed around: ${categories.join(', ')}

LENGTH IS CRITICAL. Every question MUST be under 80 characters. Aim for 40-60. Players read these on a phone screen and answer in seconds. Short = fun. Long = skipped.

GOOD examples for category "Brazil":
- "Samba or bossa nova?" (20ch)
- "Best Brazilian food: feijoada, coxinha, or açaí?" (49ch)
- "Would you rather live in Rio or São Paulo?" (43ch)
- "What animal do you associate with Brazil?" (41ch)
- "Name a famous Brazilian" (24ch)
- "Carnival or Copa do Mundo?" (26ch)

BAD examples (NEVER write questions like these):
- "You're at a bustling Brazilian churrascaria and a server approaches your table with a giant skewer..." (NO -- way too long, nobody reads this)
- "While exploring a hidden cave in the Amazon, you disturb a rare ancient spirit..." (NO -- scenario setup kills the pace)

CONVERGENCE IS CRITICAL. Players WIN by matching the majority. If the answer space is infinite, there is no majority and the round is bad. Prefer formats that CONSTRAIN the answer space.

STRONG PREFERENCE: At least 7 of 10 questions should be MULTIPLE CHOICE (A/B or A/B/C). These always converge.
- A or B? -- binary choice: "Cats or dogs?"
- A, B, or C? -- pick one of three: "Pirates, aliens, or ghosts?"
- Would you rather A or B: "Would you rather fight a horse-sized duck or 100 duck-sized horses?"

OK if the answer has a super obvious default (use sparingly):
- "Name a famous Italian" (Mario/Leonardo always wins)
- "Most overrated holiday?" (Valentine's/NYE always wins)

NEVER write open-ended questions where any answer is valid:
- BAD: "What is the most passive aggressive thing someone can do?" (infinite answers, no default)
- GOOD: "Most passive aggressive move: the 'k.' text, silent treatment, or fake-smile 'no worries'?"
- BAD: "What is the worst thing to do on a first date?"
- GOOD: "Worst first-date move: talk about your ex, show up late, or chew loud?"
- BAD: "What is the biggest lie everyone tells?"
- GOOD: "Biggest daily lie: 'I'm 5 min away', 'I'll start Monday', or 'I already ate'?"

RULE OF THUMB: If you wrote a "What is the worst/best/most X?" question, rewrite it as "Worst/best X: A, B, or C?" — the options are the joke.

TONE: Family-friendly game night. Punchy, funny, lighthearted. All ages welcome -- no alcohol, drugs, clubbing, partying, or adult-only references.

RULES:
- UNDER 80 CHARACTERS. This is the most important rule.
- Do NOT write a setup, backstory, or scenario. Get straight to the question.
- Every question must relate to one of the provided categories
- Every question MUST constrain the answer space (multiple choice preferred, or a premise with one obvious default)
- NEVER ask "what would you do?" -- ask about a specific thing (object, person, food, place)
- NEVER write boring survey questions ("What is the best thing about X?")
- NEVER write open-ended "What is the most X?" without concrete A/B/C options
- FAMILY FRIENDLY. No alcohol, drugs, clubbing, bars, or adult-only content.
- No racism, sexism, homophobia, ableism. No sexual content.

QUESTION TYPES (return one of these per question):
- Multiple choice (preferred for superlatives/comparisons) - include 2-4 options (prefer 2-3 for punchiness; use 4 only when all options are iconic and it would feel wrong to exclude any):
  { "text": "Best part of Thanksgiving: turkey, sides, or pie?", "type": "multiple_choice", "options": ["Turkey", "Sides", "Pie"], "category": "..." }
  { "text": "Cranberry sauce: canned or homemade?", "type": "multiple_choice", "options": ["Canned", "Homemade"], "category": "..." }
- Open-ended (only for genuinely free-form questions with obvious defaults):
  { "text": "Name a famous Italian", "type": "open", "category": "..." }

MULTIPLE CHOICE RULES:
- Options must be UNDER 30 characters each (button must fit on mobile)
- Options must be genuinely distinct (not "Dogs" and "Dog")
- Every option should be plausible as the majority answer -- no throwaway joke options
- If the question text already embeds options (e.g. "turkey, sides, or pie?"), repeat them in the options array exactly as title case

Return ONLY valid JSON: { "questions": [{ "text": "...", "category": "...", "type": "...", "options": [...] }, ...] }`

  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      maxOutputTokens: 4096,
      temperature: 0.8,
    },
  })

  const text = result.response.text()
  let parsed: { questions?: GeneratedQuestion[] }
  try {
    parsed = JSON.parse(text)
  } catch (err) {
    // Gemini occasionally truncates mid-JSON. Try to salvage by trimming to the last closing brace.
    const last = text.lastIndexOf('}')
    if (last > 0) {
      try {
        parsed = JSON.parse(text.slice(0, last + 1) + ']}')
      } catch {
        console.error('Gemini JSON parse failed and salvage failed:', text.slice(0, 300))
        throw err
      }
    } else {
      throw err
    }
  }

  const MAX_LENGTH = 100
  const MAX_OPTION_LEN = 40

  const questions: GeneratedQuestion[] = (parsed.questions ?? [])
    .filter((q: GeneratedQuestion) => q.text && q.text.length <= MAX_LENGTH)
    .map((q: GeneratedQuestion) => {
      if (q.type === 'multiple_choice') {
        const opts = Array.isArray(q.options) ? q.options.map((o) => String(o).trim()).filter(Boolean) : []
        const valid =
          opts.length >= 2 &&
          opts.length <= 4 &&
          opts.every((o) => o.length > 0 && o.length <= MAX_OPTION_LEN) &&
          new Set(opts.map((o) => o.toLowerCase())).size === opts.length
        if (valid) {
          return { text: q.text, category: q.category, type: 'multiple_choice' as const, options: opts }
        }
        return { text: q.text, category: q.category, type: 'open' as const }
      }
      return { text: q.text, category: q.category, type: 'open' as const }
    })

  return questions
}

// ── Fowl Words (Just One) ─────────────────────────────────────────────────────
// detectDuplicateClues() will be added here in Phase 3
