import * as readline from 'readline'
import { loadQuestions, saveQuestions, validateQuestions, PresetQuestion } from './lib/questions'

function ask(rl: readline.Interface, prompt: string): Promise<string> {
  return new Promise((resolve) => rl.question(prompt, (a) => resolve(a)))
}

async function main() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })

  try {
    const text = (await ask(rl, 'Question text: ')).trim()
    if (!text) {
      console.log('Aborted (empty text).')
      return
    }

    const typeInput = (await ask(rl, 'Type [open/mc]: ')).trim().toLowerCase()
    const type = typeInput === 'mc' || typeInput === 'multiple_choice' ? 'multiple_choice' : 'open'

    let options: string[] | undefined
    if (type === 'multiple_choice') {
      const raw = (await ask(rl, 'Options (pipe-separated, 2-5 options, e.g. Cats|Dogs): ')).trim()
      options = raw
        .split('|')
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
      if (options.length < 2 || options.length > 5) {
        console.log('Aborted: must have 2-5 options.')
        return
      }
    }

    const newQuestion: PresetQuestion = { text, type, ...(options ? { options } : {}) }
    const questions = loadQuestions()
    const candidate = [...questions, newQuestion]

    const issues = validateQuestions(candidate).filter((i) => i.index === candidate.length - 1)
    const errors = issues.filter((i) => i.severity === 'error')

    if (errors.length > 0) {
      console.log('\nValidation failed:')
      for (const e of errors) console.log(`  - ${e.message}`)
      return
    }

    saveQuestions(candidate)
    console.log(`\nAdded. Bank now has ${candidate.length} questions.`)

    const warnings = issues.filter((i) => i.severity === 'warn')
    for (const w of warnings) console.log(`  warning: ${w.message}`)
  } finally {
    rl.close()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
