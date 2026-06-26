# Henhouse

Mobile party game collection. React + TypeScript + Firebase + Tailwind (Material 3 tokens). Players join via room code, no install needed.

## Deployment & URLs

**⚠️ Important:** The public URL is `chickenparty.web.app` but the Firebase project ID is `flock-together-game` — use the project ID, not the URL.

| Environment | URL | Firebase Project | Deploy Command |
|---|---|---|---|
| **Production** | https://chickenparty.web.app | `flock-together-game` | `firebase deploy --only functions --project flock-together-game` |
| Dev/Testing | flock-together-game.web.app | (same) | (same) |
| Legacy | flockgame.web.app | (unused) | — |

**Firebase Console:** https://console.firebase.google.com/u/0/project/flock-together-game/overview

**Deploy workflow:**
1. Make changes and test locally
2. Commit to `main` 
3. Run: `firebase deploy --only functions --project flock-together-game` (functions only)
4. Or: `firebase deploy --project flock-together-game` (full deploy: hosting + functions)
5. Watch for "✔ Deploy complete!" message

**Local testing:** `/Users/bbarrand/Documents/Projects/HerdMentality` — run `npm run dev` and open localhost

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

### Fowl Words — how you win
- **Guesser** wins the round by guessing the secret word within 4 attempts.
- **Givers** win points when their clue is **visible** at the moment of a correct guess (USED bonus).
- Game winner = highest cumulative score after all rounds.

### Fowl Words — scoring & awards (server-authoritative)
| Source | Who | Points | When |
|--------|-----|--------|------|
| Correct guess | Guesser | 10 / 5 / 2 / 1 by attempt | Round ends correct |
| USED | Giver (visible clue) | Same as attempt pts | Round ends correct |
| FAST | Fastest visible submitters | +3 (+2, +1 at 6+ players) | Round ends correct |
| DUPLICATE | Giver in dup group | -1 always | Round ends (any outcome) |
| ❤️ Peer love | Giver → each other clue (one optional heart per card) | +1 per heart per author | **Win only**; during reveal/guess |
| ⭐ Most Helpful | Guesser → one clue | `max(1, floor(5/N))` per co-author | Result screen; **win only** |
| 👎 Boo | Giver or guesser | 0 (display only) | Givers: reveal/guess · Guesser: result screen |

**Award rules (UI + backend must match):**
- Givers: one optional ❤️ per other clue (binary per-card toggle), one 👎 per round; cannot vote own clue.
- Guesser sees live ❤️/👎 counts on clue cards while guessing (read-only signal).
- Most Helpful floor is +1 per co-author — no zero rewards on large duplicate groups.
- Boo is fun, never punitive — 0 pts, never shown as negative.
- Votes are anonymous: UI shows counts only, never voter names.
- Scores live in `tentativePoints` / `pointsThisRound`; clients display only.
- Core math: `functions/src/games/fowl-words/scoring.ts` · Peer love: `applyPeerLoveVotes` in `peerLove.ts` · Most Helpful: `fowlWordsSubmitGuesserMostHelpful` in `index.ts`

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
- Award naming: **❤️ Peer love** (givers), **⭐ Most Helpful** (guesser), **👎 Boo** (anyone) — never use nod/shame/MVP/star in copy or code comments
- Peer love pays out **win-only** — `applyPeerLoveVotes` called only on correct-guess path in `roundFlow.ts`

---

## UI & Design Conventions

