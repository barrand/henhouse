# Party-Safe 30-40 Player Hardening Plan

## Summary

Harden both games for 30-40 player party play with minimal pre-event risk. Keep the existing data model mostly intact, allow mid-game joins, make late joiners wait until the next round, and make server phase transitions idempotent under timers, host double-clicks, retries, and bot bursts.

## Data Model And Helpers

- Keep `game.playerIds` as all players who have joined the room.
- Add `round.eligiblePlayerIds: string[]` to every newly created round.
- Keep `round.eligiblePlayerCount` for existing UI/backcompat, but derive it from `eligiblePlayerIds.length`.
- For old/local rounds without `eligiblePlayerIds`, backend helpers should fall back to `game.playerIds` or existing `eligiblePlayerCount` behavior so previews/dev state does not break.
- Add backend helper functions near shared game logic:
  - `getRoundEligiblePlayerIds(round, game): string[]`
  - `isRoundEligible(round, game, uid): boolean`
  - `eligibleCount(round, game): number`
  - `eligibleNonGuesserIds(round, game): string[]`
- Add matching frontend helpers per game or shared UI layer:
  - `getEligiblePlayers(round, players)`
  - `isCurrentPlayerWaiting(round, currentPlayerId)`

## Late Join Behavior

- `joinGame` allows joins when `game.status === 'lobby'` or `game.status === 'playing'`.
- Late joiners are added to `game.playerIds` and `games/{gameId}/players/{uid}` immediately.
- Late joiners are not added to the current round's `eligiblePlayerIds`.
- On the next round, the server snapshots the latest `game.playerIds` into that round's `eligiblePlayerIds`.
- Presence/connection status must not change current-round eligibility. A disconnecting player remains eligible until the next round.

## Server Changes

- Round creation:
  - `flockStartGame`, Flock `doAdvanceRound`, `fowlWordsStartGame`, and Fowl `advanceToNextRound` write both `eligiblePlayerIds` and `eligiblePlayerCount`.
  - Write the new round doc and related game fields atomically with a batch or transaction where possible.
- Flock Together:
  - `submitAnswer` validates caller is in `round.eligiblePlayerIds`.
  - Answer docs remain source of truth; `answerCount` and `answeredPlayerIds` are derived display fields.
  - `triggerScoring` scores only `round.eligiblePlayerIds`, not all `game.playerIds`.
  - `forceEndRound` and `flockAdvanceRound` transaction-claim phase/current round and no-op if already moved.
- Fowl Words:
  - `submitWordVote`, `submitClue`, `submitGuess`, `fowlWordsUnlockFirst`, and award callables validate caller eligibility.
  - Word vote and clue completion counts use `eligibleNonGuesserIds`, not `players.length - 1`.
  - Guesser rotation uses the new round's frozen eligible roster.
  - `submitClue` checks `clueSubmissionDeadline` server-side.
  - `finalizeWordSelection`, `runDeduplication`, `skipToNextAttempt`, and `advanceToNextRound` transaction-claim their phase before doing work.
- Keep Fowl `wordVotes` and `cluesByPlayer` as round-doc maps for this pass. Do not move them to subcollections unless 30-player testing proves contention remains.

## UI Changes

- Handle waiting state at the game page/container level before rendering phase-specific components.
- If current player is not eligible:
  - Flock: show "You're in! You'll join next question." Disable answering.
  - Fowl: show "You're in! You'll join next round." Disable voting, clue submission, guessing, unlocking, and awards.
- Phase components receive `eligiblePlayers` for status lists/counts.
- Leaderboards and room/player lists may still show all joined players, with waiting players visually marked during active rounds.
- Do not show current Fowl secret word to waiting players in normal UI.

## Error And Race Handling

- Expected races should no-op or return explicit callable errors:
  - `permission-denied` for ineligible player action.
  - `failed-precondition` for wrong phase or expired deadline.
  - `already-exists` or no-op for duplicate player submit.
- Avoid surfacing `internal` for normal duplicate/timer/phase races.
- Add retry/backoff only around transient Firestore contention points; do not retry validation failures.
- Ensure host double-clicks cannot create duplicate rounds or score twice.

## Test Plan

- Unit tests:
  - Eligibility helpers with and without `eligiblePlayerIds`.
  - Late joiners rejected from current-round actions.
  - Next round includes late joiners.
  - Flock scoring uses `round.eligiblePlayerIds`.
  - Fowl word vote/clue counts use eligible non-guessers.
  - Duplicate phase transitions no-op cleanly.
  - Fowl clue submission rejects after `clueSubmissionDeadline`.
- Emulator integration tests:
  - 30 players join before start.
  - 10 players join during active Flock question, wait, then participate next question.
  - 10 players join during each major Fowl phase, wait, then participate next round.
  - 30 simultaneous Flock answers produce one scoring pass and no `INTERNAL`.
  - 29 simultaneous Fowl votes/clues produce one finalization/dedup pass.
  - Host double-clicks advance/force-end; only one transition occurs.
- Bot validation:
  - Run 5, 15, and 30 bots locally for both games.
  - Run human-paced and burst modes.
  - Confirm no stuck phases, duplicate rounds, transaction timeouts, score mismatches, or late-join action leakage.

## Assumptions

- Immediate target is reliable 30-40 person party play, not internet-scale traffic.
- Mid-game join is required, but current-round participation is not.
- A round's `eligiblePlayerIds` is immutable after round creation.
- Disconnected players remain eligible for the current round; missed actions are handled by timers/host controls.
- Broader Firestore security hardening and Fowl subcollection rewrites are deferred unless testing proves they are needed.
