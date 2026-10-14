// Reviewed against game policy before candidate inference. These are direct
// meanings, not provider-derived labels. No transitive synonym closure is used.
import playableWords from '../../../functions/src/games/fowl-words/data/words.json' with { type: 'json' }
// secret | intended meaning | two accepted forms | two distinct near misses
const development = `
bicycle|a pedal-powered two-wheeled vehicle|bike|pedal bicycle|motorcycle|scooter
television|a device for viewing broadcast programs|TV|television set|radio|computer
telephone|a device for making voice calls|phone|telephone set|microphone|camera
doctor|a medical practitioner|physician|medical doctor|nurse|dentist
veterinarian|a medical practitioner treating animals|vet|animal doctor|zookeeper|farmer
firefighter|a person whose job is extinguishing fires|fireman|fire fighter|police officer|lifeguard
chef|a professional cook|professional cook|head cook|waiter|butler
thief|a person who steals|person who steals|stealer|detective|sheriff
detective|a person who investigates crimes|crime investigator|private investigator|thief|lawyer
magician|a performer of magic tricks|illusionist|conjurer|clown|juggler
cemetery|a place for burying the dead|graveyard|burial ground|church|hospital
laboratory|a room equipped for scientific experiments|lab|science laboratory|library|museum
labyrinth|a complicated network of winding passages|maze|winding maze|tunnel|bridge
limousine|a large luxurious passenger car|limo|luxury limousine|taxi|bus
motorcycle|a motor-powered two-wheeled vehicle|motorbike|motor cycle|bicycle|scooter
subway|an underground urban railway|underground railway|metro|bus|streetcar
sneakers|casual rubber-soled sports shoes|trainers|athletic shoes|boots|sandals
soccer|the sport played by kicking a ball into goals|association football|soccer football|rugby|basketball
soda|a sweet carbonated drink|soft drink|soda pop|juice|lemonade
donut|a small ring-shaped fried sweet cake|doughnut|dough nut|bagel|muffin
omelet|beaten eggs cooked folded in a pan|omelette|egg omelet|pancake|waffle
burger|a ground-meat patty served in a bun|hamburger|beef burger|hotdog|taco
chips|thin crisp slices of potato in American English|potato chips|crisps|fries|crackers
candy|sweet confectionery|sweets|confectionery|fruit|bread
axE|a tool with a blade for chopping wood|ax|wood axe|saw|hammer
flashlight|a portable battery-powered electric light|electric torch|battery torch|candle|lantern
airplane|a powered fixed-wing aircraft|aeroplane|powered fixed-wing aircraft|helicopter|blimp
hippo|a large semiaquatic African mammal|hippopotamus|hippopotami|rhino|elephant
rhino|a large mammal with a horn on its nose|rhinoceros|rhinoceroses|hippo|buffalo
alligator|a broad-snouted crocodilian reptile|gator|alligators|crocodile|lizard
car|an automobile for carrying passengers|automobile|motorcar|truck|bus
refrigerator|an appliance that keeps food cold|fridge|refrigerating appliance|freezer|oven
sofa|a long upholstered seat for several people|couch|settee|armchair|bed
house|a building used as a dwelling|dwelling house|residential house|garage|hotel
book|a bound collection of written or printed pages|printed book|bound book|magazine|newspaper
table|a raised flat surface supported by legs|furniture table|dining table|chair|shelf
chair|a seat for one person with a back|single-person chair|chairs|table|bench
photograph|an image captured by a camera|photo|photographic image|painting|drawing
color|a visual property such as red or blue|colour|coloration|sound|shape
theater|a building where plays are performed|theatre|playhouse|museum|library
center|the middle point of something|centre|midpoint|edge|corner
pumpkin|a large round orange squash|pumpkins|pumkin|carrot|apple
elephant|a large mammal with a trunk|elephants|elefant|rhino|giraffe
snowboard|a board used to slide on snow|snow board|snowboards|skateboard|surfboard
firetruck|a vehicle equipped for firefighting|fire truck|fire engine|ambulance|police car
umbrella|a folding canopy held to protect against rain|brolly|rain umbrella|raincoat|parasol
scissors|a cutting tool with two pivoted blades|pair of scissors|shears|knife|saw
suitcase|a case for carrying clothes while traveling|travel case|suit case|backpack|briefcase
notebook|a book of blank pages for notes|note book|writing notebook|textbook|diary
clock|an instrument that shows the time|timepiece|wall clock|calendar|compass
bucket|an open container with a handle|pail|water bucket|basket|bottle
harbor|a sheltered place where ships can anchor|harbour|sheltered harbor|ocean|dock
forest|a large area covered with trees|woodland|woods|meadow|desert
mountain|a very high natural elevation of land|mountains|mountain peak|valley|canyon
river|a natural flowing watercourse|rivers|natural watercourse|lake|ocean
ocean|a vast body of salt water|oceans|ocean waters|beach|river
star|a luminous celestial body producing its own light|stars|stellar body|planet|asteroid
moon|a natural satellite orbiting a planet|natural satellite|moons|planet|sun
galaxy|a large gravitationally bound system of stars|galaxies|stellar galaxy|planet|nebula
ufo|an unidentified flying object|unidentified flying object|U.F.O.|airplane|satellite
`

