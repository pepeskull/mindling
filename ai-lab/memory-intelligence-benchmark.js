import { ACCEPTANCE_THRESHOLDS } from './memory-intelligence-config.js';
import { INFORMATION_TYPES } from './evaluation.js';
import { MEMORY_ACTIONS } from './memory-intelligence-schema.js';

const topicDefinitions = [
  ['Environmental Science', 'Wetland restoration', 'våtmarksrestaurering', 'Replanting reeds can help a drained marsh recover.', 'Att återställa vattennivån hjälper en utdikad våtmark.'],
  ['Crafts', 'Ceramic glazing', 'keramisk glasering', 'The firing temperature changes how a ceramic glaze looks.', 'Bränntemperaturen påverkar hur glasyren ser ut.'],
  ['Agriculture', 'Beekeeping', 'biodling', 'A beekeeper checks whether the hive has enough winter food.', 'Biodlaren kontrollerar om kupan har tillräckligt med vinterfoder.'],
  ['Marine Science', 'Coral reef ecology', 'korallrevens ekologi', 'Parrotfish grazing can influence coral reef recovery.', 'Papegojfiskarnas bete kan påverka korallrevens återhämtning.'],
  ['Computer Security', 'Phishing prevention', 'skydd mot nätfiske', 'Passkeys can reduce the damage caused by stolen passwords.', 'Säkerhetsnycklar kan minska skadan från stulna lösenord.'],
  ['Energy', 'Geothermal heating', 'geotermisk uppvärmning', 'A ground-source heat pump transfers stored heat into a building.', 'En bergvärmepump för över lagrad värme till en byggnad.'],
  ['Urban Planning', 'Pedestrian street design', 'utformning av gågator', 'Wider pavements make a shopping street easier to walk along.', 'Bredare trottoarer gör en handelsgata lättare att gå på.'],
  ['Nutrition', 'Dietary fibre', 'kostfiber', 'Beans and whole grains are common sources of dietary fibre.', 'Bönor och fullkorn är vanliga källor till kostfiber.'],
  ['Astronomy', 'Exoplanet detection', 'upptäckt av exoplaneter', 'A periodic dip in starlight can reveal an orbiting planet.', 'En återkommande minskning i stjärnljus kan avslöja en planet.'],
  ['Woodworking', 'Dovetail joints', 'sinkfogning', 'A dovetail joint resists being pulled apart without screws.', 'En sinkfog står emot dragkrafter utan skruvar.'],
  ['Music', 'Jazz improvisation', 'jazzimprovisation', 'The soloist builds a phrase from the harmony beneath it.', 'Solisten bygger en fras utifrån den underliggande harmoniken.'],
  ['Linguistics', 'Swedish pronunciation', 'svenskt uttal', 'Pitch accent can distinguish words in spoken Swedish.', 'Ordaccent kan skilja ord åt i talad svenska.'],
  ['Transportation', 'Railway signalling', 'järnvägssignalering', 'Block signals keep two trains from occupying the same section.', 'Blocksignaler hindrar två tåg från att köra in på samma sträcka.'],
  ['Earth Science', 'Volcanic rocks', 'vulkaniska bergarter', 'Basalt forms when low-viscosity lava cools.', 'Basalt bildas när lättflytande lava svalnar.'],
  ['Photography', 'Long exposure photography', 'långtidsexponering', 'A tripod prevents camera movement during a long exposure.', 'Ett stativ hindrar kameran från att röra sig under lång exponering.'],
  ['Robotics', 'Robot path planning', 'ruttplanering för robotar', 'The robot compares several routes around an obstacle.', 'Roboten jämför flera vägar runt ett hinder.'],
  ['Conservation', 'Pollinator habitats', 'livsmiljöer för pollinatörer', 'Native flowers provide food across more of the season.', 'Inhemska blommor ger föda under en större del av säsongen.'],
  ['Baking', 'Sourdough fermentation', 'surdegsjäsning', 'A cooler kitchen slows the sourdough fermentation.', 'Ett svalare kök gör att surdegen jäser långsammare.'],
  ['Medicine', 'Wound healing', 'sårläkning', 'New tissue gradually closes a clean wound.', 'Ny vävnad sluter gradvis ett rent sår.'],
  ['Economics', 'Inflation measurement', 'inflationsmätning', 'A consumer price index follows the cost of a basket of goods.', 'Ett konsumentprisindex följer kostnaden för en varukorg.'],
  ['History', 'Medieval trade routes', 'medeltida handelsvägar', 'River ports connected inland towns with medieval sea trade.', 'Flodhamnar band samman inlandets städer med medeltida sjöhandel.'],
  ['Psychology', 'Working memory', 'arbetsminne', 'Working memory holds a small amount of information briefly.', 'Arbetsminnet håller kvar en liten mängd information en kort stund.'],
  ['Sports Science', 'Interval training', 'intervallträning', 'Short recovery periods change the intensity of interval training.', 'Korta viloperioder ändrar intensiteten i intervallträning.'],
  ['Textile Crafts', 'Natural dyeing', 'växtfärgning', 'Onion skins can create yellow tones in natural dyeing.', 'Lökskal kan ge gula toner vid växtfärgning.'],
  ['Navigation', 'Celestial navigation', 'astronomisk navigation', 'A sextant measures the angle between the horizon and a star.', 'En sextant mäter vinkeln mellan horisonten och en stjärna.'],
];
const swedishDomains = Object.freeze({
  'Environmental Science': 'Miljövetenskap', Crafts: 'Hantverk', Agriculture: 'Jordbruk', 'Marine Science': 'Marinvetenskap',
  'Computer Security': 'Datasäkerhet', Energy: 'Energi', 'Urban Planning': 'Stadsplanering', Nutrition: 'Näringslära', Astronomy: 'Astronomi',
  Woodworking: 'Träarbete', Music: 'Musik', Linguistics: 'Språkvetenskap', Transportation: 'Transport', 'Earth Science': 'Geovetenskap',
  Photography: 'Fotografi', Robotics: 'Robotik', Conservation: 'Naturvård', Baking: 'Bakning', Medicine: 'Medicin', Economics: 'Ekonomi',
  History: 'Historia', Psychology: 'Psykologi', 'Sports Science': 'Idrottsvetenskap', 'Textile Crafts': 'Textilhantverk', Navigation: 'Navigation',
});

