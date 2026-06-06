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

// ── Just One ──────────────────────────────────────────────────────────────────

export interface DuplicateClueResult {
  // ALL clues grouped together. Size-1 groups = unique clues. Size-2+ = duplicates.
  // Every playerId in `clues` MUST appear in exactly one group.
  // e.g. [["alice"], ["bob","carol"], ["dave"]]
  groups: string[][]
  reason: string
}

export async function detectDuplicateClues(
  secretWord: string,
  clues: Record<string, string>, // playerId -> clue word
): Promise<DuplicateClueResult> {
  const playerIds = Object.keys(clues)
  if (playerIds.length === 0) {
    return { groups: [], reason: 'No clues submitted' }
  }
  if (playerIds.length === 1) {
    return { groups: [[playerIds[0]]], reason: 'Only one clue submitted' }
  }

  const model = getModel()
  const cluesList = playerIds.map((id) => `${id}: "${clues[id]}"`)

  const prompt = `The secret word for this round of Just One is: "${secretWord}"

Players gave these clues:
${cluesList.join('\n')}

Your job: GROUP the clues that mean the same thing or are too similar. Players who share a group are "eliminated" together. Players in a size-1 group (unique clue) survive.

Every player MUST appear in exactly one group.

RULES for when two clues belong to the same group:
- SAME GROUP if EXACTLY the same word (case-insensitive): "Paris" = "paris" = "PARIS"
- SAME GROUP if synonyms that mean the same thing: "big" and "large", "happy" and "joyful"
- SAME GROUP if very close variations: "run" and "running", "cat" and "cats"
- SAME GROUP if anagrams of the same letters (super rare): "listen" and "silent"
- DIFFERENT GROUPS if just related to the same topic: "movie" and "actor" both relate to cinema but are different clues — keep them separate

Context matters. For example, if the secret word is "PARIS":
- "FRANCE" and "CITY" → DIFFERENT groups (both unique)
- "FRANCE" and "FRENCH" → SAME group (similar enough)
- "EIFFEL" and "FRANCE" → DIFFERENT groups (both unique)

Return ONLY valid JSON in this exact shape:
{
  "groups": [["playerId1"], ["playerId2", "playerId3"], ["playerId4"]],
  "reason": "Brief one-sentence explanation, e.g. 'Bob and Carol both wrote FRANCE'"
}

Every player in the input MUST be in exactly one group in the output. The number of input players must equal the total players across all groups.`

  try {
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
      },
    })

    const text = result.response.text()
    const parsed = JSON.parse(text)
    const rawGroups: unknown = parsed.groups

    if (!Array.isArray(rawGroups)) {
      throw new Error('Invalid Gemini response: groups not an array')
    }

    // Validate that every player appears exactly once across all groups
    const seen = new Set<string>()
    const validGroups: string[][] = []
    for (const group of rawGroups) {
      if (!Array.isArray(group)) continue
      const groupIds: string[] = []
      for (const id of group) {
        if (typeof id === 'string' && id in clues && !seen.has(id)) {
          seen.add(id)
          groupIds.push(id)
        }
      }
      if (groupIds.length > 0) validGroups.push(groupIds)
    }

    // Add any missing players as their own unique group (defensive)
    for (const id of playerIds) {
      if (!seen.has(id)) {
        validGroups.push([id])
      }
    }

    return {
      groups: validGroups,
      reason: typeof parsed.reason === 'string' ? parsed.reason : 'Clues grouped',
    }
  } catch (err) {
    console.error('Gemini duplicate detection failed, falling back to exact match:', err)
    return fallbackExactMatchGrouping(clues)
  }
}

function fallbackExactMatchGrouping(clues: Record<string, string>): DuplicateClueResult {
  // Group by exact normalized text (lowercase, trimmed)
  const clueToIds: Record<string, string[]> = {}
  for (const [playerId, clue] of Object.entries(clues)) {
    const normalized = clue.trim().toLowerCase()
    if (!clueToIds[normalized]) clueToIds[normalized] = []
    clueToIds[normalized].push(playerId)
  }
  const groups = Object.values(clueToIds)
  const hasDuplicates = groups.some((g) => g.length > 1)
  return {
    groups,
    reason: hasDuplicates
      ? 'Exact duplicates detected (Gemini unavailable)'
      : 'All clues unique (Gemini unavailable)',
  }
}

// ── Just One: Guess Evaluation ────────────────────────────────────────────────

export async function evaluateGuess(secretWord: string, guess: string): Promise<boolean> {
  const trimmedGuess = guess.trim()
  const trimmedSecret = secretWord.trim()

  // Fast path: exact case-insensitive match (no Gemini call needed)
  if (trimmedGuess.toUpperCase() === trimmedSecret.toUpperCase()) {
    return true
  }

  // Empty guess is never correct
  if (trimmedGuess.length === 0) return false

  // Skip Gemini if guess is wildly different in length (likely not close)
  if (Math.abs(trimmedGuess.length - trimmedSecret.length) > Math.max(5, trimmedSecret.length)) {
    return false
  }

  try {
    const model = getModel()
    const prompt = `In the party game Just One, the secret word is: "${trimmedSecret}"

A player guessed: "${trimmedGuess}"

Should this be accepted as correct?

ACCEPT (return true) for:
- Plural/singular variations: "wolves" matches "WOLF", "cat" matches "CATS"
- Verb tense variations: "ran" matches "RUN", "running" matches "RUN"
- Common typos and misspellings: "neccessary" matches "NECESSARY", "tomatoe" matches "TOMATO"
- Accents/diacritics: "café" matches "CAFE", "résumé" matches "RESUME"
- Capitalization: already handled, but extra leniency is fine
- Compound words written differently: "ice cream" matches "ICECREAM"

REJECT (return false) for:
- Completely different words: "WOLF" does NOT match "BEAR"
- Same category but different: "WOLF" does NOT match "DOG"
- Synonyms with different meanings: "HAPPY" does NOT match "JOY" (different word entirely)
- Related words: "OCEAN" does NOT match "BEACH"

Return ONLY valid JSON: {"correct": true} or {"correct": false}`

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
      },
    })

    const text = result.response.text()
    const parsed = JSON.parse(text)
    return parsed.correct === true
  } catch (err) {
    console.error('Gemini guess evaluation failed, falling back to exact match:', err)
    // Already failed the exact match earlier, so fallback = reject
    return false
  }
}
