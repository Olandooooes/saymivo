import {dynamicSceneDuration} from './dynamic-mechanisms.mjs';
import {sceneSpeakerLayout} from './storyboard.mjs';
import {speakerBox} from './presentation.mjs';
import {sourceTokenExposure,sourceTokenTextReadiness,sourceTokenPageState} from './source-token-transfer.mjs';
const clamp=value=>Math.max(0,Math.min(1,value)),ease=value=>{const p=clamp(value);return p*p*(3-2*p);};
const chars=text=>[...new Intl.Segmenter('zh-CN',{granularity:'grapheme'}).segment(text)].map(item=>item.segment);
export const completeNodeText=node=>[node.text,node.detail,...(node.bullets??[])].filter(Boolean).join('\n');
const safeRect=rect=>rect&&['x','y','width','height'].every(key=>Number.isFinite(rect[key]))&&rect.x>=0&&rect.y>=0&&rect.width>0&&rect.height>0&&rect.x+rect.width<=1.000001&&rect.y+rect.height<=.86;
const localAsset=src=>typeof src==='string'&&src.length&&!/^(?:https?:|file:|\/|.*\.\.)/.test(src);
export function progressiveUiState(scene,config,elapsed,viewport={width:1920,height:1080}){
 const wide=viewport.width>viewport.height,panel=config.panelRect??{x:.06,y:.15,width:wide?.66:.86,height:.64},gap=.015,rows=config.elements.length,rowHeight=(panel.height-gap*(rows-1))/Math.max(1,rows),nodes=new Map((scene.nodes??[]).map(node=>[node.id,node]));
 return {panel,disclosure:'中性流程说明板；不是具体产品录屏或真实运行证据',annotation:config.annotation??'',automaticAllowed:false,elements:config.elements.map((element,index)=>{const node=nodes.get(element.nodeId),focus=element.focusAtMs===undefined?0:ease((elapsed-element.focusAtMs)/180)*(1-ease((elapsed-element.focusAtMs-(element.focusMs??1100))/180)),fillAt=element.fillAtMs??element.atMs,fillMs=element.fillMs??900,progress=ease((elapsed-fillAt)/fillMs);return {...element,node,text:node?completeNodeText(node):'',rect:element.rect??{x:panel.x,y:panel.y+index*(rowHeight+gap),width:panel.width,height:rowHeight},opacity:ease((elapsed-element.atMs)/240),focus,fillAtMs:fillAt,fillMs,progress,value:element.role==='progress'?element.from+(element.to-element.from)*progress:null,questionOpacity:element.questionAtMs===undefined?0:ease((elapsed-element.questionAtMs)/220)};})};
}
export function progressiveUiIssues(scene,config,viewport={width:1920,height:1080}){
 const issues=[],duration=dynamicSceneDuration(scene),ids=new Set((scene.nodes??[]).map(node=>node.id));
 if(config.sourceKind!=='illustration'||!config.provenance?.trim())issues.push('渐进界面必须明确为原创示意，不冒充真实工具录屏');
 if(config.annotation!==undefined&&typeof config.annotation!=='string')issues.push('可编辑标注须为完整文字，默认不添加生产角标');
 if(!Array.isArray(config.elements)||!config.elements.length||config.elements.length>6)return [...issues,'示意界面需要1—6个可读元素'];
 if(new Set(config.elements.map(element=>element.id)).size!==config.elements.length)issues.push('界面元素ID须唯一');
 if(config.elements.some(e=>typeof e?.id!=='string'||!e.id||!Number.isFinite(e.fillMs??900)||!Number.isFinite(e.focusMs??1100)))issues.push('界面元素需要稳定ID及有限的填写/聚焦时长');
 for(const element of config.elements){if(!ids.has(element.nodeId)||!['field','text','progress','image'].includes(element.role))issues.push('界面元素须引用原对象及明确角色');if(!Number.isFinite(element.atMs)||element.atMs<0||element.atMs>=duration||!Number.isFinite(element.fillAtMs??element.atMs)||(element.fillAtMs??element.atMs)<element.atMs||!((element.fillMs??900)>0)||(element.fillAtMs??element.atMs)+(element.fillMs??900)+600>duration)issues.push('元素出现/填充须在源场内且有最终停留');if(element.focusAtMs!==undefined&&(!Number.isFinite(element.focusAtMs)||element.focusAtMs<element.atMs||!((element.focusMs??1100)>0)||element.focusAtMs+(element.focusMs??1100)>duration))issues.push('逐字段聚焦需要有效源时点');if(element.role==='progress'&&(![element.from,element.to].every(Number.isFinite)||Math.min(element.from,element.to)<0||Math.max(element.from,element.to)>1))issues.push('进度须是显式0—1起止值，不代表真实后台执行');if(element.role==='image'&&!localAsset(scene.nodes.find(node=>node.id===element.nodeId)?.assetSrc))issues.push('图片槽须绑定原对象的真实本地素材');if(element.questionAtMs!==undefined&&(!Number.isFinite(element.questionAtMs)||element.questionAtMs<element.atMs||element.questionAtMs>=duration))issues.push('问题标记时点无效');}
 if(progressiveUiState(scene,config,0,viewport).elements.some(element=>!safeRect(element.rect)))issues.push('示意界面超出字幕上方安全画幅');
 return [...new Set(issues)];
}

