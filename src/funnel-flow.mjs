import {dynamicSceneDuration} from './dynamic-mechanisms.mjs';
import {visualContentRect} from './visual-presets.mjs';
import {sampleSceneWindow} from './storyboard.mjs';
import {speakerBox} from './presentation.mjs';
import {visibleTextClock} from './dynamic-text-clock.mjs';

export const MAX_FUNNEL_DOTS=512;
const clamp=value=>Math.max(0,Math.min(1,value));
const ease=value=>{const p=clamp(value);return p*p*(3-2*p);};
const mix=(a,b,p)=>a+(b-a)*p;
const mixPoint=(a,b,p)=>({x:mix(a.x,b.x,p),y:mix(a.y,b.y,p)});
const whole=value=>Number.isSafeInteger(value)&&value>=0;
const rectValid=rect=>rect&&['x','y','width','height'].every(key=>Number.isFinite(rect[key]))&&rect.x>=0&&rect.y>=0&&rect.width>0&&rect.height>0&&rect.x+rect.width<=1&&rect.y+rect.height<=.82;
const contains=(a,b)=>b.x>=a.x-1e-9&&b.y>=a.y-1e-9&&b.x+b.width<=a.x+a.width+1e-9&&b.y+b.height<=a.y+a.height+1e-9;
const childRect=(parent,x,y,width,height)=>({x:parent.x+parent.width*x,y:parent.y+parent.height*y,width:parent.width*width,height:parent.height*height});
const notesOf=scene=>[scene.body,...(scene.nodes??[]).map(node=>[node.text,node.detail,...(node.bullets??[])].filter(Boolean).join('\n'))].filter(Boolean).join('\n');

// No text matching, implicit statistics, source-specific constants or random
// frame state. The last token keeps its real remainder weight.
export function funnelTokenPlan({totalCount,passedCount,unitPerDot,atMs,emitMs}){
 if(!whole(totalCount)||!whole(passedCount)||passedCount>totalCount||!Number.isSafeInteger(unitPerDot)||unitPerDot<=0||!Number.isFinite(atMs)||!Number.isFinite(emitMs)||emitMs<=0)throw Error('漏斗需要显式有效的整数数量、点权重和时点');
 const count=Math.ceil(totalCount/unitPerDot);if(count>MAX_FUNNEL_DOTS)throw Error('点数超出独立渲染预算，请明确调整每点单位');
 const tokens=Array.from({length:count},(_,index)=>({id:`funnel-${index}`,index,birthMs:atMs+index*emitMs/Math.max(1,count),weight:Math.min(unitPerDot,totalCount-index*unitPerDot),passedWeight:0,rejectedWeight:0}));
 const full=Math.floor(totalCount/unitPerDot),passedFull=Math.floor(passedCount/unitPerDot),remainder=passedCount%unitPerDot;
 for(let index=0;index<passedFull;index++)tokens[Math.floor((index+.5)*full/passedFull)].passedWeight=unitPerDot;
 if(remainder){const eligible=tokens.filter(token=>token.passedWeight===0&&token.weight>=remainder),target=(tokens.length-1)/2;eligible.sort((a,b)=>Math.abs(a.index-target)-Math.abs(b.index-target)||a.index-b.index);if(!eligible.length)throw Error('无法分配通过余数');eligible[0].passedWeight=remainder;}
 let rejectIndex=0,passIndex=0;
 const plan=tokens.map(token=>({...token,rejectedWeight:token.weight-token.passedWeight,passIndex:token.passedWeight?passIndex++:null,rejectIndex:token.weight>token.passedWeight?rejectIndex++:null}));
 if(plan.reduce((count,token)=>count+Number(token.passedWeight>0)+Number(token.rejectedWeight>0),0)>MAX_FUNNEL_DOTS)throw Error('含通过余数拆分后的点数超预算，请明确调整每点单位');
 return plan;
}

