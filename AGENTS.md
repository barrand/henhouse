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

**Bot swarm testing:** Use the local emulator harness to test with AI players:
- Start the app/emulators with `npm run dev:local`
- Create a room in the browser and copy the room code
- Run bots separately: `npm run bots -- --code ABCD --count 5`
- Bot run artifacts land in `bot-runs/<timestamp>/`
- Details: `docs/bot-swarm-test-harness.md`

**Adding games:** Follow `docs/new-game-playbook.md` for module structure, callable naming, Firestore contracts, UI patterns, content standards, and testing expectations.

---

## Games

**Flock Together** — Answer a question, score points by matching the majority. A lone odd-one-out loses 1 point for that round.

**Fowl Words** — Based on "Just One." One **guesser**, everyone else are **givers**.
- Givers each write **ONE word** clue (enforced in frontend — button disabled if multi-word)
- Duplicate clues get eliminated (locked from guesser)
- **Minimum 3 guesses guaranteed** (even if no duplicates); more if many unique clues
- On wrong guess, unlock next duplicate clue group
- Timers decrease per attempt: 60s → 40s → 20s (keeps game paced)
- Points: attempt 1→10pts, 2→5pts, 3→2pts, 4→1pt

**Round flow:** `word-selection` → `clue-submission` → `deduplication` → `reveal` ↔ `guess` → `scored`

**Word selection:** Before each round, givers vote on 1 of 3 candidate words (15s timer). Guesser is blind. 2 losing words are burned. Game draws `totalRounds × 3` words at start.

**Truth or Turd** — Fast true/false trivia. Everyone sees the same statement and answers **Truth** or **Turd**.
- Default 15 rounds, 30 seconds per question.
- Scores are server-authoritative: +1 for correct, 0 for wrong or no answer.
- No live Truth/Turd counts during answering; players see only their own submitted choice and who has answered.
- Reveal immediately when everyone answers, or when the host forces reveal after at least one answer, or when the timer expires.
- Reveal shows the correct label, a short funny/enlightening explanation, grouped Truth/Turd picks, no-answer players, points, and standings.
- Patriotic Edition is patriotic-only for this game.
- Final ties are allowed.

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
- Truth or Turd answer/explanation data must not be written to the round doc until reveal; keep unrevealed correct answers out of client-readable documents.

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
- Use generated comic-book PNG assets from `public/images/generated-comic/` for prominent game visuals (game states, loading screens, result screens, game icons, botanical decorations, footprint divider).
- Keep the old SVG files in `public/images/` as historical fallback only; do not point new UI at them unless explicitly reverting the generated art direction.
- Emoji OK only for: inline text badges, small accents within text runs.
- `<img>` tags: always `alt=""` for decorative art.
- Production character/icon/decorative PNGs must be transparent cutouts. Do not ship character assets with a baked `#262320` square background; they create visible dark boxes on light cards.
- Use `#262320` (warm dark card/surface color) only for quick visual style previews in chat, not for final app assets.
- Chroma-key generation background for production transparent assets: flat `#ff00ff`; remove it locally before using the asset in the app.
- Character sizes: `w-24 h-24` hero/waiting moments, `w-16 h-16` supporting, `w-10 h-10` inline icons; final game-over winner art can be larger (`w-32`–`w-36`).
- Home game tile icons are intentionally larger than the original SVG icons: `w-16 h-16` icon well with `w-14 h-14` image.
- Decorative overlays: `opacity-20` for corner art, `opacity-60` for dividers.

### Generated art style
- Style: bold modern 2D comic-book cartoon, thick expressive dark ink outlines, cel-shaded warm colors, subtle halftone texture, playful high-contrast action-pose energy, readable at small mobile UI sizes.
- Tone: funny, charming, party-game expressive; not babyish, not photorealistic, not 3D, not plush, not generic vector clipart.
- Palette: warm cream feathers, golden ochre beak/feet, muted red-orange comb, subtle blush cheeks, sage green accents, dark brown/black outlines.
- Character design: keep the mascot hen-like with rounded body, short wings, expressive eyes, smaller comb/wattle than a rooster, and no big rooster tail feathers unless intentionally needed.
- Animations still apply to PNGs: `animate-hen-bob`, `animate-hen-pop`, `animate-hen-celebrate`, and `animate-hen-peck`.