// Uses the complete measured pages, with a terminal hold on EVERY page.
// The text measured by the renderer is static; only glyph opacity changes.
export function progressivePageState(pages,elapsed,writeMs,holdMs=700){
 const counts=pages.map(lines=>chars(lines.join('')).length),total=counts.reduce((sum,count)=>sum+count,0),typingBudget=Math.max(0,writeMs-pages.length*holdMs),minimum=pages.length*holdMs;
 let at=0,index=Math.max(0,pages.length-1),reveal=counts.at(-1)??0,phase='hold';
 for(let page=0;page<pages.length;page++){const typing=total?typingBudget*counts[page]/total:0,end=at+typing+holdMs;if(elapsed<end){index=page;const age=Math.max(0,elapsed-at);reveal=typing?Math.min(counts[page],Math.floor(age/typing*counts[page])):counts[page];phase=age<typing?'writing':'hold';break;}at=end;}
 return {pageIndex:index,revealedGlyphs:elapsed<0?0:reveal,phase:elapsed<0?'waiting':phase,insufficientDuration:writeMs<minimum};
}

export function taskTracksState(scene,config,elapsed,viewport={width:1920,height:1080}){
 const wide=viewport.width>viewport.height,panel=config.panelRect??{x:.06,y:.17,width:wide?.66:.86,height:.59},rowHeight=panel.height/Math.max(1,config.rows.length),nodes=new Map((scene.nodes??[]).map(node=>[node.id,node])),range=config.domain.end-config.domain.start;
 const rows=config.rows.map((row,index)=>({id:row.id,node:nodes.get(row.nodeId),text:nodes.has(row.nodeId)?completeNodeText(nodes.get(row.nodeId)):'',rect:{x:panel.x,y:panel.y+index*rowHeight,width:panel.width,height:rowHeight},segments:row.segments.map(segment=>{const draw=ease((elapsed-segment.atMs)/segment.drawMs),fill=segment.fillAtMs===undefined?0:ease((elapsed-segment.fillAtMs)/(segment.fillMs??700));return {...segment,x:(segment.from-config.domain.start)/range,width:(segment.to-segment.from)/range,draw,fill,opacity:ease((elapsed-segment.atMs)/180),questionOpacity:segment.questionAtMs===undefined?0:ease((elapsed-segment.questionAtMs)/200)};})}));
 const cursor=config.cursor?{value:config.cursor.from+(config.cursor.to-config.cursor.from)*ease((elapsed-config.cursor.atMs)/config.cursor.durationMs),fraction:(config.cursor.from+(config.cursor.to-config.cursor.from)*ease((elapsed-config.cursor.atMs)/config.cursor.durationMs)-config.domain.start)/range}:null;
 let prior=null,current=config.calendar?.values?.[0]??null,flip=0;for(const value of config.calendar?.values??[]){if(elapsed<value.atMs)break;prior=current;current=value;flip=ease((elapsed-value.atMs)/(config.calendar.flipMs??500));}
 return {panel,rows,cursor,disclosure:config.dataKind==='illustration'?'任务时间为说明性关系，不是实测工时':'按显式数据绘制；数值来源仍需核对',annotation:config.annotation??'',automaticAllowed:false,calendar:current?{prior:prior??current,current,flip,rotationDeg:-180*flip,from:Math.min(...config.calendar.values.map(value=>value.value)),to:Math.max(...config.calendar.values.map(value=>value.value))}:null};
}
export function taskTracksIssues(scene,config){
 const issues=[],duration=dynamicSceneDuration(scene),ids=new Set((scene.nodes??[]).map(node=>node.id)),domain=config.domain;
 if(!['illustration','explicit'].includes(config.dataKind)||!config.provenance?.trim())issues.push('轨道须标明明确数据/示意及来源，不能伪造实测时间');
 if(config.annotation!==undefined&&typeof config.annotation!=='string')issues.push('可编辑标注须为完整文字，默认不添加生产角标');
 if(!domain||![domain.start,domain.end].every(Number.isFinite)||domain.end<=domain.start||!domain.unit?.trim())return [...issues,'任务轨道需要显式共同时间域与单位'];
 if(!Array.isArray(config.rows)||!config.rows.length||config.rows.length>5)return [...issues,'任务轨道需要1—5行'];
 if(new Set(config.rows.map(row=>row.id)).size!==config.rows.length)issues.push('轨道ID须唯一');
 if(config.rows.some(row=>typeof row?.id!=='string'||!row.id||(row.segments??[]).some(s=>typeof s?.id!=='string'||!s.id||!Number.isFinite(s.drawMs)||!Number.isFinite(s.fillMs??700))))issues.push('轨道与时段需要稳定ID及有限的绘制/着色时长');
 for(const row of config.rows){if(!ids.has(row.nodeId)||!row.segments?.length)issues.push('每行须引用完整原对象并含显式时段');if(new Set(row.segments?.map(segment=>segment.id)).size!==row.segments?.length)issues.push('时段ID须唯一');for(const segment of row.segments??[]){if(!segment.label?.length||![segment.from,segment.to].every(Number.isFinite)||segment.from<domain.start||segment.to>domain.end||segment.to<=segment.from)issues.push('时段须有完整标签且位于共同时间域');if(!Number.isFinite(segment.atMs)||segment.atMs<0||!(segment.drawMs>0)||segment.atMs+segment.drawMs+600>duration)issues.push('时段绘制须有源时点和完整停留');if(segment.fillAtMs!==undefined&&(!Number.isFinite(segment.fillAtMs)||segment.fillAtMs<segment.atMs||!((segment.fillMs??700)>0)||segment.fillAtMs+(segment.fillMs??700)>duration))issues.push('时段着色时点无效');if(segment.questionAtMs!==undefined&&(!Number.isFinite(segment.questionAtMs)||segment.questionAtMs<segment.atMs||segment.questionAtMs>=duration))issues.push('问题标记时点无效');}}
 if(config.panelRect&&!safeRect(config.panelRect))issues.push('轨道必须位于字幕安全区上方');
 if(config.cursor&&(![config.cursor.from,config.cursor.to,config.cursor.atMs,config.cursor.durationMs].every(Number.isFinite)||Math.min(config.cursor.from,config.cursor.to)<domain.start||Math.max(config.cursor.from,config.cursor.to)>domain.end||config.cursor.atMs<0||config.cursor.durationMs<=0||config.cursor.atMs+config.cursor.durationMs>duration))issues.push('游标需要显式时间域与有效源时段');
 if(config.calendar){const values=config.calendar.values;if(!Number.isFinite(config.calendar.flipMs??500)||!((config.calendar.flipMs??500)>0)||!values?.length||values.some((value,index)=>!Number.isInteger(value.value)||!Number.isFinite(value.atMs)||value.atMs<0||value.atMs+(config.calendar.flipMs??500)+600>duration||!value.label?.length||index>0&&value.atMs<=values[index-1].atMs))issues.push('日历翻页须有明确整数日数/完整标签和顺序时点');}
 return [...new Set(issues)];
}