export const TOPIC_BENCHMARK = Object.freeze(topicDefinitions.flatMap(([domain, topic, swedishTopic, enContext, svContext], index) => {
  const split = index < 10 ? 'development' : 'heldOut';
  return [
    { id: `TOP-${index + 1}-EN-A`, conceptId: `concept-${index + 1}`, split, language: 'en', text: enContext, expectedDomain: [domain], expectedTopic: [topic] },
    { id: `TOP-${index + 1}-EN-B`, conceptId: `concept-${index + 1}`, split, language: 'en', text: `I am studying ${topic.toLocaleLowerCase('en')}.`, expectedDomain: [domain], expectedTopic: [topic] },
    { id: `TOP-${index + 1}-SV-A`, conceptId: `concept-${index + 1}`, split, language: 'sv', text: svContext, expectedDomain: [domain, swedishDomains[domain]], expectedTopic: [topic, swedishTopic] },
    { id: `TOP-${index + 1}-SV-B`, conceptId: `concept-${index + 1}`, split, language: 'sv', text: `Jag läser om ${swedishTopic}.`, expectedDomain: [domain, swedishDomains[domain]], expectedTopic: [topic, swedishTopic] },
  ];
}));

const subjects = [
  { language: 'en', noun: 'the observatory lens', verb: 'calibrate the observatory lens', past: 'calibrated the observatory lens', fact: 'The observatory lens bends incoming light', opinion: 'the observatory lens is difficult to clean', imperative: 'Calibrate the observatory lens before sunset' },
  { language: 'en', noun: 'the sourdough starter', verb: 'feed the sourdough starter', past: 'fed the sourdough starter', fact: 'A sourdough starter contains yeast and bacteria', opinion: 'the sourdough starter smells pleasant', imperative: 'Feed the sourdough starter with rye flour' },
  { language: 'en', noun: 'the reed bed', verb: 'map the reed bed', past: 'mapped the reed bed', fact: 'The reed bed shelters young fish', opinion: 'the reed bed looks healthier this year', imperative: 'Map the edge of the reed bed' },
  { language: 'en', noun: 'the violin bridge', verb: 'adjust the violin bridge', past: 'adjusted the violin bridge', fact: 'The violin bridge transfers string vibration', opinion: 'the violin bridge is too high', imperative: 'Adjust the violin bridge carefully' },
  { language: 'en', noun: 'the night bus route', verb: 'redesign the night bus route', past: 'redesigned the night bus route', fact: 'The night bus route serves three hospitals', opinion: 'the night bus route is confusing', imperative: 'Mark every stop on the night bus route' },
  { language: 'en', noun: 'the ceramic kiln', verb: 'repair the ceramic kiln', past: 'repaired the ceramic kiln', fact: 'The ceramic kiln reaches one thousand degrees', opinion: 'the ceramic kiln is inefficient', imperative: 'Turn off the ceramic kiln after firing' },
  { language: 'sv', noun: 'bikupan', verb: 'kontrollera bikupan', past: 'kontrollerade bikupan', fact: 'Bikupan har två yngelrum', opinion: 'bikupan verkar välisolerad', imperative: 'Kontrollera bikupan före vintern' },
  { language: 'sv', noun: 'växthusets ventilation', verb: 'förbättra växthusets ventilation', past: 'förbättrade växthusets ventilation', fact: 'Växthusets ventilation reglerar temperaturen', opinion: 'växthusets ventilation är för bullrig', imperative: 'Öppna växthusets ventilation långsamt' },
  { language: 'sv', noun: 'fjällleden', verb: 'märka ut fjällleden', past: 'märkte ut fjällleden', fact: 'Fjällleden passerar två vindskydd', opinion: 'fjällleden är ovanligt vacker', imperative: 'Märk ut fjällleden med röda skyltar' },
  { language: 'sv', noun: 'symaskinens spänning', verb: 'justera symaskinens spänning', past: 'justerade symaskinens spänning', fact: 'Symaskinens spänning påverkar stygnen', opinion: 'symaskinens spänning är svår att ställa in', imperative: 'Justera symaskinens spänning ett steg' },
  { language: 'sv', noun: 'kajakens roder', verb: 'reparera kajakens roder', past: 'reparerade kajakens roder', fact: 'Kajakens roder styrs med pedaler', opinion: 'kajakens roder känns trögt', imperative: 'Lossa kajakens roder före transporten' },
  { language: 'sv', noun: 'fjärrvärmenätet', verb: 'kartlägga fjärrvärmenätet', past: 'kartlade fjärrvärmenätet', fact: 'Fjärrvärmenätet transporterar varmt vatten', opinion: 'fjärrvärmenätet är energieffektivt', imperative: 'Kartlägg fjärrvärmenätets ventiler' },
];

