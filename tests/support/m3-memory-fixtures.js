// Explicit synthetic persisted browser fixtures; never imported by product code.
export function memoryFixtures() {
  const areas=[
    ['Language',['Linguistics','Expression'],['Words carry meaning through context.','Swedish nouns can have common or neuter gender.','Metaphors connect familiar and unfamiliar ideas.','Listening provides context before a response.','Writing makes an idea available for reflection.','Translation preserves intent as well as vocabulary.','Stories organize events into a meaningful sequence.','A question can clarify an ambiguous statement.']],
    ['Programming',['Software design','JavaScript'],['Small functions make behavior easier to inspect.','JavaScript promises represent eventual results.','A transaction commits its complete set of changes.','Tests describe observable behavior.','Stable identifiers preserve a record through updates.','Modules separate concerns through explicit interfaces.','A useful error explains what can be done next.']],
    ['Natural science',['Living systems','Energy'],['Neurons communicate through synapses.','Connected neurons exchange electrical and chemical signals.','Plants convert light into stored chemical energy.','An ecosystem contains interacting organisms.','Energy moves through food webs.','Observation and inference are different.']],
    ['Creative practice',['Making','Iteration'],['Sketching helps explore an unfinished idea.','Contrast makes a visual hierarchy readable.','A prototype makes a question concrete.','Revision can preserve the useful parts of an earlier idea.','Constraints help focus a design decision.']],
    ['Personal interests',['Preferences','Goals'],['My favorite programming language is Python.','I enjoy quiet places when I read.','I want to understand how memory changes over time.','I enjoy learning through small experiments.']],
    ['Everyday knowledge',['Routines','Reflection'],['A regular rest routine supports recovery.','Taking notes can preserve an observation.','A break creates room to reconsider an idea.']]
  ];
  const memories=[];
  areas.forEach(([category,topics,texts],a)=>texts.forEach((content,i)=>memories.push({id:`m3-${a}-${i}`,content,category,categoryId:`m3-area-${a}`,topic:topics[i%topics.length],strength:.3+(i%5)*.1,activations:1+i,neuronIds:['origin'],synapseIds:[],relatedMemoryIds:i?[`m3-${a}-${i-1}`]:[],source:'NATIVE',intelligence:{kind:a===4?'preference':'claim',certainty:'asserted',current:true,verification:'unverified-player-claim'}})));
  memories[0].relatedMemoryIds.push('m3-1-3');memories[12].relatedMemoryIds.push('m3-3-2');
  memories.find(m=>m.id==='m3-4-0').valueHistory=[{content:'My favorite programming language is JavaScript.',at:'2026-10-01T12:00:00Z'}];
  return memories;
}
