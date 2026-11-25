# Shared View Plan for Flock Together and Fowl Words

Shared View gives an in-person room a communal game board with persistent standings. Flock Together builds to a named answer reveal. Fowl Words gives the room a live clue board and saves the secret word and clue credits for the debrief. Phones keep the existing player actions and host controls. Each game synchronizes its result reveal across devices, including in rooms playing with phones alone.

## Joining and room lifecycle

- Add **Open Shared View** to the Henhouse home screen. Enter the room code to open the same read-only view on a phone, tablet, desktop, laptop, or TV browser. Offer fullscreen where supported and keep the page usable in a regular browser window.
- Put **Shared View** beside the room code in the host lobby, with a **Copy Shared View link** action. A link such as `chickenparty.web.app/shared/COOP` opens the display directly. Also show the manual setup instructions for another device. Open **chickenparty.web.app**, choose **Open Shared View**, and enter the room code. Resolve the game from the code and use the same entry and display shell for both games.
- The room code grants read-only access to a dedicated display feed. Opening it leaves player membership and presence untouched, even when the browser is already signed in as a player. The display lobby shows **chickenparty.web.app**, the room code, and the roster. Starting, advancing, and rematching remain host actions in the player view.
- Opening or refreshing the display restores the current stage. Follow rematches automatically and show a clear message for invalid or closed rooms. Disconnecting the display has no effect on play.

## Responsive display

| Screen | Shared View layout |
|---|---|
| Wide desktop, laptop, or TV | Main game board with a fixed standings rail on the right. Keep the question or phase, timer, and page controls inside comfortable screen margins for fullscreen and windowed use. |
| Narrow window, tablet, or phone in landscape | Use the rail when the board and rail both fit at readable sizes. Otherwise, put a compact standings strip beneath the phase header and use the full width for the board. |
| Phone in portrait | Use a single-column board below a compact round and timer header. Keep a small standings summary in the header with a **Standings** control for the full list. Keep results and clue cards easy to scroll, with touch-sized controls for overflow pages. |

- Choose the layout based on available width and height. Keep clues, answers, names, and reaction counts at a readable size as the window shrinks. Wrap names and answers, then page or scroll as needed. Fit long content without horizontal scrolling and keep keyboard focus visible.
- Keep the current round, reveal beat, and page when the screen resizes or rotates. Reflow the current content in place and keep the phase timer running. When pagination changes, keep the currently viewed item in view if it still belongs to the round.
- On wide screens, offer local **Pause pages** and manual paging when a result has overflow. Keep the question or secret word and the outcome visible while pages change. In narrow layouts, default to manual paging or scrolling so the reader controls the pace. Page controls affect only that display, and the host can still start the next round on schedule.

## Flock Together

### Stages and motion

| Stage | Shared View and phone behavior |
|---|---|
| Lobby | The hens bob and roster rows pop in as players join. Keep the URL and room code easy to read across the room. |
| Answering | Shared View shows the question, choices when applicable, round number, timer, and anonymous submission count. Eggs fill as answers arrive. The phone answering flow continues as today. |
| Counting | Use the pecking hen while scoring runs. Transition when results are available. |
| First four seconds of reveal | On every screen, reveal named groups smallest first. Groups of equal size can appear together. Animate a −1 beat only when the server awarded that penalty. Each group enters into its final position. |
| Around five seconds | The winning answer lands in gold, or a confused hen announces that there is no flock. Update standings and phone scores, show personal recaps, and enable the host’s advance control. |
| After the reveal | Hold the results for discussion until the host advances. Show which overflow page is visible. Rotate wide-screen pages at reading speed with a local pause control, and leave the question, result, and standings in place. |
| Game over | Celebrate the winner or tied winners with the crowned hen and leave the final standings visible. |

### Synchronized timing and scoring

