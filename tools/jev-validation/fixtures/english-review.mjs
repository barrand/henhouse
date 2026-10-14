import { diagnosticCases, developmentCards } from './english-experiment.mjs'

// Representativeness is a reviewer judgment, not observed player frequency.
// It never changes expected/ambiguous, aliases, thresholds, or release gates.
export const reviewVersion = 'english-representativeness-v1'
const descriptions = new Set([
  'pedal bicycle', 'medical doctor', 'animal doctor', 'professional cook', 'head cook',
  'person who steals', 'stealer', 'crime investigator', 'science laboratory',
  'winding maze', 'luxury limousine', 'soccer football', 'egg omelet', 'wood axe',
  'battery torch', 'powered fixed-wing aircraft', 'refrigerating appliance',
  'dwelling house', 'residential house', 'printed book', 'bound book', 'furniture table',
  'single-person chair', 'photographic image', 'rain umbrella', 'travel case',
  'writing notebook', 'water bucket', 'sheltered harbor', 'natural watercourse',
  'stellar galaxy',
])
const specialistNames = new Set(['association football', 'confectionery', 'natural satellite'])
const spellingForms = new Set([
  'fire fighter', 'motor cycle', 'doughnut', 'dough nut', 'omelette', 'ax', 'aeroplane',
  'hippopotami', 'rhinoceroses', 'alligators', 'chairs', 'colour', 'theatre', 'centre',
  'pumpkins', 'pumkin', 'elephants', 'elefant', 'snow board', 'snowboards', 'fire truck',
  'suit case', 'note book', 'harbour', 'mountains', 'rivers', 'oceans', 'stars', 'moons',
  'galaxies', 'U.F.O.',
])

export function reviewCase(row) {
  const bucket = row.ambiguous ? 'policy-disputed'
    : descriptions.has(row.guess) ? 'descriptive-phrase'
      : specialistNames.has(row.guess) ? 'specialist-name'
        : spellingForms.has(row.guess) ? 'spelling-or-inflection' : 'ordinary-language'
  return {
    id: row.id, secret: row.secret, guess: row.guess, expected: row.expected,
    ambiguous: row.ambiguous, bucket,
    rationale: {
      'policy-disputed': 'Existing meaning dispute retained; no new exclusion.',
      'descriptive-phrase': 'Describes or qualifies the target rather than using its usual short name; still retains its original correctness label.',
      'specialist-name': 'Legitimate technical or formal name; not presumed incorrect or impossible in play.',
      'spelling-or-inflection': 'Orthographic or grammatical variation; report local routing separately.',
      'ordinary-language': 'Plausible everyday name or competing answer; frequency has not been measured.',
    }[bucket],
  }
}
export const developmentReview = diagnosticCases().map(reviewCase)

// Additional development probes, not replacement labels or held-out evidence.
// Expected labels are fixed before inference; all remain unmeasured until a
// separately budgeted live run. Reverse pairs stay within development.
const probes = [
  ['television', 'telly', true, 'Everyday British shorthand.'],
  ['television', 'monitor', false, 'A display alone is not a television.'],
  ['telephone', 'fone', true, 'Recognizable phonetic spelling.'],
  ['telephone', 'walkie-talkie', false, 'Different communication device.'],
  ['refrigerator', 'refridgerator', true, 'Common recognizable misspelling.'],
  ['refrigerator', 'freezer', false, 'Freezes rather than refrigerates food.'],
  ['fridge', 'refrigerator', true, 'Reverse of the agreed guess equivalence; clue policy is separate.'],
  ['fridge', 'oven', false, 'Different kitchen appliance.'],
  ['candy', 'sweeties', true, 'Everyday informal name for candy.'],
  ['candy', 'dessert', false, 'Broader course/category, not the same answer.'],
  ['sweets', 'candy', true, 'Reverse everyday regional synonym in the confectionery sense.'],
  ['sweets', 'sugar', false, 'Ingredient rather than the confectionery itself.'],
  ['sofa', 'chesterfield', true, 'Regional name for a sofa in the furniture sense.'],
  ['sofa', 'loveseat', false, 'Specific smaller subtype; broad/narrow acceptance needs policy review.'],
  ['couch', 'sofa', true, 'Reverse direct synonym in the furniture sense.'],
  ['couch', 'mattress', false, 'Different furnishing.'],
  ['bicycle', 'bicyle', true, 'Recognizable missing-letter typo.'],
  ['bicycle', 'tricycle', false, 'Different three-wheeled vehicle.'],
  ['automobile', 'car', true, 'Reverse direct synonym, including the length-routing regression.'],
  ['automobile', 'van', false, 'Vehicle subtype; broad/narrow acceptance needs policy review.'],
  ['flashlight', 'torch', true, 'Everyday British name in the electric-light sense.'],
  ['flashlight', 'lightbulb', false, 'Component rather than the portable device.'],
  ['veterinarian', 'vetrinarian', true, 'Recognizable misspelling.'],
  ['veterinarian', 'animal trainer', false, 'Different occupation.'],
]
const disputedProbes = new Set(['sofa/loveseat', 'automobile/van'])
const supplementalMeanings = new Map([
  ...developmentCards.map(card => [card.secret, card.definition]),
  ['fridge', 'an appliance that keeps food cold'],
  ['sweets', 'sweet confectionery, also called candy'],
  ['couch', 'a long upholstered seat for several people'],
  ['automobile', 'a car for carrying passengers'],
])
export const supplementalCases = probes.map(([secret, guess, expected, rationale], i) => ({
  id: `supplemental-v1-${i}`, secret, guess, expected, rationale, definition: supplementalMeanings.get(secret),
  split: 'development-supplemental', family: secret,
  ambiguous: disputedProbes.has(`${secret}/${guess}`), status: 'not-measured', critical: !expected,
  category: expected ? 'everyday-equivalent' : 'related-distinct',
}))
