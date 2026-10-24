import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'

// Load the real browser helper, including the server's shared normalizer.
const server = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true }, appType: 'custom' })
let buildClusters
try {
  ;({ buildClusters } = await server.ssrLoadModule('/src/games/flock-together/answerClusters.ts'))
} finally {
  await server.close()
}

test('the screenshot round displays the two McDonalds answers as one non-winning group', () => {
  const round = {
    playerAnswers: { chick1: 'Chick-fil-A', chick2: 'Chick-fil-A', bryce: 'McDonals', penny: "McDonald's" },
    results: { chick1: 'flock', chick2: 'flock', bryce: 'outlier', penny: 'outlier', absent: 'no-answer' },
    answerGroups: ['["chickfila"]', '["mcdonalds","mcdonals"]'], flockAnswer: ['Chick-fil-A'],
  }
  const { clusters, noAnswerIds } = buildClusters(round, 'bryce')
  assert.equal(clusters.length, 2)
  const mcdonalds = clusters.find(cluster => cluster.playerIds.includes('bryce'))
  assert.deepEqual(mcdonalds.playerIds, ['bryce', 'penny'])
  assert.deepEqual(mcdonalds.variations, ['McDonals', "McDonald's"])
  assert.equal(mcdonalds.answer, 'McDonals')
  assert.deepEqual(noAnswerIds, ['absent'])
})

test('does not merge different non-winning groups, including ties', () => {
  const { clusters } = buildClusters({
    playerAnswers: { a: 'McDonals', b: "McDonald's", c: 'Burger King', d: 'burger king' },
    results: { a: 'outlier', b: 'outlier', c: 'outlier', d: 'outlier' },
    answerGroups: ['["mcdonalds","mcdonals"]', '["burger king"]'], flockAnswer: [],
  }, null)
  assert.deepEqual(clusters.map(cluster => cluster.playerIds), [['a', 'b'], ['c', 'd']])
})

test('older or malformed group data still renders players without dropping answers', () => {
  const { clusters } = buildClusters({
    playerAnswers: { a: 'Pizza', b: 'pizza', c: 'Pasta' },
    results: { a: 'flock', b: 'flock', c: 'rotten' },
    answerGroups: ['invalid json', '[null]'], flockAnswer: ['Pizza'],
  }, 'b')
  assert.equal(clusters.length, 2)
  assert.equal(clusters[0].answer, 'pizza')
  assert.deepEqual(clusters[0].playerIds, ['a', 'b'])
  assert.equal(clusters[1].type, 'rotten')
})
