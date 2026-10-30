// Exact structured labels only. Titles describe knowledge orientation, never
// professional credentials. Extend this registry without touching either view.
export const SPECIALIZATION_POLICY=Object.freeze({broadClaims:3,broadTopics:2,broadSubmissions:2,specificClaims:5,specificTopics:3,specificSubmissions:3,specificShare:.65,specificRelationships:2});
const groups=[
  ['science','Scientist','Science|Scientific knowledge|Vetenskap|Researcher|Research|Research methodology|Scientific method|Scientific research|Academic research|Evidence gathering|Experiments|Forskning',[]],
  ['geography','Geographer','Geography|Geografi',[
    ['Cartographer','Cartography|Kartografi'],['Geopolitical Analyst','Geopolitics|Geopolitik'],['Climatologist','Climatology|Klimatologi'],['Urban Geographer','Urban geography|Stadsgeografi']]],
  ['biology','Biologist','Biology|Biologi|Life science',[
    ['Cell Biologist','Cell biology|Cellular biology|Cellbiologi'],['Microbiologist','Microbiology|Mikrobiologi'],['Zoologist','Zoology|Zoologi'],['Botanist','Botany|Botanik'],['Marine Biologist','Marine biology|Marinbiologi'],['Geneticist','Genetics|Genetik'],['Ecologist','Ecology|Ekologi'],['Evolutionary Biologist','Evolutionary biology|Evolutionsbiologi'],['Molecular Biologist','Molecular biology|Molekylärbiologi']]],
  ['physics','Physicist','Physics|Fysik',[
    ['Astrophysicist','Astrophysics|Astrofysik'],['Quantum Physicist','Quantum physics|Kvantfysik|Quantum mechanics'],['Nuclear Physicist','Nuclear physics|Kärnfysik'],['Particle Physicist','Particle physics|Partikelfysik']]],
  ['chemistry','Chemist','Chemistry|Kemi',[
    ['Biochemist','Biochemistry|Biokemi'],['Organic Chemist','Organic chemistry|Organisk kemi'],['Analytical Chemist','Analytical chemistry|Analytisk kemi']]],
  ['mathematics','Mathematician','Mathematics|Math|Matematik|Analyst|Data analysis|Quantitative analysis',[
    ['Statistician','Statistics|Statistical analysis|Statistik'],['Applied Mathematician','Applied mathematics|Tillämpad matematik'],['Cryptographer','Cryptography|Kryptografi']]],
  ['technology','Technologist','Technology|Teknik|Computer science|Developer',[
    ['Software Engineer','Software engineering|Software development|Programming|Programmering|Web development'],['AI Researcher','Artificial intelligence|AI research|AI|Artificiell intelligens'],['Machine Learning Engineer','Machine learning|Maskininlärning'],['Cybersecurity Specialist','Cybersecurity|Information security|Cybersäkerhet'],['Network Engineer','Network engineering|Computer networks|Nätverksteknik'],['Systems Architect','Systems architecture|System architecture|Systemarkitektur']]],
  ['sports','Sports Analyst','Sports|Sport|Idrott',[
    ['Football Analyst','Football|Soccer|Fotboll'],['Sports Statistician','Sports statistics|Idrottsstatistik'],['Tactical Analyst','Sports tactics|Football tactics|Fotbollstaktik'],['Performance Analyst','Sports performance|Athletic performance|Idrottsprestation']]],
  ['history','Historian','History|Historia',[
    ['Archaeologist','Archaeology|Arkeologi'],['Military Historian','Military history|Militärhistoria'],['Cultural Historian','Cultural history|Kulturhistoria']]],
  ['medicine','Medical Researcher','Medicine|Medical science|Medicin|Life sciences',[
    ['Neuroscientist','Neuroscience|Neurovetenskap'],['Epidemiologist','Epidemiology|Epidemiologi'],['Pharmacologist','Pharmacology|Farmakologi']]],
  ['economics','Economist','Economics|Ekonomi|Markets',[
    ['Financial Analyst','Finance|Financial markets|Markets|Investing|Trading|Finans'],['Market Researcher','Market research|Marknadsundersökning'],['Economic Historian','Economic history|Ekonomisk historia']]],
  ['humanities','Humanities Explorer','Humanities|Humaniora',[
    ['Linguist','Linguistics|Language|Språkvetenskap'],['Literary Analyst','Literature|Literary analysis|Litteratur'],['Philosopher','Philosophy|Filosofi'],['Translator','Translation|Översättning']]],
  ['art','Creative Artist','Art|Arts|Konst|Creative practice|Creator|Creative writing|Design',[]],
  ['music','Music Specialist','Music|Musik',[]],
  ['social','Communicator','Social|Communication|Collaboration|Social skills|Teamwork|Interpersonal communication|Social interaction|Kommunikation|Samarbete',[]],
  ['gaming','Game Strategist','Gaming|Game strategy|Game design|Game development|Game mechanics|Video games|Spelstrategi',[]],
  ['productivity','Planner','Assistant|Planning|Productivity|Task management|Organization|Planering',[]],
  ['reasoning','Knowledge Explorer','General Intelligence|General reasoning|Interdisciplinary reasoning|Problem solving|Knowledge integration',[]],
  ['engineering','Engineer','Engineering|Ingenjörsvetenskap',[]]
];
const normalize=value=>typeof value==='string'?value.normalize('NFC').trim().replace(/\s+/gu,' ').toLocaleLowerCase('en'):'';
export const SPECIALIZATIONS=Object.freeze(groups.flatMap(([family,title,aliases,specific])=>[
  Object.freeze({id:family,family,title,specific:false,aliases:Object.freeze(aliases.split('|'))}),
  ...specific.map(([name,labels])=>Object.freeze({id:`${family}:${normalize(name).replace(/ /g,'-')}`,family,title:name,specific:true,aliases:Object.freeze(labels.split('|'))}))
]));
const index=new Map();for(const definition of SPECIALIZATIONS)for(const label of [definition.id,definition.title,...definition.aliases])index.set(normalize(label),definition);
export const specializationFor=label=>index.get(normalize(label))||null;
export const broadSpecialization=family=>SPECIALIZATIONS.find(item=>item.family===family&&!item.specific)||null;

