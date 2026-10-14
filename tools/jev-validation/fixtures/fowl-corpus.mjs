// Concept families stay entirely in one split. Labels come from documented
// game policy; provider predictions must never rewrite these expectations.
const families = [
  ['house','casa','home','roof','shelter','dwelling','brick','door','car'],
  ['dog','perro','bark','leash','puppy','kennel','canine','paw','cat'],
  ['cat','gato','meow','whisker','feline','kitten','purr','claw','dog'],
  ['book','libro','page','read','novel','library','paper','chapter','magazine'],
  ['table','mesa','furniture','wood','dining','flat','leg','surface','chair'],
  ['chair','silla','seat','sit','furniture','wood','backrest','cushion','table'],
  ['apple','manzana','fruit','orchard','red','crunch','cider','tree','pear'],
  ['bread','pan','bakery','loaf','flour','toast','yeast','crust','cake'],
  ['water','agua','liquid','drink','wet','river','clear','thirst','milk'],
  ['milk','leche','cow','dairy','white','calcium','carton','cream','water'],
  ['cheese','queso','dairy','wedge','mouse','melt','yellow','cracker','butter'],
  ['egg','huevo','shell','yolk','hen','breakfast','oval','omelet','chicken'],
  ['fish','pez','gill','swim','scale','ocean','fin','aquarium','shark'],
  ['bird','ave','feather','wing','nest','fly','beak','sky','bat'],
  ['horse','caballo','saddle','gallop','stable','mane','hoof','ride','donkey'],
  ['cow','vaca','milk','pasture','moo','udder','farm','cattle','bull'],
  ['pig','cerdo','oink','mud','snout','farm','pink','sty','boar'],
  ['rabbit','conejo','carrot','hop','burrow','ear','bunny','fur','hare'],
  ['turtle','tortuga','shell','slow','reptile','pond','crawl','green','lizard'],
  ['frog','rana','pond','croak','jump','tadpole','green','amphibian','toad'],
  ['bear','oso','forest','hibernate','fur','claw','honey','den','wolf'],
  ['wolf','lobo','howl','pack','forest','wild','canine','moon','fox'],
  ['lion','leon','mane','roar','pride','savanna','cat','king','tiger'],
  ['tiger','tigre','stripe','jungle','cat','orange','predator','roar','lion'],
  ['elephant','elefante','trunk','tusk','large','gray','safari','herd','hippo'],
  ['giraffe','jirafa','neck','tall','spot','savanna','leaf','safari','zebra'],
  ['zebra','cebra','stripe','hoof','savanna','herd','safari','black','horse'],
  ['monkey','mono','banana','primate','climb','tree','tail','jungle','ape'],
  ['snake','serpiente','slither','scale','reptile','venom','coil','hiss','worm'],
  ['spider','arana','web','arachnid','leg','silk','crawl','eight','insect'],
  ['bee','abeja','honey','buzz','hive','sting','pollen','insect','wasp'],
  ['butterfly','mariposa','wing','caterpillar','cocoon','color','flutter','insect','moth'],
  ['tree','arbol','leaf','branch','trunk','root','forest','wood','bush'],
  ['flower','flor','petal','bloom','garden','stem','bouquet','pollen','leaf'],
  ['moon','luna','night','orbit','crater','lunar','crescent','sky','sun'],
  ['sun','sol','day','warm','star','solar','bright','sky','moon'],
  ['star','estrella','twinkle','sky','night','space','bright','constellation','planet'],
  ['mountain','montana','peak','climb','summit','ridge','tall','rock','hill'],
  ['river','rio','flow','water','bank','stream','current','bridge','lake'],
  ['ocean','oceano','wave','salt','deep','blue','tide','water','beach'],
]

