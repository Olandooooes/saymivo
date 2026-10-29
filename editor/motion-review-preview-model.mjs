import {dynamicMotionLibrary} from '../src/dynamic-motion-library.mjs';
import {dynamicMotionEnvironmentFromState,createSceneDynamicMotionDraft,previewSceneDynamicMotion,validateSavedSceneDynamicMotion,sceneDynamicMotionDraftKey} from '../src/scene-dynamic-motion.mjs';
import {dynamicEditorProjectionWindow,dynamicEditorRawScene} from './dynamic-editor-model.mjs';

/** Only the preview Player is controlled. Rates never enter composition props. */
export function motionReviewPlaybackCommand(command){
 if(!command||!Number.isFinite(command.id)||!['play','pause','replay'].includes(command.action))return{ok:false,issues:['播放指令需要有限数字ID，以及 play、pause 或 replay 操作。']};
 if(command.rate!==undefined&&![0.5,0.75,1].includes(command.rate))return{ok:false,issues:['预览倍速只支持0.5、0.75或1。']};
 return{ok:true,command:{id:command.id,action:command.action,...(command.rate!==undefined?{rate:command.rate}:{})},issues:[]};
}

/** Observe the installed Remotion Player's real event/ref API. This is a
 * playback diagnostic, never native renderer approval or a review receipt. */
export function observeMotionReviewPlayback(player,{entryId,key,fps,inFrame,outFrame,onState,onRate}){
 let disposed=false,rate=1,waiting=false,lastCommandId=null,issues=[];
 const emit=()=>{if(disposed)return;const frame=player.getCurrentFrame();onState({entryId,previewKey:key,available:true,frame:Number.isFinite(frame)?frame:null,fps,currentTimeSec:Number.isFinite(frame)?frame/fps:null,inFrame,outFrame,playing:player.isPlaying(),muted:player.isMuted(),rate,waiting,lastCommandId,issues:[...issues]});};
 const events={play:emit,pause:emit,ended:emit,frameupdate:emit,seeked:emit,mutechange:emit,ratechange:event=>{rate=event.detail.playbackRate;onRate(rate);emit();},waiting:()=>{waiting=true;emit();},resume:()=>{waiting=false;emit();},error:event=>{issues=[event.detail.error?.message??'实际播放器播放失败。'];emit();}};
 for(const[name,listener]of Object.entries(events))player.addEventListener(name,listener);
 emit();
 return{
  command(value){
   if(disposed)return{ok:false,issues:['播放器已卸载，本条指令未执行。']};
   const checked=motionReviewPlaybackCommand(value);if(!checked.ok){issues=checked.issues;emit();return checked;}
   const command=checked.command;if(lastCommandId===command.id)return{ok:true,duplicate:true,issues:[]};
   lastCommandId=command.id;issues=[];
   try{
    if(command.rate!==undefined)onRate(command.rate);
    if(command.action==='pause')player.pause();
    else if(command.action==='replay'){player.pause();player.seekTo(inFrame);player.play();}
    else player.play();
    emit();return{ok:true,issues:[]};
   }catch(error){issues=[error instanceof Error?error.message:String(error)];emit();return{ok:false,issues:[...issues]};}
  },
  dispose(){disposed=true;for(const[name,listener]of Object.entries(events))player.removeEventListener(name,listener);},
 };
}

/** Ephemeral props only. No store, project endpoint, apply helper or receipt. */
export function prepareMotionReviewPreview(fixture){
 if(!fixture)return{status:'unavailable',issues:['请选择一个动效示例。']};
 const issues=[...(fixture.issues??[])],entry=dynamicMotionLibrary.find(e=>e.id===fixture.entryId);
 if(fixture.status!=='configured')issues.push('该示例尚未具备可呈现的数据或素材。');
 if(!entry||entry.kind!==fixture.config?.kind||entry.variant!==fixture.config?.variant)issues.push('示例没有对应当前真实动效库类型。');
 if(!fixture.scene||!fixture.sourceIdentity||!Array.isArray(fixture.clips)||!fixture.clips.length)issues.push('缺少当前原场、真实来源身份或保留片段。');
 if(issues.length)return{status:'unavailable',issues:[...new Set(issues)]};
 try{
  const raw=dynamicEditorRawScene(fixture.scene),presentation={theme:'knowledge',format:'landscape',style:'reference',displayFont:'source-han',chapters:[],...(fixture.presentation??{}),scenes:[raw]},fps=fixture.meta?.fps;
  if(!Number.isFinite(fps)||fps<=0)throw Error('缺少明确有效帧率。');
  const window=dynamicEditorProjectionWindow(raw,fixture.clips,fps);if(!window)throw Error('本场没有可播放的真实保留范围。');
  const state={clips:fixture.clips,presentation,accentColor:fixture.accentColor??'#9db8ee',meta:{fps,width:fixture.meta.width,height:fixture.meta.height,durationInFrames:window.durationInFrames},captions:fixture.captions??[],brolls:fixture.brolls??[],brollAssets:fixture.brollAssets??[],music:fixture.music??null};
  const environment=dynamicMotionEnvironmentFromState(state,{sourceIdentity:fixture.sourceIdentity,assets:fixture.assetIdentities??[],font:{status:'ready'},...(fixture.matteEvidence?{matteEvidence:fixture.matteEvidence}:{}),...(fixture.audioEvidence?{audioEvidence:fixture.audioEvidence}:{})});
  if(environment.viewport.width!==state.meta.width||environment.viewport.height!==state.meta.height)throw Error('示例实际画幅与呈现设置不匹配。');
  const draft=createSceneDynamicMotionDraft(raw,fixture.config,environment),saved=previewSceneDynamicMotion(draft),scene={...raw,dynamicMotion:saved},validation=validateSavedSceneDynamicMotion(scene,environment);
  if(!validation.ok)return{status:'blocked',issues:validation.issues};
  return{status:'prepared',issues:[],entryId:fixture.entryId,fontId:presentation.displayFont,window,key:sceneDynamicMotionDraftKey(draft),inputProps:{clips:state.clips,presentation:{...presentation,scenes:[scene]},accentColor:state.accentColor,captions:state.captions,brolls:state.brolls,brollAssets:state.brollAssets,music:state.music},width:environment.viewport.width,height:environment.viewport.height,fps};
 }catch(error){return{status:'blocked',issues:[error instanceof Error?error.message:'示例尚未具备完整实际参数。']};}
}
