import {projectStoryboard} from './storyboard.mjs';

const finite=n=>typeof n==='number'&&Number.isFinite(n);
const time=n=>finite(n)&&n>=0&&n<=Number.MAX_SAFE_INTEGER;
const text=s=>typeof s==='string'&&s.trim().length>0;
const sha=s=>typeof s==='string'&&/^[a-f0-9]{64}$/i.test(s);
const local=s=>text(s)&&!/^([a-z][a-z\d+.-]*:|\/)/i.test(s)&&!/[\\\u0000-\u001f]/.test(s)&&s.split('/').every(p=>p&&p!=='.'&&p!=='..');
const clamp=n=>Math.max(0,Math.min(1,n));
const unique=a=>[...new Set(a)];
const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
const serial=v=>{try{return JSON.stringify(stable(v));}catch{return null;}};
const projected=s=>s&&(s.sourceId!==undefined||s.phaseStartMs!==undefined||s.phaseEndMs!==undefined);
const durationOf=s=>projected(s)?(s.phaseEndMs-s.phaseStartMs)*(s.speed??1):s.endMs-s.startMs;
const provenance=p=>p&&['explicit-source','illustration'].includes(p.kind)&&text(p.note);

function formatIssues(format,integer=false){
 if(!format||typeof format!=='object')return ['explicit-format-required'];
 if(integer)return format.kind==='integer'&&Number.isInteger(format.integerDigits)&&format.integerDigits>=1&&format.integerDigits<=15?[]:['event-count-integer-format-invalid'];
 if(format.kind==='mm:ss')return Number.isInteger(format.minuteDigits)&&format.minuteDigits>=1&&format.minuteDigits<=9?[]:['minute-field-budget-invalid'];
 if(format.kind==='seconds'&&Number.isInteger(format.integerDigits)&&format.integerDigits>=1&&format.integerDigits<=9&&Number.isInteger(format.decimals)&&format.decimals>=0&&format.decimals<=3&&['floor','nearest'].includes(format.rounding))return [];
 return ['duration-format-invalid'];
}

/** Stable digit budgets are data only: a renderer must still measure its real font. */
export function typedDataClockFormatDuration(valueMs,format){
 const issues=formatIssues(format);if(!time(valueMs))issues.push('duration-value-invalid');
 if(issues.length)return {text:null,displayUnit:null,maximumText:null,issues:unique(issues)};
 if(format.kind==='mm:ss'){
  const wholeSeconds=Math.floor(valueMs/1000),minutes=Math.floor(wholeSeconds/60),seconds=wholeSeconds%60;
  if(minutes>=10**format.minuteDigits)return {text:null,displayUnit:'mm:ss',maximumText:'8'.repeat(format.minuteDigits)+':88',issues:['formatted-value-exceeds-explicit-digit-budget']};
  return {text:String(minutes).padStart(format.minuteDigits,'0')+':'+String(seconds).padStart(2,'0'),displayUnit:'mm:ss',maximumText:'8'.repeat(format.minuteDigits)+':88',issues:[]};
 }
 // Decimals <= 3 keep this divisor an integer (1000, 100, 10 or 1).
 // Divide milliseconds once: 9995 / 10 is exactly 999.5, unlike 9.995 * 100.
 const factor=10**format.decimals,scaled=Math[format.rounding==='floor'?'floor':'round'](valueMs/(1000/factor)),whole=Math.floor(scaled/factor),fraction=scaled%factor;
 const maximumText='8'.repeat(format.integerDigits)+(format.decimals?'.'+'8'.repeat(format.decimals):'');
 if(!Number.isSafeInteger(scaled)||whole>=10**format.integerDigits)return {text:null,displayUnit:'s',maximumText,issues:['formatted-value-exceeds-explicit-digit-budget']};
 return {text:String(whole)+(format.decimals?'.'+String(fraction).padStart(format.decimals,'0'):''),displayUnit:'s',maximumText,issues:[]};
}

function formatCount(value,format){
 const issues=formatIssues(format,true);if(!Number.isSafeInteger(value)||value<0)issues.push('event-count-value-invalid');
 if(issues.length)return {text:null,displayUnit:'count',maximumText:null,issues:unique(issues)};
 const maximumText='8'.repeat(format.integerDigits);
 return value>=10**format.integerDigits?{text:null,displayUnit:'count',maximumText,issues:['formatted-value-exceeds-explicit-digit-budget']}:{text:String(value),displayUnit:'count',maximumText,issues:[]};
}

