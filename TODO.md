# Fowl Words — Current Work

## Done
- Word selection voting (15s timer)
- Multi-attempt mechanic (points scale: 10→5→2→1)
- Clue debrief on result screen
- LeaderboardModal with egg counts
- Compact game header
- UX polish & styling
- Auto-redirect to home on refresh if game doesn't exist (faster testing)

## Next
- [ ] Per-attempt timer server enforcement (validate guesses within attempt window)
- [ ] Player-count scaling (`totalRounds = max(13, playerCount)`)
- [ ] Test with larger player groups

## Ideas (stretch goals)
- Spectator mode
- Game history / stats
- Sound effects & haptics
- Player avatars

---

# Future Games

## Imposter (concept)
A hybrid digital/physical game based on the "Imposter" word game.

- **Word reveal** — done digitally (app shows each player their word, one player secretly gets a different word or no word)
- **Clue-giving** — done in person (players give spoken clues around the table)
- **Voting** — done digitally (players vote on who they think the imposter is)

Key design questions to figure out:
- How does the app signal the imposter without others seeing?
- Does the imposter know they're the imposter, or are they just given a vague/related word?
- Scoring: points for correct votes, points for imposter surviving?