### Color tokens (source of truth: `src/index.css` `@theme` block)
- All colors via tokens — no hardcoded hex in components
- `border-outline-variant` — use at `/50`+ for visible structural borders; `/20–/30` only for extremely subtle decorative separators
- `border-outline` — preferred for input/form field borders at full opacity
- Never use `bg-surface-container-lowest` for interactive inputs — it's darker than the page; use `bg-surface-container-low` or higher for elevated inputs
- `text-outline` — tertiary/disabled text only; `text-on-surface-variant` for supporting text
- **Fixed-color info cards:** Never use `bg-primary-fixed`, `bg-secondary-fixed`, or `bg-tertiary-fixed` with an opacity modifier (e.g. `/50`) on cards that display primary information. Semi-transparent fixed colors over the dark surface produce a muddy mid-tone where both same-hue text and `text-on-surface` lose contrast. Always use the full-opacity token (`bg-primary-fixed`) paired with its semantic text tokens: `text-on-primary-fixed-variant` for labels/secondary text, `text-on-primary-fixed` for the main word/value. Apply the same rule to `secondary-fixed` and `tertiary-fixed` variants. Faint tints (`/20`) are fine for decorative row highlights where `text-on-surface` is the text color.

### Illustration rules
- Prefer SVG from `public/images/` over emoji for any prominent visual moment (game states, loading screens, result screens)
- Emoji OK only for: inline text badges, small accents within text runs
- All character SVGs: bold `#2a1f0e` outlines, flat `#e8e2db`/`#d6c5a5` fills, `#f0c078` gold accents, expressive eyes
- `<img>` tags: always `alt=""` (decorative); viewBox `0 0 200 200` for characters, `0 0 32 32` for icons, `0 0 320 48` for dividers
- Character sizes: `w-24 h-24` hero moments, `w-16 h-16` supporting, `w-10 h-10` inline icons
- Decorative overlays: `opacity-20` for corner art, `opacity-60` for dividers

### Character vocabulary
| File | Emotion | Reuse for |
|------|---------|-----------|
| `hen-neutral.svg` | Cheerful | Lobbies, home tiles |
| `hen-thinking.svg` | Waiting/pondering | Word selection (guesser), GuessView, RevealBoard |
| `hen-blindfold.svg` | Can't see | ClueSubmission (guesser) |
| `hen-magnifying.svg` | Inspecting | DeduplicationView |
| `hen-excited.svg` | Stars orbiting | First-attempt correct, Most Helpful moment |
| `hen-winner.svg` | Wings up, laurel | Final win, NAILED IT (attempts 2-3) |
| `hen-confused.svg` | Head tilt, question marks | NO LUCK result (ran out of guesses) |
| `hen-embarrassed.svg` | Wings to cheeks | NO CLUES, duplicates, rotten egg reveal |
| `hen-runner.svg` | Side profile, speed | No-winner scoreboard |
| `hen-flying.svg` | Wings spread, gleeful escape | FLOWN THE COOP (outlier) result rows |
| `flock-icon.svg` | Three birds clustered together | Flock Together home tile icon |
| `fowl-icon.svg` | One chicken on coop, three below | Fowl Words home tile icon |

### Animation classes (defined in `src/index.css`)
- `animate-hen-bob` — idle waiting states
- `animate-hen-pop` — entrances (swap on attempt change, embarrassed reveal)
- `animate-hen-celebrate` — wins and celebrations

### Component conventions
- Input fields: `bg-surface-container-low border-2 border-outline-variant/30 rounded-xl px-4 py-3 placeholder:text-outline/50 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all`
- Cards: `bg-surface-container-lowest rounded-2xl border border-outline-variant/60 shadow-sm` — note `/60` not `/30`
- Primary button: `bg-primary text-on-primary h-12-14 rounded-xl font-headline font-bold tracking-wide hover:opacity-90 active:scale-[0.98] disabled:opacity-50 transition-all`
- Dividers: `bg-outline-variant/60` or `divide-outline-variant/50` — never below `/40`

---

## Status

**Done:** word selection voting, multi-attempt mechanic, clue debrief on result screen, UX polish, LeaderboardModal, compact header, peer awards redesign (❤️ love / ⭐ most helpful / 👎 boo), design system overhaul (warmer surface, visible borders), SVG illustration system

**Planned:** per-attempt timer server enforcement, player-count scaling for large groups (`totalRounds = max(13, playerCount)`)
