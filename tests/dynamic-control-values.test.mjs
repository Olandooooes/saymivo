import test from 'node:test';
import assert from 'node:assert/strict';
import {dynamicMechanismControls} from '../src/dynamic-mechanism-adapter.mjs';
import {controlFieldValue,newControlValue,parseControlNumber,patchControlRecord,syncControlSourceFields,sourceTokenControlOptions} from '../editor/dynamic-control-values.mjs';
import {sourceTokenTransferControls,sourceTokenTransferIssues} from '../src/source-token-transfer.mjs';

const scene={nodes:[{id:'first',text:'不能省略条件的完整原句',atMs:1800},{id:'second',text:'The full original phrase, with spaces.'}]};
test('new explicit-value forms do not invent counters, bounds, source dimensions or ROI',()=>{
 for(const kind of ['number-counter','bar-group-variant','screenshot-region-focus']){
  const fields=dynamicMechanismControls.find(item=>item.kind===kind).fields;
  const values=newControlValue({type:'record',fields},{scene,newId:()=> 'authored-id'});
  for(const key of ['from','to','sourceWidth','sourceHeight','focusRegion'])assert.equal(values[key],undefined);
  if(kind==='bar-group-variant')assert.deepEqual(values.scale,{min:0});
 }
 assert.deepEqual(newControlValue({type:'node-time-map'},{scene}),{first:1800,second:0});
});
test('changing a bilingual source object restores its exact source text without touching the source',()=>{
 const fields=dynamicMechanismControls.find(item=>item.kind==='bilingual-board-transition').fields.find(field=>field.key==='pairs').itemFields;
 const value={nodeId:'first',fromText:scene.nodes[0].text,toText:'An explicitly authored translation'},snapshot=structuredClone(scene);
 const next=patchControlRecord(fields,value,'nodeId','second',scene);
 assert.equal(next.fromText,scene.nodes[1].text);assert.equal(next.toText,value.toText);assert.deepEqual(scene,snapshot);assert.equal(value.nodeId,'first');
 assert.throws(()=>patchControlRecord(fields,value,'fromText','截短',scene));
});
test('nested lists preserve stable IDs and locked fixed values when ordinary fields change',()=>{
 const fields=dynamicMechanismControls.find(item=>item.kind==='bilingual-board-transition').fields;
 const value={columns:2,pairs:[{id:'stable',nodeId:'first',fromText:'过期原文',toText:'Explicit translation'}]};
 const next=syncControlSourceFields(fields,value,scene);
 assert.equal(next.pairs[0].id,'stable');assert.equal(next.pairs[0].fromText,scene.nodes[0].text);assert.equal(value.pairs[0].fromText,'过期原文');
 const fixed={key:'maskScope',type:'text',fixed:'asset-only'};assert.equal(controlFieldValue(fixed,'whole-output'),'asset-only');assert.throws(()=>patchControlRecord([fixed],{maskScope:'asset-only'},'maskScope','whole-output',scene));
});
test('source-relative seconds convert exactly once and empty input removes a value',()=>{
 assert.deepEqual(parseControlNumber('1.25',{seconds:true}),{ok:true,value:1250});assert.deepEqual(parseControlNumber('  '),{ok:true,value:undefined});
 for(const text of ['Infinity','NaN','0x10','1,000','1.2.3','1e309'])assert.equal(parseControlNumber(text).ok,false);
 assert.equal(parseControlNumber('1.2',{integer:true}).ok,false);
 const next=patchControlRecord([{key:'atMs',type:'source-ms'}],{atMs:1250},'atMs',undefined,scene);assert.ok(!Object.hasOwn(next,'atMs'));
});