// Controlled subtopics are aliases in stored topic/concept metadata, not rules
// over arbitrary claim prose. A matching word never awards another claim unit.
export const TOPIC_FACETS=Object.freeze([
  ['genetics:dna','biology','Geneticist','DNA|DNA replication|DNA-replikation'],
  ['genetics:genes','biology','Geneticist','gene|genes|gen|gener|gene expression|genuttryck'],
  ['genetics:mutation','biology','Geneticist','mutation|mutations|mutationer'],
  ['genetics:inheritance','biology','Geneticist','inheritance|heredity|ärftlighet'],
  ['genetics:meiosis','biology','Geneticist','meiosis|meios'],
  ['genetics:recombination','biology','Geneticist','genetic recombination|recombination|rekombination|genetic variation'],
  ['cells:structure','biology','Cell Biologist','cell|cells|cellular structure|celler'],
  ['cells:organelles','biology','Cell Biologist','organelle|organelles|organeller|nucleus|nuclei'],
  ['cells:membranes','biology','Cell Biologist','membrane|membranes|membran'],
  ['cells:division','biology','Cell Biologist','cell division|mitosis|celldelning|mitos'],
  ['cells:processes','biology','Cell Biologist','cellular processes|cell signaling|cell metabolism'],
  ['evolution:selection','biology','Evolutionary Biologist','natural selection|evolution|evolutionary|naturligt urval'],
  ['botany:photosynthesis','biology','Botanist','photosynthesis|fotosyntes'],
  ['ecology:ecosystems','biology','Ecologist','ecosystem|ecosystems|ecology|ekologi'],
  ['microbiology:microbes','biology','Microbiologist','microorganism|microorganisms|bacteria|bacterial|microbiology|mikrobiologi'],
  ['zoology:animals','biology','Zoologist','zoology|animal physiology|zoologi'],
  ['neuroscience:neurons','medicine','Neuroscientist','neuron|neurons|neuronal|neuroner'],
  ['neuroscience:synapses','medicine','Neuroscientist','synapse|synapses|synaptic|synapser'],
  ['neuroscience:signaling','medicine','Neuroscientist','neurotransmitter|neurotransmitters|neural signaling|action potential|brain']
].map(([id,family,title,aliases])=>Object.freeze({id,family,specializationId:specializationFor(title).id,aliases:Object.freeze(aliases.split('|'))})));
const words=value=>normalize(value).replace(/[^\p{L}\p{N}]+/gu,' ');
export function structuredTopicFacets(value,family=null){const source=` ${words(value)} `;return TOPIC_FACETS.filter(facet=>(!family||facet.family===family)&&facet.aliases.some(alias=>source.includes(` ${words(alias)} `)));}