export function fowlCorpus() {
  const clues = [], guesses = []
  families.forEach(([secret, translation, ...related], familyIndex) => {
    const split = familyIndex < 10 ? 'development' : 'held-out'
    const common = { family: secret, secret, split, critical: true, ambiguous: false }
    related.slice(0, 5).forEach((clue, i) => clues.push({ ...common, id: `clue-${secret}-valid-${i}`, clue, expected: true, category: 'related-distinct', rationale: 'A standalone word related to the answer is allowed; only disguised forms of the secret are forbidden.' }))
    ;[secret, secret.toUpperCase(), `${secret}s`, ` ${secret} `, `${secret}-word`].forEach((clue, i) => clues.push({ ...common, id: `clue-${secret}-invalid-${i}`, clue, expected: false, category: i === 4 ? 'invalid-shape' : 'secret-variant', rationale: 'The secret itself, simple plural, or a clue containing punctuation is forbidden.' }))
    ;[secret, secret.toUpperCase(), `${secret}s`, ` ${secret} `, translation].forEach((guess, i) => guesses.push({ ...common, id: `guess-${secret}-correct-${i}`, guess, expected: true, category: i === 4 ? 'translation' : 'local-equivalence', rationale: 'Exact, normalized, plural, and equivalent translations are accepted.' }))
    related.slice(0, 4).concat(related[6]).forEach((guess, i) => guesses.push({ ...common, id: `guess-${secret}-incorrect-${i}`, guess, expected: false, category: 'related-distinct', rationale: 'Associations and category neighbors identify different things and must not win.' }))
  })
  const challengeClues = [
    ['television','tv',false,'abbreviation'], ['refrigerator','fridge',false,'shorthand'],
    ['bicycle','bike',false,'shorthand'], ['photograph','photo',false,'shorthand'],
    ['telephone','fone',false,'phonetic-disguise'], ['night','nite',false,'phonetic-disguise'],
    ['light','lite',false,'phonetic-disguise'], ['you','u',false,'phonetic-disguise'],
    ['dessert','strawberryshortcake',false,'joined-phrase'], ['meal','macandcheese',false,'joined-phrase'],
    ['holiday','newyearseve',false,'joined-phrase'], ['animal','polarbear',false,'joined-phrase'],
    ['office','postoffice',false,'joined-phrase'], ['sport','tabletennis',false,'joined-phrase'],
    ['soup','backpack',true,'closed-compound'], ['music','toothbrush',true,'closed-compound'],
    ['winter','blueberry',true,'closed-compound'], ['summer','cheeseburger',true,'closed-compound'],
    ['car','automobile',true,'synonym-allowed-clue'], ['couch','sofa',true,'synonym-allowed-clue'],
    ['smart','intelligent',true,'synonym-allowed-clue'], ['fast','quick',true,'synonym-allowed-clue'],
    ['doctor','nurse',true,'related-distinct'], ['ocean','beach',true,'related-distinct'],
  ]
  const challengeGuesses = [
    ['car','automobile',true,'close-synonym'], ['couch','sofa',true,'close-synonym'],
    ['bicycle','bike',true,'shorthand'], ['refrigerator','fridge',true,'shorthand'],
    ['television','tv',true,'abbreviation'], ['photograph','photo',true,'shorthand'],
    ['airplane','aeroplane',true,'spelling-variant'], ['color','colour',true,'spelling-variant'],
    ['center','centre',true,'spelling-variant'], ['theater','theatre',true,'spelling-variant'],
    ['pumpkin','pumkin',true,'misspelling'], ['elephant','elefant',true,'misspelling'],
    ['firetruck','fire truck',true,'spacing'], ['snowboard','snowboarding',true,'inflection'],
    ['firefighter','police officer',false,'documented-distinct'], ['happy','joy',false,'documented-distinct'],
    ['doctor','nurse',false,'category-neighbor'], ['knife','fork',false,'category-neighbor'],
    ['coffee','tea',false,'category-neighbor'], ['salt','sugar',false,'category-neighbor'],
    ['shoe','sock',false,'association'], ['rain','umbrella',false,'association'],
    ['computer','keyboard',false,'part-whole'], ['wheel','car',false,'part-whole'],
  ]
  challengeClues.forEach(([secret, clue, expected, category], i) => clues.push({ id: `challenge-clue-${i}`, secret, clue, expected, category, family: `challenge-clue-${secret}`, split: 'challenge', critical: true, ambiguous: false, rationale: 'Documented clue policy: reject joined phrases and disguised secret forms; allow standalone synonyms and related concepts.' }))
  challengeGuesses.forEach(([secret, guess, expected, category], i) => guesses.push({ id: `challenge-guess-${i}`, secret, guess, expected, category, family: `challenge-guess-${secret}`, split: 'challenge', critical: true, ambiguous: false, rationale: 'Documented guess policy: accept spelling/inflection variants and close equivalents; reject related but different things.' }))
  return { version: 1, clues, guesses }
}

export function validateFowlCorpus(corpus) {
  for (const operation of ['clues', 'guesses']) {
    const rows = corpus[operation]
    if (rows.length < 400 || new Set(rows.map(r => r.id)).size !== rows.length) throw new Error(`${operation}: insufficient or duplicate fixtures`)
    const signatures = new Set(rows.map(r => JSON.stringify([r.secret, r.clue ?? r.guess])))
    if (signatures.size !== rows.length) throw new Error(`${operation}: duplicate inputs`)
    const dev = rows.filter(r => r.split === 'development'), held = rows.filter(r => r.split === 'held-out')
    if (dev.length < 100 || held.length < 300 || held.filter(r => r.expected).length < 150 || held.filter(r => !r.expected).length < 150) throw new Error(`${operation}: insufficient split/class coverage`)
    const devFamilies = new Set(dev.map(r => r.family))
    if (held.some(r => devFamilies.has(r.family))) throw new Error(`${operation}: family leakage`)
    if (new Set(rows.map(r => r.family)).size < 30 || rows.some(r => !r.rationale)) throw new Error(`${operation}: insufficient family/policy coverage`)
  }
  return { clues: corpus.clues.length, guesses: corpus.guesses.length, families: families.length, limitation: 'Initial corpus emphasizes local forms, translations, and related concepts; add joined phrases, abbreviations, phonetic disguises, and adversarial cases before promotion.' }
}