export function funnelFlowGeometry(scene,config,elapsed=0,viewport={width:1920,height:1080}){
 const {width,height}=viewport,content=visualContentRect({...scene,visualPreset:{id:'floating-evidence',side:config.side??scene.visualPreset?.side}},width,height),safe={x:content.x/width,y:content.y/height,width:content.width/width,height:content.height/height},panel=config.panelRect??safe,copyText=[scene.title,notesOf(scene),config.annotation].filter(Boolean).join('\n'),body=childRect(panel,0,.31,1,.69),window=sampleSceneWindow(scene,elapsed),fallback=speakerBox('slide',width,height);
 const speaker=window?{x:window.x,y:window.y,width:window.size,height:window.size*width/height}:{x:fallback.left/width,y:fallback.top/height,width:fallback.width/width,height:fallback.height/height};
 return {safe,panel,title:childRect(panel,0,0,1,.12),counts:childRect(panel,0,.135,1,.15),body,copy:panel,speaker,copyText};
}

function completionAt(tokens,config){return tokens.reduce((end,token)=>Math.max(end,token.passedWeight?token.birthMs+config.inletMs+config.passMs+(config.collectMs??350):end,token.rejectedWeight?token.birthMs+config.inletMs+config.settleMs:end),config.atMs);}
export function funnelFlowIssues(scene,config,viewport={width:1920,height:1080}){
 const issues=[],duration=dynamicSceneDuration(scene);
 if(config.kind!=='quantified-funnel-flow')issues.push('未知独立漏斗类型');
 if(!['explicit','illustration'].includes(config.dataKind)||typeof config.provenance!=='string'||!config.provenance.trim())issues.push('漏斗数量必须有明确来源与事实/说明类型');
 if(!whole(config.totalCount)||!whole(config.passedCount)||config.passedCount>config.totalCount||!Number.isSafeInteger(config.unitPerDot)||config.unitPerDot<=0)issues.push('必须明确总数、通过数及每点整数权重；不可从口播猜数据');
 if(typeof config.unit!=='string'||!config.unit.trim())issues.push('必须明确计数单位');
 if(![config.atMs,config.emitMs,config.inletMs,config.passMs,config.settleMs].every(Number.isFinite)||config.atMs<0||config.emitMs<=0||config.inletMs<=0||config.passMs<=0||config.settleMs<=0)issues.push('发射、入喉、通过和沉积时长必须显式有效');
 if(config.collectMs!==undefined&&(!Number.isFinite(config.collectMs)||config.collectMs<=0))issues.push('出口收集运动时长须为正值');
 if(!Number.isFinite(duration)||duration<=0)issues.push('完整源场景时钟无效');
 if(scene.speed!==undefined&&(!Number.isFinite(scene.speed)||scene.speed<=0))issues.push('源投影速度必须为正值');
 if((notesOf(scene)||config.annotation)&&!config.copyWindow)issues.push('本场正文/节点条件须配置整块大字阅读时窗，不挤进图底小字');
 if(config.copyWindow&&(!Number.isFinite(config.copyWindow.atMs)||config.copyWindow.atMs<0||!(config.copyWindow.durationMs>0)||config.copyWindow.atMs+config.copyWindow.durationMs>duration))issues.push('完整文字时窗须在源场内且有正时长');
 if(config.side!==undefined&&!['left','right'].includes(config.side))issues.push('人物避让侧无效');
 if(!issues.length){
  try{const tokens=funnelTokenPlan(config),end=completionAt(tokens,config);if(end+600>duration)issues.push('源场不足以让全部点到达终态并停留600ms');if(config.copyWindow&&config.copyWindow.atMs+config.copyWindow.durationMs>config.atMs&&config.copyWindow.atMs<end+600)issues.push('整块文字阅读与漏斗运动分段呈现，须在发射前或完成停留后');}catch(error){issues.push(error.message);}
 }
 if(![viewport.width,viewport.height].every(value=>Number.isFinite(value)&&value>0))issues.push('画幅尺寸无效');
 else{
  const {safe,panel}=funnelFlowGeometry(scene,config,0,viewport);
  if(!rectValid(panel)||!contains(safe,panel)||panel.width*viewport.width<240||panel.height*viewport.height<330)issues.push('漏斗区域须在人物全部窗关键帧的安全侧及字幕区上方，并有足够尺寸');
  const windows=scene.window?[scene.window,...(scene.window.keyframes??[])]:[];
  if(windows.some(window=>![window.x,window.y,window.size].every(Number.isFinite)||window.x<0||window.y<0||window.size<=0||window.x+window.size>1||window.y+window.size*viewport.width/viewport.height>1))issues.push('人物窗及其关键帧须在画幅内');
  const times=(scene.window?.keyframes??[]).map(frame=>frame.atMs);if(times.some(time=>!Number.isFinite(time)||time<0||time>duration)||new Set(times).size!==times.length)issues.push('人物关键帧时点须有限、在原场内且不可重复');
 }
 return [...new Set(issues)];
}