function values(track){
 if(track.kind==='duration')return track.value?.basis==='source-elapsed'?[0,track.window?.endMs-track.window?.startMs]:[track.value?.fromMs,track.value?.toMs];
 if(track.kind==='receipt-duration')return [track.receipt?.endMs-track.receipt?.startMs];
 return [];
}

/** Current identity is supplied by the local asset inspector; this function does not inspect bytes. */
export function typedDataClockIssues(scene,config,context){
 const issues=[],binding=config?.binding,identity=context?.sourceIdentity,isProjected=projected(scene),raw=isProjected?context?.projectionProof?.rawScene:scene;
 if(config?.kind!=='typed-data-clock'||config?.clock!=='scene-source-relative-ms')issues.push('typed-data-clock-kind-or-basis-invalid');
 if(!raw||projected(raw)||!text(raw.id)||!local(raw.src)||![raw.startMs,raw.endMs].every(time)||raw.endMs<=raw.startMs)issues.push('raw-source-scene-required');
 if(!binding||!text(binding.sceneId)||!local(binding.src)||!sha(binding.sha256)||![binding.startMs,binding.endMs].every(time)||binding.endMs<=binding.startMs||binding.sceneId!==raw?.id||binding.src!==raw?.src||binding.startMs!==raw?.startMs||binding.endMs!==raw?.endMs)issues.push('absolute-source-binding-mismatch');
 if(!identity||identity.kind!=='video'||identity.src!==binding?.src||!sha(identity.sha256)||!sha(binding?.sha256)||identity.sha256.toLowerCase()!==binding.sha256.toLowerCase()||![identity.width,identity.height].every(n=>Number.isSafeInteger(n)&&n>0)||!finite(identity.durationSec)||identity.durationSec<=0||identity.durationSec*1000<(binding?.endMs??Infinity))issues.push('current-source-identity-required');
 if(isProjected){
  const proof=context?.projectionProof,clips=proof?.clips;
  if(!proof||!finite(proof.fps)||proof.fps<=0||!Array.isArray(clips)||!clips.length||clips.some(c=>!text(c?.id)||!local(c?.src)||![c?.inSec,c?.outSec,c?.speed??1].every(finite)||c.inSec<0||c.outSec<=c.inSec||(c.speed??1)<=0)||new Set(clips.map(c=>c?.id)).size!==clips.length)issues.push('actual-raw-timeline-projection-required');
  else if(raw&&!projected(raw)){
   const expected=projectStoryboard([raw],clips,proof.fps).find(s=>s.id===scene.id&&s.clipId===scene.clipId),a=serial(expected),b=serial(scene);
   if(!expected||a===null||b===null||a!==b)issues.push('projection-no-longer-matches-source-instance');
  }
 }
 const duration=raw?.endMs-raw?.startMs;
 if(!time(duration)||duration<=0)issues.push('original-scene-duration-invalid');
 if(!Array.isArray(config?.tracks)||!config.tracks.length)issues.push('explicit-tracks-required');
 const tracks=Array.isArray(config?.tracks)?config.tracks:[];
 if(new Set(tracks.map(t=>t?.id)).size!==tracks.length)issues.push('track-ids-must-be-unique');
 for(const track of tracks){
  const id=text(track?.id)?track.id:'unknown',add=message=>issues.push(id+':'+message),w=track?.window;
  if(!text(track?.id)||!text(track?.label)||!text(track?.definition))add('stable-id-label-definition-required');
  if(!provenance(track?.provenance))add('explicit-provenance-required');
  if(!w||![w.startMs,w.endMs].every(time)||w.endMs<=w.startMs||w.endMs>duration)add('track-window-outside-original-scene');
  if(track?.kind==='duration'){
   if(track.unit!=='ms'||!['source-elapsed','explicit-range'].includes(track.value?.basis))add('explicit-duration-basis-and-unit-required');
   if(track.value?.basis==='source-elapsed'&&('fromMs' in track.value||'toMs' in track.value))add('source-elapsed-cannot-override-its-duration');
   if(track.value?.basis==='explicit-range'&&![track.value.fromMs,track.value.toMs].every(time))add('explicit-duration-range-required');
  }else if(track?.kind==='receipt-duration'){
   const r=track.receipt;
   if(track.unit!=='ms'||!r||!['unix-epoch-ms','explicit-shared-origin-ms'].includes(r.basis)||![r.startMs,r.endMs].every(Number.isSafeInteger)||r.startMs<0||r.endMs<r.startMs)add('static-receipt-needs-explicit-common-origin-and-ordered-endpoints');
  }else if(track?.kind==='event-count'){
   if(track.unit!=='count'||!text(track.eventDefinition?.name)||!text(track.eventDefinition?.criterion)||!Number.isSafeInteger(track.initialCount)||track.initialCount<0||!Array.isArray(track.events))add('explicit-event-definition-initial-count-and-events-required');
   const events=Array.isArray(track.events)?track.events:[];
   if(events.some(e=>!text(e?.id)||!time(e?.atMs)||e.atMs<(w?.startMs??Infinity)||e.atMs>=(w?.endMs??-Infinity))||new Set(events.map(e=>e?.id)).size!==events.length||events.some((e,i)=>i&&e?.atMs<=events[i-1]?.atMs))add('events-need-unique-stable-ids-and-strictly-ordered-half-open-source-times');
   for(const issue of formatCount(track.initialCount+events.length,track.format).issues)add(issue);
  }else add('track-kind-invalid');
  if(['duration','receipt-duration'].includes(track?.kind)){
   for(const value of values(track))for(const issue of typedDataClockFormatDuration(value,track.format).issues)add(issue);
  }
 }
 return unique(issues);
}