const typeText = (type, item, index) => {
  const sv = item.language === 'sv';
  const values = {
    FACT_CLAIM: item.fact,
    AMBITION: sv ? `Jag hoppas kunna ${item.verb} någon gång.` : `I hope to ${item.verb} someday.`,
    GOAL: sv ? `Jag ska ${item.verb} före fredag.` : `I will ${item.verb} before Friday.`,
    ADVICE: sv ? `Du borde ${item.verb} innan du fortsätter.` : `You should ${item.verb} before continuing.`,
    INSTRUCTION: `${item.imperative}.`,
    OPINION: sv ? `Jag tycker att ${item.opinion}.` : `I think ${item.opinion}.`,
    QUESTION: sv ? `Hur kan jag ${item.verb}?` : `How can I ${item.verb}?`,
    EXPERIENCE: sv ? `Jag ${item.past} förra året.` : `Last year I ${item.past}.`,
    UNCERTAIN: sv ? `Kanske ${item.noun}, på något sätt.` : `Maybe ${item.noun}, somehow.`,
  };
  if (index === 1 && type === 'GOAL') return sv ? `Jag ska inte ${item.verb} den här veckan.` : `I will not ${item.verb} this week.`;
  if (index === 2 && type === 'QUESTION') return sv ? `Är inte ${item.noun} färdig?` : `Isn't ${item.noun} ready?`;
  return values[type];
};

