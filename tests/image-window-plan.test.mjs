import {test} from 'node:test';import assert from 'node:assert/strict';
import {matchImageWindows,imageSequenceState,imageWindowMedia,imageWindowSignature} from '../src/image-window-plan.mjs';
import {projectStoryboard} from '../src/storyboard.mjs';
const caption=(text,startMs,endMs)=>({id:String(startMs),clipId:'voice',startMs,endMs,words:[{text,startMs,endMs,accent:false}],topPct:88});
const asset=(id,term)=>({id,kind:'image',src:`broll-assets/${id}.jpg`,label:id,width:1200,height:800,keywords:[term]});
function fixture(term='空气净化器'){return {clips:[{id:'voice',src:'clips/synthetic.mp4',inSec:0,outSec:20,speed:1}],captions:[caption(`今天介绍${term}。`,1000,3500),caption('先看整体。',3600,6500),caption('然后看细节。',7000,10500)],brollAssets:[asset('overview',term),asset('detail',term)],presentation:{theme:'classic',format:'landscape',chapters:[]},meta:{fps:30}};}
test('same component plans unrelated topics from registered words, not product-specific offsets',()=>{
 for(const term of ['空气净化器','地图工具','烘焙配方','Atlas']){const state=fixture(term),before=JSON.stringify(state),out=matchImageWindows(state);assert.equal(out.scenes.length,1);const s=out.scenes[0];assert.equal(s.media.sequence.length,2);assert.deepEqual(s.imageWindow.matchedTerms,[term]);assert.equal(s.media.sequence[1].atMs,6000);assert.equal(s.clipInstanceId,'voice');assert.equal(JSON.stringify(state),before);}
});
test('no invented image, duplicate image, removed words or unrelated explicit manual scene',()=>{
 const state=fixture();assert.equal(matchImageWindows({...state,brollAssets:[]}).scenes.length,0);
 assert.equal(matchImageWindows({...state,captions:[caption('今天散步。',1000,9000)]}).scenes.length,0);
 assert.equal(matchImageWindows({...state,clips:[{...state.clips[0],inSec:2}]}).scenes.length,0);
 const duplicate={...state,brollAssets:[state.brollAssets[0],{...state.brollAssets[0],id:'duplicate'}]};assert.equal(matchImageWindows(duplicate).scenes[0].media.sequence.length,1);
 assert.equal(matchImageWindows({...state,presentation:{...state.presentation,scenes:[{id:'manual',src:'clips/synthetic.mp4',startMs:0,endMs:10000}]}}).scenes.length,0);
});
test('pictures only match word boundaries and sufficient real reading time',()=>{
 const state=fixture('REA');state.captions[0]=caption('Create a new file.',1000,3500);assert.equal(matchImageWindows(state).scenes.length,0);
 const fast={...fixture(),clips:[{...fixture().clips[0],speed:2}]};assert.equal(matchImageWindows(fast).scenes[0].media.sequence.length,1);
});
test('handoff exposes both real images over an opaque outgoing plane and no future image flash',()=>{
 const media=imageWindowMedia([asset('a','x'),asset('b','x')],10000,{switchTimes:[5000],transitionMs:400});
 assert.deepEqual(imageSequenceState(media,4999).map(x=>x.item.id),['a']);const cross=imageSequenceState(media,5200);assert.equal(cross.length,2);assert.equal(cross[0].opacity,1);assert.equal(cross[1].opacity,.5);assert.equal(cross[1].elapsed,200);assert.deepEqual(imageSequenceState(media,5400).map(x=>x.item.id),['b']);
});
test('same-source replay, speed and timeline reorder retain instance ownership and source phase',()=>{
 const state=fixture(),s=matchImageWindows(state).scenes[0],clips=[{...state.clips[0],id:'replay',outSec:2},{...state.clips[0],speed:2}];
 const out=projectStoryboard([s],clips,30);assert.equal(out.length,1);assert.equal(out[0].clipId,'voice');assert.equal(out[0].startMs,2500);assert.equal(out[0].speed,2);
 assert.notEqual(imageWindowSignature(state),imageWindowSignature({...state,captions:[]}));
});
test('case variants share the same registered group and project switches invalidate pending reads',()=>{
 const state=fixture('Atlas');state.brollAssets[1].keywords=['atlas'];assert.equal(matchImageWindows(state).scenes[0].media.sequence.length,2);
 assert.notEqual(imageWindowSignature({...state,projectId:'a'}),imageWindowSignature({...state,projectId:'b'}));assert.throws(()=>imageWindowMedia([],1000));
});
test('tiny thumbnails are not enlarged as reading windows',()=>{
 const state=fixture();state.brollAssets=state.brollAssets.map(a=>({...a,width:160,height:70}));assert.equal(matchImageWindows(state).scenes.length,0);
});
