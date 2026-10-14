# English semantic decision experiment

Implemented the diagnosis-first plan with harness-only routing and candidate rubrics. Public callable shapes and provider selection remain unchanged. Legacy length rejection remains unchanged; the experimental local helper routes unequal-length equivalences to Jev. Fridge/refrigerator remains valid for guessing and forbidden as a giver clue.

## Implemented

- Input/local/alias/provider/probability/final traces, including the legacy routing result and explicit provider skips.
- Current, short, and reviewed-meaning-grounded rubrics; one request each.
- Balanced 120-case screen, expansion to 240 development cases for baseline and strongest challenger, and offline threshold sweeps from 0.50 to 0.99.
- A frozen 30-secret, direct-form English alias resource, with no transitive closure and no effect on clue classification.
- Conditional rescue for first probabilities from 0.25 up to the base threshold. It uses an alternate rubric, remaining deadline, and zero SDK retries for the second request.
- A prepared 400-case holdout, 200 positive/200 negative, across 100 secret families. Guards detect duplicate/reversed pairs, development targets reused as holdout targets, and holdout targets previously used as development guesses.
- Saved source/dependency fingerprints, probabilities, errors by category/stage, semantic-only metrics, Wilson intervals, request counts, successful-response input usage, and latency. Raw request recording excludes headers.
- Critical false wins are distinct from rate-limited false rejections. Input limits, probability labels, retry/budget limits, alias matching, and rescue expiry have automated tests.

## Evidence and recommendation

First draft comparison: validation-runs/jev/20261014034027497-english-experiment. It made 563 requests. Preserve this run as diagnostic data, not authoritative accuracy evidence: the consistency review found a part/whole labeling error and ambiguous draft meanings.

Reviewed development comparison: validation-runs/jev/20261014034702372-english-experiment. It made 566 additional requests, including five conditional rescue requests. Cumulative consumption was 1,129 requests and 494,098 reported input tokens. Four disputed meanings are excluded, leaving 116 valid and 120 invalid scored development cases.

| Strategy | Best diagnostic threshold with no false wins | Valid rejected | Incorrect accepted | Accuracy |
| --- | ---: | ---: | ---: | ---: |
| Current rubric, corrected routing | 0.51 | 10/116 (8.62%) | 0/120 | 95.76% |
| Current rubric + aliases, offline replay | 0.55 | 7/116 (6.03%) | 0/120 | 97.03% |
| Grounded rubric | 0.64 | 4/116 (3.45%) | 0/120 | 98.31% |
| Grounded rubric + aliases, offline replay | 0.64 | 4/116 (3.45%) | 0/120 | 98.31% |

The grounded candidate's measured semantic-operation p95 was 117ms at the listed diagnostic point. This is direct SDK latency, not complete HTTP callable/browser latency. Remaining false rejections included candy/sweets, candy/confectionery, refrigerator/refrigerating appliance, and moon/natural satellite. The five rescue calls recovered none of the scored failures; two were disputed cases in this recorded run. The runner now avoids rescue calls on ambiguous cases.

Recommendation: reviewed intended meanings are the most promising direction. The measured false-rejection rate still exceeds 2%, so no threshold is frozen and the holdout has not been evaluated. Do not expand aliases using these failures merely to obtain a green report. Any further content/rubric revision must be versioned and judged on the still-unexposed holdout only after its development gates pass.

Three held-out executions and real-Jev HTTP game validation were intentionally not run: no development winner exists. Multilingual validation remains required afterward. No promotion or deployment occurred.

## Label and rule audit

The historical car/automobile failure originated in the local length heuristic, not Jev. Both orientations now have routing regression tests. The prior house/home and dog/puppy fixtures are disputed examples, not unquestioned negative ground truth.

The first draft incorrectly accepted chair/chair seat. Its history is retained; a seat is a part and the balanced core now uses an uncontested plural. Color/coloration, mountain/mountain peak, ocean/ocean waters, and star/stellar body remain explicitly ambiguous rather than being silently counted as model errors or wins. Held-out wording was reviewed for storm severity, monsoon winds versus associated rain, and a pond versus its water before any held-out inference.

The current clue substring rule rejects sun/sundae, bee/beef, and axe/taxes. These behaviors are recorded for policy review and left unchanged. They are not attributed to Jev.

