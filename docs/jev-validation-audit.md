# Jev validation audit

This audit supersedes earlier claims that S2 and FW-1 through FW-4 were fully validated. Those earlier reports primarily ran existing unit tests and checked for source strings. They did not establish emulator concurrency safety, live semantic accuracy, or production readiness.

## Repairs

- Bind TYPESAFE_API_KEY to submitClue and submitGuess as well as the background worker.
- Evaluate allowlists against the room's original host instead of the submitting giver or rotating guesser.
- Share probability policy between authoritative and shadow decisions; uncertain negative clue labels remain fail-open.
- Commit shadow result and aggregate increments together under a transaction, so concurrent/replayed delivery counts once. Concurrent inference can still happen; no provider billing idempotency is claimed.
- Remove captured input on provider failure. Cleanup clears its query field so expired jobs beyond the first page are eventually processed.
- Check current game, round, guesser, claim identity, attempt, and expiry before guess commits.
- Carry the observed attempt from the UI to prevent a retried submission consuming a subsequent attempt. Old clients without the field retain the older retry limitation.
- Recover expired guesses with clue unlocking and recalculated tentative points. Host/guesser screens invoke recovery automatically while connected.
- Replace terse clue and guess rubrics with the documented game policies. Probabilities remain provisional; no threshold was lowered to pass a failing holdout.
- Avoid logging raw provider exception objects in gameplay fallback paths.

## Validation executed

- Root and Functions builds passed.
- 124 Functions tests passed, including real SDK HTTP transport tests for 401/422, one 429/529 retry, Retry-After, total-deadline cancellation, malformed responses, and probability boundaries.
- Firestore emulator safety scenarios exercise actual callable handlers and transactions with mocked providers: concurrent score commits, stale/parallel clues, late provider replies, expiry recovery, operation disable, duplicate penalties, Peer love, worker replay/failure, and cleanup pagination.
- Foundation and S0 emulator suites passed. S0 now checks authenticated client denial for both shadow jobs and aggregates.
- A three-player ten-round game passed using real Jev through callable handlers with Firestore emulated and Gemini functions blocked. The harness seeds synthetic words and accelerates timestamps; it does not exercise HTTP callable transport or the browser UI. Every round and cumulative score is checked against explicit independent expected totals.
- Added 424 clue and 424 guess fixtures: 40 base concept families, 100 development and 300 held-out cases per operation, plus 24 English challenges per operation. Quantity/split checks pass, but the initial corpus is deliberately reported as limited: local variants dominate positive English examples. A fresh independent holdout is required after rubric tuning.
- Live semantic runs preserve all predictions, probabilities, outages, request counts, successful-response input usage, p95 latency, category errors, and (in the latest runner) Wilson intervals, development threshold sweep, source fingerprints, and lock hashes.

## Evidence

All run paths are relative to the repository. Historical reports below describe the source/configuration tested at that time; changes require new evidence before promotion.

| Evidence | Artifact |
| --- | --- |
| Foundation | validation-runs/jev/20261014030232-19832/summary.md |
| S0 including shadow access denial | validation-runs/jev/20261014030347-17344/summary.md |
| Real Jev ten-round handler game | validation-runs/jev/20261014025311344-live-game/report.json |
| First live run, terse guess rubric | validation-runs/jev/20261014024829385-semantics/summary.md |
| Revised guess rubric runs | validation-runs/jev/20261014025004972-semantics/summary.md; validation-runs/jev/20261014025242283-semantics/summary.md; validation-runs/jev/20261014025326657-semantics/summary.md |
| English challenges before clue rubric repair | validation-runs/jev/20261014025540564-semantics/summary.md |
| English challenges after clue rubric repair | validation-runs/jev/20261014025619791-semantics/summary.md |
| Latest full semantic run | validation-runs/jev/20261014030431261-semantics/summary.md |
| Latest offline promotion gate and safety scenarios | validation-runs/jev/20261014030552-19640/summary.md |

## Promotion remains blocked

The latest full live run made 481 HTTP requests and reported 264,024 successful-response input tokens. Clues achieved 100% held-out accuracy, with 221 live operations and p95 118ms. Guesses achieved 97.67% held-out accuracy, with 260 live operations and p95 132ms. Seven valid held-out translations were rejected, a 4.67% false-rejection rate. No tested incorrect held-out guess was accepted. These results fail the plan's accuracy, false-rejection, and critical-case gates. The 0.50–0.99 development sweep found no passing guess threshold.

The English challenge run passed 24/24 clue cases after repair. Guesses passed 23/24; car/automobile was incorrectly rejected. Fridge/refrigerator is valid as a guess and invalid as a giver clue, confirmed by the user.

Required before FW-5: solve semantic false rejections, freeze a development-selected configuration, create a new independent holdout after tuning, pass three frozen live runs, and complete the HTTP/browser and supported-player-count game matrix. Shadow enqueue latency comparison and complete shadow/score impact reporting also remain to be built. Repository-wide lint has pre-existing failures; changed migration runtime files pass focused lint. Production deployment, IAM/secret smoke, and the functions/.env deployment conflict are not proven by these local tests.

No production deployment or control-document changes were made. The user-owned .env.production was preserved. Flock-specific integration remains after Fowl promotion, per the dependency order.