function heapPoint(index,count){const row=Math.floor((Math.sqrt(8*index+1)-1)/2),column=index-row*(row+1)/2,rows=Math.max(1,Math.ceil((Math.sqrt(8*count+1)-1)/2));return {x:.5+(column-row/2)*.60/Math.max(1,rows-1),y:.63-row*.48/Math.max(1,rows-1)};}
function passedPoint(index,count,body,viewport){const columns=Math.max(1,Math.ceil(Math.sqrt(count*body.width*viewport.width*.84/(body.height*viewport.height*.13)))),rows=Math.max(1,Math.ceil(count/columns));return {x:.08+((index%columns)+.5)*.84/columns,y:.83+(Math.floor(index/columns)+.5)*.13/rows};}
function passPoint(start,p){const neck={x:.5,y:.69},out={x:.5,y:.80};return p<.75?mixPoint(start,neck,ease(p/.75)):mixPoint(neck,out,ease((p-.75)/.25));}

export function funnelFlowState(scene,config,elapsed,viewport={width:1920,height:1080}){
 const issues=funnelFlowIssues(scene,config,viewport);if(!Number.isFinite(elapsed))issues.push('当前源时钟无效');
 const geometry=funnelFlowGeometry(scene,config,Number.isFinite(elapsed)?elapsed:0,viewport),duration=dynamicSceneDuration(scene),copyClock=visibleTextClock(elapsed,config.copyWindow?[{startMs:config.copyWindow.atMs,endMs:config.copyWindow.atMs+config.copyWindow.durationMs}]:[]),flowEnd=config.copyWindow&&config.copyWindow.atMs>=config.atMs?config.copyWindow.atMs:duration,flowClock=visibleTextClock(elapsed,[{startMs:config.atMs,endMs:flowEnd}]);
 const base={available:!issues.length,issues,geometry,copyClock,flowClock,duration,automaticAllowed:false,requiresFaceReview:true,transport:'illustrated-from-explicit-counts',coordinateSpace:'body-normalized',disclosure:config.dataKind==='explicit'?'明确来源数量的说明动画；粒子运动不是原始逐事件记录':'作者明确数量的原创说明动画',particles:[],tokens:[],counts:{emitted:0,passed:0,rejected:0,inFlight:0,notEmitted:whole(config.totalCount)?config.totalCount:0},phase:'unavailable',completedAtMs:null,rate:null,rateVisible:false,dotRadiusPx:0};
 if(issues.length)return base;
 const tokens=funnelTokenPlan(config),rejectCount=tokens.filter(token=>token.rejectedWeight).length,passCount=tokens.filter(token=>token.passedWeight).length,completedAtMs=completionAt(tokens,config),particles=[],counts={emitted:0,passed:0,rejected:0,inFlight:0,notEmitted:config.totalCount};
 for(const token of tokens){
  const age=elapsed-token.birthMs;if(age<0)continue;const inletAt=token.birthMs+config.inletMs,exitAt=inletAt+config.passMs,settledAt=inletAt+config.settleMs;
  counts.emitted+=token.weight;counts.notEmitted-=token.weight;
  const reject=token.rejectedWeight?heapPoint(token.rejectIndex,rejectCount):null,decision={x:.5+(Math.sin(token.index*2.399963)*.022),y:reject?Math.max(.07,Math.min(.46,reject.y-.065)):.46},start={x:.14+(.5+.5*Math.sin(token.index*2.399963+.7))*.72,y:.075};
  if(elapsed<inletAt){particles.push({id:token.id,tokenId:token.id,phase:'inlet',weight:token.weight,...mixPoint(start,decision,ease(age/config.inletMs))});counts.inFlight+=token.weight;continue;}
  if(token.passedWeight){const end=passedPoint(token.passIndex,passCount,geometry.body,viewport),done=elapsed>=exitAt,position=done?mixPoint({x:.5,y:.80},end,ease((elapsed-exitAt)/(config.collectMs??350))):passPoint(decision,(elapsed-inletAt)/config.passMs);particles.push({id:token.id+'-pass',tokenId:token.id,phase:done?'passed':'passing',weight:token.passedWeight,...position});if(done)counts.passed+=token.passedWeight;else counts.inFlight+=token.passedWeight;}
  if(token.rejectedWeight){const done=elapsed>=settledAt;particles.push({id:token.id+'-reject',tokenId:token.id,phase:done?'settled':'settling',weight:token.rejectedWeight,...(done?reject:mixPoint(decision,reject,ease((elapsed-inletAt)/config.settleMs)))});if(done)counts.rejected+=token.rejectedWeight;else counts.inFlight+=token.rejectedWeight;}
 }
 const rows=Math.max(1,Math.ceil((Math.sqrt(8*rejectCount+1)-1)/2)),dotRadiusPx=Math.max(1.6,Math.min(viewport.height*.0045,geometry.body.width*viewport.width*.60/Math.max(2,rows)*.36,geometry.body.height*viewport.height*.48/Math.max(2,rows)*.36));
 return {...base,particles,tokens,counts,completedAtMs,rate:config.totalCount?config.passedCount/config.totalCount:null,rateVisible:elapsed>=completedAtMs&&config.totalCount>0,dotRadiusPx,phase:copyClock.visible?'copy':elapsed<config.atMs?'before':elapsed>=completedAtMs?'complete':counts.emitted<config.totalCount?'emitting':'draining'};
}

