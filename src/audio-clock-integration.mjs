import {projectStoryboard,storyboardFrameRange} from './storyboard.mjs';
import {audioClockIssues,audioClockAnalysisIssues} from './audio-clock.mjs';
const finite=Number.isFinite,sha=s=>typeof s==='string'&&/^[a-f0-9]{64}$/i.test(s),local=s=>typeof s==='string'&&s.length&&!/^(?:[a-z]+:|\/|.*\.\.)/i.test(s)&&!/[\\?#\u0000-\u001f]/.test(s);
export function audioClockVideoCandidates(state){
 const entries=[...(state.clips??[]).map(c=>({src:c.src,label:c.label??c.id,origin:'clip'})),...(state.brollAssets??state.contextSnapshot?.brollAssets??[]).filter(a=>a.kind==='video').map(a=>({src:a.src,label:a.label??a.id,origin:'broll-asset'}))],seen=new Set();
 return entries.filter(a=>local(a.src)&&!seen.has(a.src)&&seen.add(a.src));
}
export function audioClockEvidenceIssues(state,config,evidence){
 const allowed=new Set(audioClockVideoCandidates(state).map(a=>a.src)),issues=[];
 for(const take of config.takes??[]){
  const e=evidence?.find(e=>e.takeId===take.id),identity=e?.sourceIdentity,asset=e?.playbackAsset;
  if(!allowed.has(take.source?.src))issues.push('音源已不在本项目视频列表：'+take.id);
  if(!identity||identity.kind!=='video'||identity.src!==take.source?.src||identity.sha256!==take.source?.sha256||!sha(identity.sha256)||![identity.width,identity.height].every(n=>Number.isSafeInteger(n)&&n>0)||!finite(identity.durationSec)||identity.durationSec*1000<take.endMs)issues.push('需要当前真实带音轨视频身份：'+take.id);
  if(e?.analysis?.clock?.basis!=='first-video-pts')issues.push('首版仅接真实视频的源零音轨：'+take.id);
  if(take.source)issues.push(...audioClockAnalysisIssues(take,e?.analysis).map(i=>take.id+': '+i));
  if(!asset||!local(asset.src)||!asset.src.startsWith('derived-audio/')||!sha(asset.sha256)||!sha(asset.segmentPcmSha256)||asset.sourceSha256!==take.source?.sha256||asset.analysisSha256!==take.source?.analysisSha256||asset.sourceStartMs!==take.startMs||asset.sourceEndMs!==take.endMs||asset.sampleRate!==16000||asset.channels!==1||Math.abs(asset.sampleCount-(take.endMs-take.startMs)*16)>.000001||Math.abs(asset.durationMs-take.endMs+take.startMs)>.000001)issues.push('需要实际规范化PCM播放资产及完整身份链：'+take.id);
 }
 return [...new Set(issues)];
}
export function audioClockSceneSegments(raw,config,clips,fps,viewport={width:1920,height:1080}){
 const issues=[],segments=[];if(!(finite(fps)&&fps>0))return {issues:['输出帧率无效'],segments};
 const ordered=config.order==='A-then-B'?['A','B']:['B','A'],[a,b]=ordered.map(id=>(config.takes??[]).find(t=>t.id===id));
 if(!a||!b||Math.abs(config.comparisonWindow?.atMs-a.playAtMs)>.000001||Math.abs(a.playAtMs+a.endMs-a.startMs-b.playAtMs)>.000001||Math.abs(config.comparisonWindow?.endMs-b.playAtMs-b.endMs+b.startMs)>.000001)issues.push('比较窗必须连续A→B或B→A；请显式调整起止，不留无说明静音');
 for(const p of projectStoryboard([raw],clips,fps)){
  issues.push(...audioClockIssues(p,config,viewport,{rawScene:raw,clips,fps}));
  const speed=p.speed??1,phase=p.phaseStartMs;
  for(const take of config.takes??[]){const from=(phase+take.playAtMs/speed)/1000*fps,end=(phase+(take.playAtMs+take.endMs-take.startMs)/speed)/1000*fps;
   if(!finite(from)||!finite(end)||Math.abs(from-Math.round(from))>1e-6||Math.abs(end-Math.round(end))>1e-6)issues.push('本实例A/B音轨窗须对齐输出帧；请调整草稿，不能自动改听审窗');
   if((p.sourceOffsetMs??0)>config.copyWindow?.atMs+.01||(p.sourceOffsetMs??0)+(p.endMs-p.startMs)*speed<config.comparisonWindow?.endMs-.01)issues.push('完整原文与A/B窗必须在每个保留实例内');
   segments.push({sceneId:raw.id,projectionId:p.id,takeId:take.id,fromFrame:Math.round(from),endFrame:Math.round(end),sourceStartMs:take.startMs,sourceEndMs:take.endMs,speed,src:take.source?.src,sha256:take.source?.sha256});
  }
 }
 return {issues:[...new Set(issues)],segments};
}
export function audioClockProjectSegments(scenes,clips,fps,viewport){
 const segments=[],issues=[];for(const raw of scenes??[]){const saved=raw.dynamicMotion;if(saved?.config?.kind!=='audio-clock-ab')continue;const result=audioClockSceneSegments(raw,saved.config,clips,fps,viewport);segments.push(...result.segments);issues.push(...result.issues);}
 const projected=projectStoryboard(scenes,clips,fps).map(p=>({id:p.id,...storyboardFrameRange(p,fps)}));
 for(const s of segments){
  const points=[s.fromFrame,...projected.flatMap(p=>[p.from,p.from+p.durationInFrames]).filter(f=>f>s.fromFrame&&f<s.endFrame)];
  if(points.some(f=>projected.filter(p=>f>=p.from&&f<p.from+p.durationInFrames).at(-1)?.id!==s.projectionId))issues.push('比较窗被其他场景覆盖；保留原声并请重排场景，不能暗播旧A/B');
 }
 const sorted=[...segments].sort((a,b)=>a.fromFrame-b.fromFrame);for(let i=1;i<sorted.length;i++)if(sorted[i].fromFrame<sorted[i-1].endFrame)issues.push('多个A/B比较音轨窗相撞，请修改场景时窗');
 return {segments,issues:[...new Set(issues)]};
}
const passthrough=(status,issues)=>({mode:'passthrough',status,issues,forceMuteOriginal:false,forceMuteMusic:false,replacementGain:0,activeSegment:null});
export function audioClockOwnershipAtFrame(segments,frame,{evidenceOk=true,decoded,renderVerified=false}={}){
 const active=segments.filter(s=>frame>=s.fromFrame&&frame<s.endFrame);if(!active.length)return passthrough('passthrough',[]);
 if(active.length!==1)return passthrough('blocked',['多个A/B窗相撞；保留原声并拒绝应用/导出']);
 if(!evidenceOk)return passthrough('blocked',['音源或PCM证据已失效；保留原声']);
 const s=active[0],key=s.projectionId+':'+s.takeId;if(!renderVerified&&(!decoded||decoded.key!==key||decoded.status!=='ready'))return passthrough(decoded?.status==='blocked'?'blocked':'waiting',['等待实际Audio解码；不将整场原声静音']);
 return {mode:'replace',status:'ready',issues:[],forceMuteOriginal:true,forceMuteMusic:true,replacementGain:1,activeSegment:s};
}
export function audioClockDecodedReport(audio,{playbackAsset,take,projectionId,expectedMediaMs,speed,previewPlaybackRate=1,fps}){
 const key=projectionId+':'+take.id,report={key,status:'waiting',actualMediaMs:(audio?.currentTime??NaN)*1000+take.startMs};if(!audio)return report;if(audio.error)return {...report,status:'blocked'};
 let same=false;try{same=decodeURIComponent(new URL(audio.currentSrc||audio.src,'http://localhost/').pathname)==='/'+playbackAsset.src;}catch{}
 // Player's global listening rate multiplies the clip rate on the native tag.
 // It does not alter source-clock arithmetic or the saved clip/proof speed.
 if(!same||!finite(audio.duration)||Math.abs(audio.duration*1000-playbackAsset.durationMs)>1/16+.01||!finite(speed)||speed<=0||!finite(previewPlaybackRate)||previewPlaybackRate<=0||!finite(audio.playbackRate)||Math.abs(audio.playbackRate-speed*previewPlaybackRate)>1e-6)return {...report,status:'blocked'};
 if(audio.readyState<2||!finite(report.actualMediaMs)||report.actualMediaMs<take.startMs||report.actualMediaMs>=take.endMs||Math.abs(report.actualMediaMs-expectedMediaMs)>1000/fps+.1)return report;
 return {...report,status:'ready'};
}
export async function verifyAudioClockWav(bytes,asset){
 const data=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes),view=new DataView(data.buffer,data.byteOffset,data.byteLength),ascii=(a,b)=>String.fromCharCode(...data.subarray(a,b));
 if(data.length<44||ascii(0,4)!=='RIFF'||ascii(8,12)!=='WAVE'||view.getUint32(4,true)!==data.length-8||ascii(12,16)!=='fmt '||view.getUint32(16,true)!==16||view.getUint16(20,true)!==1||view.getUint16(22,true)!==1||view.getUint32(24,true)!==16000||view.getUint32(28,true)!==32000||view.getUint16(32,true)!==2||view.getUint16(34,true)!==16||ascii(36,40)!=='data'||view.getUint32(40,true)!==data.length-44||data.length-44!==asset.sampleCount*2)throw Error('实际PCM播放文件格式或采样数不匹配');
 const digest=async b=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',b))].map(v=>v.toString(16).padStart(2,'0')).join('');
 if(await digest(data)!==asset.sha256||await digest(data.subarray(44))!==asset.segmentPcmSha256)throw Error('实际PCM播放文件SHA已变化');
 return {wavSha256:asset.sha256,segmentPcmSha256:asset.segmentPcmSha256,sampleCount:asset.sampleCount};
}

