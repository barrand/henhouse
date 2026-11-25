import { describe, expect, it } from 'vitest'
import { recommendedRules } from '../../games/fowl-words/rules'
import type { ScoringState } from '../../games/fowl-words/scoringProtocol'
import { flockDisplay, legacyFowlDisplay, versionedFowlDisplay } from '../sharedViewProjection'

const legacyRound = {
  secretWord: 'campfire',
  wordOptions: ['campfire', 'lantern', 'dinner'],
  wordVotes: { alice: 0 },
  cluesByPlayer: { alice: 'embers', bob: 'smoke' },
  clueGroups: [
    { clueTexts: ['embers'], playerIds: ['alice'], isDuplicate: false },
    { clueTexts: ['smoke'], playerIds: ['bob'], isDuplicate: false },
  ],
  visibleGroupIndexes: [0],
  cluePeerLoveVotes: { voter: { '0': true } },
  cluePeerBooVotes: { anotherVoter: 0 },
  guesserMostHelpfulVote: 0,
  guesserBooVote: 0,
  eligiblePlayerCount: 3,
}

function versionedRound(phase: ScoringState['phase']): ScoringState {
  return {
    version: 1, roundNum: 1, rules: recommendedRules('best-clues-first'),
    eligible: ['guesser', 'alice', 'bob'], guesser: 'guesser',
    phase, startedAt: 1, deadline: 10_000, selectionOpensAt: 2,
    wordOptions: ['campfire'], wordVotes: { alice: 0 }, secretWord: 'campfire',
    clues: [{ id: 'a', text: 'embers', author: 'alice', at: 3 }, { id: 'b', text: 'smoke', author: 'bob', at: 4 }],
    rankingVotes: { bob: ['a'] }, love: {}, boo: {}, helpful: 'shown',
    groups: [
      { id: 'shown', texts: ['embers'], authorIds: ['alice'], duplicate: false },
      { id: 'hidden', texts: ['smoke'], authorIds: ['bob'], duplicate: false },
    ],
    queue: ['shown', 'hidden'], schedule: [1, 2], attempt: 1, maxAttempts: 2,
    shown: ['shown'], newlyShown: ['shown'], history: [], scores: { alice: 10 },
    playerScores: { alice: 2 }, breakdown: {}, correct: true, finishedAt: 8_000,
  }
}

describe('Shared View round projections', () => {
  it('exposes only progress before legacy clues unlock and only visible anonymous clues during guessing', () => {
    const writing = legacyFowlDisplay({ ...legacyRound, status: 'clue-submission' })
    expect(writing).toMatchObject({ submitted: 2, givers: 2, clues: [], word: '' })
    const guessing = legacyFowlDisplay({ ...legacyRound, status: 'guess' })
    expect(guessing.clues).toEqual([{
      id: '0', text: 'embers', authors: [], shown: true, newlyShown: false,
      duplicate: false, loves: 1, boos: 1, helpful: false,
    }])
    expect(JSON.stringify(guessing)).not.toMatch(/campfire|smoke|alice|anotherVoter|wordOptions/i)
  })

  it('adds names, unshown clues, and the guesser’s awards after legacy scoring', () => {
    const result = legacyFowlDisplay({ ...legacyRound, status: 'scored', isCorrect: true, revealAt: 123 })
    expect(result).toMatchObject({ word: 'campfire', correct: true, revealAt: 123 })
    expect(result.clues).toMatchObject([
      { authors: ['alice'], boos: 2, loves: 1, helpful: true },
      { authors: ['bob'], shown: false },
    ])
  })

  it('withholds Best Clues First backing counts until the named debrief', () => {
    const guessing = versionedFowlDisplay(versionedRound('guess'))
    expect(guessing.clues).toMatchObject([{ text: 'embers', authors: [], loves: 0, helpful: false }])
    expect(guessing.word).toBe('')
    const result = versionedFowlDisplay(versionedRound('scored'))
    expect(result).toMatchObject({ word: 'campfire', revealAt: 9100, before: { alice: 2 }, points: { alice: 10 } })
    expect(result.clues).toMatchObject([
      { authors: ['alice'], loves: 1, helpful: true },
      { authors: ['bob'], shown: false },
    ])
  })

  it('withholds Flock answer text until scored and keeps grouping and totals server-authored', () => {
    const data = {
      question: 'Snack?', questionInstance: 'replacement', status: 'answering', deadline: 30_000,
      playerAnswers: { a: 'Chips', b: 'Chip', c: 'Jerky' },
      answerGroups: ['["chip","chips"]', '["jerky"]'], flockAnswer: ['Chips'],
      results: { a: 'flock', b: 'flock', c: 'rotten', d: 'no-answer' },
      pointsThisRound: { a: 1, b: 1, c: -1, d: 0 },
      scoresBefore: { a: 1, b: 3, c: 2, d: 0 }, scoresAfter: { a: 2, b: 4, c: 1, d: 0 },
    }
    expect(flockDisplay(data)).toMatchObject({ instance: 'replacement', groups: [], points: {}, after: {} })
    const result = flockDisplay({ ...data, status: 'scored', revealAt: 30_100 })
    expect(result.groups).toMatchObject([
      { id: 'flock:group:0', answer: 'Chips', playerIds: ['a', 'b'] },
      { id: 'rotten:group:1', answer: 'Jerky', playerIds: ['c'] },
    ])
    expect(result).toMatchObject({ missing: ['d'], revealAt: 30_100, before: data.scoresBefore, after: data.scoresAfter })
  })
})
