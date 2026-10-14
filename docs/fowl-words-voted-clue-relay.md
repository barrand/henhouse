# Fowl Words: voted clue relay

Proposal for playtesting; no gameplay changes yet.

## Goal

Reward useful, unique clues. Givers submit early to gain voting exposure, then promote strong complementary clues so the guesser solves with fewer reveals and shown clues earn more points. Voting changes reveal order rather than awarding points directly; no separate voter bonus.

## Round flow

1. **Write:** Givers submit one word before seeing other clues. Submission locks their clue and opens the voting board; new clues appear as others submit. The guesser stays blind.
2. **Vote:** Reuse the heart interaction to back other clues. Proposed limit: two hearts per giver, one per clue, freely changeable until voting closes. Hide authors and live totals; prohibit self-votes. Allow a final 10-second voting window after submission closes.
3. **Order:** Deduplicate, then rank unique clues by final votes. Freeze the queue; randomize ties once. Duplicate groups remain locked initially and retain their -1 penalty. Votes on duplicates do not move them into the unique queue.
4. **Reveal:** Show the highest-ranked clue first. The guesser can request another clue without spending a guess, or submit an answer. Earlier clues stay visible; each additional reveal lowers the potential payout.
5. **Finish:** On a correct answer, award the same relay points to the guesser and each shown clue author. Unshown clues earn no relay points. Preserve four guess attempts; a wrong answer lowers the payout and reveals the next queued unique clue, or uses the existing duplicate-unlock fallback once uniques run out. Exhaustion or timeout ends the round.

## Starting scoring and UI

- Trial payout: `max(1, 10 - 2 × (clue groups shown - 1) - 2 × wrong guesses)`. No win means no relay payout; duplicate penalties still apply.
- Remove FAST: early submission earns exposure, not guaranteed points. Votes grant no direct points. Keep Most Helpful and Boo; use pre-guess hearts for ordering instead of a separate Peer love point payout in this mode.
- Giver screen: secret word, own locked clue, arriving clue cards, heart toggles, remaining hearts and voting deadline.
- Guesser screen: revealed clue cards, current potential points, guess field and **Guess**; **Next clue · 8 pts** makes the cost explicit.
- Results: reveal the word and full queue, distinguish shown/unshown clues, and display server-authoritative point breakdowns.

```text
GIVER                         GUESSER
Secret word: VOLCANO          1 clue shown · Win: +10 each
Your clue: ASH                ┌─────────────────────────┐
Back up to 2 other clues      │ LAVA                    │
┌────────────────────────┐   └─────────────────────────┘
│ LAVA         [♥ Backed]│   Your guess [____________]
│ ERUPTION     [♡ Back]  │   [Guess]
│ MOUNTAIN     [♡ Back]  │   [Next clue · 8 pts]
└────────────────────────┘
1 heart left · Voting: 10s
```

## Implementation and validation

Add an opt-in relay mode for new games. Store frozen reveal order, revealed count, voting deadline and relay scoring version on the round; compute ranking, deadlines and all points on the server. Keep unrevealed clue text inaccessible to the guesser, including Firestore documents and responses. Preserve existing games and scoring.

Test self-votes, vote limits, late submissions, ties, duplicates/all-duplicates, reveal/guess races, wrong guesses, exhaustion, timeout and exactly-once payouts. Playtest whether strong clues rise, voting stays quick, and early exposure outweighs quality. Specifically watch the tension that helping another clue can solve the word before your own is shown.
