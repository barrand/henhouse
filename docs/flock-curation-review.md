# Flock Together: curated team demo

Superseded draft: the user rejected this proposed set and is selecting 30 questions using `flock-question-selection.csv`. See `docs/curate-questions.md` for the current workflow.

Reviewed October 23, 2026. Audience: programmers and product managers who have worked remotely together for years. About five minutes available to demonstrate the game; retain the normal ten-round format. Affectionate teasing is welcome; most questions should be about life outside work.

## What makes a question earn its place

A good Flock question creates two interesting decisions: what do I think, and what do I think these people will pick? The reveal should expose a surprising assumption or invite a specific story. Recognizing the answer is not enough. Neither is a funny premise whose choices are effectively random.

The strongest candidates:

- Are understood in one reading, without specialist knowledge.
- Offer at least two choices a reasonable person can defend. A clear moral answer or a huge practical advantage usually spoils the contest.
- Have a manageable answer space. Open questions need likely clusters; player nominations naturally have the room's roster as their answer space.
- Produce a natural follow-up: "Which game?", "What would you do with those ten minutes?", "What project are you thinking of?"
- Make it amusing to be in the minority. The dissent should not imply incompetence, dishonesty, or a serious character flaw.
- Add something the other nine rounds do not already provide.

For this audience, two player-nomination rounds out of ten is a useful starting point. The user's executives example is situational and recognizable; "worst coworker" or "can't keep a secret" invites a much more lasting judgment. Do not add a second executive/meeting joke just because the first one fits.

These are editorial judgments, not results from a human playtest. The preview is a working draft to refine together.

## Findings from the existing bank

The live source bank has **185 questions: 166 multiple choice and 19 open**. Thirty are marked patriotic, leaving 155 in the ordinary bank. There is also an older hand-review CSV and an automated report covering a different, larger question set. Row numbers in those older files do not identify rows in the current bank reliably.

The old automated report rates pizza-topping prompts as STAR questions. Its entertainment rubric explicitly asks for "two-drinks-in" humor, and its multiple-choice convergence simulator assigns fixed answer probabilities. Those outputs are not evidence that this work group will enjoy a question. Do not select this playlist by those scores.

### Best existing material to build on

Numbers below are one-based positions in `functions/src/games/flock-together/data/questions.json` at review time; text is the durable reference.

| Row | Candidate | Assessment |
| --- | --- | --- |
| 38 | What animal would be the rudest if it could talk? | Best fast opener. Immediately visual, no personal exposure, and animal encounters give people something to defend. Keep. |
| 95 | Pick your useless superpower | The single pigeon is memorable. Reserve: the options' meanings are underspecified, and the round can become a random comedy choice rather than a prediction about people. |
| 106 | Pick your apocalypse buddy | Good clash of priorities for this audience. Give it a concrete rebuilding-a-town setting. Watch for an automatic engineer vote; that would make it expendable. |
| 180 | Speak to animals or all human languages | Strong reserve: two attractive capabilities and specific ways to use them. Not in the initial ten because the opener already uses talking animals. |
| 184 | Never need sleep or never need to eat | Strong conversation potential about time, pleasure, and chores. Clarify that either remains possible for fun. Watch for a sleep landslide. |
| 127 | Most nostalgic smell | Good story potential. Existing options are warm but somewhat interchangeable, and it is quieter than the selected nostalgia question. Reserve. |
| 125 | What makes someone immediately likeable? | Reveals values but feels closer to an icebreaker or interview. Reserve for a different session. |
| 23 | Most ridiculous childhood belief | Can produce real stories. The existing choices mostly repeat familiar childhood myths; consider an open rewrite for a longer session. |
| 35 / 185 | Live in a fictional world | Strong only with overlapping fandoms. Current worlds have radically different safety conditions; the answers may be driven by lore rather than the people. Reserve. |
| 67 / 69 | Longest without a phone / survive a horror movie | More affectionate than the negative nomination questions, but familiar. Reserve rather than using four roster rounds. |
| 117 | A scam everyone accepts | Can unlock stories; also easily becomes a shared gripe. Leave out of the short demonstration. |
| 31 | Job you would be terrible at | Potential stories, but the provided options and workplace context pull toward competence judgments. Reframe for a future pack. |

### What I would leave out of this pack

| Family | Examples from the bank | Why it misses this brief |
| --- | --- | --- |
| Familiar internet arguments | Cereal soup, hot-dog sandwich, horse-sized duck | The positions are already rehearsed. Novelty has to come from the group, and these provide little help. The duck question also appears twice. |
| Taste rankings with little consequence | Best fries, best dip, best candy, best fast food | Easy to answer; generally little reason to ask someone to explain. A single food question could work with a better situation, but there is no need to spend this demo on it. |
| Generic over/underrated rankings | Holiday, food, city, fashion | Often become a predictable complaint or depend on travel and cultural exposure. A concrete scenario is usually stronger. |
| Negative roster judgments | Worst roommate, worst taste in music, pyramid scheme, can't keep a secret | Ask the team to endorse an unflattering trait. Less useful than an affectionate, specific imagined incident. |
| Gross-out choices | Sweat mayonnaise, tuna breath, gravy shower, household smells | Disgust is the whole joke; the reveal rarely tells us something worth following up. |
| An obvious responsible choice | Ban war versus mosquitoes; save a pet versus documents | Options are on different moral or emotional scales. A minority answer can become awkward rather than amusing. |
| Ambiguous superlatives | Unlimited money versus unlimited time; never age mentally | People may be answering different definitions. Rule arguments consume a five-minute demo. |
| Political/patriotic discussion | Immigration, taxes, presidents, military intervention | Wrong topic and tone for this particular demonstration. This is a pack decision, not a proposal to delete the separate edition. |
| Low-stakes but thin hypotheticals | Monster truck versus airplane; long toes versus short fingers | Unusual words alone do not make a reveal interesting. What would someone actually want to know about the other person's choice? |
| Celebrity/fandom dependencies | Elevator celebrity, narrator, fictional-character identification | Uneven recognition and generational context can do more work than the group's personalities. |

