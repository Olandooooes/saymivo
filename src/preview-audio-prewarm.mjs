const finite=n=>typeof n==='number'&&Number.isFinite(n);
const text=s=>typeof s==='string'&&s.trim().length>0;
const local=s=>text(s)&&!/^([a-z][a-z\d+.-]*:|\/)/i.test(s)&&!/[\\\u0000-\u001f]/.test(s)&&s.split('/').every(p=>p&&p!=='.'&&p!=='..');
const zeroEpsilon=1/16000; // One sample of the verified preview WAV, in seconds.
const attempted=new WeakMap(); // Survives controller/Sequence recreation for this native ref + src.

function sourceMatches(element,slot,src){
 try{
  const base=new URL(slot.ownerDocument.baseURI),expected='/'+src;
  return ['src','currentSrc'].every(key=>{const u=new URL(element[key],base);return text(element[key])&&u.origin===base.origin&&decodeURIComponent(u.pathname)===expected&&!u.search&&!u.hash;});
 }catch{return false;}
}
function snapshotIssues(s,{loaded=true,playing=true}={}){
 const issues=[],a=s?.element,slot=s?.slot;
 if(!s||s.phase!=='premount'||s.sequencePremounting!==true)issues.push('actual-sequence-premount-required');
 if(!text(s?.segmentId)||!local(s?.src)||s?.materialReady!==true)issues.push('current-verified-material-and-segment-required');
 if(playing&&s?.rootPlaying!==true)issues.push('trusted-root-player-must-be-playing');
 if(![s?.rootFrame,s?.fromFrame,s?.premountFrames].every(Number.isSafeInteger)||s.rootFrame<0||s.fromFrame<0||s.premountFrames<=0||s.rootFrame<Math.max(0,s.fromFrame-s.premountFrames)||s.rootFrame>=s.fromFrame||!finite(s?.fps)||s.fps<=0||!finite(s?.previewRate)||s.previewRate<=0)issues.push('trusted-premount-frame-and-preview-rate-required');
 if(!a||a.tagName!=='AUDIO'||!slot||!a.ownerDocument||a.ownerDocument!==slot.ownerDocument||a.isConnected!==true||slot.isConnected!==true||!sourceMatches(a,slot,s?.src))issues.push('current-connected-forwarded-audio-and-same-source-required');
 if(s?.gain!==0||a?.muted!==true||a?.volume!==0)issues.push('actual-muted-zero-volume-and-zero-gain-required');
 if(loaded&&(!finite(s?.durationMs)||s.durationMs<=0||!finite(a?.duration)||Math.abs(a.duration*1000-s.durationMs)>1/16+.01||a.readyState<2||a.error||!finite(a.currentTime)||a.currentTime<0||a.currentTime>a.duration))issues.push('actual-loaded-matching-audio-required');
 return issues;
}
const leadMs=s=>(s.fromFrame-s.rootFrame)/s.fps/s.previewRate*1000;
const same=(s,t)=>s?.element===t.element&&s?.slot===t.slot&&s?.segmentId===t.segmentId&&s?.src===t.src&&s?.durationMs===t.durationMs&&s?.fromFrame===t.fromFrame&&s?.premountFrames===t.premountFrames&&s?.fps===t.fps&&s?.previewRate===t.previewRate;
const sameOwner=(s,t)=>s?.element===t.element&&s?.slot===t.slot&&s?.segmentId===t.segmentId&&s?.src===t.src&&s?.durationMs===t.durationMs;

/**
 * Preview-only preparation, not a decoder/UI receipt. Call request AFTER the
 * child SDK's initial passive effects. getSnapshot must read current trusted
 * root context and the actual forwarded ref, not copied data attributes.
 * This module never changes src, mute, volume, rate, source windows or proof.
 */
