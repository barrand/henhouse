# Jev Migration Experiment Plan

## Objective

Replace Gemini wherever possible while keeping the existing production experience unchanged.

The experiment must be isolated so existing games continue using current behavior, Jev can be tested by selected users, Jev can be disabled instantly, results can be compared, and no client-controlled setting can bypass server-side safety rules.

Desired end state:

- Fowl Words uses Jev for clue classification and semantic guess evaluation.
- Fowl Words duplicate detection remains deterministic.
- Flock Together uses Jev for open-answer equivalence and local clustering.
- Multiple-choice Flock Together scoring remains deterministic.
- Gemini remains only for optional text generation and bot tooling.
- Preset-question gameplay can run without Gemini.

### Delivery contract: automation before promotion

Each phase delivers implementation, automated validation, and a saved evidence report together. The implementing agent runs the phase checks, fixes failures, and reports completion only when its required gates pass. Passing mocks alone never establishes live Jev accuracy or a working Firebase game.

The user should review a brief phase summary and only policy cases that automation cannot resolve. No manual room creation, Start/Next clicking, score arithmetic, or routine screenshot checking is required for phase completion. Production publishing remains a separate release action; a passing report does not deploy or enable production experiments.

The validation framework and exact gates below are part of implementation scope, not optional follow-up work. Commands described as proposed must be implemented before the phase that depends on them is marked complete.

### Implementation phase map

The document's numbered sections describe capability stages. Implementation phases are the following concrete milestones:

1. Foundation and preflight: validation runner, report format, fixture schema, offline provider contract, emulator lifecycle, scripted actors, and baseline checks.
2. Experiment boundary: /jev entry, room mode/config version, server admission controls, immutable provider fields, and rules tests.
3. TypeSafe adapter: official SDK, secret loading, response validation, retries, deadlines, and adapter tests.
4. Fowl Words: clue validation, guess evaluation, guarded commits, shadow mode, and Jev-authoritative experimental games.
5. Flock Together: pair decisions, batching, clustering, atomic scoring, shadow mode, and Jev-authoritative experimental games.
6. Release evidence: full matrix, live smoke, cost/latency report, recovery tests, and the optional optimization decision.

Phase 1 is the immediate next step. It must not modify production game behavior, deploy functions, create production rooms, or require a live TypeSafe credential to pass its offline gates. It may add development dependencies, test fixtures, emulator-only seed helpers, validation scripts, and ignored report artifacts. A live TypeSafe contract check is an explicit optional Phase 1 check when the local credential is available; missing credentials produce incomplete live evidence, never a false pass.

Phase 1 exit gate:

- `npm run build`, `npm --prefix functions run build`, and `npm --prefix functions test` pass, with any pre-existing unrelated failures recorded separately.
- The validation runner starts and stops isolated emulators without leaving processes behind.
- A scripted host and players can create and join an emulator room through callable functions without manual clicks.
- Offline fixture schema, independent score oracle, report writer, fingerprinting, and exit codes are tested.
- Mocked TypeSafe success, malformed response, timeout, rate-limit, and missing-credential cases produce the expected reports.
- An intentionally failing fixture proves the runner returns failure; an intentionally missing prerequisite proves it returns incomplete evidence.
- The final Phase 1 report contains no secrets, no production project IDs as active targets, and no claims based on unexecuted live checks.

### Confirmed API provider

