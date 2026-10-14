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
