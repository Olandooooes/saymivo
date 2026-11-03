import test from 'node:test';import assert from 'node:assert/strict';
import {applyAutocutProject} from '../src/apply-autocut-project.mjs';
import {pauseCuts,selectedPausePlan} from '../src/pause-review.mjs';
const clip={id:'voice',src:'clips/synthetic.mp4',inSec:0,outSec:10,sourceDurationSec:10,speed:1.25};
const project=()=>({clips:[clip],captions:[{id:'cue',clipId:'voice',startMs:1000,endMs:9000,words:[{text:'前句',startMs:1000,endMs:2000},{text:'尾句',startMs:7000,endMs:9000}]}],brolls:[{id:'image',clipId:'voice',startMs:1000,endMs:8000}],presentation:{scenes:[{id:'scene',clipId:'voice',startMs:1000,endMs:9000}],chapters:[{id:'chapter',clipId:'voice',startMs:7000}]},music:null,accentColor:'#fff'});
const plan=[{id:'voice',segments:[{inSec:.5,outSec:3},{inSec:6,outSec:9.5}]}];
test('pause application preserves both spoken cue fragments, source token times, broll and animation phase',()=>{
 const p=project(),before=structuredClone(p),out=applyAutocutProject(p,plan);
 assert.deepEqual(p,before);assert.equal(out.clips.length,2);assert.equal(out.captions.length,2);
 assert.deepEqual(out.captions.map(c=>c.words.map(w=>w.text)),[['前句'],['尾句']]);
 assert.equal(out.captions[1].clipId,out.clips[1].id);assert.equal(out.captions[1].words[0].startMs,7000);
 assert.equal(out.brolls.length,2);assert.equal(out.brolls[1].clipId,out.clips[1].id);
 assert.deepEqual(out.presentation.scenes.map(s=>[s.startMs,s.endMs]),[[1000,9000],[1000,9000]]);
 assert.equal(out.presentation.chapters[0].clipId,out.clips[1].id);
});
test('pause decisions restore exact deselected gaps including source edges',()=>{
 const cuts=pauseCuts([clip],plan);assert.equal(cuts.length,3);
 assert.deepEqual(selectedPausePlan([clip],cuts,cuts.map(c=>c.id)),plan);
 assert.deepEqual(selectedPausePlan([clip],cuts,[cuts[1].id]),[{id:'voice',segments:[{inSec:0,outSec:3},{inSec:6,outSec:10}]}]);
 assert.deepEqual(selectedPausePlan([clip],cuts,[]),[]);
});
test('unsafe, overlapping, foreign and sub-frame plans fail before mutation',()=>{
 const p=project();for(const rows of [ [{id:'wrong',segments:plan[0].segments}], [{id:'voice',segments:[{inSec:-1,outSec:2}]}], [{id:'voice',segments:[{inSec:0,outSec:4},{inSec:3,outSec:5}]}], [{id:'voice',segments:[{inSec:1,outSec:1.001}]}], [...plan,...plan] ])assert.throws(()=>applyAutocutProject(p,rows));
 assert.equal(p.clips.length,1);
});
test('repeated source instances remain distinct and minted ids avoid existing ids',()=>{
 const p=project();p.clips.push({...clip,id:'voice-pause1'});const out=applyAutocutProject(p,plan);
 assert.equal(new Set(out.clips.map(c=>c.id)).size,3);assert.equal(out.clips[2].id,'voice-pause1');assert.equal(out.clips[1].id,'voice-pause2');
});
