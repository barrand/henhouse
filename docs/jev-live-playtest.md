# Jev live playtest

**Live:** https://chickenparty.web.app/jev. Hosting, gameplay Functions, Firestore rules, and the daily cleanup scheduler are deployed. Admission is enabled for authenticated hosts with `jev-playtest-v2`, all three Jev operations enabled, and no host allowlist. Normal room creation remains legacy.

## Scope and authorization

The user explicitly requested finishing the integration through a live `/jev` after deciding the current semantic uncertainty was acceptable for playing. This changes the immediate delivery target to an **opt-in public playtest**, not a claim that the original quantitative migration/promotion plan has passed. Normal room creation remains legacy; room codes carry the selected provider to everyone joining.

Configuration `jev-playtest-v2` pins `jev-1.13.0`, guess acceptance probability 0.64, clue rejection probability 0.75, and Flock pair equivalence probability 0.80. These are diagnostic/provisional playtest operating points, not held-out-qualified thresholds. The original four English false rejections remain counted. Multilingual and 400-case held-out gates remain incomplete; there is no favorable-subset relabeling or gate waiver disguised as a pass.

## Runtime behavior

- Fowl Words: unequal lengths no longer establish semantic rejection in v2 Jev rooms. Empty/maximum-length/exact/normalization checks remain. The 60 reviewed development meanings are frozen server-side. Known words use the tested grounded rubric; other word-bank entries use the simple rubric. This mixed full-bank behavior is not covered by the grounded development accuracy claim. No aliases/rescue calls are added. Translation acceptance remains policy; provider errors reject semantic guesses. Clue behavior and duplicate scoring remain separate; fridge is a guess, not a refrigerator clue.
- Flock Together: multiple choice and a single normalized group require no Jev calls. Other rounds evaluate every unique-answer pair in batches of at most 16, concurrency at most 4, within one 2-second budget. Complete-linkage clustering cannot merge a contradictory chain. The server validates the partition, orders by player counts, and calculates scores. Any failure discards the whole pair matrix and uses normalized groups. Commentary is empty. Above 40 unique answers or oversized inputs also falls back deterministically.
- Experimental Flock rounds atomically commit scored state and score increments under a unique expiring claim. Expired reveals can be reclaimed by the host's polling call; late inference cannot commit. Answer submission and skip claims guard stale phases/questions. Player score mutations are denied by rules for Jev rooms; normal-room rules are preserved.
- AI-generated categories are disabled in the experimental UI and rejected at both category update and game start. Manually submitted questions and the preset bank remain usable. Gemini behavior is preserved for normal games.
- Runtime controls disable admission and individual operations. Clues fail open after local checks; semantic guesses fail closed; grouping falls back to normalized groups. Previously scored results are never reinterpreted.

## Evidence

- Frontend and Functions builds pass. Functions: 145 unit tests across 18 files. English harness: 13 tests. Focused new-runtime lint passes; pre-existing `any` errors remain in Flock Lobby, and repository-wide lint is not claimed green.
- Fowl safety emulator checks cover duplicate/late commits, expired claims, peer rewards, phase guards, shadow retries, and cleanup. A new routing check exercises car/automobile in a v2 room.
- Real-Jev Fowl ten-round, three-player handler integration: `validation-runs/jev/20261014044537284-live-game/report.json`; correct atomic cumulative scores and duplicate guesses, Gemini blocked.
- Real-Jev Flock five sizes (5/10/20/30/40 players), ten rounds each: `validation-runs/jev/20261014044335224-flock-playtest/report.json`; 50 live requests and 37,700 input tokens, Gemini blocked, score oracle and repeated reveals checked. These use three unique answer forms; they are not 40-unique-answer performance evidence. Mocked tests cover all 780 pairs with bounded batching and concurrency, contradictory/partial matrices, and abort deadlines. The emulator suite also covers provider outage, kill switch, expired-claim takeover, and late result rejection.
- These are callable-handler emulator runs, not browser or HTTP gameplay runs. Release smoke separately checks deployed HTTP transport, admission, provider-stamped room creation, normal-room isolation, Secret Manager access, and `/jev` hosting.