// The renderer supplies a fit from the currently loaded real font. These are
// explicit review floors, not a claim that a synthetic test proves readability.
export function funnelTextReadiness(text,fit,clock,exposure={speed:1,startMs:-Infinity,endMs:Infinity}){
 if(!fit)return {ready:false,issues:['等待实际字体测量']};
 const issues=[];if(fit.unplaceable)issues.push('完整文字在最小字号下放不进区域');
 const pages=fit.pages??[],speed=exposure.speed??1;
 if(pages.flat().join('')!==String(text??'').replaceAll('\n',''))issues.push('实际测字与完整原文不一致');
 if(!(speed>0)||!Number.isFinite(speed))issues.push('文字曝光速度无效');
 if(!pages.length||pages.some((lines,index)=>{const start=clock.startMs+index*clock.duration/pages.length,end=start+clock.duration/pages.length,shown=Math.max(0,Math.min(end,exposure.endMs??Infinity)-Math.max(start,exposure.startMs??-Infinity))/speed,glyphs=[...new Intl.Segmenter('zh-CN',{granularity:'grapheme'}).segment(lines.join(''))].length;return shown<1200||glyphs/Math.max(.001,shown/1000)>14;}))issues.push('完整文字缺少实际保留/变速后的阅读时窗，请增时或拆场，不截字');
 return {ready:!issues.length,issues};
}
export function funnelTextPage(pages,clock){return Math.min(pages.length-1,Math.max(0,Math.floor(clock.elapsed/Math.max(1,clock.duration)*pages.length)));}