const tokenFields=sourceTokenTransferControls.fields,tokenItemFields=tokenFields.find(field=>field.key==='tokens').itemFields,sourceItemFields=tokenFields.find(field=>field.key==='sources').itemFields;
const tokenScene={id:'authored-scene',src:'clips/synthetic.mp4',startMs:0,endMs:30000,nodes:[{id:'node-a',text:'甲👨‍👩‍👧‍👦 e\u0301乙',detail:'完整限制',bullets:['条件必须保留']},{id:'node-b',text:'另一句原话'}]};
const complete=node=>[node.text,node.detail,...(node.bullets??[])].filter(Boolean).join('\n');
function tokenConfig(){return {kind:'source-token-transfer',clock:'scene-source-relative-ms',binding:{sceneId:tokenScene.id,src:tokenScene.src,durationMs:30000},sources:tokenScene.nodes.map((node,index)=>({id:'source-'+index,nodeId:node.id,expectedText:complete(node),rect:{x:.05,y:.1+index*.2,width:.4,height:.1},atMs:0})),tokens:[{id:'stable-token',sourceId:'source-0',range:{start:1,end:2},targetRect:{x:.65,y:.4,width:.2,height:.08},departAtMs:6000,arriveAtMs:7500,control1:{x:.5,y:.12},control2:{x:.6,y:.25}}]};}
test('source-token drafts derive exact node and grapheme copy from actual source IDs, not node IDs',()=>{
 const value=tokenConfig(),snapshot=structuredClone(value),next=syncControlSourceFields(tokenFields,value,tokenScene);
 assert.deepEqual(sourceTokenControlOptions(next,tokenScene).map(option=>option.value),['source-0','source-1']);
 assert.equal(next.tokens[0].nodeId,'node-a');assert.equal(next.tokens[0].text,'👨‍👩‍👧‍👦');assert.equal(next.tokens[0].id,'stable-token');assert.deepEqual(value,snapshot);
 assert.deepEqual(sourceTokenTransferIssues(tokenScene,next),[],'the real native content gate accepts derived fields');
 const range={start:2,end:4},token=patchControlRecord(tokenItemFields,next.tokens[0],'range',range,tokenScene,{rootValue:next}),ranged=patchControlRecord([tokenFields.find(f=>f.key==='tokens')],next,'tokens',[token],tokenScene);
 assert.equal(ranged.tokens[0].text,' e\u0301');assert.deepEqual(sourceTokenTransferIssues(tokenScene,ranged),[]);
 const selected=patchControlRecord(tokenItemFields,ranged.tokens[0],'sourceId','source-1',tokenScene,{rootValue:ranged});assert.equal(selected.nodeId,'node-b');assert.equal(selected.text,'句原');assert.deepEqual(selected.range,range);assert.equal(selected.id,'stable-token');
 for(const key of ['nodeId','text'])assert.throws(()=>patchControlRecord(tokenItemFields,selected,key,'fabricated',tokenScene,{rootValue:ranged}));
});
test('source node changes and current full wording resync tokens without regenerating IDs or ranges',()=>{
 const first=syncControlSourceFields(tokenFields,tokenConfig(),tokenScene),source=patchControlRecord(sourceItemFields,first.sources[0],'nodeId','node-b',tokenScene,{rootValue:first});
 assert.equal(source.expectedText,complete(tokenScene.nodes[1]));
 const changed=patchControlRecord([tokenFields.find(f=>f.key==='sources')],first,'sources',[source,first.sources[1]],tokenScene);
 assert.equal(changed.sources[0].id,'source-0');assert.equal(changed.tokens[0].nodeId,'node-b');assert.equal(changed.tokens[0].text,'一');assert.deepEqual(changed.tokens[0].range,first.tokens[0].range);
 const scene=structuredClone(tokenScene);scene.nodes[0].text='甲🧑🏽‍🚀 e\u0301乙';scene.nodes[0].detail='换词后的全部限制';
 const updated=syncControlSourceFields(tokenFields,first,scene);assert.equal(updated.sources[0].expectedText,complete(scene.nodes[0]));assert.equal(updated.tokens[0].text,'🧑🏽‍🚀');assert.equal(updated.tokens[0].id,first.tokens[0].id);assert.deepEqual(updated.tokens[0].range,first.tokens[0].range);assert.deepEqual(sourceTokenTransferIssues(scene,updated),[]);
});
test('deleted, unknown, duplicate or mismatched sources and invalid ranges clear stale derived fields while native stays blocked',()=>{
 const first=syncControlSourceFields(tokenFields,tokenConfig(),tokenScene);
 const cases=[{...first,sources:[]},{...first,sources:[{...first.sources[0],nodeId:'deleted-node'},first.sources[1]]},{...first,sources:[...first.sources,{...first.sources[0]}]},{...first,tokens:[{...first.tokens[0],sourceId:'node-a'}]},{...first,tokens:[{...first.tokens[0],range:{start:1,end:999}}]},{...first,tokens:[{...first.tokens[0],range:{start:1.5,end:2}}]},{...first,tokens:[{...first.tokens[0],range:{start:4,end:7}}]}];
 for(const value of cases){const next=syncControlSourceFields(tokenFields,value,tokenScene);assert.equal(next.tokens[0].nodeId,undefined);assert.equal(next.tokens[0].text,undefined);assert.equal(next.tokens[0].id,'stable-token');assert.deepEqual(next.tokens[0].range,value.tokens[0].range);assert.ok(sourceTokenTransferIssues(tokenScene,next).includes('token-source-node-mismatch'));}
 const stale={...first,sources:[{...first.sources[0],expectedText:'伪造原文'},first.sources[1]]};assert.equal(sourceTokenControlOptions(stale,tokenScene).some(option=>option.value==='source-0'),false);assert.equal(controlFieldValue(tokenItemFields.find(f=>f.key==='text'),'👨‍👩‍👧‍👦',{scene:tokenScene,siblings:stale.tokens[0],rootValue:stale}),undefined);
 const removedScene={...tokenScene,nodes:[tokenScene.nodes[1]]},removed=syncControlSourceFields(tokenFields,first,removedScene);assert.equal(removed.sources[0].expectedText,'');assert.equal(removed.tokens[0].text,undefined);
});
