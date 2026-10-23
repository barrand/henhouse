# Henhouse UI restyle review

Completed 2026-10-23. Presentation changes only; game rules, server scoring, Firebase services, data contracts, and application routes were left unchanged. Existing local changes in Home.tsx and .env.production were preserved.

## Theme

The palette, semantic aliases, fonts, radii, outlines, shadows, focus treatment, and motion live in `src/index.css`. `index.html` loads Bricolage Grotesque and JetBrains Mono from Google Fonts and permits browser zoom.

The shared theme covers loading and waiting screens as well as the home/join screen, all three lobbies, word selection, clue submission, deduplication, guessing, grouped answers, round results, standings, final scores, privacy handoff, and scoring settings. Existing generated-comic illustrations remain in use.

Cyan marks primary actions through the independent `action` / `on-action` / `action-shadow` theme tokens. Sun marks active players and winners; mint marks correct answers and matching groups; cyan marks room codes and neutral information; orange marks timers; lilac marks secondary/waiting states; red marks errors, duplicate-rule penalties, and destructive actions. Disabled controls keep readable text. Locked clues use locks, text labels, strike-throughs, and dashed borders. The guess form and award controls have room to wrap on narrow screens.

## Verification

- `npm run build`: passed (TypeScript and Vite production build). Vite retains its existing large-bundle warning.
- Browser review: 82 fixture scenarios at **390 × 844** and **1440 × 900**, using the actual game components. This includes 14 Flock Together scenarios, 19 Fowl Words scenarios in both player roles, 12 Truth or Turd scenarios, scoring settings, privacy handoff, and eight scoring-engine phases in both roles.
- Rendered text contrast: no failures against 4.5:1 for normal text and 3:1 for large text in the final reviewed scenarios. Background compositing and inherited opacity were included. Decorative art/icons were excluded from text measurements. Inputs/placeholders use the same high-contrast cream/mute/deep palette.
- Horizontal overflow: no document overflow in those scenarios, comparing scroll width against the actual available client width, including scrollbar space.
- Narrow-phone spot checks at **320 × 740**: lobby, grouped results, word selection, clue reveal/guess controls, trivia choices/results, settings, and scoring-engine results. Award actions stack and long words wrap.
- Interactions: missing-name validation and multi-word clue validation remain visible; the invalid clue submit button remains disabled and readable.
- Reduced motion: universal CSS disables animations/transitions; all 13 imperative visual-effect functions were checked to return without DOM work when the preference is enabled. Idle/celebration motion is finite.
- `npm run lint`: 37 existing errors and two existing warnings. A comparison of edited files against HEAD found 27 existing errors before and after the restyle, with no newly introduced lint failures. Existing rule violations include explicit-any, unused variables, effect-state updates, and mixed component/helper exports.

Visual fixtures were served through temporary local review entry points, which were removed after review. No application routes were added. This was a UI review, not a new end-to-end networking test.

## Primary action color follow-up

Primary action buttons now use cyan, independently of the sun highlights for active players and winners. Change `--color-action`, `--color-on-action`, and `--color-action-shadow` in `src/index.css` to try another action color. The follow-up production build passed, and the home screen was rechecked at 390px and 1440px with no rendered text-contrast or horizontal-overflow failures. Updated captures are `cyan-actions-phone.jpg` and `cyan-actions-desktop.jpg`.

## Review artifacts

Phone and desktop screenshots, the scenario list, and the final contrast/overflow audit results are saved in:

`C:/Users/barra/.codex/visualizations/2026/10/23/01a16ae1-aa8c-7613-aa26-e800b377c455/henhouse-restyle/`

Captures include home/join, the Flock Together lobby/question/grouped results, Fowl Words voting/clues, and Truth or Turd answering/results. The emulator notice visible in captures belongs to the existing local Firebase setup.

## Files changed

- `index.html`
- `src/games/flock-together/components/CategoryInput.tsx`
- `src/games/flock-together/components/GameHeader.tsx`
- `src/games/flock-together/components/LeaderboardModal.tsx`
- `src/games/flock-together/components/Lobby.tsx`
- `src/games/flock-together/components/QuestionDisplay.tsx`
- `src/games/flock-together/components/QuestionSubmission.tsx`
- `src/games/flock-together/components/RevealBoard.tsx`
- `src/games/flock-together/components/Scoreboard.tsx`
- `src/games/fowl-words/components/ClueSubmissionView.tsx`
- `src/games/fowl-words/components/GameHeader.tsx`
- `src/games/fowl-words/components/GuessView.tsx`
- `src/games/fowl-words/components/LeaderboardModal.tsx`
- `src/games/fowl-words/components/Lobby.tsx`
- `src/games/fowl-words/components/PointCounter.tsx`
- `src/games/fowl-words/components/PrivacyHandoffView.tsx`
- `src/games/fowl-words/components/RevealView.tsx`
- `src/games/fowl-words/components/RoundResultView.tsx`
- `src/games/fowl-words/components/Scoreboard.tsx`
- `src/games/fowl-words/components/ScoringRound.tsx`
- `src/games/fowl-words/components/ScoringSettings.tsx`
- `src/games/fowl-words/components/WordSelectionView.tsx`
- `src/games/fowl-words/components/clueVoteUi.tsx`
- `src/games/fowl-words/components/reactionFx.ts`
- `src/games/fowl-words/components/thumbVoteFx.ts`
- `src/games/truth-or-turd/components/AnsweringView.tsx`
- `src/games/truth-or-turd/components/GameHeader.tsx`
- `src/games/truth-or-turd/components/Lobby.tsx`
- `src/games/truth-or-turd/components/RevealView.tsx`
- `src/games/truth-or-turd/components/Scoreboard.tsx`
- `src/index.css`
- `src/pages/Home.tsx`
- `docs/ui-restyle-review.md`
