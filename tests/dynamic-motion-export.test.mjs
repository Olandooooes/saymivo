import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyDynamicMotionsForExport} from '../server/dynamic-motion-export.mjs';
import {dynamicMotionEnvironmentFromState,createSceneDynamicMotionDraft,previewSceneDynamicMotion} from '../src/scene-dynamic-motion.mjs';

function fixture(){
 const source={src:'clips/synthetic.mp4',sha256:'a'.repeat(64),kind:'video',width:1920,height:1080,durationSec:10},scene={id:'s',clipId:'c',src:source.src,startMs:0,endMs:4000,layout:'cards',title:'完整短句',nodes:[{id:'n',text:'完整短句'}],window:{x:.79,y:.47,size:.17}},props={clips:[{id:'c',src:source.src,inSec:0,outSec:10,speed:1}],presentation:{theme:'knowledge',format:'landscape',chapters:[],scenes:[scene]},accentColor:'#3156b9'},meta={fps:30,width:1920,height:1080,durationInFrames:300};
 const config={kind:'emphasis-phrase',items:[{nodeId:'n',rect:{x:.06,y:.15,width:.55,height:.3},atMs:0,endMs:4000,fromScale:1.08}]},environment=dynamicMotionEnvironmentFromState({...props,meta},{sourceIdentity:source,font:{status:'ready'}}),draft=createSceneDynamicMotionDraft(scene,config,environment);
 props.presentation.scenes=[{...scene,dynamicMotion:previewSceneDynamicMotion(draft)}];
 return {source,props};
}
test('export rechecks actual source identity against the accepted scene environment',async()=>{
 const {source,props}=fixture(),read=[];
 await verifyDynamicMotionsForExport(props,async src=>{read.push(src);return source;});
 assert.deepEqual(read,[source.src]);
});
test('replacement at the same filename rejects old dynamic output before render starts',async()=>{
 const {source,props}=fixture();
 await assert.rejects(verifyDynamicMotionsForExport(props,async()=>({...source,sha256:'b'.repeat(64)})),/重新预览/);
});
test('retained speed, source wording and font changes invalidate export rather than reuse old motion proof',async()=>{
 for(const change of [p=>p.clips[0].speed=2,p=>p.presentation.scenes[0].nodes[0].text='完整条件已更改',p=>p.presentation.displayFont='source-han-heavy']){
  const {source,props}=fixture();change(props);
  await assert.rejects(verifyDynamicMotionsForExport(props,async()=>source),/重新预览/);
 }
});
