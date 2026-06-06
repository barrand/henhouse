# Henhouse — Project Context

## What this is
**Henhouse** is a collection of mobile party games built with React + Firebase. Players join via a shared room code at a URL — no app install needed. All games share the same Firebase project, auth, Firestore, Cloud Functions, and Gemini AI backend.

**Primary URLs:**
- `chickenparty.web.app` — player-facing (main)
- `flockgame.web.app` — player-facing (legacy)
- `flock-together-game.web.app` — dev/staging
- GitHub: `github.com/barrand/henhouse`
- Local: `/Users/bbarrand/Documents/Projects/HerdMentality`

---

## Games

### 🐦 Flock Together
Players answer a question and score points by matching the majority. Think "Family Feud" meets texting. One rotten egg holder is randomly assigned each round — their job is to guess the majority answer despite being "sabotaged."

**Round flow:** question shown → everyone answers → Gemini groups similar answers → scoring → next round

### 🐔 Fowl Words
Based on the board game "Just One." One player is the **guesser**, everyone else are the **givers**.

**Core rule: givers write ONE word only as a clue** — that's the whole game (it's literally called "Just One"). Multi-word clues are rejected.

**Round flow:**
1. `word-selection` — givers vote (15s) on which of 3 words to give the guesser
2. `clue-submission` — givers each write ONE word clue; guesser waits blind
3. `deduplication` — Gemini/tier-1 groups identical/similar clues
4. `reveal` — guesser sees only UNIQUE clues (duplicates are locked)
5. `guess` — guesser submits their answer
6. If wrong + attempts left: one duplicate group unlocks, points drop, back to reveal
7. `scored` — round result, clue debrief shown to all

**Scoring (attempt → points):** 1→10pts, 2→5pts, 3→2pts, 4→1pt, 0 if all fail

---

## Terminology

| Term | Meaning |
|------|---------|
| **guesser** | The player whose job is to guess the secret word. Sees NO clues until reveal. Never sees the secret word until round is scored. |
| **givers** | Everyone except the guesser. They see the secret word and each write ONE clue word. |
| **dedup** | Deduplication — the process of grouping identical/similar clues. Duplicates get eliminated (locked). |
| **locked group** | A clue group that's a duplicate — hidden from the guesser unless unlocked by a wrong guess. |
| **unique group** | A clue that matched no one else's — always visible to guesser from attempt 1. |
| **unlock** | When guesser guesses wrong, one locked group becomes visible. Points drop. |
| **host** | The player who created the game. Controls start/advance/force-dedup. |

---

## Tech Stack

**Frontend:** React + TypeScript + Vite + Tailwind CSS (Material 3 tokens via custom config)
- Path aliases: `@flock/*`, `@fowl-words/*`, `@shared/*`
- Key components live in `src/games/fowl-words/components/` and `src/games/flock-together/components/`

**Backend:** Firebase Cloud Functions (Node.js 20, 2nd gen)
- Functions: `fowlWordsCreateGame`, `fowlWordsStartGame`, `submitClue`, `submitGuess`, `fowlWordsAdvanceRound`, `fowlWordsSubmitWordVote`, `fowlWordsFinalizeWordSelection`, `fowlWordsUnlockFirst`, `fowlWordsForceDedup`, `fowlWordsRematch`, + Flock equivalents
- AI: `functions/src/shared/gemini.ts` — `detectDuplicateClues()` (tier-1 fast match + optional Gemini), `evaluateGuess()`, `groupAnswersWithGemini()`

**Design system:** Dark theme, Tailwind with Material 3 tokens (`bg-primary-container`, `text-on-surface`, etc.). Reference component for visual patterns: Flock Together's components — Fowl Words mirrors their token usage.

---

## Key Design Decisions

- **Givers write ONE word** — enforced at both frontend (disabled button + red border) and backend (HttpsError if multi-word)
- **Duplicates are always locked on attempt 1** — `visibleGroupIndexes` only contains unique (size-1) groups after dedup
- **All-duplicates edge case** — if no unique clues exist, guesser sees a lock screen with an "Unlock first clue → 5pts" button (calls `fowlWordsUnlockFirst`)
- **Word selection burns 2 words** — each round draws 3 words from `cardsRemaining`, winner becomes `secretWord`, losers are discarded. Game needs `TOTAL_ROUNDS * 3 = 39` cards at start.
- **Tier-1 dedup first** — exact match + normalization catches most duplicates without Gemini. Gemini only for semantic matches.
- **Scores are server-authoritative** — `tentativePoints` written to Firestore by backend; clients display, never compute scores.

---

## What's Built / Phase Status

- ✅ Phase 1–2: Refactor to multi-game architecture
- ✅ Phase 3A: Fowl Words single-attempt MVP
- ✅ Phase 3B: Multi-attempt mechanic + rename + henhouse.web.app
- ✅ UX Polish: Visual overhaul, LeaderboardModal, compact header, copy audit
- ✅ Phase 4: Word selection voting + clue debrief in result screen

## Planned / Not Yet Built

- **Clue debrief "← yours" personal highlight** in reveal view (not just result screen)
- **Per-attempt timer enforcement** (deadline exists in Firestore but no server-side enforcement yet — client-side only)
- **Player count scaling** — with 20+ players, 13 rounds means most never guess. Rule: `totalRounds = max(13, playerCount)` (deferred)
- **Flock Together** has no active planned features at this time
