import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { parseCsv, readSelection } from './curate-questions.mjs'

const bank = JSON.parse(fs.readFileSync(new URL('../functions/src/games/flock-together/data/questions.json', import.meta.url), 'utf8'))
const serialize = rows => rows.map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\r\n')
const headers = ['keep', 'id', 'question', 'option1', 'option2', 'option3', 'option4', 'type', 'edition', 'notes']
const freshRows = () => [headers, ...bank.map((question, index) => [
  '', String(index + 1), question.text, ...[0, 1, 2, 3].map(i => question.options?.[i] ?? ''), question.type ?? 'open', question.source === 'patriotic' ? 'Patriotic' : 'Standard', '',
])]

test('a fresh export includes every bank question and leaves all keep cells blank', () => {
  const rows = freshRows()
  assert.equal(rows.length, bank.length + 1)
  assert.deepEqual(rows.slice(1).map(row => row[2]), bank.map(question => question.text))
  assert.equal(readSelection(serialize(rows), bank).length, 0)
})

test('thirty picks survive sorting and preserve original metadata', () => {
  const [headers, ...rows] = freshRows()
  rows.slice(0, 30).forEach(row => { row[0] = 'x'; row[9] = 'Possible rewrite, discuss first' })
  const selected = readSelection(serialize([headers, ...rows.reverse()]), bank)
  assert.equal(selected.length, 30)
  assert.deepEqual(selected.map(row => row.question), bank.slice(0, 30))
})

test('handles a BOM, quoted commas, escaped quotes, and embedded newlines', () => {
  assert.deepEqual(parseCsv('\uFEFFa,b\r\n"x,y","He said ""hi""\nnext line"\r\n'), [['a', 'b'], ['x,y', 'He said "hi"\nnext line']])
})

test('uses edits to a selected question while retaining its id and edition', () => {
  const rows = freshRows()
  rows[1][0] = 'x'
  rows[1][2] = 'Unexpected rewritten question'
  rows[1][7] = 'open'
  rows[1][3] = ''
  const selected = readSelection(serialize(rows), bank)
  assert.equal(selected[0].id, 1)
  assert.deepEqual(selected[0].question, { text: 'Unexpected rewritten question', type: 'open' })
})

test('rejects duplicate IDs and unrecognized marks', () => {
  const rows = freshRows()
  rows[1][0] = 'x'
  rows[2][1] = rows[1][1]
  assert.throws(() => readSelection(serialize(rows), bank), /duplicate/)
})

test('accepts open-ended instructions in keep and a new open-ended question', () => {
  const rows = freshRows()
  rows[1][0] = 'Make open'
  rows[1][3] = 'old choice'
  rows.push(['Make open', '', 'What is the most overrated luxury car maker?', '', '', '', '', '', '', ''])
  const selected = readSelection(serialize(rows), bank)
  assert.deepEqual(selected.map(item => item.question), [
    { text: bank[0].text, type: 'open' },
    { text: 'What is the most overrated luxury car maker?', type: 'open' },
  ])
})
