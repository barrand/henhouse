import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const bankPath = path.join(root, 'functions/src/games/flock-together/data/questions.json')
const curatedPath = path.join(root, 'functions/src/games/flock-together/data/curated-questions.json')
const defaultCsv = path.join(root, 'flock-question-selection.csv')

export function parseCsv(content) {
  const rows = []
  let row = [], field = '', quoted = false
  const text = content.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === '"') {
      if (quoted && text[i + 1] === '"') { field += '"'; i++ }
      else if (!quoted && field !== '') throw new Error('Unexpected quote in CSV. Save as a comma-separated CSV.')
      else quoted = !quoted
    } else if (!quoted && (ch === ',' || ch === '\n')) {
      row.push(field)
      field = ''
      if (ch === '\n') { if (row.some(value => value.trim())) rows.push(row); row = [] }
    } else field += ch
  }
  if (quoted) throw new Error('Unclosed quote in CSV')
  row.push(field)
  if (row.some(value => value.trim())) rows.push(row)
  return rows
}

export function readSelection(content, bank) {
  const [header = [], ...rows] = parseCsv(content)
  const columns = header.map(value => value.trim().toLowerCase())
  const required = ['keep', 'id', 'question', 'option1', 'option2', 'option3', 'option4', 'type', 'edition']
  for (const name of required) {
    if (columns.filter(value => value === name).length !== 1) throw new Error(`Expected one "${name}" column`)
  }
  const seen = new Set()
  const selected = []
  for (const [index, row] of rows.entries()) {
    if (row.length !== header.length) throw new Error(`CSV row ${index + 2}: wrong number of columns`)
    const get = name => row[columns.indexOf(name)].trim()
    const idText = get('id')
    const keep = get('keep').toLowerCase()
    const isKept = !['', 'no', 'n', 'false', '0'].includes(keep)
    const id = Number(idText)
    const isNewQuestion = !idText && isKept
    if (!isNewQuestion && (!Number.isInteger(id) || id < 1 || id > bank.length || seen.has(id))) {
      throw new Error(`CSV row ${index + 2}: missing, duplicate, or invalid id`)
    }
    if (!isNewQuestion) seen.add(id)
    const original = isNewQuestion ? null : bank[id - 1]
    const edition = get('edition')
    const expectedEdition = original?.source === 'patriotic' ? 'Patriotic' : 'Standard'
    if (!isNewQuestion && edition !== expectedEdition) throw new Error(`Question ${id}: edition must remain ${expectedEdition}`)
    const requestedOpen = /\b(open|open ended|open-ended)\b/i.test(keep)
    const type = requestedOpen ? 'open' : (get('type') || 'open')
    if (type !== 'open' && type !== 'multiple_choice') throw new Error(`Question ${id}: type must be open or multiple_choice`)
    const text = get('question')
    if (!text || text.length > 100) throw new Error(`Question ${id}: question must be 1-100 characters`)
    const options = [1, 2, 3, 4].map(i => get(`option${i}`)).filter(Boolean)
    if (type === 'multiple_choice') {
      if (options.length < 2 || options.length > 4) throw new Error(`Question ${id}: multiple choice needs 2-4 options`)
      if (options.some(option => option.length > 80)) throw new Error(`Question ${id}: options must be 80 characters or fewer`)
      if (new Set(options.map(option => option.toLowerCase())).size !== options.length) throw new Error(`Question ${id}: options must be distinct`)
    }
    if (isKept) {
      selected.push({
        id: isNewQuestion ? null : id,
        question: {
          text,
          type,
          ...(type === 'multiple_choice' ? { options } : {}),
          ...(original?.tag ? { tag: original.tag } : {}),
          ...(original?.source ? { source: original.source } : {}),
        },
      })
    }
  }
  return selected.sort((a, b) => (a.id ?? Number.MAX_SAFE_INTEGER) - (b.id ?? Number.MAX_SAFE_INTEGER))
}

function main() {
  const [command = 'check', csvArg] = process.argv.slice(2)
  if (!['check', 'apply'].includes(command)) throw new Error('Usage: node scripts/curate-questions.mjs [check|apply] [path.csv]')
  const bank = JSON.parse(fs.readFileSync(bankPath, 'utf8'))
  const selected = readSelection(fs.readFileSync(csvArg ? path.resolve(csvArg) : defaultCsv, 'utf8'), bank)
  console.log(`Selected ${selected.length} curated questions`)
  for (const { id, question } of selected) {
    const original = id === null ? null : bank[id - 1]
    const changed = !original || question.text !== original.text || question.type !== (original.type ?? 'open')
    console.log(`${id ?? 'new'}. ${question.text}${changed ? ' (edited)' : ''}`)
  }
  if (command === 'check') return
  if (selected.length < 10) throw new Error(`Select at least 10 questions before applying; currently ${selected.length}`)
  fs.writeFileSync(curatedPath, JSON.stringify(selected.map(({ question }) => question), null, 2) + '\n')
  console.log('Updated the curated bank. The standard bank is unchanged. Not deployed.')
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main() } catch (error) { console.error(error.message); process.exitCode = 1 }
}
