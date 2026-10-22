import fs from 'node:fs';
import path from 'node:path';
import {validateStoryboard} from '../src/storyboard.mjs';
import {overviewComparisonIssues} from '../src/overview-comparison.mjs';
const fields=['title','titleTreatment','embeddedText','personMatte','tags','tagTreatment','folderCloseMs','nodeTimings','mediaFraming','highlights','overviewComparison'];
export function captureSceneDesign(scene){
 const design={};
 for(const key of fields)if(!['nodeTimings','mediaFraming'].includes(key)&&scene[key]!==undefined)design[key]=structuredClone(scene[key]);
 if(scene.media?.src)design.mediaFraming={src:scene.media.src,fit:scene.media.fit??'contain',...(scene.media.camera?{camera:structuredClone(scene.media.camera)}:{}),...(scene.media.kind==='video'&&scene.media.startSec!==undefined?{startSec:scene.media.startSec}:{})};
 if(Object.keys(design).length&&!design.tags)design.tags=[];
 if(scene.nodes?.length)design.nodeTimings=scene.nodes.map((n,index)=>({index,text:n.text,...(n.atMs===undefined?{}:{atMs:n.atMs}),...(n.focusMs===undefined?{}:{focusMs:n.focusMs}),...(n.textCues===undefined?{}:{textCues:structuredClone(n.textCues)})}));
 return Object.keys(design).length?design:null;
}
export function reviewedSceneDesign(target,design,{PUBLIC}={}){
 if(!design||typeof design!=='object'||Array.isArray(design)||Object.keys(design).some(k=>!fields.includes(k)))return {error:'invalid-scene-design'};
 if(design.title!==undefined&&(typeof design.title!=='string'||!design.title.trim()||design.title.length>500))return {error:'invalid-design-title'};
 if(design.tagTreatment!==undefined&&!['kinetic','legacy'].includes(design.tagTreatment))return {error:'invalid-design-tags'};
 if(design.tags!==undefined&&(!Array.isArray(design.tags)||design.tags.length>30))return {error:'invalid-design-tags'};
 if(design.embeddedText&&Object.entries(design.embeddedText).some(([k,v])=>!['backdrop','headline'].includes(k)||typeof v!=='string'||v.length>80))return {error:'invalid-embedded-text'};
 if(design.overviewComparison!==undefined){
  if(target.layout!=='overview'||overviewComparisonIssues(design.overviewComparison,target.endMs-target.startMs).length)return {error:'invalid-design-overview-comparison'};
  if(PUBLIC){
   if(!fs.existsSync(path.join(PUBLIC,'broll-assets')))return {error:'missing-design-overview-comparison'};
   const root=fs.realpathSync(path.join(PUBLIC,'broll-assets'));
   for(const item of [design.overviewComparison.before,design.overviewComparison.after]){
    const file=path.join(PUBLIC,item.src);
    if(!fs.existsSync(file)||!fs.statSync(file).isFile()||!fs.realpathSync(file).startsWith(root+path.sep))return {error:'missing-design-overview-comparison'};
   }
  }
 }
 const matte=design.personMatte;
 if(matte){
  if(!/^broll-assets\/[\w/-]+$/.test(matte.prefix??'')||!Number.isInteger(matte.count)||matte.count<1||matte.count>18000)return {error:'invalid-design-matte'};
  if(matte.timesMs!==undefined&&(!Array.isArray(matte.timesMs)||matte.timesMs.length!==matte.count||matte.timesMs.some((n,i,a)=>!Number.isFinite(n)||n<0||i>0&&n<=a[i-1])))return {error:'invalid-design-matte-times'};
  if(PUBLIC){
   const root=fs.realpathSync(PUBLIC);
   for(let i=0;i<matte.count;i++){
    const file=path.join(PUBLIC,matte.prefix+String(i).padStart(5,'0')+'.png');
    if(!fs.existsSync(file)||!fs.realpathSync(file).startsWith(root+path.sep))return {error:'missing-design-matte'};
   }
  }
 }
 const {nodeTimings,mediaFraming,...patch}=structuredClone(design),scene={...target,...patch};
 if(mediaFraming){
  if(!target.media?.src||mediaFraming.src!==target.media.src||!['contain','cover'].includes(mediaFraming.fit)||Object.keys(mediaFraming).some(k=>!['src','fit','camera','startSec'].includes(k)))return {error:'changed-design-media'};
  if(mediaFraming.camera!==undefined&&(!Array.isArray(mediaFraming.camera)||mediaFraming.camera.length>100||mediaFraming.camera.some(k=>!k||Object.keys(k).some(f=>!['atMs','scale','x','y'].includes(f)))))return {error:'invalid-design-camera'};
  if(mediaFraming.startSec!==undefined){
   const {startSec}=mediaFraming,media=target.media,rate=media.rate??1,duration=media.durationSec,span=(target.endMs-target.startMs)/1000;
   if(media.kind!=='video'||!Number.isFinite(startSec)||startSec<0||!Number.isFinite(rate)||rate<=0)return {error:'invalid-design-media-start'};
   // A nonzero seek needs a known media boundary. Legacy zero-start media
   // without duration metadata retain their previous no-seek behaviour.
   if(duration===undefined){if(startSec!==0)return {error:'unknown-design-media-duration'};}
   else if(!Number.isFinite(duration)||duration<=0||startSec>=duration||
    (media.freezeAtSec!==undefined?(!Number.isFinite(media.freezeAtSec)||media.freezeAtSec<0||media.freezeAtSec>=duration):startSec+span*rate>duration+1e-6))return {error:'out-of-bounds-design-media-start'};
  }
  scene.media={...target.media,fit:mediaFraming.fit,...(mediaFraming.camera===undefined?{}:{camera:mediaFraming.camera}),...(mediaFraming.startSec===undefined?{}:{startSec:mediaFraming.startSec})};
 }
 if(design.highlights!==undefined&&!mediaFraming)return {error:'unbound-design-highlights'};
 if(nodeTimings!==undefined){
  if(!Array.isArray(nodeTimings)||nodeTimings.length!==(target.nodes??[]).length||nodeTimings.some((t,i)=>t.index!==i||t.text!==target.nodes[i].text||Object.keys(t).some(k=>!['index','text','atMs','focusMs','textCues'].includes(k))))return {error:'changed-design-nodes'};
  scene.nodes=target.nodes.map((node,i)=>{const {atMs:_,focusMs:__,textCues:___,...base}=node;return {...base,...(nodeTimings[i].atMs===undefined?{}:{atMs:nodeTimings[i].atMs}),...(nodeTimings[i].focusMs===undefined?{}:{focusMs:nodeTimings[i].focusMs}),...(nodeTimings[i].textCues===undefined?{}:{textCues:nodeTimings[i].textCues})};});
 }
 const clip={id:target.clipId,src:target.src,inSec:target.startMs/1000,outSec:target.endMs/1000};
 if(validateStoryboard([scene],[clip]).length)return {error:'invalid-scene-design'};
 return {scene};
}
