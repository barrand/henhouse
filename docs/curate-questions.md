# Choose the curated 30

Open `flock-question-selection.csv` in Excel, Google Sheets, or a text editor.

1. Put `x` in **keep** for the questions you want. Leave the rest blank. You need at least 10; 30 is a good target.
2. Use **notes** for suggested rewrites or changes to the answer choices.
3. Save as CSV and tell Codex you are done. Codex can count your picks, review notes with you, and apply the final list.

All 185 questions from the current source bank are included, in the same order, with their actual answer choices. No questions are preselected. **edition** distinguishes Standard from Patriotic. Blank options mean the game accepts a typed answer. The rejected ten-question draft is not mixed into this review file.

You can sort or filter the sheet. Keep the id, question, options, type, and edition cells unchanged. Marking fewer or more than 30 is fine while reviewing. You can also send question IDs in chat instead of editing the file.

Optional commands, run from the project directory:

```powershell
node scripts/curate-questions.mjs check
node scripts/curate-questions.mjs apply
```

`check` counts and lists your selections. `apply` requires at least 10 and updates only `functions/src/games/flock-together/data/curated-questions.json`. Neither command deploys anything or deletes questions from the standard bank. Notes are for discussion and do not automatically rewrite questions.

Once applied, the host's existing curated toggle uses your 30 as the exclusive pool, with ten drawn in a fresh order per game. The host preview lists all 30. Blank `keep` rows stay in the standard bank, outside your curated pool.

If you save the CSV somewhere else, pass its path after `check` or `apply`. The importer validates question IDs and original content so a sorted sheet or an outdated export cannot silently select the wrong questions.