1. Publish one server-authored reveal start time, scored groups, points, and pre- and post-round totals in the same commit as score updates. Allow a short lead-in for delivery. Cover both Flock Together scoring paths, preserve exactly-once scoring across retries, and handle existing scored rounds without timing fields.
2. Use the same deterministic sequence and common clock reference on phones and every Shared View. Use stable server group IDs, outcome, and tie order even when a player sees their own wording for an answer. Key the sequence to the question instance and reveal start. A host skip can replace a question while retaining the round number, so clear old progress, paging, and scheduled animation when the question changes.
3. Hold pre-round totals in the player header, leaderboard, and Shared View until the outcome beat. Show personal recaps, updated scores, and rank changes together. Enforce the earliest advance time on the server and match it in the host UI. Phone-only rooms follow the same schedule. Reduced motion uses the same beats with simpler transitions.
4. On refresh, delayed delivery, or foreground return, derive the current beat from the shared clock and immediately render what has already landed. Skip past animations. Key result motion to the reveal so layout changes and later score snapshots do not replay it.
5. During answering, the display feed contains the prompt, available choices, timer, and aggregate progress. At reveal it adds scored answer groups and names. Keep the underlying player round and answer feeds separate from Shared View.

### Layout at different room sizes

- Keep the standings area anchored. Show a readable subset in large rooms with a clear path to the full standings. Hold standings during answer animations and page changes, and move the ranks only when new scores land.
- Choose the answer layout based on room available, group count, and text length. A few groups get big cards with names underneath. Many short answers use a two-column board. Page before text falls below the couch-readable minimum.
- For forty unique short answers on a wide screen, start with roughly ten named answers per page. Ripple in the first page during the reveal, land **No flock this round** around five seconds, and then let people read the remaining pages. With forty players clustered into a few answers, retain the groups and page through names when needed. Pin the winning answer and pick count while pages cycle. The five-second reveal target applies to the outcome.

## Fowl Words

### Stages and motion

| Stage | Shared View and phone behavior |
|---|---|
| Lobby and privacy handoff | Reuse the URL, room code, and standings rail. At round start, pop in the blindfolded hen and name the guesser with a reminder to close their eyes. Follow the existing handoff timing and host skip. |
| Word selection | Show the timer and anonymous vote progress. Keep the candidate words, vote choices, and selected word on the phones entitled to see them. Use a quick hen reaction when voting closes. |
| Clue submission | Show who is guessing, the timer, and the submission count. Eggs pop as clues lock in. The shared display shows progress while givers write on their phones. |
| Clue voting and deduplication | For Best Clues First, show the current phase and timer while givers back clues on their phones. Use the magnifying-glass hen while the game checks for duplicates. |
| Reveal and guessing | Show the guesser’s name, current attempt, timer, payout, and only the clues currently visible to the guesser. Newly available clues pop in with a brief highlight. Keep clue authors anonymous. An all-duplicate opening shows a playful locked state, then follows the actual unlock. While a guess is being evaluated, show a short checking state. |
| Scored debrief | Synchronize the win, loss, or no-clues result across phones and Shared View. The secret word lands first, followed by named clues and standings over roughly one to two seconds. Include all clue groups and mark duplicates and clues that stayed unshown. The host advances from their phone after the result. |
| Game over | Celebrate the winner or tied winners and hold final standings. Follow the host into a rematch. |

### Hearts, Boo, and Most Helpful

