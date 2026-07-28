# Fowl Words Couch Privacy

## Summary

Reduce accidental word reveals when players share a couch by adding a brief, round-start privacy handoff and making the giver's secret word a hold-to-peek interaction. Voting itself remains unchanged.

## Experience

1. Each fresh round begins with a four-second, full-screen handoff for every player: `Billy, close your eyes. No peeking.` The active guesser's name replaces `Billy`; the game header is also hidden during this moment.
2. The host can skip the handoff. When it ends or is skipped, the normal 15-second word-voting screen starts unchanged.
3. The guesser's existing blind voting screen keeps an explicit reminder to keep their eyes closed; it never shows word options or the selected word.
4. In clue submission, givers see a compact covered **Secret word** card with an eye-off icon and `Press and hold to peek`.
5. The word is visible only while the pointer/finger remains pressed. Releasing immediately restores the covered card. A brief, restrained fade/scale and eye-icon swap provide feedback; no new mascot art or playful copy is required.
6. Once a giver submits a clue, the existing locked-in waiting state remains word-free and offers no further peek control.

## Implementation

- Keep the existing `word-selection` status. Add `wordSelectionStartsAt` and create rounds with the vote start at `now + 4s` and its deadline at `now + 19s`.
- Add a host-only skip callable that atomically changes the vote start to now and resets the vote deadline to 15 seconds from now. Reject word votes before the start timestamp.
- Harden word finalization: allow it after the deadline, when every eligible giver has voted, or when the host explicitly skips stragglers; never finalize before the privacy handoff has ended.
- Extend the frontend Fowl Words round type and game routing with a dedicated full-screen privacy-handoff view. It counts down from the server timestamp and replaces the normal header/body until voting starts.
- Replace the persistent secret-word banner in `ClueSubmissionView` with local, non-persistent press-and-hold state. Use pointer capture and hide on release, cancellation, lost capture, blur, and keyboard key-up; Space and Enter support keyboard users. Do not announce the secret word through an ARIA live region.
- Preserve existing secret-word validation, clue timers, submitted-clue behavior, deduplication, and all later round phases.

## Test Plan

- Starting a game and advancing to each later round enters the four-second handoff before voting; the host can skip, and existing in-progress rounds without the new timestamp continue directly to voting.
- Only the host sees an enabled skip action; all players transition together when the server state changes.
- Word votes are rejected during the handoff, and word finalization is rejected before the valid deadline unless all eligible givers voted or the host skipped stragglers.
- The guesser never sees vote options or the selected word during the handoff, voting, selected-word spotlight, or clue entry.
- A giver can reveal the word only while actively holding; release, pointer cancellation, blur, and submitted-clue state leave it hidden.
- Existing clue submission validation, timer expiry, host skip-ahead, and normal Fowl Words round flow continue to work.

## Assumptions

- The privacy feature addresses casual, in-person shoulder surfing; it does not change the existing Firestore client-data model or claim to protect against a player inspecting application data.
- The announcement uses the active guesser's display name and the exact default copy above.
- The vote UI and its 15-second duration remain unchanged after the handoff.
