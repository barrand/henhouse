# AI Bot Swarm Test Harness

## Summary

Build an external local-emulator harness that lets the host use the real app UI while AI players join by room code and play both Fowl Words and Flock Together. Bots use Firebase Auth, Firestore listeners, and the same callable functions real clients use. Gemini is used for language decisions; randomization handles simple choices, votes, and optional awards.

## Key Changes

- Add a root script: `npm run bots -- --code ABCD --count 5`.
- Create a Node 22 CLI under `tools/bots/` using the existing Firebase client SDK and Gemini REST API.
- Each bot gets its own Firebase app/auth identity, joins through `joinGame`, listens to game/player/round state, and submits allowed player actions through callable functions.
- Run v1 against local emulators only: Auth `9099`, Firestore `8080`, Functions `5001`, Realtime Database `9000`.
- Read Firebase config from `.env`; require `GEMINI_API_KEY` from environment or `functions/.env`.

## Bot Behavior

Gemini-backed actions:

- Fowl Words clue submission: generate a valid one-word clue from the visible secret word.
- Fowl Words guessing: infer a one-word guess from visible clue groups and previous guesses.
- Flock Together open-text answers: answer the visible question like a casual player.

Randomized actions:

- Fowl Words word selection: randomly choose one of the 3 visible word options.
- Fowl Words love/boo/Most Helpful: random eligible visible clue groups, only some of the time.
- Flock Together multiple-choice answers: randomly choose one visible option.

Award probabilities for v1:

- Giver love: around 40% chance per eligible visible clue group, skipping own clues.
- Giver boo: around 10% chance per round, only against an eligible visible non-own clue.
- Guesser Most Helpful: around 60% chance after a correct guess, choosing one visible clue group.
- Guesser boo: around 10% chance after scored result, choosing one visible clue group.

Bots should play naturally. Do not force wrong guesses in v1.

## Run Model

- Start local development with `npm run dev:local`.
- Create a room in the browser and copy the room code.
- Run the swarm separately: `npm run bots -- --code ABCD --count 5`.
- The host manually clicks controls like Start Game and Next Round based on the real UI.
- Terminal output is supportive only: bot joins, phase changes, actions, errors, and optional "bots have acted" status. Stop the swarm with Ctrl+C or by ending the game.
- First milestone: 5 bots, 3-5 rounds per game.
- Later scaling: reuse the same harness for 10, 20, and 30 bots, plus optional auto-host mode.

## Reporting

Write artifacts to `bot-runs/<timestamp>/`:

- `events.jsonl`: joins, phase changes, bot actions, prompts, sanitized model outputs, callable results, errors.
- `snapshots.json`: relevant game/round snapshots on phase changes and failures.
- `summary.md`: pass/fail, stuck phases, failed calls, timings, final scores, Gemini call count, rough cost estimate.

## Test Plan

Run:

- `npm run build`
- `npm --prefix functions run build`
- `npm --prefix functions test`

Manual validation:

- Start local emulators and Vite.
- Create a Fowl Words room, run 5 bots, complete 3-5 rounds.
- Create a Flock Together room, run 5 bots, complete 3-5 rounds.

Acceptance criteria:

- Bots join as distinct anonymous users.
- No prompt includes hidden information.
- No callable permission errors during normal bot play.
- No phase gets stuck after required bot actions.
- Report artifacts clearly explain failures.

## Assumptions

- v1 is an external developer harness, not an in-app "Add AI players" feature.
- v1 runs locally against Firebase emulators, not production.
- If Gemini is unavailable, the test should fail clearly instead of falling back to scripted behavior.
- Random award/vote behavior is enough to test permissions, scoring side effects, visibility, and UI counts.
- Firestore security hardening for hidden round fields is out of scope for v1.
