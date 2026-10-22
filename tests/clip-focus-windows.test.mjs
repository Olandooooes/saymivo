import test from 'node:test';
import assert from 'node:assert/strict';
import {validFocusRect,retainedFocusWindows,focusWindowSample,captionsForVisibleClips} from '../src/clip-focus-windows.mjs';

const sourceRect={x:.25,y:.25,w:.5,h:.5};
const targetRect={x:.1,y:.1,w:.4,h:.4};
const clip={id:'screen',src:'clips/screen.mp4',inSec:10,outSec:20,sourceDurationSec:30,sourceWidth:1920,sourceHeight:1080,speed:2,muted:false,volume:.8};
const window=(patch={})=>({id:'detail',startSec:11,endSec:15,sourceRect:{...sourceRect},targetRect:{...targetRect},...patch});
const close=(actual,expected,message)=>assert.ok(Math.abs(actual-expected)<1e-8,`${message??'value'}: ${actual} != ${expected}`);
const deepFreeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(deepFreeze);Object.freeze(value);}return value;};

test('focus rectangles require finite number coordinates fully inside normalized bounds',()=>{
 for(const rect of [sourceRect,{x:0,y:0,w:1,h:1},{x:.9,y:.8,w:.1,h:.2}])assert.equal(validFocusRect(rect),true);
 for(const rect of [null,undefined,[],{}, {...sourceRect,x:'0.25'},{...sourceRect,w:true},{...sourceRect,x:NaN},{...sourceRect,y:Infinity},{...sourceRect,x:-.00001},{...sourceRect,w:0},{...sourceRect,h:-1},{...sourceRect,x:.8,w:.3},{...sourceRect,y:.9,h:.2}])assert.equal(validFocusRect(rect),false,JSON.stringify(rect));
});

test('retained windows clamp to the retained source range and duration without mutating the original',()=>{
 const original=deepFreeze({...clip,sourceDurationSec:18,focusWindows:[window({id:'lead',startSec:8,endSec:12}),window({id:'inside',startSec:12,endSec:16}),window({id:'tail',startSec:17,endSec:25}),window({id:'removed-before',startSec:0,endSec:9}),window({id:'removed-after',startSec:20,endSec:25}),window({id:'inside',startSec:16,endSec:17}),window({id:'reversed',startSec:14,endSec:13}),window({id:'empty',startSec:12,endSec:12}),window({id:'infinite',endSec:Infinity}),window({id:'bad-source',sourceRect:{...sourceRect,x:-.1}}),window({id:'bad-target',targetRect:{...targetRect,w:1}})]});
 const before=structuredClone(original),retained=retainedFocusWindows(original);
 assert.deepEqual(retained.map(({id,startSec,endSec})=>({id,startSec,endSec})),[{id:'lead',startSec:10,endSec:12},{id:'inside',startSec:12,endSec:16},{id:'tail',startSec:17,endSec:18}]);
 assert.deepEqual(original,before);
 assert.equal(retained[1].startSec,12,'later duplicate does not replace the first valid window');
 assert.deepEqual(retainedFocusWindows({...clip,focusWindows:undefined}),[]);
 assert.deepEqual(retainedFocusWindows({...clip,inSec:20,outSec:10,focusWindows:[window()]}),[]);
 assert.deepEqual(retainedFocusWindows({...clip,inSec:NaN,focusWindows:[window()]}),[]);
});

test('clamping also respects source zero and ignores an invalid duplicate before the first valid entry',()=>{
 const result=retainedFocusWindows({...clip,inSec:-3,outSec:5,sourceDurationSec:4,focusWindows:[window({id:'same',startSec:-2,endSec:3,sourceRect:{...sourceRect,w:0}}),window({id:'same',startSec:-2,endSec:3}),window({id:'last',startSec:3,endSec:8})]});
 assert.deepEqual(result.map(w=>[w.id,w.startSec,w.endSec]),[['same',0,3],['last',3,4]]);
});

test('sampling maps clip-local frames into absolute source seconds and permanently mutes the ROI playback',()=>{
 const input=deepFreeze({...clip}),focus=deepFreeze(window()),before=structuredClone({input,focus});
 const sample=focusWindowSample(input,focus,30,30,1920,1080);
 assert.ok(sample);close(sample.sourceSec,12);assert.equal(sample.opacity,1);
 assert.deepEqual(sample.playback,{trimBefore:300,trimAfter:600,playbackRate:2,muted:true,volume:0});
 assert.deepEqual({input,focus},before);
 assert.equal(focusWindowSample(input,focus,14,30,1920,1080),null,'before source11 is outside the window');
 assert.ok(focusWindowSample(input,focus,15,30,1920,1080),'source start is inclusive even when opacity is zero');
 assert.equal(focusWindowSample(input,focus,75,30,1920,1080),null,'source end15 is exclusive');
});

test('playback trim uses rounded retained timeline duration and defaults to normal speed',()=>{
 const fractional={...clip,inSec:10.01,outSec:15.55,speed:1.25},focus=window({startSec:10.01,endSec:15.55});
 const sample=focusWindowSample(fractional,focus,60,30,1920,1080);
 close(sample.sourceSec,12.51);
 assert.deepEqual(sample.playback,{trimBefore:300,trimAfter:466,playbackRate:1.25,muted:true,volume:0},'out trim follows rounded133timeline frames,not a separately rounded source end');
 const normal=focusWindowSample({...clip,speed:undefined},window({startSec:10,endSec:20}),30,30,1920,1080);
 close(normal.sourceSec,11);assert.equal(normal.playback.playbackRate,1);assert.equal(normal.playback.trimAfter,600);
});

