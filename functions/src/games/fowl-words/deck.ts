interface BuildFowlWordsDeckOptions {
  words: string[]
  patrioticWords: string[]
  totalRounds: number
  includePatrioticQuestions: boolean
  activeCooldownKeys?: Set<string>
  rng?: () => number
}

export function shuffle<T>(arr: T[], rng: () => number = Math.random): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function buildFowlWordsDeck({
  words,
  patrioticWords,
  totalRounds,
  includePatrioticQuestions,
  activeCooldownKeys = new Set(),
  rng = Math.random,
}: BuildFowlWordsDeckOptions): string[] {
  const deckSize = totalRounds * 3
  const uniqueNormalWords = uniqueByKey(words)
  const uniquePatrioticWords = uniqueByKey(patrioticWords, new Set(uniqueNormalWords.map(wordKey)))
  const freshNormal = shuffle(uniqueNormalWords.filter((word) => !activeCooldownKeys.has(wordKey(word))), rng)
  const cooledNormal = shuffle(uniqueNormalWords.filter((word) => activeCooldownKeys.has(wordKey(word))), rng)
  const freshPatriotic = shuffle(uniquePatrioticWords.filter((word) => !activeCooldownKeys.has(wordKey(word))), rng)
  const cooledPatriotic = shuffle(uniquePatrioticWords.filter((word) => activeCooldownKeys.has(wordKey(word))), rng)
  const usedKeys = new Set<string>()

  const takeFrom = (pool: string[]): string | null => {
    while (pool.length > 0) {
      const word = pool.shift()!
      const key = wordKey(word)
      if (usedKeys.has(key)) continue
      usedKeys.add(key)
      return word
    }
    return null
  }

  const takeWithPriority = (pools: string[][]): string | null => {
    for (const pool of pools) {
      const word = takeFrom(pool)
      if (word) return word
    }
    return null
  }

  if (!includePatrioticQuestions) {
    const cards = []
    while (cards.length < deckSize) {
      const word = takeWithPriority([freshNormal, cooledNormal, freshPatriotic, cooledPatriotic])
      if (!word) break
      cards.push(word)
    }
    return cards
  }

  const cardsRemaining: string[] = []

  for (let round = 1; round <= totalRounds; round++) {
    const usePatrioticWords = round % 2 === 1

    for (let slot = 0; slot < 3; slot++) {
      const word = usePatrioticWords
        ? takeWithPriority([freshPatriotic, freshNormal, cooledPatriotic, cooledNormal])
        : takeWithPriority([freshNormal, freshPatriotic, cooledNormal, cooledPatriotic])
      if (word) cardsRemaining.push(word)
    }
  }

  return cardsRemaining
}

export function wordKey(word: string): string {
  return word.trim().toUpperCase()
}

function uniqueByKey(words: string[], excludedKeys: Set<string> = new Set()): string[] {
  const seen = new Set(excludedKeys)
  const unique: string[] = []

  for (const word of words) {
    const key = wordKey(word)
    if (!key || seen.has(key)) continue
    seen.add(key)
    unique.push(word)
  }

  return unique
}