// Sealed evaluation families. The runner must not import these until a
// selection artifact pins the development choice, rubric, aliases, and hashes.
const heldOut = `
accordion|a bellows-driven keyboard wind instrument|squeezebox|keyboard accordion|harmonica|banjo
binoculars|a paired optical instrument for viewing distant objects|field glasses|pair of binoculars|microscope|periscope
anchor|a heavy device holding a ship in place|ship anchor|mooring anchor|sail|oar
armor|protective covering worn in combat|armour|body armor|sword|helmet
broom|a long-handled sweeping brush|sweeping brush|floor broom|mop|rake
apricot|a small orange stone fruit|apricots|apricot fruit|peach|plum
cabIN|a small simple dwelling|small cabin|wooden cabin|mansion|castle
canoe|a narrow boat propelled with a single-bladed paddle|paddle canoe|canoes|kayak|sailboat
cape|a sleeveless garment hanging from the shoulders|shoulder cape|sleeveless cloak|jacket|scarf
chariot|an ancient two-wheeled horse-drawn vehicle|horse-drawn chariot|war chariot|sleigh|tractor
avalanche|a sudden mass of snow sliding downhill|snowslide|snow avalanche|snowstorm|earthquake
clarinet|a single-reed woodwind instrument|clarinets|single-reed clarinet|flute|trumpet
cobweb|a web spun by a spider|spiderweb|spider web|nest|cocoon
cookie|a small sweet baked biscuit|sweet biscuit|baked cookie|cracker|cake
cottage|a small house typically in the countryside|country cottage|rural cottage|palace|barn
crayon|a stick of colored wax used for drawing|wax crayon|coloring crayon|pencil|paintbrush
cyclone|a large rotating storm system|cyclonic storm|cyclones|drought|earthquake
badminton|a racket sport using a shuttlecock|shuttlecock sport|badminton game|tennis|volleyball
diner|a small informal restaurant|diner restaurant|roadside diner|bakery|hotel
donkey|a domesticated long-eared equine|domestic ass|donkeys|horse|mule
drought|a prolonged shortage of rain|prolonged dry spell|rainfall drought|flood|blizzard
dungeon|a dark underground prison cell|underground prison|prison dungeon|attic|tower
emperor|a sovereign ruler of an empire|imperial ruler|emperor ruler|prince|duke
eraser|a tool for removing pencil marks|pencil rubber|pencil eraser|crayon|sharpener
eyeball|the rounded organ of sight|eye globe|ocular globe|eyelid|eyebrow
fairy|a small magical supernatural being|faerie|fairies|giant|troll
ferret|a domesticated slender mustelid|domestic ferret|ferrets|weasel|otter
fortress|a heavily fortified defensive stronghold|fortified stronghold|military fortress|cottage|museum
frisbee|a flying disc used for throwing games|flying disc|throwing disc|boomerang|ball
banjo|a stringed instrument with a round membrane-covered body|stringed banjo|banjo instrument|guitar|cello
gelato|Italian-style ice cream|Italian ice cream|gelati|sorbet|pudding
ghost|the apparition of a dead person|specter|spectre|zombie|vampire
gloves|hand coverings with separate fingers|hand gloves|fingered hand coverings|mittens|socks
goggles|protective eyewear held close to the face|protective goggles|safety goggles|helmet|earmuffs
grizzly|a grizzly bear|grizzly bear|grizzlies|polar bear|panda
hamlet|a very small settlement|tiny village|small hamlet|city|farm
hammock|a suspended fabric or net bed|hanging bed|suspended bed|tent|swing
helmet|protective headgear|protective helmet|safety helmet|hat|mask
barometer|an instrument measuring atmospheric pressure|air-pressure meter|atmospheric pressure gauge|thermometer|speedometer
hourglass|a time-measuring device using falling sand|sandglass|sand timer|stopwatch|sundial
hummingbird|a tiny bird able to hover while feeding|humming bird|hummingbirds|woodpecker|sparrow
hurricane|a severe tropical cyclone over the Atlantic or northeastern Pacific|severe Atlantic tropical cyclone|hurricanes|blizzard|tornado
igloo|a domed shelter built from snow blocks|snow house|snow-block shelter|tent|cave
inventor|a person who creates a new device or process|device inventor|person who invents|explorer|historian
island|land surrounded by water|isle|islands|peninsula|continent
jester|a court entertainer or fool|court fool|court jester|king|butler
kiwi|the oval fuzzy-skinned edible fruit|kiwifruit|kiwi fruit|mango|peach
knight|an armored medieval mounted warrior|armored knight|mediaeval knight|archer|peasant
knitting|making fabric by interlocking loops of yarn|hand knitting|yarn knitting|weaving|sewing
ladder|a portable climbing frame with rungs|rung ladder|climbing ladder|staircase|scaffold
ladybug|a small spotted beetle|ladybird|lady beetle|butterfly|firefly
telescope|an optical instrument for viewing distant objects|astronomical telescope|optical telescope|microscope|periscope
lighthouse|a tower emitting light to guide ships|light house|navigation lighthouse|windmill|observatory
lightning|a visible electrical discharge during a storm|lightning bolt|electrical lightning|thunder|rain
lollipop|hard candy mounted on a stick|lollypop|candy on a stick|toffee|chocolate
mallet|a hammer with a large wooden or rubber head|wooden mallet|rubber mallet|wrench|chisel
manatee|a large aquatic herbivorous mammal|sea cow|manatees|walrus|dolphin
thermometer|an instrument measuring temperature|temperature gauge|temperature meter|barometer|speedometer
megaphone|a cone-shaped device amplifying speech|speaking trumpet|voice megaphone|microphone|radio
merchant|a person trading goods|trader|goods merchant|farmer|soldier
harmonica|a small free-reed mouth instrument|mouth organ|harp harmonica|accordion|flute
mirror|a reflective surface used to see an image|looking glass|reflecting mirror|window|painting
mitten|a hand covering with one compartment for the fingers|mitt|finger-compartment mitten|fingered glove|sock
monsoon|a seasonal wind system associated with heavy rain|seasonal monsoon wind|monsoonal wind|drought|blizzard
yoyo|a toy consisting of a spool on a string|yo-yo|string yoyo|spinning top|kite
mummy|a preserved dead body wrapped for burial|mummified body|wrapped mummy|skeleton|zombie
violin|a four-stringed bowed musical instrument|fiddle|bowed violin|viola|cello
oasis|a fertile watered place in a desert|desert oasis|watered desert refuge|mirage|sand dune
observatory|a facility equipped to observe celestial objects|astronomical observatory|stargazing observatory|planetarium|museum
parachute|a canopy slowing descent through air|descent parachute|parachutes|umbrella|glider
parrot|a hooked-beaked often colorful bird|parrots|parrot bird|toucan|eagle
pelican|a large waterbird with a bill pouch|pouched-bill pelican|pelicans|flamingo|swan
pencil|a writing instrument with a graphite core|graphite pencil|lead pencil|pen|crayon
pharaoh|a ruler of ancient Egypt|Egyptian pharaoh|ancient Egyptian ruler|Roman emperor|samurai
pilot|a person who flies an aircraft|aircraft pilot|aviator|sailor|astronaut
plumber|a tradesperson installing and repairing pipes|pipe plumber|plumbing tradesperson|electrician|carpenter
pond|a small body of standing water|small pond|small standing-water pond|river|ocean
popsicle|a frozen flavored ice treat on a stick|ice pop|ice lolly|ice cream cone|lollipop
potato|an edible starchy tuber|spud|potatoes|turnip|carrot
prince|a male member of a royal family|royal prince|princes|duke|king
princess|a female member of a royal family|royal princess|princesses|queen|duchess
puzzle|a problem or game requiring a solution|brain teaser|puzzler|answer|instruction
racetrack|a track used for races|race track|racing track|stadium|playground
restaurant|an establishment serving purchased meals|dining establishment|eatery|hotel|grocery store
rooster|an adult male chicken|cockerel|male chicken|hen|turkey
scarf|a strip of cloth worn around the neck|neck scarf|scarves|necktie|cape
scepter|a ceremonial staff symbolizing sovereignty|sceptre|royal staff|sword|crown
scientist|a person conducting scientific research|scientific researcher|research scientist|historian|merchant
sled|a vehicle sliding on runners over snow|sledge|snow sled|wagon|skateboard
slingshot|a forked device launching projectiles with elastic|catapult slingshot|elastic slingshot|crossbow|boomerang
soldier|a member of an army|army soldier|army servicemember|sailor|police officer
spaceship|a vehicle designed to travel in space|spacecraft|space ship|airplane|submarine
stapler|a device fastening papers with staples|paper stapler|stapling device|hole punch|paperclip
submarine|a vessel capable of underwater operation|submersible naval vessel|underwater submarine|sailboat|canoe
surgeon|a doctor performing surgical operations|surgical doctor|operating surgeon|dentist|nurse
teacher|a person whose job is teaching|educator|schoolteacher|student|principal
trampoline|a taut elastic surface used for bouncing|bouncing trampoline|trampolines|diving board|hammock
typewriter|a machine printing typed characters onto paper|typing machine|manual typewriter|computer|printer
vampire|a mythical undead blood-drinking being|blood-drinking undead|vampires|werewolf|zombie
waterfall|water falling over a steep drop in a river|cascade|water fall|rapids|whirlpool
`

