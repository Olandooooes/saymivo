import test from 'node:test';import assert from 'node:assert/strict';
import {sceneSpeakerLayout,validateStoryboard} from '../src/storyboard.mjs';import {speakerBox} from '../src/presentation.mjs';
test('airy side titles retain a full-width natural shot rather than a narrow face crop',()=>{
 const scene={id:'s',clipId:'a',startMs:0,endMs:3000,layout:'chapter',title:'Agent',titleTreatment:'airy'};
 assert.equal(sceneSpeakerLayout(scene),'editorial');
 const box=speakerBox(sceneSpeakerLayout(scene),1920,1080);assert.equal(box.width,1920);assert.equal(box.left,1920*.17);assert.ok(box.height>1000);
 assert.equal(sceneSpeakerLayout({...scene,titleTreatment:undefined}),'headline');
 assert.equal(sceneSpeakerLayout({...scene,layout:'headline',headlinePosition:'top'}),'speaker');
 assert.deepEqual(validateStoryboard([scene],[{id:'a',inSec:0,outSec:3}]),[]);
 assert.ok(validateStoryboard([{...scene,titleTreatment:'unknown'}],[{id:'a',inSec:0,outSec:3}]).some(x=>x.message==='未知标题画面风格'));
});
