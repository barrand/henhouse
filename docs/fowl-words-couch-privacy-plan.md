# Fowl Words Couch Privacy

## Summary

Reduce accidental word reveals when players share a couch by adding a brief, round-start privacy handoff and making the giver's secret word a hold-to-peek interaction. Voting itself remains unchanged.

## Experience

1. Each fresh round begins with a seven-second, full-screen handoff for every player: `Billy, close your eyes. No peeking.` The active guesser's name replaces `Billy`.
2. The host can skip the handoff. When it ends or is skipped, the normal word-voting screen starts unchanged.
3. The guesser's existing blind voting screen keeps an explicit reminder to keep their eyes closed; it never shows word options or the selected word.
4. In clue submission, givers see a compact covered **Secret word** card with an eye-off icon and `Press and hold to peek`.
5. The word is visible only while the pointer/finger remains pressed. Releasing immediately restores the covered card. A brief, restrained fade/scale and eye-icon swap provide feedback; no new mascot art or playful copy is required.
6. Once a giver submits a clue, the existing locked-in waiting state remains word-free and offers no further peek control.

## Implementation

- Add a server-timed `guesser-cover` round status and deadline before `word-selection`. Create every first and subsequent round in this state, then transition atomically to the existing vote state when the deadline expires.
- Add an idempotent callable/round-flow transition for beginning voting. It may run after the deadline from any client, and the host may invoke it early to skip the handoff. Keep state validation and timing authoritative on the server.
- Extend the frontend Fowl Words round type and game routing with a dedicated full-screen privacy-handoff view. Count down from the server deadline and expose the skip control only to the host.
- Replace the persistent secret-word banner in `ClueSubmissionView` with local, non-persistent press-and-hold state. Handle pointer press/release/cancel and loss of focus so the word always re-hides; provide keyboard accessibility with focus/blur and Space/Enter behavior.
- Preserve existing secret-word validation, clue timers, submitted-clue behavior, deduplication, and all later round phases.

## Test Plan

- Starting a game and advancing to each later round enters the seven-second handoff before voting; the host can skip, and repeated/timer calls cannot advance twice.
- Only the host sees an enabled skip action; all players transition together when the server state changes.
- The guesser never sees vote options or the selected word during the handoff, voting, selected-word spotlight, or clue entry.
- A giver can reveal the word only while actively holding; release, pointer cancellation, blur, and submitted-clue state leave it hidden.
- Existing clue submission validation, timer expiry, host skip-ahead, and normal Fowl Words round flow continue to work.

## Assumptions

- The privacy feature addresses casual, in-person shoulder surfing; it does not change the existing Firestore client-data model or claim to protect against a player inspecting application data.
- The announcement uses the active guesser's display name and the exact default copy above.
- The vote UI and its 15-second duration remain unchanged after the handoff.