function parse(text, split) {
  return text.trim().split('\n').map((line, index) => {
    const [secret, definition, yes1, yes2, no1, no2] = line.trim().split('|')
    if (!no2) throw new Error('Malformed English family')
    return { id: `${split}-${index}`, secret: secret.toLowerCase(), definition, accepted: [yes1, yes2], rejected: [no1, no2] }
  })
}
export const developmentCards = parse(development, 'development')
const disputedPairs = new Set(['color/coloration','mountain/mountain peak','ocean/ocean waters','star/stellar body'])
export function diagnosticCases(cards = developmentCards, split = 'development') {
  return cards.flatMap(card => [...card.accepted.map(guess => ({ guess, expected: true })), ...card.rejected.map(guess => ({ guess, expected: false }))].map((row, index) => ({ ...row, id: `${card.id}-${index}`, secret: card.secret, definition: card.definition, family: card.secret, split, critical: !row.expected, ambiguous: disputedPairs.has(`${card.secret}/${row.guess}`), category: row.expected ? 'equivalent-english' : 'related-distinct', rationale: row.expected ? 'Direct name, ordinary shorthand, spelling/inflection variant, or close description of the intended meaning.' : 'Identifies a different thing under the supplied meaning; an association or neighboring category does not win.' })))
}
export function openHoldout() { return diagnosticCases(parse(heldOut, 'held-out'), 'held-out') }
const playable = new Set(playableWords.map(word => word.toLowerCase()))
const lexicalAliases = [
  ['accordion','squeezebox'], ['anchor','ship anchor'], ['armor','armour'],
  ['asteroid','minor planet'], ['avalanche','snowslide'], ['badminton','shuttlecock sport'],
  ['banjo','banjo instrument'], ['telescope','astronomical telescope'], ['harmonica','mouth organ'],
  ['violin','fiddle'], ['island','isle'], ['ladybug','ladybird'],
  ['donkey','domestic ass'], ['potato','spud'], ['rooster','cockerel'],
].map(([secret,form])=>({secret,forms:[form]}))
export const aliasCards = [...developmentCards.filter(card => playable.has(card.secret)).slice(0, 15).map(card => ({ secret: card.secret, forms: card.accepted })), ...lexicalAliases].map(card => ({...card,provenance:'Curated direct English forms frozen before model execution, including lexical-resource entries outside development families; no provider-derived entries.',kind:'guess-equivalent'}))
export const labelHistory = [
  { id: 'development-36-1', previousInput: 'chair seat', previous: true, reviewed: false, replacement: 'chairs', reason: 'A seat names a part of a chair. Preserve this negative in the supplemental policy audit; use an uncontested inflection for the balanced core. First draft run is not authoritative evidence.' },
  { ids: ['color/coloration','mountain/mountain peak','ocean/ocean waters','star/stellar body'], previous: 'unambiguous acceptance', reviewed: 'ambiguous', reason: 'Property/process, part/whole, and broad meaning distinctions conflict with strict equivalence; retain and report separately pending explicit policy review.' },
  { ids: ['hurricane/Atlantic tropical cyclone','monsoon/monsoonal rains','pond/pond water'], previous: true, reviewed: 'draft wording corrected before held-out inference', reason: 'A weaker storm, associated rain, and water as a substance do not identify the defined target. Sealed inputs now express the intended meaning precisely.' },
  { id: 'guess-house-incorrect-0', previous: false, reviewed: 'ambiguous', reason: 'Home can refer to a dwelling or an abstract place of belonging; exclude from unambiguous error denominators until sense is specified.' },
  { id: 'guess-dog-incorrect-2', previous: false, reviewed: 'ambiguous', reason: 'Puppy is narrower than dog; fixture needs explicit broader/narrower policy rationale and must not be presented as an easy category neighbor.' },
  { id: 'challenge-guess-0', previousAttribution: 'Jev rejection', reviewedAttribution: 'local-length-filter', reason: 'The car/automobile result has no provider response; direct routing confirms local rejection.' },
]
export const disputedLocalRules = [
  { secret: 'sun', clue: 'sundae', issue: 'Substring is not necessarily a disguised form of the secret.' },
  { secret: 'bee', clue: 'beef', issue: 'Accidental shared letters versus word derivation.' },
  { secret: 'axe', clue: 'taxes', issue: 'Substring and inflection collision; preserve gameplay pending policy review.' },
]
