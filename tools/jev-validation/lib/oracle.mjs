export function normalizeAnswer(text) {
  return text.trim().toLowerCase()
    .replace(/[‘’“”]/g, "'")
    .replace(/[.,!?;:\-"'()]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^(a |an |the )/, '')
    .replace(/\band\b/g, '&').replace(/\bn\b/g, '&').replace(/&/g, 'and')
    .trim()
}

export function scoreFlockRound(answers, groups) {
  const entries = Object.entries(answers)
  const results = {}
  const points = {}
  for (const [playerId] of entries) { results[playerId] = 'outlier'; points[playerId] = 0 }
  const counts = groups.map((group) => entries.filter(([, answer]) => group.includes(answer)).length)
  if (counts.length === 0) return { results, points, flockGroupIndex: -1 }
  const max = Math.max(...counts)
  const winners = counts.map((count, index) => count === max ? index : -1).filter((index) => index >= 0)
  if (winners.length !== 1 || max < 2) return { results, points, flockGroupIndex: -1 }
  const flockIndex = winners[0]
  const flock = new Set(groups[flockIndex])
  for (const [playerId, answer] of entries) {
    if (flock.has(answer)) { results[playerId] = 'flock'; points[playerId] = 1 }
  }
  const solos = counts.map((count, index) => count === 1 ? index : -1).filter((index) => index >= 0)
  if (solos.length === 1) {
    const solo = new Set(groups[solos[0]])
    const player = entries.find(([, answer]) => solo.has(answer))?.[0]
    if (player) { results[player] = 'rotten'; points[player] = -1 }
  }
  return { results, points, flockGroupIndex: flockIndex }
}

export function assertPartition(groups, expectedAnswers) {
  const expected = new Set(expectedAnswers)
  const actual = groups.flat()
  if (actual.length !== expected.size) throw new Error('partition has duplicate or missing answer entries')
  if (new Set(actual).size !== actual.length) throw new Error('partition repeats an answer')
  if (actual.some((answer) => !expected.has(answer))) throw new Error('partition contains an unknown answer')
  if ([...expected].some((answer) => !actual.includes(answer))) throw new Error('partition omits an answer')
}
