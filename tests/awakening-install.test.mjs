import test from 'node:test';
import assert from 'node:assert/strict';
import { InstallProgress,pendingAwakening } from '../src/learning/install-progress.js';
import { automaticInstallation,INSTALLATION_POLICY,MODEL_PACK,MODEL_ASSET_BYTES,modelDownloadNotice } from '../src/learning/model-config.js';
test('automatic installation fails closed until this exact pack has qualification evidence',()=>{
 assert.equal(automaticInstallation(),false);assert.equal(INSTALLATION_POLICY.qualifiedPack,null);assert.ok(MODEL_PACK.includes('q8'));assert.ok(MODEL_ASSET_BYTES>650e6);assert.match(modelDownloadNotice(),/655 MB/);
});
test('progress aggregates actual bytes without inventing a global completion percentage',()=>{
 const p=new InstallProgress();p.update({file:'a',loaded:25,total:100});p.update({file:'b',loaded:30,total:60});assert.equal(p.snapshot().loaded,55);assert.equal(p.snapshot().total,160);assert.equal(p.snapshot().percent,undefined);
 p.update({file:'a',loaded:50,total:100});assert.equal(p.snapshot().loaded,80);p.update({file:'unknown',loaded:10});assert.equal(p.snapshot().total,null);p.update({file:'bad',loaded:NaN});assert.equal(p.snapshot().loaded,90);
 p.update({file:'a',loaded:0,total:100});assert.equal(p.snapshot().loaded,40); // retry starts a new transfer, not invented completed bytes
});
test('reload resumes only prior consent for this living identity and exact qualified pack',()=>{
 const mind={id:'player',life:{lifeState:'ALIVE'}},record={mindlingId:'player',pack:MODEL_PACK,status:'pending'};
 assert.equal(pendingAwakening(record,mind,MODEL_PACK,true),true);
 for(const altered of [{...record,status:'native'},{...record,mindlingId:'other'},{...record,pack:'old'}])assert.equal(pendingAwakening(altered,mind,MODEL_PACK,true),false);
 assert.equal(pendingAwakening(record,mind,MODEL_PACK,false),false);assert.equal(pendingAwakening(record,{...mind,life:{lifeState:'DECEASED'}},MODEL_PACK,true),false);
});
