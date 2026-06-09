# Henhouse

Mobile party game collection. React + TypeScript + Firebase + Tailwind (Material 3 tokens). Players join via room code, no install needed.

**URLs:** `chickenparty.web.app` (main), `flockgame.web.app` (legacy), `flock-together-game.web.app` (dev)
**Local:** `/Users/bbarrand/Documents/Projects/HerdMentality`

---

## Games

**Flock Together** — Answer a question, score by matching the majority. One "rotten egg" player is secretly sabotaged each round.

**Fowl Words** — Based on "Just One." One **guesser**, everyone else are **givers**.
- Givers each write **ONE word** clue (enforced in frontend — button disabled if multi-word)
- Duplicate clues get eliminated (locked from guesser)
- **Minimum 3 guesses guaranteed** (even if no duplicates); more if many unique clues
- On wrong guess, unlock next duplicate clue group
- Timers decrease per attempt: 60s → 40s → 20s (keeps game paced)
- Points: attempt 1→10pts, 2→5pts, 3→2pts, 4→1pt

**Round flow:** `word-selection` → `clue-submission` → `deduplication` → `reveal` ↔ `guess` → `scored`

**Word selection:** Before each round, givers vote on 1 of 3 candidate words (15s timer). Guesser is blind. 2 losing words are burned. Game draws `totalRounds × 3` words at start.

---

## Key Terms

| Term | Meaning |
|------|---------|
| **guesser** | Guesses the secret word. Blind during word-selection and clue-submission. Sees only non-duplicate clues. |
| **givers** | Everyone else. See the secret word, each write one clue. |

---

## Critical Rules (cause bugs if forgotten)

- Duplicates are **always locked on attempt 1** — `visibleGroupIndexes` only contains unique (size-1) groups
- If all clues are duplicates → guesser sees lock screen with "Unlock first clue → 5pts" button (`fowlWordsUnlockFirst`)
- Scores are **server-authoritative** — backend writes `tentativePoints`/`pointsThisRound`, clients only display
- Dedup uses **tier-1 fast match first** (normalization + plurals, no API call), Gemini only as fallback

---

## Status

**Done:** word selection voting, multi-attempt mechanic, clue debrief on result screen, UX polish, LeaderboardModal, compact header

**Planned:** per-attempt timer server enforcement, player-count scaling for large groups (`totalRounds = max(13, playerCount)`)
