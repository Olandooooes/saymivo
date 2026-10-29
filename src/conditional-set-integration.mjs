import {persistentMotionProtectedRects} from './persistent-motion.mjs';
const raw=s=>{const{dynamicMotion,visualPreset,...rest}=s;return rest;};
/** Shared by editor renderer and saved/export validation. The person reservation
 * comes from the actual authored/default window, never a parameter checkbox. */
export function conditionalSetCurrentContext(scene,projection,sourceIdentity,assets,clips,fps,captions,viewport){
 const original=raw(scene);let people=[];try{people=persistentMotionProtectedRects(original,viewport);}catch{}
 const person=people[0]??{x:0,y:0,width:0,height:0};
 return{rawScene:original,sourceIdentity:sourceIdentity??{kind:'video',src:original.src,sha256:'',width:0,height:0,durationSec:0},assets:(assets??[]).filter(a=>a.kind==='image').map(a=>({kind:'image',src:a.src,sha256:a.sha256,width:a.width,height:a.height})),clips,fps,captions:captions??[],viewport,speaker:{known:true,rect:person},...(projection?{projection:raw(projection)}:{})};
}