export const INFORMATION_TYPE_BENCHMARK = Object.freeze(INFORMATION_TYPES.flatMap(type => subjects.map((subject, index) => ({
  id: `TYPE-${type}-${index + 1}`, split: index % 6 < 3 ? 'development' : 'heldOut', language: subject.language,
  text: typeText(type, subject, index), expected: type,
}))));

const relationshipSeeds = [
  ['I plan to restore a wooden sailboat.', 'Min plan är att restaurera en segelbåt av trä.', 'I am researching paint for wooden boats.', 'I do not plan to restore the sailboat anymore.', 'I moved the restoration deadline to next summer.', 'The city planted new trees beside the station.'],
  ['Jag vill lära mig spela cello.', 'I want to learn to play the cello.', 'Cello lessons are available on Thursdays.', 'Jag vill inte längre lära mig cello.', 'Jag har bytt mål från cello till kontrabas.', 'A solar eclipse will occur next year.'],
  ['The greenhouse needs a new irrigation pump.', 'Ett nytt bevattningssystem behövs i växthuset.', 'The greenhouse roof also needs cleaning.', 'The greenhouse does not need a new pump.', 'A repaired pump may be enough for the greenhouse.', 'I baked rye bread yesterday.'],
  ['Jag sprang fem kilometer i går.', 'Yesterday I ran five kilometres.', 'I bought new running shoes.', 'Jag sprang inte fem kilometer i går.', 'Jag sprang sex kilometer i stället.', 'The museum closes at five.'],
  ['Mangrove roots protect young fish.', 'Mangrovernas rötter skyddar unga fiskar.', 'Mangrove forests also reduce wave energy.', 'Mangrove roots do not shelter young fish.', 'New evidence suggests only some fish use those roots.', 'My keyboard has silent switches.'],
  ['I think the new tram is comfortable.', 'Jag tycker att den nya spårvagnen är bekväm.', 'The tram line reaches the university.', 'I do not think the new tram is comfortable.', 'The seats improved after the tram was renovated.', 'A triangle has three sides.'],
  ['Jag ska avsluta vävkursen i juni.', 'I will finish the weaving course in June.', 'The weaving course teaches natural dyes.', 'Jag ska inte avsluta kursen i juni.', 'Jag flyttade slutdatumet till augusti.', 'Whales breathe air.'],
  ['The telescope mirror was cleaned on Monday.', 'Teleskopets spegel rengjordes i måndags.', 'The telescope camera still needs calibration.', 'The telescope mirror was not cleaned on Monday.', 'The mirror was cleaned on Tuesday instead.', 'I prefer dark chocolate.'],
  ['I hope to work as a landscape architect.', 'Jag hoppas arbeta som landskapsarkitekt.', 'Landscape architects study drainage.', 'I no longer want to work as a landscape architect.', 'I now hope to specialize in public parks.', 'The soup contains lentils.'],
  ['Batteriet laddades till åttio procent.', 'The battery was charged to eighty percent.', 'The battery warms during rapid charging.', 'Batteriet laddades inte till åttio procent.', 'Mätaren visade senare sjuttioåtta procent.', 'A robin nested under the roof.'],
  ['The archive stores letters from 1890.', 'Arkivet förvarar brev från 1890.', 'The archive is digitising old photographs.', 'The archive does not contain letters from 1890.', 'The catalogue now dates one letter to 1891.', 'I want to learn kayaking.'],
  ['Jag tycker att surdegen är för syrlig.', 'I think the sourdough is too sour.', 'The sourdough fermented for twelve hours.', 'Jag tycker inte längre att surdegen är för syrlig.', 'A shorter fermentation made it milder.', 'Saturn has many moons.'],
  ['The wetland survey begins in April.', 'Våtmarksinventeringen börjar i april.', 'The survey team will also count dragonflies.', 'The wetland survey does not begin in April.', 'The start was moved from April to May.', 'The violin needs new strings.'],
  ['Jag har byggt en bokhylla av ek.', 'I built an oak bookcase.', 'The remaining oak will become a table.', 'Jag byggde inte bokhyllan av ek.', 'Jag använde ask i hyllplanen i stället.', 'The train arrives on platform four.'],
  ['The clinic offers evening vaccination appointments.', 'Kliniken erbjuder vaccination på kvällstid.', 'The clinic also provides travel advice.', 'The clinic does not offer evening vaccination.', 'Evening appointments are now limited to Wednesdays.', 'I photographed a waterfall.'],
  ['Jag vill odla saffran inomhus.', 'I want to grow saffron indoors.', 'Indoor saffron needs a dry summer period.', 'Jag vill inte längre odla saffran inomhus.', 'Jag tänker prova saffran i växthuset i stället.', 'Copper conducts electricity.'],
  ['The ferry uses electric propulsion in the harbour.', 'Färjan använder eldrift i hamnen.', 'The ferry uses diesel on the open sea.', 'The ferry does not use electric propulsion in the harbour.', 'A software update changed when the diesel engine starts.', 'My neighbour adopted a cat.'],
  ['Jag rekommenderar att du sparar originalfilen.', 'I recommend that you save the original file.', 'The file can also be exported as a PDF.', 'Jag rekommenderar inte längre att du sparar originalfilen.', 'Jag rekommenderar nu en skrivskyddad kopia.', 'Rain formed puddles on the road.'],
  ['A blue marker identifies the hiking route.', 'En blå markering visar vandringsleden.', 'Red markers identify the winter route.', 'A blue marker does not identify the hiking route.', 'The route markers were changed from blue to orange.', 'The piano was tuned last month.'],
  ['Jag läste en bok om arbetsminne.', 'I read a book about working memory.', 'The book also discusses long-term memory.', 'Jag läste inte boken om arbetsminne.', 'Jag läste bara de första tre kapitlen.', 'The bakery opens before sunrise.'],
];