/** Retained exposure is still measured in original scene milliseconds. */
export function typedDataClockExposure(scene){
 const speed=scene?.speed??1;
 return projected(scene)?{startMs:(scene.startMs-scene.phaseStartMs)*speed,endMs:(scene.endMs-scene.phaseStartMs)*speed,speed}:{startMs:0,endMs:scene?.endMs-scene?.startMs,speed:1};
}

function sampleTrack(track,elapsed){
 const w=track.window,windowProgress=clamp((elapsed-w.startMs)/(w.endMs-w.startMs)),phase=elapsed<w.startMs?'before':elapsed<w.endMs?'active':'after';
 const common={id:track.id,kind:track.kind,label:track.label,definition:track.definition,unit:track.unit,provenance:{...track.provenance},visible:phase==='active',phase,windowProgress};
 if(track.kind==='event-count'){
  const counted=track.events.filter(e=>e.atMs<=elapsed),count=track.initialCount+counted.length;
  return {...common,mode:'explicit-events',count,countedEventIds:counted.map(e=>e.id),eventProgress:track.events.length?counted.length/track.events.length:0,progress:windowProgress,...formatCount(count,track.format)};
 }
 const isReceipt=track.kind==='receipt-duration',valueMs=isReceipt?track.receipt.endMs-track.receipt.startMs:track.value.basis==='source-elapsed'?(w.endMs-w.startMs)*windowProgress:track.value.fromMs+(track.value.toMs-track.value.fromMs)*windowProgress;
 return {...common,mode:isReceipt?'static-receipt':track.value.basis,valueMs,progress:isReceipt?null:windowProgress,...(isReceipt?{receipt:{...track.receipt}}:{}),...typedDataClockFormatDuration(valueMs,track.format)};
}

/** Pure data state only: no font, face, media decoding, UI receipt or audio approval. */
export function typedDataClockState(scene,config,elapsedSourceMs,context){
 const issues=typedDataClockIssues(scene,config,context),exposure=typedDataClockExposure(scene),duration=scene?durationOf(scene):NaN;
 if(!time(elapsedSourceMs)||!time(duration)||![exposure.startMs,exposure.endMs,exposure.speed].every(finite)||exposure.speed<=0||exposure.startMs<0||exposure.endMs<=exposure.startMs||elapsedSourceMs<exposure.startMs||elapsedSourceMs>=exposure.endMs||elapsedSourceMs>=duration)issues.push('sample-outside-current-retained-half-open-source-window');
 const base={status:issues.length?'blocked':'data-ready',issues:unique(issues),canApply:false,uiAccepted:false,mediaVerified:false,audioVerified:false,sourceElapsedMs:elapsedSourceMs,tracks:[]};
 if(issues.length)return base;
 const tracks=config.tracks.map(track=>sampleTrack(track,elapsedSourceMs)),formatErrors=tracks.flatMap(t=>t.issues.map(i=>t.id+':'+i));
 return formatErrors.length?{...base,status:'blocked',issues:unique(formatErrors)}:{...base,tracks};
}

/** Use the verified projection, not a reset timer, for cut clips and repeated source instances. */
export function typedDataClockAtOutput(scene,config,outputMs,context){
 if(!projected(scene)||!finite(outputMs)||outputMs<scene.startMs||outputMs>=scene.endMs)return {status:'blocked',issues:['output-sample-requires-current-projected-half-open-instance'],canApply:false,uiAccepted:false,mediaVerified:false,audioVerified:false,sourceElapsedMs:null,tracks:[]};
 return typedDataClockState(scene,config,(outputMs-scene.phaseStartMs)*(scene.speed??1),context);
}