export function createPreviewAudioPrewarmController({getSnapshot,minLeadMs,maxWarmMs,cueSafetyMs,now=()=>performance.now(),setTimer=(f,ms)=>setTimeout(f,ms),clearTimer=id=>clearTimeout(id)}){
 let pending=null,disposed=false,state={status:'idle',issues:[],prewarmOnly:true,canApply:false,uiAccepted:false,mediaProof:false};
 const policyValid=typeof getSnapshot==='function'&&[minLeadMs,maxWarmMs,cueSafetyMs].every(n=>finite(n)&&n>0)&&maxWarmMs+cueSafetyMs<=minLeadMs;
 const read=()=>{try{return getSnapshot();}catch{return null;}};
 const result=(status,issues=[])=>({status,issues:[...issues],prewarmOnly:true,canApply:false,uiAccepted:false,mediaProof:false});
 const publish=(status,issues=[])=>{state=result(status,issues);return {...state,issues:[...state.issues]};};
 const detach=t=>{clearTimer(t.timer);for(const [name,fn] of t.listeners)t.element.removeEventListener(name,fn);};
 const stopProtected=t=>{
  const s=read(),wall=now();
  // A delayed timer or stale callback must never pause an active cue. The
  // independent wall deadline is conservative even if React's frame is stale.
  if(!sameOwner(s,t)||snapshotIssues(s,{loaded:false,playing:false}).length||!finite(wall)||wall<t.startedAt||wall>=t.stopBeforeAt||leadMs(s)<=cueSafetyMs)return;
  try{t.element.pause();if(Math.abs(t.element.currentTime)>zeroEpsilon)t.element.currentTime=0;}catch{}
 };
 const settle=(t,status,issues=[],stop=false)=>{
  if(!t.active)return;
  t.active=false;if(stop)stopProtected(t);detach(t);if(pending===t)pending=null;
  t.resolve(publish(status,issues));
 };
 const current=(t)=>{
  const s=read(),wall=now(),issues=snapshotIssues(s,{loaded:t.phase!=='resetting'});
  if(!same(s,t))issues.push('prewarm-owner-ref-source-or-clock-changed');
  if(!finite(wall)||wall<t.startedAt||wall>=t.deadline||wall>=t.stopBeforeAt||s&&leadMs(s)<=cueSafetyMs)issues.push('prewarm-completion-budget-expired');
  return {s,issues};
 };
 const resetReady=t=>{
  if(!t.active||t.phase!=='resetting')return;
  const {issues}=current(t);if(issues.length){settle(t,'cancelled',issues,true);return;}
  if(t.element.error||!finite(t.element.duration)||Math.abs(t.element.duration*1000-t.durationMs)>1/16+.01){settle(t,'failed',['actual-audio-changed-during-reset'],true);return;}
  if(t.element.paused!==true){settle(t,'failed',['reset-audio-must-remain-actually-paused'],true);return;}
  if(t.element.seeking===true||t.element.readyState<2||Math.abs(t.element.currentTime)>zeroEpsilon||t.needsSeek&&!t.sawSeeked)return;
  settle(t,'warmed');
 };
 const playbackStarted=t=>{
  if(!t.active)return;
  const {issues}=current(t);if(issues.length){settle(t,'cancelled',issues,true);return;}
  if(t.element.paused!==false||t.element.ended===true){settle(t,'failed',['play-promise-did-not-leave-a-playing-current-element'],true);return;}
  try{
   t.phase='resetting';publish('resetting');t.element.pause();
   const after=current(t);if(after.issues.length){settle(t,'cancelled',after.issues);return;}
   t.needsSeek=t.element.seeking===true||Math.abs(t.element.currentTime)>zeroEpsilon;
   if(t.needsSeek)t.element.currentTime=0;
   resetReady(t);
  }catch{settle(t,'failed',['actual-audio-pause-or-reset-failed'],true);}
 };
 const cancel=(reason='prewarm-cancelled')=>{if(pending)settle(pending,'cancelled',[reason],true);return {...state,issues:[...state.issues]};};
 return {
  request(){
   if(disposed)return Promise.resolve(result('blocked',['prewarm-controller-disposed']));
   if(pending)return pending.promise;
   if(!policyValid)return Promise.resolve(publish('blocked',['explicit-consistent-wall-lead-and-completion-budgets-required']));
   const s=read(),issues=snapshotIssues(s),wall=now();
   if(s?.element?.paused!==true)issues.push('premount-audio-must-be-paused-before-warmup');
   if(!finite(wall))issues.push('monotonic-preview-wall-clock-required');
   if(!issues.length&&(leadMs(s)<minLeadMs||cueSafetyMs<1000/s.fps/s.previewRate))issues.push('insufficient-trusted-preview-wall-lead');
   if(issues.length)return Promise.resolve(publish('blocked',issues));
   const previous=attempted.get(s.element)??new Set();
   if(previous.has(s.src))return Promise.resolve(result('skipped',['this-forwarded-element-and-source-were-already-attempted']));
   previous.add(s.src);attempted.set(s.element,previous);
   let resolve;const promise=new Promise(r=>resolve=r),t={...s,startedAt:wall,deadline:wall+maxWarmMs,stopBeforeAt:wall+leadMs(s)-cueSafetyMs,active:true,phase:'playing',needsSeek:false,sawSeeked:false,listeners:[],timer:null,promise,resolve};
   pending=t;publish('warming');
   const error=()=>settle(t,'failed',['actual-audio-error-during-prewarm'],true),seeked=()=>{t.sawSeeked=true;resetReady(t);},canplay=()=>resetReady(t);
   for(const [name,fn] of [['error',error],['emptied',error],['seeked',seeked],['canplay',canplay],['loadeddata',canplay]]){t.listeners.push([name,fn]);t.element.addEventListener(name,fn);}
   t.timer=setTimer(()=>settle(t,'failed',['prewarm-play-and-reset-did-not-complete-in-budget'],true),maxWarmMs);
   try{
    const play=t.element.play();
    if(!play||typeof play.then!=='function')settle(t,'failed',['actual-play-promise-required'],true);
    else play.then(()=>playbackStarted(t),()=>settle(t,'failed',['actual-audio-prewarm-play-rejected'],true));
   }catch{settle(t,'failed',['actual-audio-prewarm-play-threw'],true);}
   return promise;
  },
  reconcile(){if(pending){const {issues}=current(pending);if(issues.length)settle(pending,'cancelled',issues,true);}return {...state,issues:[...state.issues]};},
  cancel,
  dispose(){cancel('prewarm-controller-disposed');disposed=true;},
  getState(){return {...state,issues:[...state.issues]};}
 };
}