const relationVariants = [
  ['LINK_EXISTING', 1], ['RELATED_BUT_DISTINCT', 2], ['CONTRADICTS_OR_UPDATES', 3], ['CONTRADICTS_OR_UPDATES', 4], ['CREATE_NEW', 5],
  ['NEEDS_REVIEW', null],
];

export const RELATIONSHIP_BENCHMARK = Object.freeze(relationshipSeeds.flatMap((seed, index) => relationVariants.map(([expected, position], variant) => ({
  id: `REL-${index + 1}-${variant + 1}`, split: index < 8 ? 'development' : 'heldOut',
  left: seed[0], right: position == null ? `${seed[0].split(' ').slice(0, 3).join(' ')} … perhaps differently.` : seed[position], expected,
  features: [variant === 0 ? 'cross-language' : null, variant === 2 ? 'negation' : null, variant === 3 ? 'update' : null].filter(Boolean),
}))));

const normalize = value => String(value || '').normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const matchesAlias = (actual, aliases) => aliases.some(alias => normalize(actual) === normalize(alias));

export function topicMetrics(cases, predictions) {
  const rows = cases.map((item, index) => ({ item, prediction: predictions[index] || {} }));
  const domainCorrect = rows.filter(row => matchesAlias(row.prediction.domain, row.item.expectedDomain)).length;
  const topicCorrect = rows.filter(row => matchesAlias(row.prediction.topic, row.item.expectedTopic)).length;
  const categorized = rows.filter(row => typeof row.prediction.categoryId === 'string' && row.prediction.categoryId);
  const concepts = new Map();
  for (const row of categorized) concepts.set(row.item.conceptId, [...(concepts.get(row.item.conceptId) || []), row]);
  let reuseComparisons = 0; let reused = 0; let duplicateSlots = 0; let duplicates = 0;
  for (const group of concepts.values()) {
    if (group.length < 2) continue;
    const first = group[0].prediction.categoryId; reuseComparisons += group.length - 1;
    reused += group.slice(1).filter(row => row.prediction.categoryId === first).length;
    duplicateSlots += group.length - 1; duplicates += Math.max(0, new Set(group.map(row => row.prediction.categoryId)).size - 1);
  }
  return {
    count: rows.length, domainAccuracy: rows.length ? domainCorrect / rows.length : null, topicAccuracy: rows.length ? topicCorrect / rows.length : null,
    categoryReuseAccuracy: reuseComparisons ? reused / reuseComparisons : null,
    categoryDuplicationRate: duplicateSlots ? duplicates / duplicateSlots : null,
  };
}

