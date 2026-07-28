import { describe, expect, it, vi } from 'vitest'
import { isObviouslySameAsSecretWord, validateClueForSubmission, validateClueShape } from '../clueValidation'

describe('validateClueShape', () => {
  it('normalizes and accepts a single word', () => {
    expect(validateClueShape('  caf\u00e9  ')).toEqual({ valid: true, clue: 'caf\u00e9' })
    expect(validateClueShape('cafe\u0301')).toEqual({ valid: true, clue: 'caf\u00e9' })
  })

  it.each([
    'ice cream',
    'ice-cream',
    'ice_cream',
    'ice2cream',
    '\uD83C\uDF68',
    'ice\uD83C\uDF68cream',
    'ice\u200Bcream',
    'ice\uFE0Fcream',
  ])('rejects non-single-word input: %j', (clue) => {
    expect(validateClueShape(clue)).toEqual({ valid: false, reason: 'invalid-characters' })
  })

  it('rejects empty and oversized input', () => {
    expect(validateClueShape('   ')).toEqual({ valid: false, reason: 'empty' })
    expect(validateClueShape('a'.repeat(51))).toEqual({ valid: false, reason: 'too-long' })
  })
})

describe('validateClueForSubmission', () => {
  it('rejects a classifier-identified joined phrase', async () => {
    const classify = vi.fn().mockResolvedValue({ allowed: false, reason: 'joined_words' })

    await expect(validateClueForSubmission('strawberryshortcake', classify)).resolves.toEqual({
      valid: false,
      reason: 'joined-words',
    })
    expect(classify).toHaveBeenCalledWith('strawberryshortcake')
  })

  it('rejects canonical multi-word spellings without asking the classifier', async () => {
    const classify = vi.fn().mockResolvedValue({ allowed: true, reason: 'single_word' })

    await expect(validateClueForSubmission('hotdog', classify)).resolves.toEqual({
      valid: false,
      reason: 'joined-words',
    })
    expect(classify).not.toHaveBeenCalled()
  })

  it('accepts a classifier-approved single word', async () => {
    const classify = vi.fn().mockResolvedValue({ allowed: true, reason: 'single_word' })

    await expect(validateClueForSubmission('rainbow', classify)).resolves.toEqual({
      valid: true,
      clue: 'rainbow',
    })
  })

  it('does not call the classifier for shape-invalid clues', async () => {
    const classify = vi.fn()

    await expect(validateClueForSubmission('\uD83C\uDF68', classify)).resolves.toEqual({
      valid: false,
      reason: 'invalid-characters',
    })
    expect(classify).not.toHaveBeenCalled()
  })

  it('keeps shape-valid clues playable if classification is unavailable', async () => {
    const classify = vi.fn().mockRejectedValue(new Error('Gemini unavailable'))

    await expect(validateClueForSubmission('butterfly', classify)).resolves.toEqual({
      valid: true,
      clue: 'butterfly',
    })
  })
})

describe('secret-word variants', () => {
  it.each([
    ['pumpkins', 'pumpkin'],
    ['pumkin', 'pumpkin'],
    ['running', 'run'],
    ['baked', 'bake'],
  ])('recognizes %j as a variant of %j', (clue, secretWord) => {
    expect(isObviouslySameAsSecretWord(clue, secretWord)).toBe(true)
  })

  it('does not reject a related but distinct clue', () => {
    expect(isObviouslySameAsSecretWord('squash', 'pumpkin')).toBe(false)
  })

  it('rejects an abbreviation or shorthand the server classifier recognizes', async () => {
    const classify = vi.fn().mockResolvedValue({
      allowed: true,
      reason: 'single_word',
      tooCloseToSecret: true,
    })

    await expect(validateClueForSubmission('tv', 'television', classify)).resolves.toEqual({
      valid: false,
      reason: 'too-close-to-secret',
    })
    expect(classify).toHaveBeenCalledWith('tv', 'television')
  })
})
