# Jev validation foundation

This runner is the executable evidence layer for the Jev migration plan. It is intentionally safe to run offline and does not read or print API credentials.

```powershell
node tools/jev-validation/index.mjs --phase foundation --profile offline
```

The command writes a redacted JSON report, Markdown summary, and JSONL event log under `validation-runs/jev/<run-id>/`. Those artifacts are ignored by Git. Exit codes are stable:

- `0` — all checks passed
- `1` — at least one check failed
- `2` — no check failed, but a required prerequisite or capability is incomplete

The foundation validates fixture shape and fingerprinting, independent Flock Together score expectations, partition invariants, mocked provider-response shape, credential redaction, and report-status semantics. It also runs the root and Functions builds/tests, proves Vite responds on a loopback-only port, and uses Firebase Emulator Suite isolation for Auth, Firestore, and Functions.

During that emulator session, two separate anonymous client actors create and join Flock Together and Fowl Words rooms through their public callable functions. The runner verifies persisted emulator state and requires Firebase to confirm shutdown. It never starts against a non-loopback host, deploys, creates production rooms, or reads a TypeSafe credential.

The runner discovers standard Windows installations when npm or firebase are not in PATH. Explicit overrides are available through JEV_NPM_BIN and JEV_FIREBASE_BIN.

Firestore Emulator Suite also requires a JDK. When Java is unavailable, the runner returns incomplete evidence (exit code 2) rather than treating unrun emulator actors as a passing or failing game check.

## English diagnosis experiment

```powershell
npm run test:jev:english
npm run experiment:jev:english -- --offline
npm run experiment:jev:english
npm run replay:jev:english -- validation-runs/jev/<english-run-id>
```

The English runner compares current, simple, and meaning-grounded Jev rubrics on 120 diagnostic cases. It expands only the baseline and strongest challenger to 240 development cases, sweeps thresholds offline, and evaluates a fixed 30-secret alias resource separately. A bounded alternate-rubric rescue is tested only when remaining valid development guesses fall in the specified probability band. No candidate is wired to gameplay.

The local routing candidate removes the length-difference rejection while retaining empty/max-length validation. Legacy routing is captured alongside it. Source-label corrections and disputed clue substring rules are saved in the report. Four disputed development meanings are retained but excluded from accuracy denominators.

Live mode reads TYPESAFE_API_KEY from the process or functions/.env; it never reads or modifies .env.production. Offline mode does not load credentials. Each stage is a separately budgeted subrun (1,000 HTTP requests and 10 million successful-response input tokens with conservative headroom); the entire experiment is capped at 4,000 requests. Retry requests count. Pass `--prior validation-runs/jev/<prior-id>` to carry consumption from a previous development run into that ceiling.

A new 400-case English holdout spans 100 secret families. Only schema/seal validation occurs before selection; no held-out inputs are sent to Jev until a passing development configuration is written to selection.json. Then three independent executions run, preserving failures. Retuning through --prior rejects reuse of exposed holdout families. A passing English experiment remains incomplete for FW-5 until multilingual and HTTP/browser game gates pass.

Artifacts include report.json, predictions.json with decision-stage traces, comparison.md, resources.json, requests.jsonl (request bodies and timing, never headers/credentials), and selection.json only if a development winner exists. Replay creates a new analysis directory, preserves source evidence, and makes zero API calls. Alias latency figures in development are offline projections from captured calls, not measured latency savings. Development rescue timing sums recorded first-call duration and a live rescue; held-out rescue executes sequentially under one shared deadline.