export function classificationMetrics(cases, predictions) {
  const types = [...INFORMATION_TYPES]; const index = new Map(types.map((type, position) => [type, position])); const confusion = types.map(() => types.map(() => 0)); let abstentions = 0;
  cases.forEach((item, position) => { const predicted = predictions[position] || 'UNCERTAIN'; if (predicted === 'UNCERTAIN') abstentions += 1; if (index.has(item.expected) && index.has(predicted)) confusion[index.get(item.expected)][index.get(predicted)] += 1; });
  const perClass = Object.fromEntries(types.map((type, position) => { const tp = confusion[position][position]; const actual = confusion[position].reduce((sum, value) => sum + value, 0); const predicted = confusion.reduce((sum, row) => sum + row[position], 0); const precision = predicted ? tp / predicted : 0; const recall = actual ? tp / actual : 0; return [type, { precision, recall, f1: precision + recall ? 2 * precision * recall / (precision + recall) : 0, support: actual }]; }));
  const correct = confusion.reduce((sum, row, position) => sum + row[position], 0); return { count: cases.length, types, confusion, perClass, accuracy: cases.length ? correct / cases.length : null, macroF1: types.reduce((sum, type) => sum + perClass[type].f1, 0) / types.length, abstentionRate: cases.length ? abstentions / cases.length : null };
}

export function relationshipMetrics(cases, predictions) {
  const actions = [...MEMORY_ACTIONS]; const actionIndex = new Map(actions.map((action, position) => [action, position])); const confusion = actions.map(() => actions.map(() => 0));
  let correct = 0; let links = 0; let correctLinks = 0; let falseMerges = 0; let actualLinks = 0; let recoveredLinks = 0; let actualContradictions = 0; let recoveredContradictions = 0;
  cases.forEach((item, index) => { const predicted = predictions[index] || 'NEEDS_REVIEW'; if (actionIndex.has(item.expected) && actionIndex.has(predicted)) confusion[actionIndex.get(item.expected)][actionIndex.get(predicted)] += 1; if (predicted === item.expected) correct += 1; if (predicted === 'LINK_EXISTING') { links += 1; if (item.expected === 'LINK_EXISTING') correctLinks += 1; else falseMerges += 1; } if (item.expected === 'LINK_EXISTING') { actualLinks += 1; if (predicted === item.expected) recoveredLinks += 1; } if (item.expected === 'CONTRADICTS_OR_UPDATES') { actualContradictions += 1; if (predicted === item.expected) recoveredContradictions += 1; } });
  const perClass = Object.fromEntries(actions.map((action, position) => { const tp = confusion[position][position]; const actual = confusion[position].reduce((sum, value) => sum + value, 0); const predicted = confusion.reduce((sum, row) => sum + row[position], 0); const precision = predicted ? tp / predicted : 0; const recall = actual ? tp / actual : 0; return [action, { precision, recall, f1: precision + recall ? 2 * precision * recall / (precision + recall) : 0, support: actual }]; }));
  return {
    count: cases.length, actions, confusion, perClass,
    accuracy: cases.length ? correct / cases.length : null,
    macroF1: actions.reduce((sum, action) => sum + perClass[action].f1, 0) / actions.length,
    linkPrecision: links ? correctLinks / links : 0, linkRecall: actualLinks ? recoveredLinks / actualLinks : 0,
    falseMergeRate: cases.length ? falseMerges / cases.length : 0,
    contradictionRecall: actualContradictions ? recoveredContradictions / actualContradictions : 0,
  };
}

export const MEMORY_BENCHMARK = Object.freeze({
  version: 1, acceptanceThresholds: ACCEPTANCE_THRESHOLDS,
  policy: 'Development and held-out concepts are separated before evaluation. Prompt examples are excluded. Model prompts never contain expected labels.',
  topic: TOPIC_BENCHMARK, informationType: INFORMATION_TYPE_BENCHMARK, relationship: RELATIONSHIP_BENCHMARK,
  counts: Object.freeze({ topic: TOPIC_BENCHMARK.length, informationType: INFORMATION_TYPE_BENCHMARK.length, relationship: RELATIONSHIP_BENCHMARK.length }),
  allowedRelationshipActions: MEMORY_ACTIONS,
});
