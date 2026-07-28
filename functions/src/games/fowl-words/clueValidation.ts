import { classifyFowlWordsClue, fuzzyMatch, normalizeGuess, type FowlWordsClueClassification } from '../../shared/gemini'

export type ClueValidationReason =
  | 'empty'
  | 'too-long'
  | 'invalid-characters'
  | 'joined-words'
  | 'too-close-to-secret'

export type ClueValidationResult =
  | { valid: true; clue: string }
  | { valid: false; reason: ClueValidationReason }

export type ClueClassifier = (clue: string, secretWord?: string) => Promise<FowlWordsClueClassification | null>

const MAX_CLUE_LENGTH = 50
const SINGLE_WORD = /^[\p{L}\p{M}]+$/u
const INVISIBLE_OR_VARIATION_SELECTOR = /[\p{Cf}\uFE0E\uFE0F\u{E0100}-\u{E01EF}]/u
// Game-policy spellings that must never rely on model judgment. Some have
// dictionary-listed closed variants, but Fowl Words treats them as phrases.
const CANONICAL_MULTI_WORD_CLUES = new Set([
  'bluecheese',
  'birthdaycake',
  'chocolatecake',
  'highschool',
  'hotdog',
  'icecream',
  'peanutbutter',
  'redapple',
])

/**
 * Validates the parts of the one-word rule that are deterministic. Leading and
 * trailing whitespace is harmless and normalized away; anything else besides
 * letters and combining marks is rejected.
 */
export function validateClueShape(rawClue: unknown): ClueValidationResult {
  if (typeof rawClue !== 'string') return { valid: false, reason: 'empty' }

  const clue = rawClue.normalize('NFC').trim()
  if (!clue) return { valid: false, reason: 'empty' }
  if (clue.length > MAX_CLUE_LENGTH) return { valid: false, reason: 'too-long' }
  if (INVISIBLE_OR_VARIATION_SELECTOR.test(clue)) return { valid: false, reason: 'invalid-characters' }
  if (!SINGLE_WORD.test(clue)) return { valid: false, reason: 'invalid-characters' }

  return { valid: true, clue }
}

function levenshteinDistance(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index)
  for (let i = 1; i <= left.length; i++) {
    const current = [i]
    for (let j = 1; j <= right.length; j++) {
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1),
      )
    }
    for (let j = 0; j <= right.length; j++) previous[j] = current[j]
  }
  return previous[right.length]
}

function inflectionRoots(word: string): Set<string> {
  const roots = new Set([word])
  const addRoot = (root: string) => {
    if (root.length >= 3) roots.add(root)
  }

  if (word.endsWith('ies') && word.length > 4) addRoot(`${word.slice(0, -3)}y`)
  if (word.endsWith('es') && word.length > 4) addRoot(word.slice(0, -2))
  if (word.endsWith('s') && word.length > 3) addRoot(word.slice(0, -1))
  if (word.endsWith('ing') && word.length > 5) {
    const root = word.slice(0, -3)
    addRoot(root)
    addRoot(root.replace(/(.)\1$/, '$1'))
    addRoot(`${root}e`)
  }
  if (word.endsWith('ed') && word.length > 4) {
    const root = word.slice(0, -2)
    addRoot(root)
    addRoot(root.replace(/(.)\1$/, '$1'))
    addRoot(`${root}e`)
  }
  return roots
}

export function isObviouslySameAsSecretWord(clue: string, secretWord: string): boolean {
  const normalizedClue = normalizeGuess(clue)
  const normalizedSecret = normalizeGuess(secretWord)
  if (!normalizedClue || !normalizedSecret) return false
  if (normalizedSecret.includes(normalizedClue) || normalizedClue.includes(normalizedSecret)) return true
  if (fuzzyMatch(normalizedClue, normalizedSecret)) return true

  const clueRoots = inflectionRoots(normalizedClue)
  const secretRoots = inflectionRoots(normalizedSecret)
  for (const root of clueRoots) {
    if (secretRoots.has(root)) return true
  }

  const maxDistance = normalizedSecret.length >= 8 ? 2 : normalizedSecret.length >= 5 ? 1 : 0
  return maxDistance > 0 && levenshteinDistance(normalizedClue, normalizedSecret) <= maxDistance
}

/**
 * Applies the semantic portion of the one-word rule. A classifier failure is
 * deliberately fail-open after the deterministic checks so a model outage does
 * not prevent the whole flock from submitting clues.
 */
export async function validateClueForSubmission(
  rawClue: unknown,
  secretWordOrClassify: string | ClueClassifier = '',
  maybeClassify: ClueClassifier = classifyFowlWordsClue,
): Promise<ClueValidationResult> {
  const secretWord = typeof secretWordOrClassify === 'string' ? secretWordOrClassify : ''
  const classify = typeof secretWordOrClassify === 'function' ? secretWordOrClassify : maybeClassify
  const shape = validateClueShape(rawClue)
  if (!shape.valid) return shape
  if (secretWord && isObviouslySameAsSecretWord(shape.clue, secretWord)) {
    return { valid: false, reason: 'too-close-to-secret' }
  }
  if (CANONICAL_MULTI_WORD_CLUES.has(shape.clue.toLocaleLowerCase('en-US'))) {
    return { valid: false, reason: 'joined-words' }
  }

  try {
    const classification = secretWord
      ? await classify(shape.clue, secretWord)
      : await classify(shape.clue)
    if (classification === null) {
      console.error('Fowl Words clue classifier returned malformed output; accepting shape-valid clue')
      return shape
    }
    if (classification.tooCloseToSecret) return { valid: false, reason: 'too-close-to-secret' }
    if (!classification.allowed) return { valid: false, reason: 'joined-words' }
  } catch (err) {
    console.error('Fowl Words clue classifier failed; accepting shape-valid clue:', err)
  }

  return shape
}