// Remotion Player can mount shared Audio elements outside the composition.
// Only the real component's forwarded ref may associate one with a live slot;
// copied JSON/data attributes cannot recreate this local DOM authority.
const actualAudioSlots=new WeakMap();
export function registerAudioClockMediaElement(slot,audio,previewPlaybackRate=1){
 if(!slot||!audio||audio.tagName!=='AUDIO'||!slot.ownerDocument||slot.ownerDocument!==audio.ownerDocument)return ()=>{};
 const entry={audio,previewPlaybackRate};actualAudioSlots.set(slot,entry);return()=>{if(actualAudioSlots.get(slot)===entry)actualAudioSlots.delete(slot);};
}
const slotAudio=slot=>actualAudioSlots.get(slot)?.audio??slot.querySelector?.('audio')??null;
/** Independently inspect the current Player DOM. Native flags alone are not
 * a decoder receipt. A muted Player still proves clocks, not human listening. */
export function audioClockDomPlaybackIssues(root,draft,projection,sourceMs,fps){
 const c=draft.config,elapsed=sourceMs-draft.binding.startMs;
 if(elapsed<c.comparisonWindow.atMs||elapsed>=c.comparisonWindow.endMs)return [];
 const take=c.takes.find(t=>elapsed>=t.playAtMs&&elapsed<t.playAtMs+t.endMs-t.startMs),e=draft.audioEvidence?.find(e=>e.takeId===take?.id),scope=root.closest?.('[data-audio-clock-scope]');
 if(!take||!e||!scope||scope.getAttribute('data-audio-owner-mode')!=='replace'||scope.getAttribute('data-audio-original-muted')!=='true'||scope.getAttribute('data-audio-music-muted')!=='true')return ['等待当前Player实际A/B独占音轨，不能用原生ready标记代替'];
 const active=[...scope.querySelectorAll('[data-audio-playback-projection]')].filter(p=>p.getAttribute('data-audio-replacement-gain')==='1');
 if(active.length!==1||active[0].getAttribute('data-audio-playback-projection')!==projection.id||active[0].getAttribute('data-audio-playback-take')!==take.id)return ['当前Player并非唯一的本实例A/B播放窗'];
 const audio=slotAudio(active[0]),registered=actualAudioSlots.get(active[0]),previewPlaybackRate=registered?registered.previewPlaybackRate:1,report=audioClockDecodedReport(audio,{playbackAsset:e.playbackAsset,take,projectionId:projection.id,expectedMediaMs:take.startMs+elapsed-take.playAtMs,speed:projection.speed??1,previewPlaybackRate,fps});
 if(report.status!=='ready')return ['实际A/B Audio未在本实例源时间成功解码'];
 const originals=[...scope.querySelectorAll('[data-audio-original-track]')].flatMap(p=>[...p.querySelectorAll('video')]),musicSlots=[...scope.querySelectorAll('[data-audio-music-track]')],music=musicSlots.map(slotAudio);
 if(!originals.length||originals.some(v=>v.muted!==true)||music.some(a=>!a||a.muted!==true))return ['比较窗内原口播或音乐尚未实际静音'];
 if([...scope.querySelectorAll('[data-audio-playback-projection]')].some(p=>p!==active[0]&&(!slotAudio(p)||slotAudio(p).muted!==true)))return ['另一个A/B播放槽未静音'];
 return [];
}
