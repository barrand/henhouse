# New Game Playbook

Standards for adding a new Henhouse game. Use this alongside `AGENTS.md` and the existing game modules.

## Game Identity

- Choose a stable slug before coding, for example `truth-or-turd`.
- Add the game as a peer module, not inside another game:
  - Frontend: `src/games/<slug>/`
  - Backend: `functions/src/games/<slug>/`
- Use a stable route and `gameType` that match the slug.
- Prefix callable functions with the game name to avoid collisions, for example `truthOrTurdSubmitAnswer`.
- Add the game to:
  - `src/shared/types.ts`
  - `src/App.tsx`
  - `src/pages/Home.tsx`
  - `functions/src/index.ts`
  - `vite.config.ts`
  - `tsconfig.app.json`

## Required Frontend Shape

Each game should provide:

- `types.ts` for game, player, round, result, and phase types.
- `service.ts` for callable wrappers and Firestore listeners.
- `hooks/useGame.ts` for game/player/round subscriptions.
- `pages/Game.tsx` for room lookup, presence, rematch redirects, abandoned-game redirects, late-join handling, and phase routing.
- Components for lobby, header, active round, reveal/result, and final scoreboard.

Phone-first interaction is the default. Use large tap targets, stable dimensions, and the existing tokenized button/card/input styles.

## Backend Contract

- Use the shared room model:
  - `rooms/{code}` maps to `gameId` and `gameType`.
  - `games/{gameId}` stores game metadata, host, status, settings, current round, players, and rematch code.
  - `games/{gameId}/players/{playerId}` stores name, score, and connection state.
  - `games/{gameId}/rounds/{roundNum}` stores the current round phase and server-computed display data.
- Scores are server-authoritative. Clients submit intent only.
- Backend writes `pointsThisRound` and cumulative player `score`.
- Capture `eligiblePlayerIds` at round start so late joiners wait until the next round.
- Timer, reveal, dedup, scoring, and advance transitions must be idempotent. Multiple clients may nudge the same transition.
- Do not store future answers, secrets, or unrevealed correct answers in client-readable documents.
- For trivia/quiz games, split visible round data from secret answer data:
  - client-readable round doc: prompt/statement, choices, tags, deadline, answer state, and reveal state
  - server-only subdoc, for example `rounds/{roundNum}/secrets/answer`: correct answer, explanation, and source refs
  - on reveal, copy only the now-public answer/explanation fields onto the round doc

## Interaction Patterns

- Home tile creates the game directly unless the game truly needs setup.
- Joining by room code must route by `gameType`.
- Lobby shows room code, connected players, settings, and host-only start.
- Active rounds should show:
  - current prompt
  - deadline/timer
  - local submission state
  - who has answered when appropriate
- Avoid revealing live answer counts if it would influence remaining players.
- Reveals should show the outcome, points, and standings before the host advances.
- Multiple-choice reveals should group players by displayed choice and keep no-answer players visible.
- Final scoreboard supports rematch and back-to-home.
- Host abandon should send all players home.

## UI And Assets

- Use color tokens from `src/index.css`; do not hardcode hex colors in components.
- Use `bg-surface-container-low` or higher for interactive inputs.
- Use visible structural borders: usually `border-outline-variant/50` or stronger.
- Use generated comic PNGs from `public/images/generated-comic/` for prominent visuals.
- Decorative `<img>` tags must use `alt=""`.
- Reuse existing hen assets before generating new ones.
- New production character/icon PNGs should be transparent cutouts created with the established chroma-key workflow.
- Home tile icons use a `w-16 h-16` icon well with a `w-14 h-14` image.

## Content Standards

- Content banks should be large enough for several sessions without obvious repeats.
- If a global mode such as Patriotic Edition applies, define exact behavior per game.
- Trivia/factual content must be checked before shipping.
- Keep wording family party-safe unless the game explicitly chooses otherwise.
- Prefer one source-of-truth content bank per game. Use a `tags` array for variants such as `patriotic` instead of creating parallel JSON files.
- If a game has multiple question formats, use an explicit `kind` discriminator such as `binary` or `multiple-choice`.
- Multiple-choice items should include stable choice ids, exactly one correct id, plausible distractors, explanations, and source refs for factual/trivia content.
- Store enough metadata for variety, such as topic tags and optional difficulty/audience tags.

## Testing Checklist

- Backend unit tests for draw/deck logic, scoring, eligibility, duplicate submissions, timer/reveal edge cases, final-round finish, and rematch reset.
- Frontend build: `npm run build`.
- Functions build/test:
  - `npm --prefix functions run build`
  - `npm --prefix functions test`
- Local multiplayer smoke test:
  - create room
  - join from multiple tabs/devices
  - answer/submit
  - timer expiry
  - all-answered early transition
  - late join
  - disconnect/reconnect
  - host abandon
  - final scoreboard and rematch
- Add bot swarm support when practical so `npm run bots -- --code ABCD --count 5` can exercise the game.
