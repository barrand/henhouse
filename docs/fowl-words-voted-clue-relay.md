# Fowl Words: configurable scoring and Best Clues First

Implementation draft. Update and push this document first, then implement and validate locally. No deployment. Preserve unrelated `.env.production` changes.

## Modes and live settings

| Setting | Classic | Best Clues First |
|---|---|---|
| Opening clues | All unique groups | Top 20% of unique groups, minimum 3 |
| Attempts | Existing default behavior | 4 |
| Payout ladder | 10 / 5 / 2 / 1 | 10 / 7 / 4 / 1 |
| Reveal all groups by | Attempt 3 | Attempt 3 |
| FAST / Peer love points | Existing awards | Disabled |
| Most Helpful / Boo | Existing awards; Boo is display-only | Recognition only |
| Duplicate penalty | -1 per author | -1 per author |
| Ranking votes | None | Two hearts per giver |
| Final voting window | None | 10 seconds |

Classic is the default. Missing rules preserve legacy rounds. A server-controlled availability flag enables new selections of Best Clues First independently of the AI experiment. Disabling it does not interrupt selected rounds. Enable it locally for playtesting; production requires an explicit server configuration.

Host settings are accessible in the lobby and game header: preset, attempts and payouts, reveal-all attempt, and mode-specific advanced controls. Require positive, non-increasing payouts, one per attempt. Show example reveal counts, current versus pending settings, Save for next round, Cancel pending changes and Reset to recommended. Lobby saves affect round one; in-game saves affect the next round. Reject stale saves if the round changes while editing. Each round freezes a versioned rules snapshot. Announce activated changes, retain cumulative scores, and inherit saved settings on rematch.

## Voting and reveals

Givers lock a one-word clue before seeing others. Best Clues First uses optional, changeable hearts to rank clues. Hide authors and totals, prohibit self-votes, and allow a final voting window after submissions close. Freeze the order when voting closes: unique groups by votes, ties randomized once, then duplicate groups in existing unlock priority. Votes on duplicate clues do not promote them into the unique queue.

Opening count is `min(uniqueCount, max(minimumOpening, ceil(openingShare × uniqueCount)))`. Spread remaining groups evenly across transitions before the configured reveal-all attempt, rounding cumulative counts upward. Reveal at least one additional group while any remain. Classic opens all uniques and retains duplicate unlock priority, revealing every remaining group by the same deadline.

| Attempt | Example: 10 unique + 4 duplicate groups | Best Clues First payout |
|---|---|---|
| 1 | Top 3 uniques | 10 |
| 2 | First 9 groups | 7 |
| 3 | All 14 groups | 4 |
| 4 | All 14 remain visible | 1 |

All-duplicate rounds retain the locked opening; advancing reveals the first scheduled batch. No submitted clues ends the round immediately. Results reveal every clue, even after an early win.

## Guess, skip and give up

Both modes offer Guess and **Skip · reveal N more · next win +P**. A wrong guess, skip or attempt timeout consumes an attempt, advances the ladder and reveals the next batch. Skip makes no AI call and is recorded as Skipped. No additional penalty. Restart the next timer using 60s, 40s, then 20s for subsequent attempts.

Replace skip with Give up when no hidden groups remain or on the final attempt. Confirm before ending unsuccessfully. Disable actions during answer evaluation. Attempt exhaustion ends the round.

Best Clues First pays the current tier to the guesser and shown clue authors; unshown authors get no relay payout. Apply duplicate penalties separately, even on failure. Remove FAST and Peer love points only in this mode; Most Helpful and Boo remain recognition. Classic retains its scoring and awards.

## UI and backend

- Givers: stable responsive grid for roughly 40 clues, two columns on phones, wrapping words, accessible heart targets, own clue separated, visible vote allowance/deadline. Append arrivals without rearranging cards.
- Guesser: attempt, payout, revealed cards, highlighted new clues, answer field and explicit skip consequence. Results show mode, authors, shown/unshown status, history and server point breakdowns.
- Add capability lookup, host settings updates, ranking votes/finalization and guesser skip/give-up actions. Share transactional progression across wrong answers, skips and timeout recovery. Validate expected round/attempt and commit scores exactly once.
- Keep secret words, future word decks, unrevealed clues, author mappings and private ballots in restricted storage. Project role-appropriate views; board access requires a locked clue. Protect rules/configuration against direct client writes.
- Preserve active legacy rounds, Classic scoring and historical fields. New rounds use immutable rules snapshots. Record rules, reveals, skips, wrong guesses and duration. Defer saved presets and dashboards.

## Validation

Unit-test presets, configuration validation, configurable ladders, relative reveals/rounding, ties and duplicates. Emulator-test host authorization, flag behavior, next-round changes, privacy, deadlines, concurrent guess/skip/timeout, give up and exactly-once scores. Browser-test both modes, small/large rooms, grid, settings, reconnects and full early-win results. Run frontend/functions builds and relevant existing tests. Report actual checks and limitations; do not deploy.

## Implementation notes

- New games use the versioned engine in both modes. Active legacy rounds finish on their existing path; saving host settings opts subsequent rounds into the new engine.
- Availability is controlled by the server-only Firestore document `fowlWordsConfig/scoring`, field `bestCluesFirstEnabled` (boolean). Without that document, availability defaults on in emulators and off in production. Classic remains selectable. This configuration is independent of Jev/Gemini settings.
- Private state lives in `games/{id}/rounds/{round}/private/state`; own role projections live in `views/{uid}`. Future words live in `games/{id}/private/deck`. Legacy callables reject versioned rounds, preventing accidental public secret writes.
- Two-player rounds skip the final ranking window: there is no other giver to back. Guesser controls appear above the clue grid so large rooms do not require scrolling through every clue to act.
- Emulator safety checks: build functions, then run `firebase emulators:exec --only auth,firestore --project demo-fowl-scoring "npm run test:fowl:emulator"`. Tests use stubbed providers and never require paid AI calls.
- A future release must include frontend, functions and Firestore rules together. This implementation task does not deploy them or enable the production experiment.