Use TypeSafe AI directly, with the API key issued through [the TypeSafe console](https://console.typesafe.ai/home).

- Evaluation endpoint: `POST https://api.typesafe.ai/v1/systemone`.
- Pinned model: `jev-1.13.0`.
- Server SDK: `@typesafe-ai/sdk`.
- Credential name: `TYPESAFE_API_KEY`, matching the SDK convention.
- Use [TypeSafe's official API documentation](https://docs.typesafe.ai/api), [model documentation](https://docs.typesafe.ai/models), and [JavaScript SDK documentation](https://docs.typesafe.ai/sdk/javascript) as the integration contract.

This replaces the earlier third-party endpoint, model spelling, pricing, and assumed 20-question request limit. Documentation checked on October 5, 2026; confirm current limits and account access before live benchmarks.

## Stage 0: Isolate the experiment

Use both a separate experimental route and a server-side, game-level provider setting.

Recommended routes:

~~~text
/                 existing production experience
/jev              Jev experiment lobby
~~~

The /jev route reuses the existing lobby and game UI but displays an “Experimental Jev Mode” indicator.

The route alone must not determine backend behavior. When a host creates a game from /jev, the server writes:

~~~ts
aiExperiment: {
  mode: 'legacy' | 'shadow' | 'jev',
  model: 'jev-1.13.0',
  configVersion: 'versioned-rubrics-thresholds-and-clustering',
  enabledAt: Timestamp
}
~~~

The server selects and enforces the mode. Missing configuration on existing rooms resolves to legacy. Legacy uses existing behavior, shadow uses existing behavior plus separate Jev comparisons, and jev uses Jev plus deterministic fallbacks. Shadow still requires Gemini for the existing semantic paths.

Players inherit the room mode regardless of the URL used to join. Persist it across reconnects, host transfers, next rounds, and rematches. Rematches copy configuration but recheck whether admission is enabled before creating an experimental room. Do not silently create a legacy rematch for a disabled experiment.

### Feature controls

Use one server-only Firestore document, aiExperimentConfig/jev, for runtime admission and execution controls. Deny client reads and writes; expose only sanitized capabilities through a callable. Read controls at each admission and model operation so changes apply without deployment. Missing or unreadable configuration disables admission and Jev execution.

Fields: admissionEnabled (default false), allowedHostUids (empty means any authenticated host when admission is enabled), enabledOperations (clue, guess, grouping; default false), and approvedConfigVersion. Model/rubric settings live in immutable, versioned server configurations referenced by the room.

Disabling an operation stops subsequent Jev calls and invokes its deterministic fallback. Committed results are unchanged; calls already started may finish under their claimed operation, subject to normal guarded commits. Environment variables are for startup configuration, not an immediate production kill switch.

The mode and version must be immutable after game creation. Add a narrow Firestore rule preventing client changes to aiExperiment, including addition or removal: existing host update permissions are currently broad. Keep diagnostics and evaluation jobs server-only. No unrelated security-rule rewrite is required for this experiment.

Validation dependency order: foundation -> S0/S1/S2 -> FW-1/FW-2/FW-3 -> FW-4 -> FW-5 -> FT-1/FT-2/FT-3/FT-4/FT-5 -> FT-6 -> FT-7 -> optional FT-8 -> release. Implement the applicable S3 generation boundary, S4 reporting, and S5 fallback/recovery checks before each game's promotion. Finish Fowl Words promotion evidence before starting Flock-specific integration. S0 rules and S2 transport tests can progress together after foundation, while live semantics require S1 credential validation.

### UI behavior

The standard lobby remains unchanged.

The Jev route adds an experimental badge, provider label, optional diagnostics for authorized testers, and a fallback indicator when a Jev decision was unavailable.

Do not expose raw confidence values to ordinary players initially.

### Success criteria

- Existing production URL behaves exactly as before.
- /jev can be disabled without changing normal games.
- Normal games never invoke Jev.
- Jev games use Jev unless a defined fallback occurs.
- Clients cannot create Jev games when the experiment is disabled.
- A provider cannot be changed after game creation.

## Stage 1: Secure Jev configuration

### Local development

Add the key to functions/.env:

~~~env
TYPESAFE_API_KEY=your-typesafe-key
JEV_DEFAULT_MODEL=jev-1.13.0
~~~

The file is already ignored by Git.

If a key was previously saved as JEV_API_KEY, rename that local entry to TYPESAFE_API_KEY. The SDK uses its official API host by default; do not configure a third-party base URL.

Never put the key in frontend VITE variables, root .env.production, React source, Firestore, logs, bot artifacts, or URL query parameters.

### Production

Use Firebase Secret Manager:

~~~powershell
firebase functions:secrets:set TYPESAFE_API_KEY --project flock-together-game
~~~

Bind the secret to functions that perform Jev decisions using Firebase’s secret configuration mechanism.

Use pinned jev-1.13.0 during evaluation. Pass this model explicitly because SDK defaults may use a rolling alias. Record the returned model field as the resolved model version.

### Success criteria

- Local emulator reads functions/.env.
- Production functions receive the secret securely.
- Frontend bundles contain no Jev key.
- Missing-key errors are clear and server-side.
- Model version and provider are logged without exposing credentials.

Bind the secret to every callable or worker that can reach a Jev operation through shared helpers. Check the call graph, including force-end/timeout paths and evaluation workers. Legacy-only operation must remain usable without a TypeSafe credential.

## Stage 2: Build the provider-neutral AI layer

Create a server-side adapter so game logic does not depend directly on Gemini or Jev.

Implement the Jev adapter with the official @typesafe-ai/sdk package in the functions workspace. It supports Node.js 20+ and CommonJS, compatible with this project's Node.js 22 functions. Configure one retry layer and explicit timeouts; avoid multiplying SDK retries with wrapper retries.

~~~ts
class DecisionService {
  classifyFowlWordsClue(input: ClueInput): Promise<ClueDecision>
  evaluateFowlWordsGuess(input: GuessInput): Promise<GuessDecision>
  compareFlockAnswers(input: AnswerPairInput[]): Promise<AnswerPairDecision[]>
}
~~~

Each response should include:

~~~ts
interface DecisionMetadata {
  provider: 'legacy' | 'jev' | 'deterministic'
  model?: string
  requestId?: string
  latencyMs: number
  confidence?: number
  fallbackUsed: boolean
}
~~~

The adapter owns SDK calls, internal decision identifiers, retries, timeouts, response validation, provider errors, and metrics. Game code receives typed results only. Do not assume the provider returns a request ID or a separate model_version field; preserve those only if present and use the documented model field.

Application decisions should have a stable identifier such as:

~~~text
fowl-words/{gameId}/{roundNum}/guess/{inputHash}
~~~

Use server-side decision claims and guarded commits to prevent duplicate score application. The official contract reviewed here does not establish an Idempotency-Key guarantee; do not rely on an arbitrary HTTP header to deduplicate inference or billing.

Handle the documented transient 429 and 529 responses with bounded backoff, honoring Retry-After when present. Confirm other transient statuses against the SDK retry policy. Do not retry invalid credentials or request validation errors. Use a bounded gameplay timeout and at most one retry initially, within the total operation deadline.

Before gameplay integration, validate the official response contract: matching question IDs and answer types, valid labels and probability distributions, resolved model, and usage.input_tokens. A Choice requires a criteria map from each label to its rubric description. Question IDs are correlation keys, not instructions; identify each compared pair explicitly in instructions or structured instruction data.

## Game 1: Fowl Words

The objective is to remove Gemini from all live Fowl Words gameplay.

### Stage FW-1: Jev clue validation

The existing deterministic checks remain authoritative for empty input, maximum length, letters-only input, known joined phrases, and obvious secret-word matches.

Replace only the ambiguous model portion of classifyFowlWordsClue.

Use two Jev choice questions in one request:

~~~text
Is this clue normally written as one standalone word?
Choices: single_word, joined_words

Is this clue effectively the secret word disguised as a plural,
inflection, abbreviation, misspelling, acronym, phonetic spelling,
or shorthand?
Choices: too_close, acceptable
~~~

State:

~~~json
{
  "secretWord": "...",
  "clue": "...",
  "deterministicChecksPassed": true
}
~~~

Decision policy:

- joined_words rejects the clue.
- too_close rejects the clue.
- both acceptable accepts the clue.
- Invalid or unavailable Jev preserves current fail-open behavior after deterministic checks.

Reject joined_words or too_close only when that label's probability reaches its versioned threshold. An uncertain classification accepts the shape-valid clue. Thresholds and fixture requirements are defined in the validation framework below.

Before inference, reject existing submissions without spending a request. After inference, transactionally recheck phase, deadline, membership, giver eligibility, and existing submission before writing. Never call the API inside a Firestore transaction. Parallel submissions and late model results must not overwrite a clue or add it after deduplication has started.

Success criteria:

- Valid one-word clues remain accepted.
- Joined phrases remain rejected.
- Disguised secret words remain rejected.
- Synonyms and related concepts remain allowed.
- Jev failure does not stop clue submission.
- Clue submission remains responsive.

Validation fixtures should include ordinary words, joined phrases, plurals, spelling mistakes, abbreviations, phonetic spellings, secret-word disguises, synonyms, and related-but-different words. Run the same corpus through current behavior, Jev, and deterministic fallback.

### Stage FW-2: Jev guess evaluation

Exact, fuzzy, plural, inflection, and length checks remain local. Jev handles only unresolved guesses currently sent to evaluateGuess.

Use one Jev choice question:

~~~text
Should this guess be accepted as the secret word?
Choices: correct, incorrect
~~~

State:

~~~json
{
  "secretWord": "...",
  "guess": "...",
  "rules": [
    "Accept equivalent translations.",
    "Accept extremely close semantic equivalents.",
    "Reject related but different concepts.",
    "Reject different things in the same category."
  ]
}
~~~

Decision policy:

- Accept only correct.
- Require a configured probability threshold for the correct label.
- Treat ambiguous decisions as incorrect.
- Fail closed if Jev is unavailable.

Claim the attempt with a unique decision identity and an expiry. Commit only while that claim and attempt still match. A client retry or recovery callable can finish an expired claim using the documented fallback; a late provider result cannot score a newer attempt. A retry returns the committed decision rather than consuming another attempt. Commit final round result and score increments atomically, including Peer love; preserve the existing Most Helpful handling.

Success criteria:

- No increase in false-positive guesses.
- Valid translations remain accepted.
- Related words remain rejected.
- Jev failure never awards points.
- p95 decision latency fits the guess interaction.

Fixtures should cover exact equivalence, plural and inflection variants, translations, spelling errors, synonyms, category neighbors, broad associations, and adversarial guesses.

### Stage FW-3: Keep duplicate detection deterministic

Do not migrate Fowl Words duplicate detection to Jev.

The current implementation already uses normalization, plural roots, inflection roots, and deterministic group construction. Correct stale comments that say Gemini performs deduplication.

Success means:

- No AI request occurs during deduplication.
- Every clue appears exactly once.
- Duplicate penalties and visibility rules remain unchanged.

### Stage FW-4: Fowl Words experiment mode

Normal games continue using the current implementation. Experimental rooms explicitly select shadow or jev mode; the authoritative provider is resolved from the room, not the current browser route.

Run Jev in shadow mode first:

- Jev makes a candidate decision.
- Existing behavior remains authoritative.
- Disagreements are recorded.
- Players see only the authoritative result.

Queue shadow work as a durable server-only evaluation job with an immutable input snapshot, config version, and expected legacy result. The worker never changes round state or player scores. Do not await both providers in the player response path or launch unawaited work after a function returns. Expire captured inputs after 7 days; retain aggregate, redacted reports. Default shadow sampling is 10% of eligible model decisions in shadow rooms, selected by stable decision hash; emulator tests use 100%.

Compare clue acceptance, guess correctness, resulting score, latency, fallback use, and disagreement categories.

### Stage FW-5: Promote Jev for Fowl Words

Promote Jev only after fixture accuracy is acceptable, shadow disagreements are reviewed, no serious cheating loophole appears, p95 latency is acceptable, fallback behavior is verified, and bot-swarm games complete successfully.

Jev becomes authoritative only for Jev-mode games. Legacy games remain untouched.

## Game 2: Flock Together

The objective is to remove Gemini from preset-question gameplay.

### Stage FT-1: Preserve deterministic paths

No Jev request is needed for multiple-choice rounds, exact normalized answer matches, or rounds where all answers already form one local group.

### Stage FT-2: Jev answer-pair decisions

For open-ended answers, ask:

~~~text
Do these two answers mean the same thing for this question?
Choices: same, different
~~~

State:

~~~json
{
  "question": "Name a topping you would put on a burger.",
  "answerA": "cheddar",
  "answerB": "cheese"
}
~~~

Rules should distinguish typo differences, plural differences, spacing differences, abbreviations, true semantic equivalence, and merely related answers.

### Stage FT-3: Pairwise evaluation

For N unique answers, evaluate every pair:

~~~text
N × (N - 1) / 2
~~~

Batch pair questions against TypeSafe's actual context and account limits. The official documentation specifies a 64k-token total request budget and a 32k-token budget for state plus the longest question. It does not establish the earlier third-party 20-question ceiling. Determine practical batch sizes through contract and accuracy tests.

Examples:

- 7 answers: 21 pair decisions.
- 8 answers: 28 pair decisions.
- 10 answers: 45 pair decisions.
- 30 answers: 435 pair decisions.
- 40 answers: 780 pair decisions.

Request count depends on measured batch size. Use bounded concurrency and a total grouping deadline from the initial implementation. A batch has shared state; give each pair explicit answer references or pair data in its question instructions. Benchmark accuracy as batch size increases, rather than assuming the largest possible request is best.

The first implementation should use complete pairwise evaluation because it is easiest to debug and compare against Gemini.

### Stage FT-4: Local clustering

Jev must not directly determine the final Firestore group structure.

The server should:

1. Build a pairwise decision matrix.
2. Discard invalid or low-confidence decisions.
3. Start with singleton groups.
4. Merge groups only when all relevant cross-pairs support equivalence.
5. Sort groups by player count, with stable answer-based tie-breaking.
6. Verify every answer appears exactly once.

Use complete-linkage-style merging instead of simple connected components. This prevents A = B, B = C, A != C from incorrectly merging all three answers.

Canonicalize unique answers and pair identifiers before comparison. At each step choose the eligible merge with the highest minimum cross-pair same probability, then break ties lexicographically by the canonical group keys. Recompute eligible merges after each union. Preserve the player-to-answer map: six identical submissions count as six players, not one unique string.

Strictly validate the partition, rejecting duplicate membership, unknown answers, empty groups, and missing answers. Keep the legacy validator unchanged for legacy rooms. Retain the existing serialized answerGroups wire shape so current clients can render experimental results. Clear commentary only for Jev-authoritative rounds.

If a batch fails or the total deadline expires, discard partial comparisons and use deterministic grouping for the whole round. Commit experimental scored state and player score increments atomically under a unique scoring claim. Recover an expired revealing claim without double-scoring or accepting late results.

### Stage FT-5: Uncertainty policy

Initial policy:

- High-confidence same: eligible for merge.
- High-confidence different: keep separate.
- Low-confidence: keep separate.
- Contradictory decisions: prefer splitting.
- Jev outage: deterministic normalized grouping.

Initial configurable thresholds:

~~~env
JEV_GROUP_SAME_THRESHOLD=0.80
~~~

Use label probability as the decision gate; record confidence as diagnostic metadata. For binary Choice, confidence is derived from the same distribution and is not another independent correctness estimate. Store tuned thresholds in the room's immutable configVersion, not mutable per-function environment variables. Tune on development fixtures, then freeze before evaluating held-out data.

### Stage FT-6: Flock experiment mode

For /jev games:

- Jev produces candidate pair decisions.
- The server builds candidate groups.
- Initially, legacy grouping remains authoritative.
- Differences are logged for analysis.

Use the same durable job mechanism as Fowl Words shadow mode. Candidate grouping cannot write authoritative scores, commentary, or state, including when the worker retries.

Compare group membership and actual game results: winning group, flock/non-flock result, player points, and final standings.

### Stage FT-7: Promote Jev grouping

Promote Jev grouping for Jev-mode games when obvious equivalences are grouped, distinct answers remain separate, majority outcomes match the baseline at an acceptable rate, no malformed partitions occur, reveal latency stays within target, and fallback behavior completes rounds safely.

After promotion, remove Gemini grouping from Jev-mode games while preserving legacy grouping for normal games.

### Stage FT-8: Optimize after correctness

Bounded concurrency and canonical ordering belong in the initial implementation. After pairwise grouping is stable, optionally benchmark representative comparisons, early stopping, or caching. Optimizations must pass the same held-out and ordering tests before promotion; preserve full pairwise mode as the reference. Do not change algorithm and provider simultaneously during initial rollout.

Keep the complete pairwise implementation available as a diagnostic mode.

## Stage 3: Preserve custom-question behavior

AI-generated category questions remain a Gemini-only feature. Manually submitted questions already supply their text and can use Jev grouping without Gemini.

If the host chooses custom categories:

- Legacy rooms retain category generation. Shadow and Jev rooms reject AI-category configuration and disable that control in the UI.
- Jev is not used for question generation.
- The UI explains that custom-question mode requires the generation provider.

If the host uses the preset bank:

- Jev mode can run without Gemini.
- Multiple-choice rounds use no AI.
- Open-answer rounds use Jev grouping.

Explain availability in the experimental lobby; never silently switch an experimental room to legacy. Permit manually submitted questions through the existing callable with existing validation.

## Stage 4: Observability and cost measurement

Every AI decision should record:

~~~text
gameId
roundNum
gameType
experimentProvider
decisionType
modelVersion
latencyMs
inputTokens
confidence
retryCount
fallbackUsed
authoritativeProvider
~~~

Do not log raw secrets. Minimize raw player content in analytics.

Expected cost pattern:

TypeSafe currently lists $0.042 per million input tokens and free output for jev-1.13.0. This supersedes the earlier third-party subscription rates. See [official pricing and limits](https://docs.typesafe.ai/models).

Estimate inference cost as `sum(usage.input_tokens) * 0.042 / 1_000_000` at this rate. Include repeated state, pair instructions, retries, shadow evaluation, and Firebase overhead in the complete experiment budget. Use actual usage and account billing to validate the estimate; latency and savings remain hypotheses until benchmarked.

- Fowl Words: Jev should reduce model cost because calls are small and output is not billed.
- Flock Together multiple-choice: no model cost.
- Flock Together open grouping: savings are uncertain because pairwise Jev decisions may consume more total input than one Gemini grouping call.
- Preset-question full-game runtime: measure both providers on identical inputs and workloads; deterministic paths avoid inference with either provider, so those paths alone do not demonstrate savings from migration.

Initial performance targets:

### Fowl Words

- p95 Jev decision under 1 second.
- Fallback rate below 1%.
- No timer-related stalls.

### Flock Together

- p95 open-answer grouping under 2 seconds for normal groups.
- Measure request count at 5, 10, 20, 30, and 40 players; choose batch and concurrency settings that meet the latency and accuracy gates.
- No incomplete group partitions.
- Fallback always completes the reveal.

## Stage 5: Failure handling

### Fowl Words clue validation

Provider failure after deterministic checks accepts a shape-valid clue, preserving current fail-open behavior.

### Fowl Words guess evaluation

Provider failure rejects an unresolved guess, awards no guess points, and preserves current fail-closed behavior.

### Flock Together grouping

Provider failure uses deterministic normalized grouping, completes the round, and records fallbackUsed: true.

### Feature kill switch

Disable admission and the affected enabledOperations field in the runtime configuration document. Subsequent operations use the documented deterministic fallback; scores already committed remain unchanged. Test controls using fresh invocations and already-running requests. If the control document cannot be read, fail to deterministic behavior for experimental decisions and record configuration-unavailable.

## Stage 6: Testing

### Validation foundation: implement before the first gameplay change

The repository currently has backend Vitest tests, frontend and functions build commands, and a manually hosted, Gemini-powered bot harness. It has no automated browser or full-game release gate. Add those capabilities as the first implementation deliverable.

Build one Node.js validation runner under tools/jev-validation with npm commands at the project root. Use cross-platform child-process orchestration on Windows and other hosts; do not depend on the existing Bash-only dev launcher. Start Firebase emulators and Vite, wait for readiness, seed emulator-only controls, run suites, and clean up processes started by the runner even on failure. Require loopback emulator addresses and reject production database targets. Prefer Firebase emulators:exec for lifecycle management.

Add a deterministic scripted host/player mode separate from the existing natural-language bot behavior. It creates rooms, joins distinct authenticated identities, starts games, submits scripted actions, advances rounds, and checks final state without human clicks or a Gemini key. All player/host actions use the public callables; Admin access is restricted to isolated fixture setup, controls, assertions, and deliberate fault injection. Seeded content lets scenarios exercise known words/questions. Tests must include real UI room creation rather than only seeded documents.

Use Vitest for pure/backend tests, the Firebase rules testing library for permission checks, and Playwright for automated browser flows. Pin installed versions in lockfiles when implemented. Add a CI workflow for the offline profile; live tests run separately in a trusted environment with the TypeSafe credential, never in an untrusted fork job.

### Proposed command contract

These commands do not exist yet. Implement them as part of the validation foundation:

~~~text
npm run validate:jev -- --phase foundation --profile offline
npm run validate:jev -- --phase S0 --profile offline
npm run validate:jev -- --phase FW-1 --profile full
npm run validate:jev -- --phase FT-7 --profile full
npm run validate:jev -- --phase release --profile full
~~~

Accepted phase IDs are foundation, S0, S1, S2, FW-1 through FW-5, FT-1 through FT-8, S3, S4, S5, and release. The runner selects all prerequisite checks for a phase; it does not permit skipping prerequisites with a passing report. FT-8 is an optional optimization; report not-in-scope if no optimization is implemented, and retain pairwise grouping.

Profiles:

- offline: builds, unit/property tests, mocked provider contracts, emulator/rules integration, fault tests, and browser scenarios; no external model calls or credentials.
- live: actual TypeSafe contract, semantic evaluation, and performance checks against synthetic/local fixtures; no production game data.
- full: offline plus the live checks required for the selected phase. Full-game release includes real Jev through emulated Firebase callables, not only direct SDK tests.

Exit 0 means all required checks passed. Exit 1 means assertions failed. Exit 2 means required evidence is blocked or incomplete, including missing credentials, missing fixtures, budget exhaustion, unavailable services, or skipped required suites. Optional baseline comparisons may be unavailable without making correctness evidence pass or fail; report them separately. A phase requiring live checks cannot be marked complete from offline results.

Use a default live run budget of 10 million TypeSafe input tokens and 1,000 requests, whichever is reached first. Check accumulated usage after each response and reserve a conservative allowance before starting the next batch; record any final in-flight overshoot. Budget exhaustion yields incomplete evidence. Count retries. Optional Gemini comparison has its own explicit budget and is disabled by default; do not claim measured cost savings if no matching Gemini baseline was collected.

### Evidence artifacts and trustworthy reports

Write each run under ignored validation-runs/jev/<UTC-run-id>/:

- report.json: machine-readable status of every required gate, measured values and thresholds, failures, skipped checks, and missing prerequisites.
- summary.md: concise agent-readable result with links to failures and artifacts.
- events.jsonl: redacted decision timing, provider, fallback reason, request count, usage, and state transitions.
- semantic-results.json: synthetic fixture IDs, expected/predicted labels, probabilities, and model/config versions.
- browser/: failure screenshots and traces; retain no credentials.

Record commit ID, a content fingerprint covering changed/untracked implementation files, dependency lock hashes, fixture version, resolved model, rubric/threshold/algorithm configuration version, runner version, seed, runtime, and timestamps. Git commit alone is insufficient while changes are uncommitted. Never reuse a report after relevant input fingerprints change.

The agent's phase completion message identifies the phase, implementation outcome, report path, passed checks, actual model calls and latency, and unresolved limits. If a required gate fails, the agent investigates and repairs it, reruns affected checks, and updates the report. Do not quietly lower thresholds, delete difficult fixtures, or hide flaky failures to obtain green results.

Use the phase dependency graph to run affected checks after repairs. Previously passing evidence may satisfy prerequisites only when its relevant implementation, dependency, fixture, and configuration fingerprints still match. Always run the full offline matrix before release; reuse unchanged live semantic evidence only when exact tested inputs and model/config versions match. Report reused evidence with its run ID and age rather than implying a fresh run.

### Semantic fixtures and minimum human involvement

Maintain fixture files with id, operation, inputs, expected outcome, policy rationale, category, critical flag, and split. Flock round fixtures also include player multiplicities, expected partition, no-answer players, and expected points/results. Include an independent score oracle and hand-checkable examples; a test must not calculate its expectation by calling the production scorer under test.

Minimum corpus before semantic promotion:

- Fowl clues: 400 distinct cases; 100 development and 300 held-out, with at least 150 valid and 150 invalid held-out cases.
- Fowl guesses: 400 distinct cases; 100 development and 300 held-out, with at least 150 correct and 150 incorrect held-out cases.
- Flock pairs: 400 distinct cases; 100 development and 300 held-out, with at least 150 same and 150 different held-out cases.
- Flock full rounds: 200 cases; 50 development and 150 held-out, spanning ties, no flock, singleton penalties, repeated answers, multilingual forms, contradictions, and 5/10/20/30/40-player workloads.

Generate clear deterministic variations from documented policies and existing tests; add curated semantic cases. Generated quantity alone is insufficient: include at least 30 distinct base concepts per operation and split related variants by concept/question family to avoid development-to-test leakage. Validate fixture schema, coverage, split overlap, and contradictory labels automatically.

The agent drafts policy rationales and performs an independent consistency review. Gemini predictions, Jev predictions, or agreement between them do not define ground truth. Mark genuinely ambiguous cases separately, exclude them from unambiguous accuracy denominators, and track their count. Present one small bundled list of at most 10 unresolved policy questions to the user only if those decisions materially affect the rules; otherwise use the existing documented game policy. A percentage passes only when the minimum held-out coverage is met.

Tune label-probability thresholds on development fixtures using a fixed sweep from 0.50 through 0.99 in steps of 0.01. Choose the threshold with highest recall among those satisfying the corresponding capability's numeric error/precision and critical-case gates below on development data, breaking ties toward the higher threshold. If no threshold passes, report failure rather than selecting a default. Freeze it in configVersion before testing held-out data. A failed held-out gate requires a documented new configuration; preserve old results, do not relabel examples to match the model. Repeated held-out tuning requires a fresh independent holdout before promotion.

### Quantitative acceptance gates

Semantic gates use final game decisions after thresholds and fallbacks, not only the provider's winning label:

| Capability | Required held-out gates |
|---|---|
| Fowl clue validation | Overall accuracy >=98%; invalid-clue acceptance <=1%; valid-clue rejection <=2%; zero errors on designated critical cases. |
| Fowl guess evaluation | Overall accuracy >=98%; wrong-guess acceptance <=1%; correct-guess rejection <=2%; zero false wins on designated critical cases. |
| Flock answer pairs | Same-pair precision >=99%, recall >=95%; zero merges on designated critical distinct-answer pairs. |
| Flock full rounds | Exact expected player points/results on >=98% of rounds; correct expected flock membership and tie/no-flock outcome on >=98%; 100% valid partitions; zero critical winner/penalty errors. |

Report confusion matrices, per-category errors, denominators, abstentions, provider outages, and 95% Wilson intervals. These are empirical release gates, not proof of production error bounds. Run the frozen semantic configuration on three separate live executions; each must pass. Report variance rather than retrying only until one favorable run passes.

Performance checks require at least 200 live Fowl semantic operations per capability and 50 live Flock grouping workloads at each supported player count. Warm provider-operation p95 must be <1s for Fowl and <2s for Flock at each tested size. Report complete callable/browser latency and cold starts separately. Fallback rate during healthy runs must be <1%; intentional outage tests are excluded from that denominator. A size that fails blocks promotion for that workload; it is not silently excluded.

Hard runtime budgets: 2s total for Fowl semantic evaluation and 4s total for Flock grouping, including retries; use the established deterministic fallback on expiry. Fault tests must reach a completed callable/state transition within 10s after fault injection, or within the defined recovery-trigger window for a simulated process crash. Define attempt/scoring lease expiry at 10s and require recovery within 20s when the runner invokes the supported recovery path. Unit deadlines use fake time; live timeout checks use generous harness margins distinct from the provider latency gates.

### Phase checklist: deliverable, validation, and exit evidence

| Phase | Deliverable and automated exit checks |
|---|---|
| foundation | Implement runner, scripted host/players, fixture schema, oracle, report writer, and CI offline job. Run existing backend tests and both builds; capture pre-existing lint failures separately. Prove an intentionally failing assertion and a missing prerequisite both produce nonzero status/report; remove fault fixtures before normal runs. |
| S0 | /jev admission, room mode/version, server controls, protected fields, inheritance/rematches. Rules tests deny host/provider-field changes and client config/job access; browser tests create normal/experimental rooms and join through ordinary codes. Check disabled/missing controls, reconnects, host transfer, and backward compatibility. |
| S1 | Secret binding and credential loading. Offline tests find no secret in bundles/artifacts and verify missing-key handling. Live contract confirms authentication/model/usage from TypeSafe. Static export/call-graph check covers every Jev-reaching callable/worker; deployed secret behavior is a later release smoke gate. |
| S2 | SDK adapter, deadlines, retry/response validation, decision identity. Mock 401/422/429/529, malformed/missing answers, out-of-range probabilities, slow response, and expired result. Assert one retry layer, deadlines, no credential logging, and no duplicate commit. Repeat actual TypeSafe contract with the pinned model. |
| FW-1 | Clue classifier plus guarded submission. Pass clue corpus, threshold boundaries, duplicate/parallel/stale submission emulator tests, and no-provider deterministic fast-path assertions. |
| FW-2 | Guess classifier plus claimed attempts and atomic score commit. Pass guess corpus and emulator tests for duplicate calls, expiry, late replies, phase advance, failure fallback, score increments, and award timing. |
| FW-3 | Preserve local duplicate handling. Existing dedup/scoring tests pass; provider-call spies assert zero Gemini/Jev calls; every clue is present exactly once and duplicates stay locked on attempt 1. |
| FW-4 | Durable shadow jobs. Worker replay/failure/duplicate delivery changes no live state or scores. Legacy calls never queue Jev. Compare API latency with shadow transport healthy vs failed; shadow inference must not be awaited in the player path. |
| FW-5 | Promote Fowl only in experimental mode. Full offline regression, three passing semantic runs, live performance gates, and scripted ten-round games using real Jev with Gemini blocked. |
| FT-1 | Preserve local paths. Provider spies prove zero calls for multiple choice and one normalized group; independent expected tie/flock/penalty scores pass. |
| FT-2 | Pair rubric and explicit answer addressing. Pass pair corpus; pair reversal and Choice-option-order probes detect changes; critical labels must remain consistent under both orderings. |
| FT-3 | Batch scheduler. Boundary/context, rate-limit, out-of-order result, concurrency, cancellation, and 780-pair workloads pass. Every pair appears once; missing results trigger fallback. Live batch-size comparison records latency/tokens/accuracy and selects a versioned configuration. |
| FT-4 | Deterministic clustering and atomic scoring. Run 1,000 seeded property cases for exact coverage, no incompatible merges, order invariance, tie-breaking, multiplicities, and independent score consistency. Exhaustively permute answer order on small contradiction fixtures. Test crash between evaluation and commit. |
| FT-5 | Versioned probability/fallback policy. Boundary and malformed-response tests pass; frozen thresholds satisfy pair and full-round held-out gates. Partial batches never produce partially semantic scores. |
| FT-6 | Durable grouping comparisons. Shadow jobs report membership and score differences without mutating the live round; retries and worker crashes remain harmless. |
| FT-7 | Promote Flock only in experimental mode. Three passing semantic runs, all player-count latency gates, and ten-round emulated games using real Jev with Gemini blocked. Commentary is empty in Jev mode and unchanged in legacy mode. |
| FT-8 | Optional optimization. If implemented, pass the same independent fixture/property/gate suites and benchmark against the pairwise reference. Otherwise record not-in-scope; do not block release. |
| S3 | Generation boundaries. UI/callable tests deny AI categories in experimental rooms, allow manual questions, preserve legacy generation, and never switch room mode. |
| S4 | Metrics and budgets. Assert actual usage matches request aggregation, retries/shadow costs count, redaction works, budget exhaustion is incomplete, and legacy/Jev workload comparisons use the same fixtures. |
| S5 | Controls and recovery. Disable each capability during active rooms; all safe fallbacks and subsequent no-Jev-call assertions pass. Kill a worker after claim and recover; late replies/replayed jobs cannot apply points twice. |
| release | Run all required offline/live suites against current fingerprints; create a final report and release checklist. No deployment occurs from the validation command. |

### End-to-end release matrix

Run both games in legacy and Jev mode at 5, 10, 20, 30, and 40 players, three fixed seeds each, for ten rounds per game: 60 complete scripted games. Use provider mocks for the large reproducible offline matrix; run at least one real-Jev ten-round game per game/player-count separately with scripted actors and Gemini egress blocked. Also run one shadow game per game with mocked providers to prove comparison isolation.

Scenarios must exercise a correct first guess, a later correct guess, a final wrong guess, all-duplicate clues/unlock, no clues, Peer love win-only payouts, Most Helpful, tie/no-flock rounds, the lone outlier penalty, manual questions, late joins, host disconnect/reassignment, rematches, timer expiry, and concurrent host/player calls. Every score is compared with the independent oracle. No stuck phase, duplicate scoring, or unexpected provider use is allowed.

Browser automation on Chromium uses 390x844 mobile and 1280x800 desktop layouts. Cover host room creation/start, joining on another page, submission/validation errors, waiting/reveal/result screens, round advance, rematch, experiment badge, and disabled admission. The agent inspects failure screenshots; the user is not required to browse them. Add focused browser checks for any discovered interaction issue rather than generating broad cosmetic snapshot churn.

### Remaining human checks and deployment evidence

The user's optional human role is one short play session to assess perceived fairness and pace, plus the small unresolved policy bundle if needed. These observations supplement automated correctness evidence; they do not replace it.

Emulators cannot prove deployed secret binding, service IAM, hosting rewrites, or real-region latency. When production deployment is separately authorized, keep experiment admission disabled, then run an automated smoke against only newly created synthetic allowlisted experimental rooms. Verify secret access, /jev routing, one decision per capability, runtime disable/re-enable, and artifact redaction. Never mutate existing human rooms. Do not publish a claim of production validation until this smoke passes; keep the report explicitly local/live-API validated until then.

## Stage 7: Final migration decision

The experiment succeeds when:

- The current site behaves unchanged for normal users.
- /jev supports isolated Jev games.
- Fowl Words completes without Gemini in Jev mode.
- Preset-question Flock Together completes without Gemini in Jev mode.
- Jev grouping produces valid partitions.
- Scoring remains server-authoritative.
- Fallbacks complete rounds safely.
- Latency fits gameplay.
- Cost is lower or acceptably predictable.
- Deployment and emulator workflows are documented.
- Remaining Gemini uses are isolated to optional generation tooling.

Completion requires the release report to pass all mandatory gates for the current implementation. Missing credentials, skipped live suites, unresolved critical cases, or a failed player-count workload leave the corresponding phase incomplete. A local release report and a deployed smoke report are distinct milestones.

### Final provider footprint

| Capability | Provider |
|---|---|
| Fowl Words clue validation | Jev |
| Fowl Words guess evaluation | Jev |
| Fowl Words duplicate detection | Deterministic |
| Flock Together multiple-choice scoring | Deterministic |
| Flock Together open-answer grouping | Jev + local clustering |
| Preset-question gameplay | No Gemini required |
| Manually submitted questions | No generation API; Jev can group answers |
| AI-generated category questions | Gemini in legacy rooms only |
| Question text generation/rewriting and simulated free-text answers | Gemini |
| Grading existing questions against a rubric | Optional later Jev phase; keep current tooling initially |
| Natural-language bots | Gemini |

The existing production URL remains the safe baseline throughout the experiment. The Jev route and game-level provider flag provide isolation, while the kill switch provides immediate rollback without changing the normal game experience.

