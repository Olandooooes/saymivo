import {typedDataClockIssues,typedDataClockState,typedDataClockFormatDuration} from './typed-data-clock.mjs';
import {projectStoryboard} from './storyboard.mjs';
import {persistentMotionProtectedRects,persistentMotionCaptionBands} from './persistent-motion.mjs';
import {sourceTokenExposure,sourceTokenTextReadiness} from './source-token-transfer.mjs';

const finite=n=>typeof n==='number'&&Number.isFinite(n),text=s=>typeof s==='string'&&!!s.trim(),unique=a=>new Set(a).size===a.length;
const full=n=>n?[n.text,n.detail,...(n.bullets??[])].filter(s=>typeof s==='string'&&s.length).join('\n'):'';
const strip=s=>{const {dynamicMotion,visualPreset,...raw}=s;return raw;};
const stable=x=>Array.isArray(x)?x.map(stable):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().filter(k=>x[k]!==undefined).map(k=>[k,stable(x[k])])):x;
const serial=x=>JSON.stringify(stable(x)),same=(a,b)=>serial(a)===serial(b),must=(ok,message)=>{if(!ok)throw Error(message);};
const rect=r=>r&&['x','y','width','height'].every(k=>finite(r[k]))&&r.x>=0&&r.y>=0&&r.width>0&&r.height>0&&r.x+r.width<=1.000001&&r.y+r.height<=.86;
const canvas=r=>r&&['x','y','width','height'].every(k=>finite(r[k]))&&r.x>=0&&r.y>=0&&r.width>0&&r.height>0&&r.x+r.width<=1.000001&&r.y+r.height<=1.000001;
const overlap=(a,b)=>a.x<b.x+b.width-1e-7&&a.x+a.width>b.x+1e-7&&a.y<b.y+b.height-1e-7&&a.y+a.height>b.y+1e-7;
const intersects=(a,b)=>a.startMs<b.endMs&&b.startMs<a.endMs;
const sourceCopy=raw=>[raw.title,raw.body,raw.label,raw.sourceNote,...(raw.tags??[]).map(t=>t.text),...(raw.links??[]).map(l=>l.label),...(raw.nodes??[]).map(full)].filter(s=>typeof s==='string'&&s.length).join('\n');

/** Strict ink boxes for this new kind only; old approved glyph geometry stays unchanged. */
export function typedClockGlyphFit({glyphs,slots,unit='',width,height,minFont,maxFont,measure}){
 const chars=[...new Intl.Segmenter('zh-CN',{granularity:'grapheme'}).segment(glyphs)].map(p=>p.segment);
 must(chars.length&&Number.isInteger(slots)&&slots>0&&[width,height,minFont,maxFont].every(n=>finite(n)&&n>0)&&maxFont>=minFont,'明确数字字形、位数与测量区域无效');
 const at=size=>{const metrics=chars.map(c=>measure(c,size)),u=measure(unit,size);must([...metrics,u].every(m=>['width','actualBoundingBoxLeft','actualBoundingBoxRight','actualBoundingBoxAscent','actualBoundingBoxDescent'].every(k=>finite(m[k]))),'需要当前字体的真实完整字形墨迹测量');const pad=size*.025,leftInset=Math.max(0,...metrics.map(m=>m.actualBoundingBoxLeft))+pad,advance=leftInset+Math.max(0,...metrics.map(m=>Math.max(m.width,m.actualBoundingBoxRight)))+pad,ascent=Math.max(0,...metrics.map(m=>m.actualBoundingBoxAscent),u.actualBoundingBoxAscent)+pad,rowHeight=ascent+Math.max(0,...metrics.map(m=>m.actualBoundingBoxDescent),u.actualBoundingBoxDescent)+pad,unitLeftInset=Math.max(0,u.actualBoundingBoxLeft)+pad,unitWidth=unit?unitLeftInset+Math.max(0,u.width,u.actualBoundingBoxRight)+pad:0,unitX=slots*advance+(unit?size*.22:0);return{fontSize:size,advance,leftInset,ascent,rowHeight,unitWidth,unitLeftInset,unitX,totalWidth:unitX+unitWidth};};
 let low=minFont,high=maxFont,best=at(low);for(let i=0;i<15;i++){const s=(low+high)/2,m=at(s);if(m.totalWidth<=width&&m.rowHeight<=height){low=s;best=m;}else high=s;}
 return{...best,unplaceable:best.totalWidth>width||best.rowHeight>height};
}