## Representativeness review (v1)

The user questioned whether the rejected examples should be considered bad tests. This review does **not** change any correctness labels, add exclusions, alter thresholds, or relax promotion gates. Candy/sweets, candy/confectionery, refrigerator/refrigerating appliance, and moon/natural satellite all retain their original valid labels and remain counted failures. Technical vocabulary and descriptive guesses can be legitimate; their frequency in real play has not been measured.

The separate `english-review.mjs` fixture annotates all 240 development cases as ordinary language, spelling/inflection, descriptive phrases, specialist names, or previously disputed meanings. These are subjective, post-prediction annotations, not an independent benchmark. They never modify the corpus used by the experiment runner or the holdout.

Offline replay of the reviewed source run produced `validation-runs/jev/20261014041051681-english-replay/representativeness.md` and its JSON audit. At the existing grounded diagnostic threshold of 0.64:

- Original result remains 4/116 valid guesses rejected, 0/120 false wins; the rejection gate still fails.
- Ordinary-language positives: 1/51 rejected (sweets), with 0/120 false wins among the existing negative cases.
- Spelling/inflection positives: 0/31 rejected.
- Descriptive positives: 1/31 rejected (refrigerating appliance).
- Specialist-name positives: 2/3 rejected (confectionery, natural satellite).

These uneven, small buckets are diagnostic, not proof of a passing everyday-guess candidate. In particular, all existing negative examples fell into ordinary language; the other buckets do not establish false-win safety. The simple candidate has only 120 screening cases and is not a like-for-like 240-case comparison.

An additional 24-case development probe fixture has been prepared: shorthand (telly, sweeties), regional names, recognizable typos, reverse synonym pairs, and competing objects/ingredients/occupations. All 24 are explicitly **not measured**. Sofa/loveseat and automobile/van are flagged for policy review rather than used as unquestioned negatives; refrigerator/freezer intentionally repeats an existing regression and must not be counted as independent evidence. No alias additions were made from observed failures.

Replay made zero model calls. Historical files, the holdout, gameplay, and production were untouched. The review tooling has automated checks for unchanged labels, non-mutating replay, refusal of mismatched historical data, and supplemental holdout-family isolation. Next: measure the supplemental probes in a budgeted development run before choosing a targeted rubric/content experiment; do not open the holdout based on favorable subset scores.

## Live supplemental comparison

Completed in `validation-runs/jev/20261014041638746-english-experiment`. The 24 supplemental cases were frozen with definitions before requests. Both candidates used their existing rubrics and the prior diagnostic thresholds (baseline 0.51, grounded 0.64), with no threshold sweep, aliases, rescue, or holdout inference.

| Candidate | Valid rejected | False wins | Scored provider-operation p95 |
| --- | ---: | ---: | ---: |
| Baseline | 2/12 | 0/10 | 160ms |
| Grounded | 0/12 | 0/10 | 118ms |

The baseline rejected sweets/candy (equivalence probability 0.20) and sofa/chesterfield (0.21). The grounded candidate accepted both, as well as telly, fone, sweeties, torch, the typo variants, and the reverse synonym probes. Both rejected sofa/loveseat and automobile/van, which remain policy-disputed and are not included in the 22 scored cases. All 48 operations actually reached Jev; none were resolved locally, none failed, and there were no retry requests. Latency is direct harness/SDK operation time, not HTTP game latency.

Consumption: 48 additional HTTP requests, 21,604 successful-response input tokens; cumulative totals including prior runs are 1,177 requests and 515,702 input tokens. Original and supplemental results remain separate; the repeated refrigerator/freezer case is not independent evidence. The original grounded 4/116 false-rejection rate still fails the gate. No winner, held-out inference, or production change resulted.

Recommended next development experiment: keep grounding and compare one concise rubric clarification permitting everyday regional names and accurate descriptive/technical names when they identify the intended meaning. Retain explicit rejection criteria for associated items, ingredients, parts, and different categories. Do not add failure-specific aliases or acceptance examples. Evaluate that revision on the full original development set and the supplemental probes, preserving all existing labels and reporting both datasets separately; only a passing original development candidate may proceed toward freezing and independent validation.