const overlap=(a,b)=>a.x<b.x+b.width-1e-7&&a.x+a.width>b.x+1e-7&&a.y<b.y+b.height-1e-7&&a.y+a.height>b.y+1e-7;
const unique=values=>[...new Set(values)];
export function progressiveCompleteCopy(scene,config){return [scene.title,scene.body,...(scene.nodes??[]).map(completeNodeText),config?.annotation].filter(t=>typeof t==='string'&&t.length).join('\n');}
export function progressiveLayoutKey(scene,config,viewport,font){return JSON.stringify([scene.sourceId??scene.id,scene.src,scene.nodes,progressiveCompleteCopy(scene,config),scene.window,config,viewport,font]);}
export function progressiveProtectedRects(scene,viewport){
 const points=scene.window?[scene.window,...(scene.window.keyframes??[])]:[],rects=points.map(p=>({x:p.x,y:p.y,width:p.size,height:p.size*viewport.width/viewport.height}));
 if(!points.length){const r=speakerBox(sceneSpeakerLayout({...scene,visualPreset:undefined}),viewport.width,viewport.height);rects.push({x:r.left/viewport.width,y:r.top/viewport.height,width:r.width/viewport.width,height:r.height/viewport.height});}
 const x=Math.min(...rects.map(r=>r.x)),y=Math.min(...rects.map(r=>r.y));return [...rects,{x,y,width:Math.max(...rects.map(r=>r.x+r.width))-x,height:Math.max(...rects.map(r=>r.y+r.height))-y}];
}
export function progressiveCriticalEntry(scene,config){
 const events=config.kind==='progressive-ui'?config.elements.flatMap(e=>[e.atMs,e.fillAtMs??e.atMs,e.focusAtMs,e.questionAtMs]):[...config.rows.flatMap(r=>r.segments.flatMap(s=>[s.atMs,s.fillAtMs,s.questionAtMs])),config.cursor?.atMs,...(config.calendar?.values??[]).map(v=>v.atMs)];
 return Math.min(...events.filter(Number.isFinite));
}
/** These boxes are also the renderer's sole native text geometry. */
export function progressiveFieldPlan(scene,config,viewport={width:1920,height:1080}){
 const d=dynamicSceneDuration(scene),cw=config.copyWindow,start=cw?.endMs??0,pad=viewport.height*.012,fields=[{id:'complete-copy',text:progressiveCompleteCopy(scene,config),rect:cw?.rect,atMs:cw?.atMs,endMs:cw?.endMs,role:'copy'}],w=viewport.width,h=viewport.height;
 const box=(x,y,width,height)=>({x:x/w,y:y/h,width:width/w,height:height/h});
 if(config.kind==='progressive-ui'){
  const s=progressiveUiState(scene,config,0,viewport);fields.push({id:'title',text:scene.title,rect:{x:s.panel.x,y:.035,width:s.panel.width,height:.08},atMs:start,endMs:d,role:'native'});
  for(const e of s.elements){const bw=e.rect.width*w,bh=e.rect.height*h,label=e.role==='progress'?bh*.45:e.role==='image'?bh*.35:bh-pad*2;
   fields.push({id:'element:'+e.id,text:e.text,rect:box(e.rect.x*w+pad,e.rect.y*h+pad,bw-2*pad,label),atMs:e.fillAtMs,endMs:d,writeMs:e.fillMs,role:'writing'});
   if(e.questionAtMs!==undefined)fields.push({id:'question:'+e.id,text:'?',rect:{x:e.rect.x+e.rect.width-.035,y:e.rect.y-.016,width:.035,height:.06},atMs:e.questionAtMs+220,endMs:d,role:'native'});
  }
 }else{
  const s=taskTracksState(scene,config,0,viewport),calendar=config.calendar?.rect??{x:w>h?.77:.71,y:.06,width:.20,height:.105},tw=config.calendar?Math.min(s.panel.width,calendar.x-s.panel.x-.02):s.panel.width;
  fields.push({id:'title',text:scene.title,rect:{x:s.panel.x,y:.035,width:tw,height:.08},atMs:start,endMs:d,role:'native'});
  for(const row of s.rows){const bh=row.rect.height*h,p=h*.01,trackWidth=row.rect.width*w*.76;
   fields.push({id:'row:'+row.id,text:row.text,rect:box(row.rect.x*w,row.rect.y*h,row.rect.width*w*.24-w*.012,bh-p),atMs:start,endMs:d,role:'native'});
   for(const seg of row.segments){fields.push({id:'segment:'+row.id+':'+seg.id,text:seg.label,rect:box(row.rect.x*w+row.rect.width*w*.24+trackWidth*seg.x+p,row.rect.y*h+bh*.15+p,trackWidth*seg.width-p*2,bh*.70-p*2),atMs:seg.atMs+seg.drawMs,endMs:d,role:'native'});
    if(seg.questionAtMs!==undefined)fields.push({id:'question:'+row.id+':'+seg.id,text:'?',rect:box(row.rect.x*w+row.rect.width*w*.24+trackWidth*(seg.x+seg.width)-h*.035,row.rect.y*h+bh*.15-h*.014,h*.035,h*.05),atMs:seg.questionAtMs+220,endMs:d,role:'native'});
   }
  }
  for(const [i,v] of (config.calendar?.values??[]).entries())fields.push({id:'calendar:'+i,text:v.label,rect:box(calendar.x*w+h*.01,calendar.y*h+h*.057,calendar.width*w-h*.02,calendar.height*h-h*.067),atMs:v.atMs+(config.calendar.flipMs??500),endMs:config.calendar.values[i+1]?.atMs??d,role:'native'});
  fields.push({id:'axis',text:`${config.domain.start}—${config.domain.end}${config.domain.unit}${config.annotation?' · '+config.annotation:''}`,rect:{x:s.panel.x,y:.80,width:s.panel.width,height:.045},atMs:start,endMs:d,role:'native'});
 }
 return fields.filter(f=>f.text);
}
export function progressiveNumberPlan(scene,config,viewport={width:1920,height:1080}){
 const w=viewport.width,h=viewport.height,d=dynamicSceneDuration(scene),pad=h*.012;
 if(config.kind==='progressive-ui')return progressiveUiState(scene,config,0,viewport).elements.filter(e=>e.role==='progress').map(e=>({id:e.id,from:Math.round(e.from*100),to:Math.round(e.to*100),unit:'%',rect:{x:e.rect.x+e.rect.width-e.rect.width*.23-pad/w,y:e.rect.y+e.rect.height*.45+pad/h,width:e.rect.width*.23,height:e.rect.height*.40},atMs:e.fillAtMs+e.fillMs,endMs:d}));
 const calendar=config.calendar?.rect??{x:w>h?.77:.71,y:.06,width:.20,height:.105},vs=config.calendar?.values??[];
 return vs.map((v,i)=>({id:'calendar:'+i,from:Math.min(...vs.map(v=>v.value)),to:Math.max(...vs.map(v=>v.value)),unit:'',rect:{x:calendar.x+h*.01/w,y:calendar.y+.01,width:calendar.width-h*.02/w,height:.047},atMs:v.atMs+(config.calendar.flipMs??500),endMs:vs[i+1]?.atMs??d}));
}
export function progressivePresentationIssues(scene,config,viewport={width:1920,height:1080}){
 if(!scene||!config||!['progressive-ui','task-tracks'].includes(config.kind))return ['说明板或任务轨道配置无效'];
 let issues;try{issues=config.kind==='progressive-ui'?progressiveUiIssues(scene,config,viewport):taskTracksIssues(scene,config);}catch{return ['参数尚未完整，请补齐原对象、明确数值和时点'];}if(issues.length)return issues;
 const d=dynamicSceneDuration(scene),exposure=sourceTokenExposure(scene),copy=config.copyWindow,entry=progressiveCriticalEntry(scene,config),overview=config.kind==='task-tracks'?1000:0;
 if(![d,exposure.startMs,exposure.endMs,exposure.speed,viewport.width,viewport.height].every(Number.isFinite)||d<=0||exposure.speed<=0||exposure.startMs<-.01||exposure.endMs>d+.01||exposure.endMs<=exposure.startMs||viewport.width<=0||viewport.height<=0)issues.push('完整原场或保留变速时钟无效');
 if(!copy||!safeRect(copy.rect)||![copy.atMs,copy.endMs].every(Number.isFinite)||copy.atMs<0||copy.endMs>d||copy.endMs-copy.atMs<1000)issues.push('需要显式完整原文阅读窗口');
 if(copy&&copy.endMs+overview>entry+.01)issues.push('完整原文窗口不能隐藏原生入场、绘制、填充、游标或翻页动作');
 const times=(scene.window?.keyframes??[]).map(p=>p.atMs);if(times.some(t=>!Number.isFinite(t)||t<0||t>d)||new Set(times).size!==times.length)issues.push('人物关键帧源时点无效');
 if(issues.length)return unique(issues);
 const fields=progressiveFieldPlan(scene,config,viewport),numbers=progressiveNumberPlan(scene,config,viewport),protectedRects=progressiveProtectedRects(scene,viewport),native=fields.filter(f=>f.role!=='copy'),all=[...fields,...numbers],state=config.kind==='progressive-ui'?progressiveUiState(scene,config,0,viewport):taskTracksState(scene,config,0,viewport),graphics=config.kind==='progressive-ui'?state.elements.map(e=>e.rect):[state.panel,...(config.calendar?[config.calendar.rect??{x:viewport.width>viewport.height?.77:.71,y:.06,width:.20,height:.105}]:[])];
 if(new Set(fields.map(f=>f.id)).size!==fields.length)issues.push('内部文字对象身份冲突，请使用互不歧义的稳定ID');
 if(protectedRects.some(r=>!safeRect(r))||all.some(f=>!safeRect(f.rect)||protectedRects.some(p=>overlap(f.rect,p)))||graphics.some(r=>!safeRect(r)||protectedRects.some(p=>overlap(r,p))))issues.push('完整文字、原生图解或人物路径跨越字幕/已知人物保护区');
 for(let i=0;i<graphics.length;i++)for(let j=i+1;j<graphics.length;j++)if(overlap(graphics[i],graphics[j]))issues.push('独立元素、日历与任务图解不能互相覆盖');
 for(let i=0;i<all.length;i++)for(let j=i+1;j<all.length;j++)if(all[i].atMs<all[j].endMs&&all[j].atMs<all[i].endMs&&overlap(all[i].rect,all[j].rect))issues.push('同时显示的完整文字或数值框互相遮挡');
 if(config.kind==='progressive-ui'&&(scene.media?.src||(scene.nodes??[]).some(n=>n.assetSrc&&!config.elements.some(e=>e.nodeId===n.id&&e.role==='image'))))issues.push('已有真实资料未映射到图片槽，不能用说明板替代');
 if(config.kind==='task-tracks'&&(scene.media?.src||(scene.nodes??[]).some(n=>n.assetSrc)))issues.push('任务轨道不显示本场已有真实资料，请改用证据构图');
 return unique(issues);
}
export function progressiveWritingHold(fit,exposure){return Math.max(1000,...(fit?.pages??[]).map(p=>chars(p.join('')).length*85))*exposure.speed;}
export function progressiveFieldReadiness(field,fit,exposure){
 if(field.role!=='writing')return sourceTokenTextReadiness(field.text,fit,field,exposure);
 if(!fit)return {status:'waiting',issues:['等待原生动态文字的实际字体测量']};
 const base=sourceTokenTextReadiness(field.text,fit,{atMs:field.atMs,endMs:field.endMs},exposure),issues=[...base.issues],hold=progressiveWritingHold(fit,exposure),counts=fit.pages.map(p=>chars(p.join('')).length),total=counts.reduce((a,b)=>a+b,0),typing=field.writeMs-hold*counts.length;let at=field.atMs;
 if(typing<0)issues.push('逐字填写时间不足以完整保留每页阅读窗口');
 for(let i=0;i<counts.length;i++){const write=total?Math.max(0,typing)*counts[i]/total:0,start=at+write,end=i===counts.length-1?field.endMs:at+write+hold,shown=Math.max(0,Math.min(end,exposure.endMs)-Math.max(start,exposure.startMs))/exposure.speed;if(shown<Math.max(1000,counts[i]*85))issues.push('逐字页完整出现后的保留变速阅读时间不足');at+=write+hold;}
 return {status:issues.length?'blocked':'ready',issues:unique(issues)};
}
export function progressivePresentationReadiness(scene,config,measurement,viewport={width:1920,height:1080}){
 const issues=progressivePresentationIssues(scene,config,viewport);if(issues.length)return {status:'blocked',issues};if(!measurement)return {status:'waiting',issues:['等待完整正文及原生文字/数值实际字体测量']};
 if(!measurement.fontKey||measurement.key!==progressiveLayoutKey(scene,config,viewport,measurement.fontKey))return {status:'blocked',issues:['原文、字体、源时钟或布局测量已失效']};
 const waiting=[],exposure=sourceTokenExposure(scene);for(const field of progressiveFieldPlan(scene,config,viewport)){const m=measurement.fields.find(m=>m.id===field.id),check=m?.text===field.text?progressiveFieldReadiness(field,m.fit,exposure):{status:'waiting',issues:['等待全部原生文字测量']};(check.status==='waiting'?waiting:issues).push(...check.issues);}
 for(const number of progressiveNumberPlan(scene,config,viewport)){const m=measurement.numbers.find(m=>m.id===number.id);if(!m||m.specKey!==JSON.stringify(number))waiting.push('等待最终数值/单位字形框测量');else if(m.unplaceable)issues.push('原生数值或单位无法完整容纳');const hold=Math.max(0,Math.min(number.endMs,exposure.endMs)-Math.max(number.atMs,exposure.startMs))/exposure.speed;if(hold<1000)issues.push('最终数值缺少保留变速后的可读停留');}
 const actions=config.kind==='progressive-ui'?config.elements.flatMap(e=>[[e.atMs,e.atMs+240],[e.fillAtMs??e.atMs,(e.fillAtMs??e.atMs)+(e.fillMs??900)],...(e.focusAtMs===undefined?[]:[[e.focusAtMs,e.focusAtMs+(e.focusMs??1100)+180]]),...(e.questionAtMs===undefined?[]:[[e.questionAtMs,e.questionAtMs+220]])]):[...config.rows.flatMap(r=>r.segments.flatMap(s=>[[s.atMs,s.atMs+s.drawMs],...(s.fillAtMs===undefined?[]:[[s.fillAtMs,s.fillAtMs+(s.fillMs??700)]]),...(s.questionAtMs===undefined?[]:[[s.questionAtMs,s.questionAtMs+220]])])),...(config.cursor?[[config.cursor.atMs,config.cursor.atMs+config.cursor.durationMs]]:[]),...(config.calendar?.values??[]).map(v=>[v.atMs,v.atMs+(config.calendar.flipMs??500)])];
 if(actions.some(([start,end])=>start<exposure.startMs-.01||end+1000*exposure.speed>exposure.endMs+.01))issues.push('原生动作及最终停留必须完整保留，不能用文字已显示替代被剪掉的后半动作');
 return {status:issues.length?'blocked':waiting.length?'waiting':'ready',issues:unique([...issues,...waiting])};
}