### Image generation prompt template
Use this as the base for new Henhouse character/state assets:

```text
Use case: stylized-concept
Asset type: mobile party game character illustration for Henhouse
Asset name: <asset-name>
Primary request: <specific character/action/emotion>

Style: bold modern 2D comic-book cartoon, thick expressive dark ink outlines, cel-shaded warm colors, subtle halftone texture, playful high-contrast action-pose energy, readable at small mobile UI sizes. Funny and charming, not babyish.

Character design: same friendly hen mascot as the existing generated-comic set: rounded cream-feather body, golden ochre beak and feet, small muted red-orange comb, subtle blush cheeks, expressive eyes, short wings, sage green accent details, dark brown/black outlines. Keep it hen-like, not rooster-like: small comb/wattle, no big rooster tail feathers.

Scene/backdrop: for production app assets, use a perfectly flat solid #ff00ff chroma-key background for background removal; the background must be uniform with no shadows, gradients, texture, floor plane, or lighting variation, and #ff00ff must not appear in the subject. Use flat warm dark #262320 only for rough style previews that will not be shipped.

Composition: square image, full-body character centered, generous padding, clean silhouette, no cropping.

Constraints: no text, no letters, no speech bubbles, no watermark, no logo, no photorealism, no 3D, no plush, no emoji, no flat SVG/vector look.
```

### Character vocabulary
| File | Emotion | Reuse for |
|------|---------|-----------|
| `generated-comic/hen-neutral.png` | Cheerful | Lobbies, home tiles |
| `generated-comic/hen-thinking.png` | Waiting/pondering | Word selection (guesser), GuessView, RevealBoard |
| `generated-comic/hen-blindfold.png` | Can't see | ClueSubmission (guesser) |
| `generated-comic/hen-magnifying.png` | Inspecting | DeduplicationView |
| `generated-comic/hen-excited.png` | Stars orbiting | First-attempt correct, Most Helpful moment |
| `generated-comic/hen-winner.png` | Wings up, champion | Final win, NAILED IT (attempts 2-3) |
| `generated-comic/hen-confused.png` | Head tilt, puzzled | NO LUCK result (ran out of guesses) |
| `generated-comic/hen-embarrassed.png` | Wings to cheeks | NO CLUES, duplicates, lone odd-one-out result |
| `generated-comic/hen-runner.png` | Side profile, speed | No-winner scoreboard |
| `generated-comic/hen-flying.png` | Wings spread, gleeful escape | FLOWN THE COOP (outlier) result rows |
| `generated-comic/hen-pecking.png` | Pecking | Flock Together reveal/counting transition |
| `generated-comic/hen-sleeping.png` | Sleeping | Waiting for other players |
| `generated-comic/flock-icon.png` | Three birds clustered together | Flock Together home tile icon |
| `generated-comic/fowl-icon.png` | Chicken with clue cards | Fowl Words home tile icon |
| `generated-comic/botanical-fern.png` | Comic fern | Home/lobby decorative corner art |
| `generated-comic/botanical-wheat.png` | Comic wheat | Home/lobby decorative corner art |
| `generated-comic/footprint-divider.png` | Footprints/feathers divider | Home bottom divider |

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

**Done:** word selection voting, multi-attempt mechanic, clue debrief on result screen, UX polish, LeaderboardModal, compact header, peer awards redesign (❤️ love / ⭐ most helpful / 👎 boo), design system overhaul (warmer surface, visible borders), SVG illustration system, local bot swarm test harness

**Planned:** per-attempt timer server enforcement, player-count scaling for large groups (`totalRounds = max(13, playerCount)`)
