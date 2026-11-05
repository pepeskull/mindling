import assert from 'node:assert/strict';
import {bindSemanticAllowance} from '../src/ui/semantic-allowance-control.js';
import {saveResearchPermissions,loadResearchPermissions,defaultPermissions} from '../src/autonomous/research-permissions.js';
import {AutonomousLearningEngine} from '../src/autonomous/learning-engine.js';
// Minimal asynchronous transactional store: exercise the real permission API,
// with commits/aborts, rather than replacing persistence with a UI assignment.
function database(){const records=new Map();return {records,fail:false,transaction(name,mode){const tx={aborted:false,abort(){this.aborted=true;queueMicrotask(()=>this.onabort?.());}};let staged;
 tx.objectStore=()=>({get(key){const request={};queueMicrotask(()=>{request.result=structuredClone(records.get(key));request.onsuccess?.();queueMicrotask(()=>{if(tx.aborted)return;if(thisDB.fail&&mode==='readwrite'){tx.onerror?.();return;}if(staged)records.set(staged.id,staged);tx.oncomplete?.();});});return request;},put(value){staged=structuredClone(value);}});const thisDB=this;return tx;}};}
const db=database();
await saveResearchPermissions(db,false,'mine',{enabled:true});
let recoveries=0,renders=0;
const engine={app:{state:{mind:{id:'mine'}},renderState(){renders++;},db:{saveResearchPermissions:(id,choice)=>saveResearchPermissions(db,false,id,choice)}},async loadPermissions(){return loadResearchPermissions(db,false,this.app.state.mind.id);},assertLive(){},recover(){recoveries++;}};
const save=n=>AutonomousLearningEngine.prototype.setSemanticAllowance.call(engine,n);
let state={mindlingId:'mine',researchPermissions:{...await loadResearchPermissions(db,false,'mine'),loaded:true}};
const nodes=Object.fromEntries(['data-semantic-allowance','data-save-semantic','data-semantic-saved','data-semantic-feedback'].map(key=>[key,{value:'0',disabled:false,textContent:'',handlers:{}}]));
const root={querySelector:selector=>nodes[selector.slice(1,-1)]},listen=(node,type,fn)=>{node.handlers[type]=fn;};
let hold,release;
const binding=bindSemanticAllowance(root,{getState:()=>state,onSave:async n=>{if(hold)await hold;const prefs=await save(n);state={...state,researchPermissions:{...prefs,loaded:true}};return prefs;},listen});
const select=nodes['data-semantic-allowance'],button=nodes['data-save-semantic'],status=nodes['data-semantic-saved'],feedback=nodes['data-semantic-feedback'];
assert.equal(select.value,'0');assert.match(status.textContent,/Saved allowance: 0/);
select.value='3';assert.match(status.textContent,/Saved allowance: 0/);
hold=new Promise(resolve=>release=resolve);const pending=button.handlers.click();assert(button.disabled);assert.match(status.textContent,/Saved allowance: 0/);release();await pending;hold=null;
assert.match(status.textContent,/Saved allowance: 3/);assert.equal(recoveries,1);assert.equal(renders,1);assert.equal((await loadResearchPermissions(db,false,'mine')).semanticCallsPerDay,3);
// Reload from the persisted preference, change to 1, then disable with 0.
state.researchPermissions={...await loadResearchPermissions(db,false,'mine'),loaded:true};binding.refresh(true);assert.equal(select.value,'3');
for(const n of [1,0,2,3]){select.value=String(n);await button.handlers.click();assert.equal((await loadResearchPermissions(db,false,'mine')).semanticCallsPerDay,n);assert.match(status.textContent,new RegExp('Saved allowance: '+n));}
assert.equal(recoveries,5);
assert.equal((await loadResearchPermissions(db,false,'other')).semanticCallsPerDay,0);assert(!db.records.has(defaultPermissions('other').id));
// Aborted storage must not optimistically activate the selection or recover.
db.fail=true;select.value='0';await button.handlers.click();assert.match(status.textContent,/Saved allowance: 3/);assert.match(feedback.textContent,/could not be saved/);assert.equal(recoveries,5);db.fail=false;
// Disabling autonomous work preserves the configured allowance but clearly
// indicates it cannot run until the separate research permission is enabled.
await saveResearchPermissions(db,false,'mine',{enabled:false});state.researchPermissions={...await loadResearchPermissions(db,false,'mine'),loaded:true};binding.refresh(true);assert.equal(select.value,'3');assert.match(status.textContent,/disabled; no calls will run/);
state.researchPermissions.loaded=false;binding.refresh();assert(button.disabled);assert.match(status.textContent,/Loading/);state.researchPermissions.loaded=true;select.value='0';binding.refresh();assert.equal(select.value,'3');
state={mindlingId:'other',researchPermissions:{...defaultPermissions('other'),loaded:true}};binding.refresh(true);assert.equal(select.value,'0');assert.match(status.textContent,/Saved allowance: 0/);
console.log('Settings draft/save/failure/reload/change/disable, real permission API, recovery trigger and per-Mindling isolation passed.');