### Completed production verification

The gameplay deployment succeeded; a scheduler job conflict interrupted the first full deploy after all gameplay Functions updated. Retrying only `expireJevShadowInputs` and Hosting completed with Firebase's `Deploy complete!` confirmation. No remote functions were removed (47 local exports, 44 previously deployed, zero removed exports). The four conflicting plain cloud keys were removed before binding Secret Manager, without changing any other environment variables.

- `validation-runs/jev/20261014045951475-production-smoke/report.json`: real authenticated HTTP three-player Fowl round (wrong semantic guess, stale retry ignored, exact win on attempt 2, cumulative scores match) and multiple-choice Flock round (deterministic path, duplicate reveal ignored, cumulative scores match). Temporary rooms were abandoned and temporary anonymous actors removed.
- `validation-runs/jev/20261014050130891-production-smoke/report.json`: repeated production verification with an **open-ended Flock round**, `groupSource: jev`, cumulative scores matching and repeated reveals ignored. The real secret-bound contract returned pinned model `jev-1.13.0` in 139ms. Fowl gameplay also passed again.
- The first production smoke, `validation-runs/jev/20261014045758130-production-smoke`, is preserved as failed: its one-shot begin-clue call reached the server before the spotlight ended. The harness now retries the idempotent begin operation and verifies server phase instead of relying on workstation/server clock agreement. This was a harness timing assumption; the browser already retries while the spotlight remains visible. Admission was automatically disabled during that failure and re-enabled for the passing reruns. No game timing rule was weakened.
- `validation-runs/jev/20261014050027462-production-inspect/metadata.json`: controls enabled; the four gameplay entry points plus live contract are ACTIVE and reference `TYPESAFE_API_KEY` through Secret Manager, not ordinary environment variables. Current cloud state is also inspectable with the explicit release tool.
- Browser verification shows the rendered `/jev` home page with the playtest banner and both game creation controls. The tab is left open for the user. The production asset scan found no local Jev credential in any built asset. `.env.production` and `functions/.env` were never modified or staged by this work.

The public route is ready for a human playtest. The incomplete formal gates below are still incomplete; successful smoke games are not a replacement for independent semantic evaluation.

## Deployment and rollback

Use Firebase project `flock-together-game`, Hosting site `chickenparty`. The deployment staging command copies compiled Functions and package manifests into an ignored artifact directory, without any local dotenv file. No `.env.production` or `functions/.env` is modified. With no deployment dotenv file, Firebase preserves existing cloud environment variables; conflicting plain `TYPESAFE_API_KEY` variables must first be removed only from secret-bound functions, preserving all other variables. Secret Manager remains authoritative.

Commands: `node tools/jev-validation/scenarios/production-playtest.mjs inspect|stage|disable|remove-plain-keys|enable|smoke`. These commands are explicit production operations, never run as ordinary validation defaults. `stage` prints a generated Firebase config path; use it with `firebase deploy --config <path> --only functions,hosting,firestore:rules --project flock-together-game` after tests and commit. Admission stays disabled until deployment completes, then enable all three operations for v2.

Immediate rollback: run the `disable` command. Normal rooms remain legacy. Existing experimental rooms use the documented deterministic fallbacks; create fresh normal rooms for the regular provider. Revert/deploy code separately if needed; do not reinterpret committed scores or silently convert existing rooms.

## Remaining formal migration work

The original promotion plan is not complete: independent English/multilingual evaluations, full semantic/grouping held-out corpora, large unique-answer live performance, shadow grouping and detailed score-impact aggregates, and the complete legacy/experimental multi-seed HTTP/browser matrix remain. FT shadow mode is not claimed implemented by this Jev-authoritative playtest. Optional grouping optimization remains deferred. This launch supplies a playable experiment, not general production migration.
