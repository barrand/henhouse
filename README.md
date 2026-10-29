# Henhouse

Henhouse is a mobile party game collection for groups playing together in a browser. Players join a room with a short code, so nobody needs to install an app.

The production game is available at [chickenparty.web.app](https://chickenparty.web.app).

## Games

- **Flock Together** — Answer a question and score by matching the majority.
- **Fowl Words** — Give one-word clues, remove duplicates, and guess the secret word.
- **Truth or Turd** — Answer fast trivia questions and compare your score with the group.

## Technology

- React, TypeScript, Vite, and Tailwind CSS
- Firebase Authentication, Firestore, Cloud Functions, and Hosting
- Server-authoritative game state and scoring
- Optional Jev-powered semantic decisions for experimental gameplay

## Local development

Install dependencies from the project root:

```bash
npm install
npm --prefix functions install
```

For the browser app only:

```bash
npm run dev
```

On Windows, run the local app and Firebase emulators from PowerShell:

```powershell
npm run dev:local
```

Create a room in the browser, then add automated players from another terminal:

```bash
npm run bots -- --code ABCD --count 5
```

Replace `ABCD` with the room code and `5` with the number of bots.

## Verification

```bash
npm run build
npm --prefix functions run build
npm --prefix functions test
npm run lint
```

The local bot test artifacts are written to `bot-runs/`. The Jev validation harness is available with `npm run validate:jev`; see [`tools/jev-validation/README.md`](tools/jev-validation/README.md) for its offline and live modes.

## Deployment

The production Firebase project is `flock-together-game` and the Hosting site is `chickenparty`.

Deploy the application with:

```bash
npx -y firebase-tools@latest deploy --project flock-together-game
```

See [`AGENTS.md`](AGENTS.md) for game development conventions, Firebase details, and the process for adding new games.