export function typedClockTracks(config){return [...(config.durationTracks??[]).map(t=>({...t,kind:'duration',unit:'ms'})),...(config.eventTracks??[]).map(t=>({...t,kind:'event-count',unit:'count'})),...(config.receiptTracks??[]).map(t=>({...t,kind:'receipt-duration',unit:'ms'}))];}
const unitFor=t=>t.kind==='event-count'?t.displayUnit:t.format?.kind==='seconds'?'s':'';
function metadata(t){
 const receipt=t.kind==='receipt-duration'?`静态回执 · ${t.receipt?.basis}\n开始 ${t.receipt?.startMs} ms\n结束 ${t.receipt?.endMs} ms`:'';
 const definition=t.kind==='event-count'?`${t.eventDefinition?.name??''}\n${t.eventDefinition?.criterion??''}`:'';
 return [t.expectedText,t.label,t.definition,`数值单位：${t.unit}${unitFor(t)?' · 显示 '+unitFor(t):t.format?.kind==='mm:ss'?' · 显示 mm:ss':''}`,t.provenance?.note,receipt,definition].filter(Boolean).join('\n');
}
export function compileTypedClockMotion(raw,config){
 const tracks=typedClockTracks(config),duration=raw.endMs-raw.startMs;
 must(config.kind==='typed-data-clock'&&config.clock==='scene-source-relative-ms','请选择共享数据时钟及完整原场时钟');
 must(tracks.length>0&&tracks.length<=6&&unique(tracks.map(t=>t.id)),'请添加1–6条具有唯一身份的明确数据轨道');
 const cw=config.copyWindow;
 must(cw&&rect(cw.rect)&&[cw.atMs,cw.endMs].every(finite)&&cw.atMs>=0&&cw.endMs>cw.atMs&&cw.endMs<=duration,'需要明确完整来源和原文的阅读窗口');
 const fields=[{id:'complete-copy',text:[sourceCopy(raw),...tracks.map(metadata)].filter(Boolean).join('\n'),rect:cw.rect,startMs:cw.atMs,endMs:cw.endMs,role:'copy'}],numbers=[];
 for(const t of tracks){
  const ns=(raw.nodes??[]).filter(n=>n.id===t.nodeId);
  must(ns.length===1&&text(t.expectedText)&&t.expectedText===full(ns[0]),'数据轨道必须绑定当前原节点的完整原文与条件');
  must(t.window&&t.window.startMs>=cw.endMs&&t.window.endMs<=duration&&t.window.endMs>t.window.startMs,'数据与图形不得挤掉全文窗口，须设置明确原场时段');
  must(rect(t.textRect)&&rect(t.numberRect),'完整来源、定义与数值需要各自明确区域');
  must(t.geometry&&['none','bar','dial'].includes(t.geometry.kind)&&(t.geometry.kind==='none'||rect(t.geometry.rect)),'请选择明确图形与区域');
  must(t.kind!=='receipt-duration'||t.geometry.kind==='none','静态回执差值不允许运行进度、环形表盘或计增动画');
  if(t.kind==='event-count')must(text(t.displayUnit),'事件计数必须明确显示单位');
  fields.push({id:'track:'+t.id,text:metadata(t),rect:t.textRect,...t.window,role:'definition'});
  const slots=t.format?.kind==='integer'?t.format.integerDigits:t.format?.kind==='mm:ss'?t.format.minuteDigits+3:t.format?.integerDigits+(t.format?.decimals?1+t.format.decimals:0);
  must(Number.isInteger(slots)&&slots>0&&slots<=18,'数值格式必须有明确且可读的完整位数');
  numbers.push({id:t.id,rect:t.numberRect,startMs:t.window.startMs,endMs:t.window.endMs,slots,glyphs:'0123456789.:',unit:unitFor(t),samples:[],minFont:26});
 }
 return {typed:{kind:'typed-data-clock',clock:config.clock,binding:config.binding,tracks},tracks,fields,numbers,duration};
}
export function typedClockMotionKey(scene,raw,config,identity,viewport,proof,fontKey){return serial([strip(scene),strip(raw),config,identity,viewport,proof.clips,proof.fps,proof.captions??[],fontKey]);}
export function typedClockMotionIssues(scene,raw,config,identity,viewport,proof){
 try{
  const c=compileTypedClockMotion(raw,config),issues=[];
  must(proof&&same(strip(proof.rawScene),strip(raw))&&Array.isArray(proof.clips)&&finite(proof.fps)&&proof.fps>0,'需要当前全工程剪辑和原场的投影证明');
  const expected=projectStoryboard([strip(raw)],proof.clips,proof.fps).find(p=>p.id===scene.id&&p.clipId===scene.clipId);
  must(expected&&same(expected,strip(scene)),'本场投影不再匹配完整原片源时钟');
  issues.push(...typedDataClockIssues(strip(scene),c.typed,{sourceIdentity:identity,projectionProof:{...proof,rawScene:strip(raw)}}));
  if(issues.length)return issues;
  must(!raw.media?.src&&!(raw.nodes??[]).some(n=>n.assetSrc),'本场已有真实资料，数据时钟不能静默替换资料');
  const keys=raw.window?.keyframes??[];
  must(unique(keys.map(k=>k.atMs))&&keys.every(k=>finite(k.atMs)&&k.atMs>=0&&k.atMs<=c.duration),'人物关键帧时钟无效');
  const people=persistentMotionProtectedRects(raw,viewport,config.protectedAreas??[]);
  must(people.every(canvas),'需要有效已知人物窗及完整路径');
  const protectedRects=[...people,...persistentMotionCaptionBands(scene,proof)],zones=[...c.fields,...c.numbers.map(n=>({...n,role:'number'})),...c.tracks.filter(t=>t.geometry.kind!=='none').map(t=>({id:'geometry:'+t.id,rect:t.geometry.rect,...t.window,role:'geometry'}))],exposure=sourceTokenExposure(scene);
  for(const z of zones){
   if(!rect(z.rect)||protectedRects.some(r=>overlap(z.rect,r)))issues.push('完整文字/数值/图形与人物或字幕重叠：'+z.id);
   if(z.startMs<exposure.startMs-.02||z.endMs>exposure.endMs+.02)issues.push('完整阅读和轨道窗口必须全部保留：'+z.id);
  }
  for(let i=0;i<zones.length;i++)for(let j=i+1;j<zones.length;j++)if(intersects(zones[i],zones[j])&&overlap(zones[i].rect,zones[j].rect))issues.push('同一时段的完整文字与图形区域重叠');
  for(const t of c.tracks)if((t.window.endMs-t.window.startMs)/exposure.speed<1200)issues.push('数值轨道需要足够的实际保留阅读时长');
  return [...new Set(issues)];
 }catch(error){return[error instanceof Error?error.message:'数据时钟参数不完整'];}
}
export function typedClockMotionReadiness(scene,raw,config,identity,viewport,proof,measurement){
 const issues=typedClockMotionIssues(scene,raw,config,identity,viewport,proof);
 if(issues.length)return{status:'blocked',issues};
 if(!measurement?.fontKey||measurement.key!==typedClockMotionKey(scene,raw,config,identity,viewport,proof,measurement.fontKey))return{status:'waiting',issues:['等待当前实际字体、完整文字及0–9分隔符最大字形测量']};
 const c=compileTypedClockMotion(raw,config),waiting=[],exposure=sourceTokenExposure(scene);
 for(const f of c.fields){const m=measurement.fields?.find(m=>m.id===f.id),r=m?.text===f.text?sourceTokenTextReadiness(f.text,m.fit,{atMs:f.startMs,endMs:f.endMs},exposure):{status:'waiting',issues:['等待完整文案的当前字体测量']};(r.status==='waiting'?waiting:issues).push(...r.issues.map(x=>f.id+'：'+x));}
 for(const n of c.numbers){const m=measurement.numbers?.find(m=>m.id===n.id&&m.specKey===JSON.stringify(n));if(!m)waiting.push('等待完整数字字形与单位测量：'+n.id);else if(m.unplaceable)issues.push('数字最大位数或单位无法完整放入：'+n.id);}
 return{status:issues.length?'blocked':waiting.length?'waiting':'ready',issues:[...new Set([...issues,...waiting])]};
}
export function typedClockMotionSample(scene,raw,config,identity,proof,elapsed){
 const c=compileTypedClockMotion(raw,config),state=typedDataClockState(strip(scene),c.typed,elapsed,{sourceIdentity:identity,projectionProof:{...proof,rawScene:strip(raw)}});
 return {...state,tracks:state.tracks.map(t=>({...t,geometryProgress:t.kind==='receipt-duration'?null:t.kind==='event-count'?t.eventProgress:t.progress}))};
}

