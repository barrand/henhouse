# Henhouse

Mobile party game collection. React + TypeScript + Firebase + Tailwind (Material 3 tokens). Players join via room code, no install needed.

**Production:** `chickenparty.web.app` (Firebase project: `flock-together-game`) — **this is the only one that matters**
**Deployment:** `firebase deploy --only functions --project flock-together-game`
**Console:** https://console.firebase.google.com/u/0/project/flock-together-game/overview
**Legacy/Unused:** `flockgame.web.app` and `flock-together-game.web.app`
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

## UI & Design Conventions

### Color tokens (source of truth: `src/index.css` `@theme` block)
- All colors via tokens — no hardcoded hex in components
- `border-outline-variant` — use at `/50`+ for visible structural borders; `/20–/30` only for extremely subtle decorative separators
- `border-outline` — preferred for input/form field borders at full opacity
- Never use `bg-surface-container-lowest` for interactive inputs — it's darker than the page; use `bg-surface-container-low` or higher for elevated inputs
- `text-outline` — tertiary/disabled text only; `text-on-surface-variant` for supporting text

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
| `hen-excited.svg` | Stars orbiting | First-attempt correct, gold star moment |
| `hen-winner.svg` | Wings up, laurel | Final win, NAILED IT (attempts 2-3) |
| `hen-embarrassed.svg` | Wings to cheeks | NO LUCK, duplicates, rotten egg reveal |
| `hen-runner.svg` | Side profile, speed | No-winner scoreboard |

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

**Done:** word selection voting, multi-attempt mechanic, clue debrief on result screen, UX polish, LeaderboardModal, compact header, gold star clue appreciation, design system overhaul (warmer surface, visible borders), SVG illustration system

**Planned:** per-attempt timer server enforcement, player-count scaling for large groups (`totalRounds = max(13, playerCount)`)
