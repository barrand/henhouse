# Question bank tooling

Source of truth: [`../functions/src/data/questions.json`](../functions/src/data/questions.json).

Schema:

```json
{ "text": "Cats or dogs?", "type": "multiple_choice", "options": ["Cats", "Dogs"] }
{ "text": "Name a famous pirate", "type": "open" }
```

MC questions can have 2-5 options.

## One CSV, one workflow

```
npm run csv:export    # dump everything to scripts/questions.csv
# ...edit in your spreadsheet app...
npm run csv:import    # validate and save back to questions.json
```

## CSV columns

**Editable:**
| column | what it does |
|---|---|
| `delete` | Put any non-empty value (e.g. `x`) to remove the question on import |
| `text` | The question text |
| `type` | `open` or `multiple_choice` |
| `options` | Pipe-separated, 2-5 options (e.g. `Cats\|Dogs\|Fish\|Bird\|Reptile`). Required when `type=multiple_choice`. |
| `tag` | Optional tag, usually blank |

**Read-only hints (importer ignores these):**
| column | what it tells you |
|---|---|
| `auto_label` | Classifier's guess: `MC-binary (strong)`, `MC-ternary (strong)`, `MC (suggested)`, `Open (strong default)`, `Open (free-form)`, `Open (no data)`, `SKIP (auto)` |
| `suggested_options` | Pipe-separated options you can paste into the `options` column |
| `simulated_answers` | What Gemini predicted 7 players would answer |
| `grade` | Convergence grade (A/B/C) |

## Common tasks

**Convert to multiple choice:**
1. Change `type` from `open` to `multiple_choice`
2. Copy `suggested_options` into the `options` column (or write your own 2-5 options)

**Delete:** put any value in the `delete` column (e.g. `x`)

**Batch review by category:** sort the CSV by `auto_label` in your spreadsheet. Work through clusters:
- `SKIP (auto)` — review for deletion
- `MC-binary (strong)` — high-confidence binary conversions
- `MC-ternary (strong)` — high-confidence A/B/C conversions
- `MC (suggested)` — borderline, your call
- `Open (free-form)` — leave alone
- `Open (no data)` — grader hasn't seen these, review manually

**Add a new question:**
- Append a row at the bottom (or use `npm run add` for an interactive prompt)

## Other commands

| Command | Purpose |
|---|---|
| `npm run validate` | Check schema/length/duplicates without saving |
| `npm run add` | Interactive CLI to add one question |
| `npm run grade` | Regrade with Gemini (~10 min, uses API credits). Refreshes `simulated_answers` and `suggested_options`. |
