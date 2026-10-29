import {dynamicSceneDuration} from './dynamic-mechanisms.mjs';
import {sourceTokenExposure,sourceTokenTextReadiness,sourceTokenPageState,sourceTokenLineRanges} from './source-token-transfer.mjs';
import {veilStateProjectionIssues,veilStateProtectedRects} from './veil-state.mjs';

const finite=n=>typeof n==='number'&&Number.isFinite(n),unique=xs=>[...new Set(xs)],sha=s=>typeof s==='string'&&/^[a-f0-9]{64}$/i.test(s),local=s=>typeof s==='string'&&s.length&&!/^(?:[a-z]+:|\/|.*\.\.)/i.test(s)&&!s.includes('\\');
const validRect=r=>r&&['x','y','width','height'].every(k=>finite(r[k]))&&r.x>=0&&r.y>=0&&r.width>0&&r.height>0&&r.x+r.width<=1.000001&&r.y+r.height<=.860001;
const overlap=(a,b)=>a.x<b.x+b.width-1e-7&&a.x+a.width>b.x+1e-7&&a.y<b.y+b.height-1e-7&&a.y+a.height>b.y+1e-7;
const full=n=>[n?.text,n?.detail,...(Array.isArray(n?.bullets)?n.bullets:[])].filter(t=>typeof t==='string'&&t.length).join('\n');
const list=v=>Array.isArray(v)?v:[],string=s=>typeof s==='string'&&s.trim().length>0;
const segmenter=new Intl.Segmenter('zh-CN',{granularity:'grapheme'});
export const audioClockAnalysisMethod='pcm16-source-zero-waveform-v1';
export function audioClockCopy(scene,config){
 return [scene.title,scene.body,scene.label,scene.sourceNote,...list(scene.tags).map(t=>t?.text),...list(scene.links).map(l=>l?.label),...list(scene.nodes).map(full),...list(config.takes).map(t=>t?.wordTrack?.text),config.annotation].filter(t=>typeof t==='string'&&t.length).join('\n');
}
export function audioClockMeasurementKey(scene,config,viewport,fontKey){return JSON.stringify([scene.sourceId??scene.id,scene.src,config,audioClockCopy(scene,config),scene.nodes,scene.window,scene.layout,scene.speaker,viewport,fontKey]);}
export function audioClockActiveTake(config,elapsed){return list(config.takes).find(t=>elapsed>=t.playAtMs&&elapsed<t.playAtMs+t.endMs-t.startMs)??null;}
/** A request only: the external single audio owner must execute and report it. */
export function audioClockPlaybackRequest(scene,config,elapsed){
 const take=audioClockActiveTake(config,elapsed);
 return {ownerId:config.audioOwner.id,takeId:take?.id??null,src:take?.source.src??config.binding.src,sha256:take?.source.sha256??config.binding.sha256,sourceClock:'source-zero-ms',mediaMs:take?take.startMs+elapsed-take.playAtMs:config.binding.startMs+elapsed,playbackRate:scene.speed??1,sceneSourceMs:config.binding.startMs+elapsed,activeAudioTracks:1,otherTracksMuted:true};
}
export function audioClockFieldPlan(scene,config){
 const nodes=new Map(list(scene.nodes).map(n=>[n.id,n])),window=config.comparisonWindow;
 return [{id:'complete-copy',role:'copy',text:audioClockCopy(scene,config),rect:config.copyWindow?.rect,atMs:config.copyWindow?.atMs,endMs:config.copyWindow?.endMs,singlePage:false},...list(config.takes).flatMap(t=>[
  {id:'label:'+t.id,role:'label',takeId:t.id,text:full(nodes.get(t.nodeId)),rect:t.labelRect,atMs:window?.atMs,endMs:window?.endMs,singlePage:false},
  ...(t.wordTrack?[{id:'words:'+t.id,role:'words',takeId:t.id,text:t.wordTrack.text,rect:t.wordRect,atMs:window?.atMs,endMs:window?.endMs,singlePage:true}]:[])
 ])];
}
function wordIssues(take){
 const track=take.wordTrack;if(!track)return [];
 if(track.clock!=='source-zero-ms'||track.src!==take.source?.src||track.sha256!==take.source?.sha256||!string(track.provenance)||!string(track.text)||!Array.isArray(track.words)||!track.words.length||new Set(track.words.map(w=>w?.id)).size!==track.words.length)return ['explicit-source-word-times-and-provenance-required'];
 const boundaries=new Set([...segmenter.segment(track.text)].map(p=>p.index));boundaries.add(track.text.length);let at=0,time=take.startMs;
 for(const w of track.words){
  if(!w||!string(w.id)||!string(w.text)||!Number.isInteger(w.startUtf16)||!Number.isInteger(w.endUtf16)||!boundaries.has(w.startUtf16)||!boundaries.has(w.endUtf16)||w.startUtf16<at||w.endUtf16<=w.startUtf16||track.text.slice(w.startUtf16,w.endUtf16)!==w.text||![w.startMs,w.endMs].every(finite)||w.startMs<time||w.endMs<=w.startMs||w.endMs>take.endMs)return ['word-source-range-time-or-order-invalid'];
  if(/[^\s\p{P}]/u.test(track.text.slice(at,w.startUtf16)))return ['substantive-transcript-text-without-explicit-word-clock'];
  at=w.endUtf16;time=w.endMs;
 }
 return /[^\s\p{P}]/u.test(track.text.slice(at))?['substantive-transcript-text-without-explicit-word-clock']:[];
}
export function audioClockIssues(scene,config,viewport={width:1920,height:1080},projectionProof){
 if(!scene||!config||config.kind!=='audio-clock-ab')return ['audio-clock-ab-config-required'];
 const issues=[],b=config.binding,d=dynamicSceneDuration(scene),e=sourceTokenExposure(scene),projected=scene.phaseStartMs!==undefined||scene.phaseEndMs!==undefined,nodes=list(scene.nodes),takes=list(config.takes),copy=config.copyWindow,window=config.comparisonWindow;
 if(config.clock!=='scene-source-relative-ms'||!b||b.sceneId!==(scene.sourceId??scene.id)||b.src!==scene.src||!local(b.src)||!sha(b.sha256)||![b.startMs,b.endMs].every(finite)||b.startMs<0||b.endMs<=b.startMs||Math.abs(b.endMs-b.startMs-d)>.01||!projected&&(b.startMs!==scene.startMs||b.endMs!==scene.endMs))issues.push('raw-source-identity-or-clock-mismatch');
 if(![d,e.startMs,e.endMs,e.speed,viewport.width,viewport.height].every(finite)||d<=0||e.speed<=0||e.startMs<-.01||e.endMs>d+.01||e.endMs<=e.startMs||viewport.width<=0||viewport.height<=0||projected&&(!finite(scene.phaseStartMs)||!finite(scene.phaseEndMs)||!finite(scene.sourceOffsetMs)||Math.abs(scene.sourceOffsetMs-e.startMs)>.02))issues.push('retained-source-clock-or-viewport-invalid');
 issues.push(...veilStateProjectionIssues(scene,config,projectionProof));
 if(config.dataKind!=='explicit-audio'||!string(config.provenance)||config.audioOwner?.kind!=='external-single-track'||!string(config.audioOwner?.id))issues.push('explicit-ab-provenance-and-single-external-audio-owner-required');
 if(!copy||!validRect(copy.rect)||![copy.atMs,copy.endMs].every(finite)||copy.atMs<0||copy.endMs> d||copy.endMs-copy.atMs<1000)issues.push('complete-source-copy-window-required');
 if(!window||![window.atMs,window.endMs].every(finite)||window.atMs<0||window.endMs>d||window.endMs-window.atMs<1000||copy&&window.atMs<copy.endMs)issues.push('separate-comparison-window-after-full-copy-required');
 if(!finite(config.timeScaleMs)||config.timeScaleMs<=0||config.timeScaleMs>60000)issues.push('explicit-shared-waveform-time-scale-required');
 if(takes.length!==2||new Set(takes.map(t=>t?.id)).size!==2||!takes.every(t=>t&&['A','B'].includes(t.id))||!['A-then-B','B-then-A'].includes(config.order))issues.push('exactly-two-stable-ab-takes-and-explicit-play-order-required');
 if(!nodes.length||nodes.some(n=>!n||!string(n.id)||!string(n.text)||n.detail!==undefined&&typeof n.detail!=='string'||n.bullets!==undefined&&(!Array.isArray(n.bullets)||n.bullets.some(t=>typeof t!=='string')))||new Set(nodes.map(n=>n?.id)).size!==nodes.length)issues.push('stable-original-node-ids-and-complete-labels-required');
 if(scene.media?.src||nodes.some(n=>n?.assetSrc))issues.push('existing-evidence-media-requires-a-supported-media-renderer');
 for(const take of takes){
  if(!take||!nodes.some(n=>n.id===take.nodeId&&take.expectedText===full(n))||!validRect(take.labelRect)||!validRect(take.waveRect)||take.wordTrack&&!validRect(take.wordRect)||!local(take.source?.src)||!sha(take.source?.sha256)||!sha(take.source?.analysisSha256)){issues.push('each-take-needs-actual-audio-identity-and-exact-original-node');continue;}
  if(![take.startMs,take.endMs,take.playAtMs].every(finite)||take.startMs<0||take.endMs<=take.startMs||take.endMs-take.startMs>config.timeScaleMs||take.playAtMs<window?.atMs||take.playAtMs+take.endMs-take.startMs>window?.endMs)issues.push('explicit-source-audio-segment-and-play-window-invalid');
  issues.push(...wordIssues(take));
 }
 const ordered=config.order==='A-then-B'?['A','B']:config.order==='B-then-A'?['B','A']:[];
 if(ordered.length&&ordered.every(id=>takes.some(t=>t?.id===id))){const [a,b]=ordered.map(id=>takes.find(t=>t.id===id));if(a.playAtMs+a.endMs-a.startMs>b.playAtMs)issues.push('ab-play-order-must-not-overlap-or-reverse');}
 if(!Array.isArray(config.protectedAreas??[])||list(config.protectedAreas).some(p=>!validRect(p?.rect)))issues.push('protected-area-invalid');
 const frames=scene.window?[scene.window,...list(scene.window.keyframes)]:[];
 if(scene.window?.keyframes!==undefined&&!Array.isArray(scene.window.keyframes)||frames.some(p=>!p||![p.x,p.y,p.size].every(finite)||p.size<=0||p.x<0||p.y<0||p.x+p.size>1||p.y+p.size*viewport.width/viewport.height>1))issues.push('speaker-window-or-keyframe-geometry-invalid');
 const times=list(scene.window?.keyframes).map(p=>p?.atMs);if(times.some(t=>!finite(t)||t<0||t>d)||new Set(times).size!==times.length)issues.push('speaker-keyframe-clock-invalid');
 if(issues.length)return unique(issues);
 const protectedRects=veilStateProtectedRects(scene,config,viewport),fields=audioClockFieldPlan(scene,config),native=[...fields.filter(f=>f.role!=='copy'),...takes.map(t=>({rect:t.waveRect}))];
 if([...fields,...native].some(f=>protectedRects.some(p=>overlap(p,f.rect))))issues.push('copy-waveform-or-word-cursor-overlaps-person-path-or-protected-area');
 for(let i=0;i<native.length;i++)for(let j=i+1;j<native.length;j++)if(overlap(native[i].rect,native[j].rect))issues.push('simultaneous-ab-graphics-and-full-text-must-not-overlap');
 return unique(issues);
}
export function audioClockAnalysisIssues(take,analysis){
 if(!analysis)return ['current-local-pcm-analysis-required'];
 const a=analysis,r=a.range,rate=a.sampleRate;
 if(a.version!==1||a.method!==audioClockAnalysisMethod||a.sourceClock!=='source-zero-ms'||a.src!==take.source.src||a.sha256!==take.source.sha256||a.analysisSha256!==take.source.analysisSha256||!sha(a.pcmSha256)||!sha(a.analysisSha256)||rate!==16000||a.channels!==1||!Number.isSafeInteger(a.sampleCount)||a.sampleCount<=0||a.sampleCount>600*rate||!finite(a.durationMs)||Math.abs(a.durationMs-a.sampleCount/rate*1000)>.000001)return ['actual-pcm-analysis-identity-method-or-duration-mismatch'];
 if(!r||![r.startSample,r.endSample].every(Number.isSafeInteger)||r.startSample<0||r.endSample> a.sampleCount||r.endSample<=r.startSample||![r.startMs,r.endMs].every(finite)||Math.abs(r.startMs-r.startSample/rate*1000)>.000001||Math.abs(r.endMs-r.endSample/rate*1000)>.000001||Math.abs(take.startMs-r.startMs)>.000001||Math.abs(take.endMs-r.endMs)>.000001)return ['waveform-must-cover-exact-authored-source-sample-range'];
 const clock=a.clock;if(!clock||!['first-video-pts','container-start'].includes(clock.basis)||![clock.sourceOriginSec,clock.audioFirstPtsSec,clock.audioOffsetMs].every(finite)||Math.abs(clock.audioOffsetMs-(clock.audioFirstPtsSec-clock.sourceOriginSec)*1000)>.001)return ['verified-source-zero-pcm-origin-receipt-required'];
 if(!Array.isArray(a.bins)||a.bins.length<16||a.bins.length>1024)return ['real-pcm-waveform-bins-required'];let at=r.startSample;
 for(const bin of a.bins){if(!bin||bin.startSample!==at||!Number.isSafeInteger(bin.endSample)||bin.endSample<=at||bin.endSample>r.endSample||![bin.min,bin.max,bin.rms].every(finite)||bin.min< -1||bin.max>1||bin.min>bin.max||bin.rms<0||bin.rms>Math.max(Math.abs(bin.min),Math.abs(bin.max))+.000001)return ['pcm-waveform-samples-or-amplitude-invalid'];at=bin.endSample;}
 return at===r.endSample?[]:['pcm-waveform-has-a-gap-or-missing-tail'];
}
export function audioClockReadiness(scene,config,elapsed,measurement,runtime,viewport={width:1920,height:1080},projectionProof){
 const issues=audioClockIssues(scene,config,viewport,projectionProof),waiting=[],d=dynamicSceneDuration(scene),e=sourceTokenExposure(scene);
 if(!finite(elapsed)||elapsed<0||elapsed>=d)issues.push('source-elapsed-outside-original-scene');
 if(runtime?.error)issues.push(runtime.error);
 if(issues.length)return {status:'blocked',issues:unique(issues)};
 for(const take of config.takes){const analysis=list(runtime?.analyses).find(a=>a?.src===take.source.src&&a.analysisSha256===take.source.analysisSha256);if(!analysis)waiting.push('local-pcm-analysis-not-loaded:'+take.id);else issues.push(...audioClockAnalysisIssues(take,analysis));}
 if(!measurement)waiting.push('loaded-complete-source-font-measurements-required');
 else if(!measurement.fontKey||measurement.key!==audioClockMeasurementKey(scene,config,viewport,measurement.fontKey))issues.push('stale-source-font-or-layout-measurement');
 else for(const field of audioClockFieldPlan(scene,config)){
  const m=measurement.fields?.find(f=>f.id===field.id);if(!m||m.text!==field.text){waiting.push('all-complete-source-fields-must-be-measured');continue;}
  const check=sourceTokenTextReadiness(field.text,m.fit,field,e,{singlePage:field.singlePage});(check.status==='waiting'?waiting:issues).push(...check.issues.map(i=>field.id+': '+i));
  if(m.fit&&(![m.fit.fontSize,m.fit.rowHeight,m.fit.width].every(finite)||m.fit.fontSize<viewport.height*.026||m.fit.width>field.rect.width*viewport.width*.94+.01||m.fit.pages.some(p=>p.length*m.fit.rowHeight>field.rect.height*viewport.height*.88+.01)))issues.push('complete-font-page-geometry-invalid');
  if(m.fit&&field.role==='words'){const take=config.takes.find(t=>t.id===field.takeId),ranges=sourceTokenLineRanges(field.text,m.fit.lines);if(!ranges||take.wordTrack.words.some(w=>!ranges.some(r=>w.startUtf16>=r.startUtf16&&w.endUtf16<=r.endUtf16)))issues.push('one-explicit-word-must-not-cross-measured-lines');}
 }
 const cw=config.comparisonWindow;if(cw.atMs<e.startMs-.01||cw.endMs>e.endMs+.01||config.takes.some(t=>(t.endMs-t.startMs)/e.speed<250))issues.push('whole-ab-comparison-and-listening-exposure-must-be-retained');
 const proof=runtime?.audioProof;
 const inComparison=elapsed>=cw.atMs&&elapsed<cw.endMs,render=runtime?.renderProof;
 if(runtime?.ownerPolicy==='comparison-only'&&!inComparison){/* Existing source/music stay untouched outside A/B. Central verifies the real speaker. */}
 else if(render){
  const take=audioClockActiveTake(config,elapsed),verified=runtime.verifiedPlayback?.find(v=>v.takeId===take?.id);
  if(!take||render.kind!=='verified-pcm-frame'||render.takeId!==take.id||render.src!==take.source.src||render.sha256!==take.source.sha256||render.analysisSha256!==take.source.analysisSha256||!verified||render.playbackSha256!==verified.wavSha256||render.segmentPcmSha256!==verified.segmentPcmSha256||render.sampleCount!==verified.sampleCount||!Number.isInteger(render.sampleOffset)||render.sampleOffset<0||render.sampleOffset>=verified.sampleCount||Math.abs(render.sampleOffset-(elapsed-take.playAtMs)*16)>1.001)issues.push('actual-verified-pcm-export-frame-required-not-a-realtime-decode-claim');
 }
 else if(!proof)waiting.push('actual-external-single-owner-audio-decode-clock-required');
 else{
  const request=audioClockPlaybackRequest(scene,config,elapsed),same=['ownerId','takeId','src','sha256','sourceClock','activeAudioTracks','otherTracksMuted'].every(k=>proof[k]===request[k]);
  if(!same||!finite(proof.fps)||proof.fps<1||proof.fps>240||!finite(proof.mediaMs)||!finite(proof.sceneSourceMs)||!finite(proof.playbackRate)||Math.abs(proof.playbackRate-request.playbackRate)>.000001||!['waiting','blocked','ready'].includes(proof.status))issues.push('actual-audio-owner-source-or-playback-rate-mismatch');
  else if(proof.status==='blocked')issues.push('actual-audio-decoder-failed');
  else{
   const take=audioClockActiveTake(config,elapsed),lower=take?.startMs??config.binding.startMs,upper=take?.endMs??config.binding.endMs;
   if(proof.status!=='ready'||proof.mediaMs<lower-.000001||proof.mediaMs>=upper||Math.abs(proof.mediaMs-request.mediaMs)>1000/proof.fps+.1||Math.abs(proof.sceneSourceMs-request.sceneSourceMs)>1000/proof.fps+.1)waiting.push('waiting-for-current-decoded-audio-and-source-clock');
  }
 }
 if(runtime?.ownerPolicy==='comparison-only'&&inComparison&&(!runtime.mixerPolicy?.forceMuteOriginal||!runtime.mixerPolicy?.forceMuteMusic||runtime.mixerPolicy?.replacementGain!==1))waiting.push('waiting-for-exclusive-replacement-owner-original-and-music-must-be-muted');
 return {status:issues.length?'blocked':waiting.length?'waiting':'ready',issues:unique([...issues,...waiting])};
}
export function audioClockState(scene,config,elapsed,measurement,runtime,viewport={width:1920,height:1080},projectionProof){
 const readiness=audioClockReadiness(scene,config,elapsed,measurement,runtime,viewport,projectionProof),base={...readiness,automaticAllowed:false,canApply:false,uiAccepted:false,needsFaceReview:true,clockMode:runtime?.renderProof?'render-pcm':'preview-decoded',copy:null,rows:[],playbackRequest:null};if(readiness.status!=='ready')return base;
 const fields=audioClockFieldPlan(scene,config),copy=fields[0],cf=measurement.fields.find(f=>f.id===copy.id).fit,active=audioClockActiveTake(config,elapsed),visible=elapsed>=config.comparisonWindow.atMs&&elapsed<config.comparisonWindow.endMs;
 return {...base,copy:{...copy,page:sourceTokenPageState(cf.pages,elapsed,copy)},playbackRequest:audioClockPlaybackRequest(scene,config,elapsed),rows:config.takes.map(t=>{
  const analysis=runtime.analyses.find(a=>a.src===t.source.src&&a.analysisSha256===t.source.analysisSha256),playing=visible&&active?.id===t.id,mediaMs=playing?(runtime.renderProof?t.startMs+runtime.renderProof.sampleOffset/16:runtime.audioProof.mediaMs):null,cursor=mediaMs===null?null:Math.max(0,Math.min(t.endMs-t.startMs,mediaMs-t.startMs))/config.timeScaleMs;
  return {id:t.id,nodeId:t.nodeId,visible,playing,waveRect:t.waveRect,waveform:analysis.bins.map(b=>({x:((b.startSample+b.endSample)/2/analysis.sampleRate*1000-t.startMs)/config.timeScaleMs,min:b.min,max:b.max,rms:b.rms})),durationFraction:(t.endMs-t.startMs)/config.timeScaleMs,cursor,activeWordId:playing?t.wordTrack?.words.find(w=>mediaMs>=w.startMs&&mediaMs<w.endMs)?.id??null:null,fields:fields.filter(f=>f.takeId===t.id).map(f=>({...f,page:sourceTokenPageState(measurement.fields.find(m=>m.id===f.id).fit.pages,elapsed,f)}))};
 })};
}
const ms=(key,label)=>({key,label,type:'source-ms',min:0}),box=(key,label)=>({key,label,type:'stage-rect',coordinates:'normalized-output',subtitleBottom:.86});
export const audioClockControls={kind:'audio-clock-ab',label:'真实音频A/B与词时钟',stage:'experimental-independent',automaticAllowed:false,canApply:false,uiAccepted:false,fields:[
 {key:'clock',label:'原场时钟',type:'text',fixed:'scene-source-relative-ms',readonly:true},{key:'binding',label:'原场身份',type:'record',readonly:true,fields:[]},{key:'dataKind',label:'实际音频',type:'text',fixed:'explicit-audio',readonly:true},{key:'provenance',label:'A/B关系的明确依据',type:'text'},
 {key:'audioOwner',label:'唯一外部音轨owner',type:'record',readonly:true,fields:[]},{key:'order',label:'明确播放顺序',type:'select',options:['A-then-B','B-then-A']},ms('timeScaleMs','两行共同横轴时长'),
 {key:'copyWindow',label:'完整原文阅读窗',type:'record',fields:[ms('atMs','开始'),ms('endMs','结束'),box('rect','完整原文框')]},{key:'comparisonWindow',label:'两行完整比较窗',type:'record',fields:[ms('atMs','开始'),ms('endMs','结束')]},
 {key:'takes',label:'真实音频片段',type:'list',preserveId:true,itemFields:[{key:'id',label:'稳定A/B身份',type:'text',readonly:true},{key:'nodeId',label:'原论点节点',type:'node-ref'},{key:'expectedText',label:'完整原节点',type:'text',readonly:true,source:'scene-node-complete-text'},{key:'source',label:'真实音频及PCM分析身份',type:'record',readonly:true,fields:[]},ms('startMs','真实音频片段起点'),ms('endMs','真实音频片段终点'),ms('playAtMs','原场开始播放时点'),box('labelRect','完整标签区'),box('waveRect','真实波形区'),box('wordRect','完整逐词文本区'),{key:'wordTrack',label:'显式来源的完整时间词（不可自动造ASR）',type:'record',readonly:true,fields:[]}]},
 {key:'annotation',label:'作者明确补充',type:'text'},{key:'protectedAreas',label:'额外保护区域',type:'list',itemFields:[{key:'label',label:'说明',type:'text'},box('rect','保护区域')]}
]};