- **Peer love.** In Classic, show anonymous heart counts on visible clues during guessing. On Shared View, show clues with hearts first in descending count and keep ties in the existing order. In Best Clues First, keep backing totals private during play and surface them in the debrief. Apply the same hearts-first order to the named debrief. Heart totals and the Most Helpful award remain separate signals.
- **Boo.** Show a compact lilac thumbs-down count on eligible visible clues during guessing and carry it into the debrief. Show the guesser’s Boo in the debrief once awarded. Boo is worth zero points and has no effect on clue order.
- **Most Helpful.** When the guesser awards it after a correct result, add a gold **⭐ Most Helpful** badge to the clue. When they move or remove the award, update the affected badge and any resulting scores in the same debrief. Keep the clue order, author alignment, current page, and secret-word reveal state intact. Use server-awarded points for that mode.
- **Fixed author alignment.** Use dedicated lanes for clue text, authors, and reactions on the wide debrief. Author names share a consistent left edge across rows. Reserve space for the reaction area before badges appear, including **Most Helpful**. On narrow phones, keep badges on their own reserved line if needed. Wrap or page longer text at a readable size. Adding or removing any badge must leave the author text in place. A heart reorder may move a complete row vertically while its author alignment stays fixed.

### Reaction motion across displays

- A **heart** floats up in pink, the clue pulses once, and the count updates. Batch live heart reordering after a short quiet period, then glide affected clues into their new position together. A **Boo** gives the clue a quick wiggle and a brief lilac “boo!” float. **Most Helpful** lands as a gold stamp with a short burst of comic sparks and remains visible through the debrief or until the guesser changes it.
- Reuse the existing phone effects where practical and size the same cues for couch viewing. Give the voting phone immediate feedback, then play the effect for other phones and Shared View when the reaction is confirmed. Avoid playing the same reaction twice on the voting phone. Expose aggregate counts and the awarded clue with no voter identities.
- Combine rapid reactions on the same clue into a short burst. Opening, refreshing, or reconnecting shows current counts without replaying old reactions. Reduced-motion mode updates badges and counts with minimal motion. Keep the standings rail stationary while clues reorder or overflow pages change.

### Shared data and timing

- Reuse the shared clock and stage catch-up behavior. Time the short debrief from one server-authored result timestamp. During an active attempt, release new clues on Shared View when they become visible to the guesser and keep the guessing timer moving.
- Publish a dedicated, phase-appropriate display feed for the legacy flow used by new rooms and rematches and for versioned Classic and Best Clues First. Before scoring, expose only the clues the guesser can already see and the reaction aggregates that the current mode permits. Keep candidate and selected words, unseen clues, author mappings, and private ballots out of the pre-result feed. Publish the secret word and named clue groups once the round is scored.
- Use stable clue group IDs for paging and motion. Use the server’s visible-clue order, deadline, attempt payout, and scoring data as inputs. Track debrief identity separately from reaction and score updates so later awards update in place.

## Build and verification order

1. Build one complete Flock Together round with the synchronized reveal on the host phone, a player phone, and Shared View. Include the room entry and server-owned score and timing changes so the first slice runs end to end. Verify the phone header, leaderboard, recap, and host controls follow the same timeline.
2. Verify phone-only play, question skips, reconnects, rematches, reduced motion, invalid room links, and a viewer that has never joined as a player. Check that on-time clients see the same outcome beat, and that late clients catch up without replay. Verify the host can advance during overflow paging once the result has landed.
3. Check rooms of 7, 20, and 40 players with long names and answers, ties, all-unique answers, a lone −1, and one large flock. Test phone portrait and landscape, a narrow desktop window, and a fullscreen TV. Confirm the route remains display-only, the scores stay easy to find, and rotating or resizing preserves the current beat.
4. Add the Fowl Words display feed, live clue board, synchronized debrief, and reaction motion on phones and Shared View. Verify Classic and Best Clues First through correct and failed guesses, all-duplicate and no-clue rounds, and early wins that leave clues unshown.
5. Verify Fowl Words privacy and layout with the guesser phone, a giver phone, and a viewer who never joined as a player. Check visible-clue unlock timing, mode-specific heart visibility, anonymous reactions, reconnects, and reduced motion. Run a forty-player emulator reaction burst to check update latency and the existing per-player view writes under load. Award, transfer, and remove **Most Helpful** on wide and narrow screens with long or multiple author names. Confirm changes leave the author alignment and reveal state intact, including when all three badges share a row.