test('same-aspect ROI fills its target box with the full source shifted behind the clip',()=>{
 const sample=focusWindowSample(clip,window(),30,30,1920,1080);
 for(const [key,value]of Object.entries({left:192,top:108,width:768,height:432}))close(sample.box[key],value,'box.'+key);
 for(const [key,value]of Object.entries({left:-384,top:-216,width:1536,height:864}))close(sample.crop[key],value,'crop.'+key);
});

test('a narrow ROI is contained without stretching and its clip edges exclude neighbouring source pixels',()=>{
 const focus=window({sourceRect:{x:.1,y:.25,w:.2,h:.5},targetRect:{x:.1,y:.1,w:.8,h:.8}}),sample=focusWindowSample(clip,focus,30,30,1920,1080);
 for(const [key,value]of Object.entries({left:652.8,top:108,width:614.4,height:864}))close(sample.box[key],value,'box.'+key);
 for(const [key,value]of Object.entries({left:-307.2,top:-432,width:3072,height:1728}))close(sample.crop[key],value,'crop.'+key);
 close(sample.box.width/sample.box.height,(focus.sourceRect.w*clip.sourceWidth)/(focus.sourceRect.h*clip.sourceHeight),'ROI aspect ratio');
 close(sample.crop.left+focus.sourceRect.x*sample.crop.width,0,'ROI left maps exactly to clip left');
 close(sample.crop.top+focus.sourceRect.y*sample.crop.height,0,'ROI top maps exactly to clip top');
 close(sample.crop.left+(focus.sourceRect.x+focus.sourceRect.w)*sample.crop.width,sample.box.width,'ROI right maps exactly to clip right');
 close(sample.crop.top+(focus.sourceRect.y+focus.sourceRect.h)*sample.crop.height,sample.box.height,'ROI bottom maps exactly to clip bottom');
});

test('a wide ROI is vertically centred inside the target without exposing adjacent rows',()=>{
 const focus=window({sourceRect:{x:.1,y:.1,w:.8,h:.2},targetRect:{x:.2,y:.2,w:.5,h:.5}}),sample=focusWindowSample(clip,focus,30,30,1920,1080);
 for(const [key,value]of Object.entries({left:384,top:418.5,width:960,height:135}))close(sample.box[key],value,'box.'+key);
 close(sample.crop.top+focus.sourceRect.y*sample.crop.height,0);
 close(sample.crop.top+(focus.sourceRect.y+focus.sourceRect.h)*sample.crop.height,135);
});

test('fade durations follow output time at changed speed and shrink enough for a short window to become readable',()=>{
 const focus=window();
 const entering=focusWindowSample(clip,focus,18,30,1920,1080),settled=focusWindowSample(clip,focus,23,30,1920,1080),leaving=focusWindowSample(clip,focus,72,30,1920,1080);
 assert.ok(entering.opacity>0&&entering.opacity<1);assert.equal(settled.opacity,1);assert.ok(leaving.opacity>0&&leaving.opacity<1);
 const short=window({startSec:13,endSec:13.2});
 assert.equal(focusWindowSample(clip,short,155,100,1920,1080).opacity,1,'100ms output window has a fully visible middle,with each fade capped at40%');
 assert.ok(focusWindowSample(clip,short,151,100,1920,1080).opacity<1);
 assert.ok(focusWindowSample(clip,short,159,100,1920,1080).opacity<1);
 assert.equal(focusWindowSample(clip,short,160,100,1920,1080),null);
});

test('invalid dimensions, source windows and sampling inputs produce no overlay',()=>{
 for(const patch of [{sourceWidth:undefined},{sourceHeight:0},{sourceWidth:Infinity},{speed:0},{speed:-1},{speed:NaN}])assert.equal(focusWindowSample({...clip,...patch},window(),30,30,1920,1080),null);
 for(const focus of [window({sourceRect:{...sourceRect,w:0}}),window({targetRect:{...targetRect,x:1}}),window({startSec:NaN}),window({endSec:11}),window({startSec:19,endSec:18})])assert.equal(focusWindowSample(clip,focus,30,30,1920,1080),null);
 for(const [frame,fps,width,height]of [[NaN,30,1920,1080],[30,0,1920,1080],[30,30,0,1080],[30,30,1920,Infinity]])assert.equal(focusWindowSample(clip,window(),frame,fps,width,height),null);
});

test('caption visibility filters only explicitly hidden clip IDs and preserves the editable source transcript',()=>{
 const captions=deepFreeze([{id:'screen-cap',clipId:'screen',words:[{text:'屏幕内已有字幕',startMs:0,endMs:1000}]},{id:'other-cap',clipId:'other',words:[{text:'另一原片',startMs:0,endMs:1000}]},{id:'unknown-cap',clipId:'unknown',words:[]},{id:'legacy-cap',words:[]}]),before=structuredClone(captions);
 const visible=captionsForVisibleClips(captions,[{...clip,showCaptions:false},{...clip,id:'other',showCaptions:true}]);
 assert.deepEqual(visible.map(c=>c.id),['other-cap','unknown-cap','legacy-cap']);assert.equal(visible[0],captions[1]);assert.deepEqual(captions,before);
 assert.deepEqual(captionsForVisibleClips(captions,[clip]),captions,'old clips retain their existing subtitle behavior');
 assert.deepEqual(captionsForVisibleClips(captions,[{...clip,showCaptions:true}]),captions);
 assert.deepEqual(captionsForVisibleClips(captions,[]),captions);
});
