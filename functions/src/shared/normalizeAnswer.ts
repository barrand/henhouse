/**
 * Shared answer normalization utilities used by Flock Together scoring.
 * May be reused or extended by other games.
 */

export function normalizeAnswer(text: string): string {
  let s = text.trim().toLowerCase()
  s = s.replace(/[‘’“”]/g, "'")
  s = s.replace(/[.,!?;:\-"'()]/g, '')
  s = s.replace(/\s+/g, ' ')
  s = s.replace(/^(a |an |the )/, '')
  s = s.replace(/\band\b/g, '&').replace(/\bn\b/g, '&').replace(/&/g, 'and')
  s = s.trim()
  return s
}

export function fallbackGrouping(answers: string[]): string[][] {
  const groups = new Map<string, string[]>()
  for (const answer of answers) {
    const group = groups.get(answer) ?? []
    group.push(answer)
    groups.set(answer, group)
  }
  return Array.from(groups.values()).sort((a, b) => b.length - a.length)
}

export function validateGeminiGroups(geminiGroups: string[][], expected: string[]): string[][] {
  const expectedSet = new Set(expected)
  const allPresent = geminiGroups.flat().every((s) => expectedSet.has(s))
  const allAccountedFor = expected.every((s) =>
    geminiGroups.some((g) => g.includes(s)),
  )

  if (allPresent && allAccountedFor) return geminiGroups

  const lowerToOriginal = new Map(expected.map((s) => [s.toLowerCase(), s]))
  const remapped: string[][] = []

  for (const group of geminiGroups) {
    const fixed: string[] = []
    for (const s of group) {
      if (expectedSet.has(s)) {
        fixed.push(s)
      } else {
        const match = lowerToOriginal.get(s.toLowerCase())
        if (match) fixed.push(match)
      }
    }
    if (fixed.length > 0) remapped.push(fixed)
  }

  const remappedFlat = new Set(remapped.flat())
  for (const s of expected) {
    if (!remappedFlat.has(s)) {
      remapped.push([s])
    }
  }

  console.warn('Gemini groups remapped:', JSON.stringify({ original: geminiGroups, remapped }))
  return remapped
}
