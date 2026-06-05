import { loadQuestions, validateQuestions } from './lib/questions'

function main() {
  const questions = loadQuestions()
  const issues = validateQuestions(questions)

  const errors = issues.filter((i) => i.severity === 'error')
  const warnings = issues.filter((i) => i.severity === 'warn')

  const mcCount = questions.filter((q) => q.type === 'multiple_choice').length
  const openCount = questions.length - mcCount

  console.log(`\nQuestion bank: ${questions.length} total (${openCount} open, ${mcCount} multiple choice)\n`)

  if (errors.length > 0) {
    console.log(`ERRORS (${errors.length}):`)
    for (const e of errors) {
      console.log(`  [${e.index}] ${e.message}`)
      console.log(`        "${e.text}"`)
    }
    console.log()
  }

  if (warnings.length > 0) {
    console.log(`WARNINGS (${warnings.length}):`)
    for (const w of warnings) {
      console.log(`  [${w.index}] ${w.message}`)
      console.log(`        "${w.text}"`)
    }
    console.log()
  }

  if (errors.length === 0 && warnings.length === 0) {
    console.log('All questions pass validation.')
  }

  process.exit(errors.length > 0 ? 1 : 0)
}

main()
