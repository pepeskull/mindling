// Exact structured labels only. Titles describe knowledge orientation, never
// professional credentials. Extend this registry without touching either view.
export const SPECIALIZATION_POLICY=Object.freeze({broadClaims:3,broadTopics:2,broadSubmissions:2,specificClaims:5,specificTopics:3,specificSubmissions:3,specificShare:.65,specificRelationships:2});
const groups=[
  ['science','Scientist','Science|Scientific knowledge|Vetenskap',[]],
  ['geography','Geographer','Geography|Geografi',[
    ['Cartographer','Cartography|Kartografi'],['Geopolitical Analyst','Geopolitics|Geopolitik'],['Climatologist','Climatology|Klimatologi'],['Urban Geographer','Urban geography|Stadsgeografi']]],
  ['biology','Biologist','Biology|Biologi|Life science',[
    ['Microbiologist','Microbiology|Mikrobiologi'],['Zoologist','Zoology|Zoologi'],['Botanist','Botany|Botanik'],['Marine Biologist','Marine biology|Marinbiologi'],['Geneticist','Genetics|Genetik'],['Ecologist','Ecology|Ekologi'],['Evolutionary Biologist','Evolutionary biology|Evolutionsbiologi'],['Molecular Biologist','Molecular biology|Molekylärbiologi']]],
  ['physics','Physicist','Physics|Fysik',[
    ['Astrophysicist','Astrophysics|Astrofysik'],['Quantum Physicist','Quantum physics|Kvantfysik|Quantum mechanics'],['Nuclear Physicist','Nuclear physics|Kärnfysik'],['Particle Physicist','Particle physics|Partikelfysik']]],
  ['chemistry','Chemist','Chemistry|Kemi',[
    ['Biochemist','Biochemistry|Biokemi'],['Organic Chemist','Organic chemistry|Organisk kemi'],['Analytical Chemist','Analytical chemistry|Analytisk kemi']]],
  ['mathematics','Mathematician','Mathematics|Math|Matematik',[
    ['Statistician','Statistics|Statistical analysis|Statistik'],['Applied Mathematician','Applied mathematics|Tillämpad matematik'],['Cryptographer','Cryptography|Kryptografi']]],
  ['technology','Technologist','Technology|Teknik|Computer science',[
    ['Software Engineer','Software engineering|Software development|Programming|Programmering|Web development'],['AI Researcher','Artificial intelligence|AI research|AI|Artificiell intelligens'],['Machine Learning Engineer','Machine learning|Maskininlärning'],['Cybersecurity Specialist','Cybersecurity|Information security|Cybersäkerhet'],['Network Engineer','Network engineering|Computer networks|Nätverksteknik'],['Systems Architect','Systems architecture|System architecture|Systemarkitektur']]],
  ['sports','Sports Analyst','Sports|Sport|Idrott',[
    ['Football Analyst','Football|Soccer|Fotboll'],['Sports Statistician','Sports statistics|Idrottsstatistik'],['Tactical Analyst','Sports tactics|Football tactics|Fotbollstaktik'],['Performance Analyst','Sports performance|Athletic performance|Idrottsprestation']]],
  ['history','Historian','History|Historia',[
    ['Archaeologist','Archaeology|Arkeologi'],['Military Historian','Military history|Militärhistoria'],['Cultural Historian','Cultural history|Kulturhistoria']]],
  ['medicine','Medical Researcher','Medicine|Medical science|Medicin|Life sciences',[
    ['Neuroscientist','Neuroscience|Neurovetenskap'],['Epidemiologist','Epidemiology|Epidemiologi'],['Pharmacologist','Pharmacology|Farmakologi']]],
  ['economics','Economist','Economics|Ekonomi',[
    ['Financial Analyst','Finance|Financial markets|Markets|Investing|Trading|Finans'],['Market Researcher','Market research|Marknadsundersökning'],['Economic Historian','Economic history|Ekonomisk historia']]],
  ['humanities','Humanities Explorer','Humanities|Humaniora',[
    ['Linguist','Linguistics|Language|Språkvetenskap'],['Literary Analyst','Literature|Literary analysis|Litteratur'],['Philosopher','Philosophy|Filosofi'],['Translator','Translation|Översättning']]],
  ['art','Creative Artist','Art|Arts|Konst|Creative practice',[]],
  ['music','Music Specialist','Music|Musik',[]],
  ['engineering','Engineer','Engineering|Ingenjörsvetenskap',[]]
];
const normalize=value=>typeof value==='string'?value.normalize('NFC').trim().replace(/\s+/gu,' ').toLocaleLowerCase('en'):'';
export const SPECIALIZATIONS=Object.freeze(groups.flatMap(([family,title,aliases,specific])=>[
  Object.freeze({id:family,family,title,specific:false,aliases:Object.freeze(aliases.split('|'))}),
  ...specific.map(([name,labels])=>Object.freeze({id:`${family}:${normalize(name).replace(/ /g,'-')}`,family,title:name,specific:true,aliases:Object.freeze(labels.split('|'))}))
]));
const index=new Map();for(const definition of SPECIALIZATIONS)for(const label of [definition.title,...definition.aliases])index.set(normalize(label),definition);
export const specializationFor=label=>index.get(normalize(label))||null;
export const broadSpecialization=family=>SPECIALIZATIONS.find(item=>item.family===family&&!item.specific)||null;