There are concrete cleanup candidates even outside this pack: the accent question includes "Southern American" and "Southern drawl" as separate options; music-versus-movies and the duck fight have near duplicates; several broad prompts are constrained by arbitrary choices. The curated feature deliberately leaves the existing bank in place while this new editorial direction is reviewed.

## Draft ten, in play order

The exact playable wording and choices live in `functions/src/games/flock-together/data/curated-questions.json`. The host can preview all ten in the lobby. This file is the single source used by the backend and preview.

| Round | Prompt | Reason for its place / follow-up |
| --- | --- | --- |
| 1 | If animals could talk, which would be the rudest? | Fast, accessible opener. Cat / Goose / Squirrel / Horse. Ask someone in the minority what that animal did to them. |
| 2 | Who here is most likely to put their foot in their mouth in front of executives? | User's example. A specific shared imagined scene. Answer with a player name; keep any anecdote affectionate and brief. |
| 3 | Once a day, pause time for ten minutes or rewind by ten seconds? | Best actual tradeoff: more usable time versus another shot at a moment. Ask what they would use it for. If asked, you can move during the pause; rewind gives you another try. |
| 4 | Which normal human activity is hardest to explain to an alien? | Birthday candles / Clapping / Job interviews / Spectator sports. Familiar rituals become strange when explained out loud. Ask for a one-sentence explanation. |
| 5 | Rebuilding a town after the apocalypse: who do you recruit first? | Doctor / Mechanic / Farmer / Engineer. Different practical priorities, with an audience-specific prediction problem. Replace if everyone immediately chooses engineer. |
| 6 | Which statistic from your life would you want to see? | Laughs caused / Time looking for things / Unprovable times you were right / People who remember you fondly. Shifts from absurdity to personality without demanding a confession. |
| 7 | Who would turn a tiny hobby into a wildly overengineered project? | Second and final roster question. Affectionate recognition of enthusiasm. The natural follow-up is a story about the actual hobby. |
| 8 | Never need sleep or never need food, while keeping either for fun? | Time and convenience versus daily rituals. Preserve optional enjoyment so people answer the same hypothetical. This is the first round I would replace if it feels too obvious. |
| 9 | Which favorite experience would you want to have for the first time again? | Movie / Video game / Trip / Album. Easy vote followed by a specific recommendation or memory. A warmer late-game round. |
| 10 | Twenty-minute talk with no preparation: which topic saves you? | Hobby / Movie or TV show / Specific pet peeve / Deep internet rabbit hole. End with an opening for people to reveal an unexpected interest. Ask one person for their actual talk title. |

I would prioritize rounds 2, 3, 6, 7, and 10 for discussion while refining the set. Round 1 earns its place as an easy entry, not as the deepest question. Rounds 5 and 8 need the most scrutiny for a lopsided answer. If either fails, the language-versus-animals reserve is the strongest ready alternative, with animal repetition to consider.

## Administering the five-minute demonstration

Keep the requested ten-round game; do not claim that ten rounds plus discussion will fit in five minutes. Have people join before the demonstration begins if possible. Say: **"Pick the answer you think this group will pick. Matching the biggest group scores. Don't say your answer until the reveal."**

The first three rounds intentionally show three different strengths: an easy funny premise, the group recognizing one another, and a real hypothetical tradeoff. Allow roughly 15–20 seconds to answer and 10–20 seconds for one reaction after each reveal. The current timer is 45 seconds, but the game can reveal when everyone submits and the host controls when the next round starts. Budget connection, joining, and scoring latency separately. Stop after a few rounds if the five-minute slot is strict; the full ten-round game remains available.

Do not explain possible answers before voting. Do not make every minority player defend themselves. One spontaneous explanation is more useful than a compulsory discussion. If a nomination produces a named person, give them room to laugh or pass without demanding a story.

## Feature behavior

- Only the host sees the toggle and the question preview. The server also checks host ownership and lobby status.
- Off by default. On means the ordered curated playlist is exclusive: no standard, patriotic, category-generated, or custom questions enter the draw.
- Existing categories, custom submissions, and patriotic preference are retained; they are inactive while curated mode is selected.
- Normal ten rounds and normal scoring. The setting carries into rematches.
- The curated sequence ignores global 48-hour cooldowns, so rehearsal cannot consume the real event's questions. Used questions remain used within the room; skip moves to the next curated entry. An exhausted curated pack never falls back to the normal bank.
- Content edits are source edits for now. Both functions and hosting need to be deployed to publish changes to gameplay and the host's preview together.

Next editorial step: react to the exact ten and swap the weakest before deployment. A draft playlist makes the feature concrete; it does not establish that every question has been proven with this team.
