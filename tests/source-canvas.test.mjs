import test from 'node:test';
import assert from 'node:assert/strict';
import {validSourceCanvas,sourceCanvasForClip,presentationSize,knowledgePlan} from '../src/presentation.mjs';

const clip={id:'source',src:'clips/screen.mp4',inSec:0,outSec:10,sourceDurationSec:20,sourceWidth:3226,sourceHeight:2160};
const captions=[{id:'source-cue',clipId:'source',startMs:1000,endMs:3000,topPct:80,scale:1,words:[{text:'搜索资料、',startMs:1000,endMs:2000},{text:'打开网页。',startMs:2000,endMs:3000}]}];
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};

test('source canvas accepts only even integer dimensions within the supported range',()=>{
 for(const canvas of [{width:320,height:320},{width:7680,height:7680},{width:1614,height:1080},{width:1080,height:1920}])assert.equal(validSourceCanvas(canvas),true);
 for(const canvas of [undefined,null,[],{}, {width:'1920',height:1080},{width:1920,height:NaN},{width:Infinity,height:1080},{width:1920.5,height:1080},{width:1921,height:1080},{width:1920,height:1081},{width:318,height:1080},{width:1920,height:318},{width:7682,height:1080},{width:1920,height:7682}])assert.equal(validSourceCanvas(canvas),false,JSON.stringify(canvas));
});

test('source dimensions derive an even canvas at1080height without mutating the clip',()=>{
 const original=freeze({...clip}),before=structuredClone(original);
 assert.deepEqual(sourceCanvasForClip(original),{width:1614,height:1080},'3226×2160 source rounds its half-resolution odd width1613 up to an even1614');
 assert.deepEqual(sourceCanvasForClip({...clip,sourceWidth:1920,sourceHeight:1080}),{width:1920,height:1080});
 assert.deepEqual(sourceCanvasForClip({...clip,sourceWidth:1080,sourceHeight:1920}),{width:608,height:1080});
 assert.deepEqual(sourceCanvasForClip({...clip,sourceWidth:640,sourceHeight:2160}),{width:320,height:1080});
 assert.deepEqual(sourceCanvasForClip({...clip,sourceWidth:15360,sourceHeight:2160}),{width:7680,height:1080});
 assert.deepEqual(original,before);
});

test('missing,nonfinite and unsupported extreme source dimensions cannot produce an unsafe canvas',()=>{
 for(const input of [undefined,null,{}, {...clip,sourceWidth:undefined},{...clip,sourceHeight:0},{...clip,sourceWidth:-1},{...clip,sourceWidth:'3226'},{...clip,sourceHeight:NaN},{...clip,sourceWidth:Infinity},{...clip,sourceWidth:20000,sourceHeight:1000},{...clip,sourceWidth:100,sourceHeight:1000}])assert.equal(sourceCanvasForClip(input),null);
});

test('source presentation size honors its own canvas and safely falls back while legacy sizing stays unchanged',()=>{
 const source=freeze({format:'source',canvas:{width:1614,height:1080}}),before=structuredClone(source);
 assert.deepEqual(presentationSize(source),{width:1614,height:1080});assert.deepEqual(source,before);
 for(const canvas of [undefined,null,{width:1613,height:1080},{width:320,height:9999}])assert.deepEqual(presentationSize({format:'source',canvas}),{width:1920,height:1080});
 assert.deepEqual(presentationSize({format:'landscape',canvas:{width:1614,height:1080}}),{width:1920,height:1080});
 assert.deepEqual(presentationSize({format:'portrait'}),{width:1080,height:1920});
 assert.deepEqual(presentationSize(),{width:1080,height:1920});assert.deepEqual(presentationSize({}),{width:1080,height:1920});
});

test('knowledgePlan preserves explicit source format and canvas through JSON persistence without changing speech or inputs',()=>{
 const caps=freeze(structuredClone(captions)),clips=freeze([{...clip}]),options=freeze({format:'source',canvas:{width:1800,height:1200},title:'原画幅'}),before=structuredClone({caps,clips,options});
 const planned=knowledgePlan(caps,clips,options),stored=JSON.parse(JSON.stringify(planned));
 assert.equal(planned.presentation.format,'source');assert.deepEqual(planned.presentation.canvas,{width:1800,height:1200});assert.deepEqual(presentationSize(stored.presentation),{width:1800,height:1200});
 assert.equal(stored.presentation.format,'source');assert.deepEqual(stored.captions[0].words,caps[0].words);assert.deepEqual([stored.captions[0].clipId,stored.captions[0].startMs,stored.captions[0].endMs],['source',1000,3000]);assert.deepEqual({caps,clips,options},before);
});

test('knowledgePlan derives source geometry from the first clip and uses real geometry for subtitle placement',()=>{
 const derived=knowledgePlan(captions,[clip],{format:'source'});
 assert.equal(derived.presentation.format,'source');assert.deepEqual(derived.presentation.canvas,{width:1614,height:1080});assert.equal(derived.captions[0].topPct,91);assert.equal(derived.captions[0].scale,.72,'source widescreen must not fall through to portrait subtitle scaling');
 const explicitPortrait=knowledgePlan(captions,[clip],{format:'source',canvas:{width:1080,height:1920}});
 assert.equal(explicitPortrait.presentation.format,'source');assert.equal(explicitPortrait.captions[0].topPct,86);assert.equal(explicitPortrait.captions[0].scale,.9);
 const derivedPortrait=knowledgePlan(captions,[{...clip,sourceWidth:1080,sourceHeight:1920}],{format:'source'});
 assert.deepEqual(derivedPortrait.presentation.canvas,{width:608,height:1080});assert.equal(derivedPortrait.captions[0].topPct,86);
 const invalidExplicit=knowledgePlan(captions,[clip],{format:'source',canvas:{width:1613,height:1080}});
 assert.deepEqual(invalidExplicit.presentation.canvas,{width:1614,height:1080});
 const firstUnknown=knowledgePlan(captions,[{...clip,sourceWidth:undefined},{...clip,id:'later'}],{format:'source'});
 assert.equal(firstUnknown.presentation.format,'source');assert.deepEqual(presentationSize(firstUnknown.presentation),{width:1920,height:1080},'do not silently take an unrelated later clip ratio');
});

test('source independent planning conservatively keeps existing recording geometry while landscape automatic diagrams still work',()=>{
 const source=knowledgePlan(captions,[clip],{format:'source',style:'reference',independentScenes:true});
 assert.equal(source.presentation.format,'source');assert.deepEqual(source.presentation.canvas,{width:1614,height:1080});assert.equal(source.captions[0].topPct,91);
 const circleLayouts=new Set(['slide','spotlight','cards','flow','demo','outro','overview','stack','route','gallery']);
 assert.ok((source.presentation.scenes??[]).every(scene=>!scene.window&&!circleLayouts.has(scene.layout)),'do not introduce an automatic circular narrator over a recording that already embeds its person');
 const landscape=knowledgePlan(captions,[clip],{format:'landscape',style:'reference',independentScenes:true});
 assert.equal(landscape.presentation.format,'landscape');assert.ok(landscape.presentation.scenes.some(scene=>scene.layout==='flow'),'original landscape rule still produces the spoken two-action flow');
 assert.deepEqual(presentationSize(landscape.presentation),{width:1920,height:1080});
});
