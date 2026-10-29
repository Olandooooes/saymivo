import {personMatteFrame} from '../src/person-matte.mjs';

export const matteSceneSnapshot=scene=>({id:scene.id,clipId:scene.clipId,src:scene.src,startMs:scene.startMs,endMs:scene.endMs});
export const sameMatteScene=(a,b)=>['id','clipId','src','startMs','endMs'].every(key=>a?.[key]===b?.[key]);

// A generated asset is not a successful editor binding. Use the renderer's
// actual frame lookup at both boundaries rather than a second loose tolerance.
export function validateMatteBinding(matte,original,current){
 if(!sameMatteScene(original,current))return {ok:false,error:'这段原片或时间已改变，请重新生成人物分层。'};
 if(!original?.src||![original.startMs,original.endMs].every(Number.isFinite)||original.endMs<=original.startMs)return {ok:false,error:'场景原片范围无效，未绑定。'};
 if(!matte||matte.src!==original.src||!/^[a-f0-9]{64}$/i.test(matte.sourceSha256??'')||
   typeof matte.prefix!=='string'||!/^broll-assets\/[\w/-]+$/.test(matte.prefix)||
   !Number.isInteger(matte.count)||matte.count<1||!Number.isFinite(matte.fps)||matte.fps<=0||
   ![matte.width,matte.height].every(n=>Number.isInteger(n)&&n>0)||
   !Array.isArray(matte.timesMs)||matte.timesMs.length!==matte.count||
   !matte.timesMs.every((n,i,a)=>Number.isFinite(n)&&n>=0&&(!i||n>a[i-1]))||
   !Number.isFinite(matte.sourceStartMs)||Math.abs(matte.sourceStartMs-matte.timesMs[0])>.001||
   !Number.isFinite(matte.endMs)||matte.endMs<=matte.timesMs.at(-1)||matte.endMs>matte.timesMs.at(-1)+1000/matte.fps+.001){
  return {ok:false,error:'分层缺少可核验的原片、尺寸或逐帧时间信息，未绑定。'};
 }
 if(!personMatteFrame(matte,original.startMs)||!personMatteFrame(matte,Math.max(original.startMs,original.endMs-1)))return {ok:false,error:'人物分层没有覆盖本场景的完整源时间，未绑定。'};
 return {ok:true,matte};
}