const field=(key,label,type,extra={})=>({key,label,type,...extra}),time=(key,label)=>field(key,label,'source-ms'),r=(key,label)=>field(key,label,'stage-rect'),record=(key,label,fields)=>field(key,label,'record',{fields}),locked=(key,label,fixed)=>field(key,label,'text',{fixed}),id=field('id','稳定轨道ID','stable-id',{readonly:true});
const format=[field('kind','显示格式','select',{source:'explicit-choice',options:['mm:ss','seconds','integer']}),field('minuteDigits','分钟位数','number'),field('integerDigits','整数位数','number'),field('decimals','秒小数位数','number'),field('rounding','秒舍入方式','select',{source:'explicit-choice',options:['floor','nearest']})];
const common=[id,field('nodeId','来源完整原节点','node-ref'),field('expectedText','来源完整原文与条件','text',{readonly:true,source:'scene-node-complete-text'}),field('label','作者完整标题','text'),field('definition','数值定义与口径','text'),record('provenance','明确来源或原创示意',[field('kind','来源类别','select',{source:'explicit-choice',options:['explicit-source','illustration']}),field('note','来源与限定说明','text')]),record('window','完整原场显示时段',[time('startMs','开始'),time('endMs','结束')]),record('format','数值格式',format),r('textRect','完整来源与定义区域'),r('numberRect','稳定数值区域'),record('geometry','同钟图形',[field('kind','图形类别','select',{source:'explicit-choice',options:['none','bar','dial']}),r('rect','图形区域')])];
const list=(key,label,itemFields)=>field(key,label,'list',{preserveId:true,itemFields});
export const typedClockMotionControls={kind:'typed-data-clock',label:'共享数据时钟与静态回执',stage:'experimental-independent',uiAccepted:false,automaticAllowed:false,fields:[locked('clock','原场源时钟','scene-source-relative-ms'),field('binding','当前原片身份','source-binding',{readonly:true}),record('copyWindow','全文与数据来源先行窗口',[time('atMs','开始'),time('endMs','结束'),r('rect','完整文字区域')]),
 list('durationTracks','时长与明确范围', [...common,locked('unit','原始单位','ms'),record('value','时长依据',[field('basis','时长依据','select',{source:'explicit-choice',options:['source-elapsed','explicit-range']}),time('fromMs','明确范围起值'),time('toMs','明确范围终值')])]),
 list('eventTracks','明示事件计数',[...common,locked('unit','原始单位','count'),field('displayUnit','完整显示单位','text'),field('initialCount','明确初值','number'),record('eventDefinition','明确事件定义',[field('name','事件名称','text'),field('criterion','计入规则','text')]),list('events','明确事件时点',[id,time('atMs','事件发生')])]),
 list('receiptTracks','静态开始结束回执',[...common,locked('unit','原始单位','ms'),record('receipt','同一时基的静态记录',[field('basis','共同时间基准','select',{source:'explicit-choice',options:['unix-epoch-ms','explicit-shared-origin-ms']}),field('startMs','明确开始值（毫秒）','number'),field('endMs','明确结束值（毫秒）','number')])])
]};
