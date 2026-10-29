import {dynamicSceneDuration} from './dynamic-mechanisms.mjs';
import {projectStoryboard} from './storyboard.mjs';
import {sourceTokenExposure,sourceTokenTextReadiness,sourceTokenPageState} from './source-token-transfer.mjs';

const finite=n=>typeof n==='number'&&Number.isFinite(n);
const clamp=n=>Math.max(0,Math.min(1,n));
const unique=a=>[...new Set(a)];
const sha=s=>typeof s==='string'&&/^[a-f0-9]{64}$/i.test(s);
const local=s=>typeof s==='string'&&s.length>0&&!/^(?:https?:|file:|\/|.*\.\.)/.test(s);
const rect=r=>r&&['x','y','width','height'].every(k=>finite(r[k]))&&r.x>=0&&r.y>=0&&r.width>0&&r.height>0&&r.x+r.width<=1.000001&&r.y+r.height<=.86;
const overlaps=(a,b)=>a.x<b.x+b.width-1e-7&&a.x+a.width>b.x+1e-7&&a.y<b.y+b.height-1e-7&&a.y+a.height>b.y+1e-7;
const sameTime=(a,b)=>a.atMs<b.endMs&&b.atMs<a.endMs;
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const nodeCopy=n=>[n?.text,n?.detail,...(n?.bullets??[])].filter(s=>typeof s==='string'&&s.length).join('\n');
const getNode=(s,id)=>(s.nodes??[]).find(n=>n.id===id);
const inAxis=(a,v)=>finite(v)&&v>=a.min&&v<=a.max&&(a.scale!=='log10'||v>0);
const precision=(v,d)=>Math.abs(v-Number(v.toFixed(d)))<1e-9*Math.max(1,Math.abs(v));

/** Axis zero is NEVER silently invented. Log baseline is the explicit positive min. */
export function quantitativeAxisPosition(axis,value){return axis.scale==='log10'?(Math.log10(value)-Math.log10(axis.min))/(Math.log10(axis.max)-Math.log10(axis.min)):(value-axis.min)/(axis.max-axis.min);}
export function quantitativeNumber(value,decimals,unit='',signed=false){const magnitude=Math.abs(value).toFixed(decimals),sign=value<0?'−':signed&&value>0?'+':'';return sign+magnitude+(unit?' '+unit:'');}
export function quantitativeCopy(scene,config){return [scene.title,scene.body,scene.label,scene.sourceNote,...(scene.tags??[]).map(t=>t.text),...(scene.links??[]).map(l=>l.label),...(scene.nodes??[]).map(nodeCopy),config?.annotation].filter(s=>typeof s==='string'&&s.length).join('\n');}
export function quantitativeMeasurementKey(scene,config,viewport,fontKey){return JSON.stringify(canonical([scene.sourceId??scene.id,scene.src,scene.nodes,quantitativeCopy(scene,config),scene.window,config,viewport,fontKey]));}
export function quantitativeProjectionIssues(scene,config,proof){
 if(scene.phaseStartMs===undefined&&scene.phaseEndMs===undefined)return [];
 const raw=proof?.rawScene,b=config?.binding,clips=proof?.clips;
 if(!raw||raw.sourceId||raw.phaseStartMs!==undefined||raw.phaseEndMs!==undefined||raw.id!==b?.sceneId||raw.src!==b?.src||raw.startMs!==b?.startMs||raw.endMs!==b?.endMs||!finite(proof?.fps)||proof.fps<=0||!Array.isArray(clips)||!clips.length||new Set(clips.map(c=>c?.id)).size!==clips.length||clips.some(c=>!c?.id||!local(c.src)||![c.inSec,c.outSec,c.speed??1].every(finite)||c.inSec<0||c.outSec<=c.inSec||(c.speed??1)<=0))return ['verified-raw-scene-and-projection-required'];
 const expected=projectStoryboard([raw],clips,proof.fps).find(s=>s.id===scene.id&&s.clipId===scene.clipId);
 return expected&&JSON.stringify(canonical(expected))===JSON.stringify(canonical(scene))?[]:['projection-does-not-match-bound-absolute-source'];
}
export function quantitativeProtectedRects(scene,config,viewport){
 const windows=scene.window?[scene.window,...(scene.window.keyframes??[])]:[],rs=windows.map(w=>({x:w.x,y:w.y,width:w.size,height:w.size*viewport.width/viewport.height}));
 if(rs.length&&rs.every(rect)){const x=Math.min(...rs.map(r=>r.x)),y=Math.min(...rs.map(r=>r.y));rs.push({x,y,width:Math.max(...rs.map(r=>r.x+r.width))-x,height:Math.max(...rs.map(r=>r.y+r.height))-y});}
 return [config.speakerRect,...rs,...(config.protectedAreas??[]).map(a=>a.rect)];
}
function axisIssues(a){
 const out=[];if(!a||!['linear','log10'].includes(a.scale)||![a.min,a.max].every(finite)||a.max<=a.min||a.scale==='log10'&&a.min<=0||typeof a.unit!=='string'||typeof a.label!=='string'||!a.label.trim()||!Number.isInteger(a.decimals)||a.decimals<0||a.decimals>6)return ['explicit-axis-scale-domain-unit-label-and-precision-required'];
 if(!Array.isArray(a.ticks)||a.ticks.length<2||a.ticks.length>12||a.ticks.some((v,i)=>!inAxis(a,v)||!precision(v,a.decimals)||i&&v<=a.ticks[i-1])||a.ticks[0]!==a.min||a.ticks.at(-1)!==a.max)out.push('explicit-sorted-domain-endpoint-ticks-required');return out;
}
/** Ticks reserve boxes at real data positions; neighbours cannot silently collide. */
function tickFields(axis,layout,plot,orientation,prefix,window){
 const ticks=axis?.ticks??[],band=layout?.tickBandRect;if(!band||!plot)return [];
 return ticks.map((value,i)=>{const p=quantitativeAxisPosition(axis,value),positions=ticks.map(t=>quantitativeAxisPosition(axis,t)),prev=i?Math.abs(p-positions[i-1]):Infinity,next=i+1<ticks.length?Math.abs(positions[i+1]-p):Infinity;
  const center=orientation==='x'?plot.x+p*plot.width:plot.y+(1-p)*plot.height;
  const limit=orientation==='x'?Math.min(prev*plot.width/2,next*plot.width/2,center-band.x,band.x+band.width-center):Math.min(prev*plot.height/2,next*plot.height/2,center-band.y,band.y+band.height-center);
  const r=orientation==='x'?{x:center-limit*.94,y:band.y,width:limit*1.88,height:band.height}:{x:band.x,y:center-limit*.94,width:band.width,height:limit*1.88};
  return {id:prefix+'-tick-'+i,text:quantitativeNumber(value,axis.decimals),rect:r,...window,role:'tick',singlePage:true};
 });
}
export function quantitativeFieldPlan(scene,config){
 const w=config.chartWindow??{},copy=config.copyWindow,plan=[...(quantitativeCopy(scene,config)?[{id:'source-copy',text:quantitativeCopy(scene,config),rect:copy?.rect,atMs:copy?.atMs,endMs:copy?.endMs,role:'copy',singlePage:false}]:[])];
 const axis=(a,l,o,p)=>{plan.push(...tickFields(a,l,config.plotRect,o,p,w));plan.push({id:p+'-axis-label',text:a?.label+(a?.unit?' ('+a.unit+')':''),rect:l?.labelRect,...w,role:'axis',singlePage:true});};
 if(config.variant==='annotated-line'){
  axis(config.xAxis,config.xAxisLayout,'x','x');axis(config.yAxis,config.yAxisLayout,'y','y');
  for(const s of config.series??[])plan.push({id:'series-'+s.id,text:getNode(scene,s.nodeId)?.text??'',rect:s.labelRect,...w,role:'series',singlePage:true});
  const lines=config.code?.lines??[],r=config.code?.rect;
  for(let i=0;i<lines.length;i++)plan.push({id:'code-'+lines[i].id,text:lines[i].lineNumber+'  '+(getNode(scene,lines[i].nodeId)?.text??''),rect:r?{x:r.x,y:r.y+i*r.height/lines.length,width:r.width,height:r.height/lines.length}:undefined,...w,role:'code',singlePage:true});
  for(const c of config.conditions??[])plan.push({id:'condition-'+c.id,text:nodeCopy(getNode(scene,c.nodeId)),rect:c.textRect,atMs:c.atMs,endMs:c.endMs,role:'condition',singlePage:false});
 }else{
  axis(config.axis,config.axisLayout,config.variant==='horizontal-bars'?'x':'y','value');
  for(const i of config.items??[])plan.push({id:'item-'+i.id,text:getNode(scene,i.nodeId)?.text??'',rect:i.labelRect,...w,role:'item',singlePage:true});
 }
 return plan;
}
/** Final atlas, endpoints, sign and units are measured ONCE, never current values. */
export function quantitativeNumberPlans(config){
 if(config.variant==='annotated-line')return [];
 return (config.items??[]).map(i=>{const signed=config.variant==='signed-columns',samples=[i.from,i.to,0].filter(n=>config.axis.scale!=='log10'||n>0).map(n=>quantitativeNumber(n,i.decimals,'',signed)),digits=Math.max(...[i.from,i.to].map(n=>Math.max(1,Math.floor(Math.log10(Math.max(1,Math.abs(n))))+1))),slots=digits+(i.decimals?i.decimals+1:0)+(signed||Math.min(i.from,i.to)<0?1:0);
  return {id:i.id,rect:i.valueRect,glyphs:'0123456789.+−',slots,unit:config.axis.unit,samples,atMs:i.atMs+i.durationMs,endMs:config.chartWindow.endMs};
 });
}
export function quantitativeIssues(scene,config,viewport={width:1920,height:1080},projectionProof){
 if(!config||config.kind!=='quantitative-chart'||!['horizontal-bars','signed-columns','annotated-line'].includes(config.variant))return ['quantitative-chart-variant-invalid'];
 const issues=[],d=dynamicSceneDuration(scene),e=sourceTokenExposure(scene),b=config.binding,projected=scene.phaseStartMs!==undefined||scene.phaseEndMs!==undefined;
 if(![d,scene.startMs,scene.endMs,e.startMs,e.endMs,e.speed,viewport.width,viewport.height].every(finite)||d<=0||scene.endMs<=scene.startMs||e.speed<=0||e.startMs<-.01||e.endMs>d+.01||e.endMs<=e.startMs||viewport.width<=0||viewport.height<=0||projected&&(!finite(scene.phaseStartMs)||!finite(scene.phaseEndMs)))issues.push('source-clock-invalid');
 if(config.clock!=='scene-source-relative-ms'||!b||b.sceneId!==(scene.sourceId??scene.id)||b.src!==scene.src||!local(b.src)||!sha(b.sha256)||![b.startMs,b.endMs].every(finite)||b.startMs<0||b.endMs<=b.startMs||Math.abs(b.endMs-b.startMs-d)>.01||!projected&&(b.startMs!==scene.startMs||b.endMs!==scene.endMs))issues.push('absolute-source-identity-or-sha-clock-mismatch');
 if(projected&&(!finite(scene.sourceOffsetMs)||Math.abs(scene.sourceOffsetMs-e.startMs)>.02))issues.push('retained-source-offset-mismatch');
 issues.push(...quantitativeProjectionIssues(scene,config,projectionProof));
 if(!['explicit','illustration'].includes(config.dataKind)||typeof config.provenance!=='string'||!config.provenance.trim())issues.push('explicit-data-kind-and-provenance-required');
 const w=config.chartWindow,c=config.copyWindow;
 for(const [value,label] of [[w,'chart'],[c,'copy']])if(!value||![value.atMs,value.endMs].every(finite)||value.atMs<0||value.endMs>d||value.endMs-value.atMs<1200)issues.push(label+'-window-invalid');
 if(c&&w&&sameTime(c,w))issues.push('complete-copy-and-chart-windows-must-be-separate');
 if(!rect(c?.rect)||!rect(config.plotRect)||!rect(config.speakerRect))issues.push('explicit-safe-copy-plot-and-real-speaker-rects-required');
 if(!Array.isArray(config.protectedAreas??[])||(config.protectedAreas??[]).some(a=>!rect(a?.rect)))issues.push('protected-area-invalid');
 const windows=scene.window?[scene.window,...(scene.window.keyframes??[])]:[],times=(scene.window?.keyframes??[]).map(k=>k.atMs);
 if(windows.some(p=>!rect({x:p.x,y:p.y,width:p.size,height:p.size*viewport.width/viewport.height})))issues.push('speaker-window-outside-safe-area');
 if(times.some(t=>!finite(t)||t<0||t>d)||new Set(times).size!==times.length)issues.push('speaker-keyframe-clock-invalid');
 const ns=scene.nodes??[];if(new Set(ns.map(n=>n.id)).size!==ns.length||ns.some(n=>!n.id))issues.push('source-node-ids-must-be-stable-and-unique');
 const node=id=>ns.some(n=>n.id===id&&typeof n.text==='string'&&n.text.trim());
 if(scene.media?.src||ns.some(n=>n.assetSrc))issues.push('native-chart-does-not-render-evidence-screenshots');
 if(config.variant!=='annotated-line'){
  issues.push(...axisIssues(config.axis));const a=config.axis,items=config.items;
  if(a&&config.variant==='horizontal-bars'&&a.scale==='linear'&&a.min!==0)issues.push('linear-horizontal-bars-require-explicit-zero-baseline');
  if(a&&config.variant==='signed-columns'&&(a.scale!=='linear'||a.min>=0||a.max<=0||!a.ticks?.includes(0)))issues.push('signed-columns-require-common-explicit-linear-zero');
  if(!Array.isArray(items)||!items.length||items.length>12||new Set(items.map(i=>i?.id)).size!==items.length||new Set(items.map(i=>i?.nodeId)).size!==items.length)issues.push('stable-unique-explicit-items-required');
  for(const i of Array.isArray(items)?items:[]){if(!i?.id||!node(i.nodeId)||!rect(i.labelRect)||!rect(i.valueRect)||!Number.isInteger(i.decimals)||i.decimals<0||i.decimals>6||!a||!inAxis(a,i.from)||!inAxis(a,i.to)||!precision(i.from,i.decimals)||!precision(i.to,i.decimals)||![i.atMs,i.durationMs].every(finite)||i.atMs<w?.atMs||i.durationMs<400||i.atMs+i.durationMs+1200>w?.endMs)issues.push('item-requires-complete-node-exact-values-domain-precision-and-final-hold');}
  if(config.depth&&(![config.depth.x,config.depth.y].every(finite)||config.depth.x<0||config.depth.x>.03||config.depth.y>0||config.depth.y<-.03))issues.push('explicit-small-positive-side-and-upward-depth-required');
 }else{
  issues.push(...axisIssues(config.xAxis),...axisIssues(config.yAxis));const ss=config.series;
  if(!Array.isArray(ss)||!ss.length||ss.length>3||new Set(ss.map(s=>s?.id)).size!==ss.length)issues.push('explicit-series-required');
  for(const s of Array.isArray(ss)?ss:[]){const ps=s?.points;if(!s?.id||!node(s.nodeId)||!rect(s.labelRect)||!Array.isArray(ps)||ps.length<2||ps.length>100||new Set(ps.map(p=>p?.id)).size!==ps.length)issues.push('series-requires-original-node-and-explicit-points');
   for(let j=0;j<(Array.isArray(ps)?ps:[]).length;j++){const p=ps[j];if(!p?.id||!config.xAxis||!config.yAxis||!inAxis(config.xAxis,p.x)||!inAxis(config.yAxis,p.y)||!finite(p.atMs)||p.atMs<w?.atMs||p.atMs+1200>w?.endMs||j&&(p.x<=ps[j-1].x||p.atMs<=ps[j-1].atMs))issues.push('polyline-points-must-have-explicit-ordered-data-and-source-times');}}
  const code=config.code,lines=code?.lines;
  if(!rect(code?.rect)||typeof code?.provenance!=='string'||!code.provenance.trim()||!Array.isArray(lines)||!lines.length||lines.length>20||new Set(lines.map(l=>l?.id)).size!==lines.length||lines.some((l,j)=>!l?.id||!node(l.nodeId)||!Number.isInteger(l.lineNumber)||l.lineNumber<1||j&&l.lineNumber<=lines[j-1].lineNumber))issues.push('explicit-explanatory-code-lines-and-provenance-required');
  const cs=config.conditions;if(!Array.isArray(cs)||!cs.length||cs.length>12||new Set(cs.map(c=>c?.id)).size!==cs.length)issues.push('explicit-annotated-conditions-required');
  for(const c of Array.isArray(cs)?cs:[]){const r=c?.region;if(!c?.id||!node(c.nodeId)||!rect(c.textRect)||![c.atMs,c.endMs].every(finite)||c.atMs<w?.atMs||c.endMs>w?.endMs||c.endMs-c.atMs<1200||!r||!config.xAxis||!config.yAxis||![r.xMin,r.xMax].every(v=>inAxis(config.xAxis,v))||![r.yMin,r.yMax].every(v=>inAxis(config.yAxis,v))||r.xMax<=r.xMin||r.yMax<=r.yMin||!Array.isArray(c.codeLineIds)||!c.codeLineIds.length||c.codeLineIds.some(id=>!lines?.some(l=>l.id===id)))issues.push('condition-needs-explicit-domain-region-time-and-code-line-mapping');}
 }
 if(issues.length)return unique(issues);
 const fields=quantitativeFieldPlan(scene,config),numbers=quantitativeNumberPlans(config).map(n=>({...n,role:'number'})),all=[...fields,...numbers],ids=all.map(f=>f.id);
 if(new Set(ids).size!==ids.length)issues.push('reserved-or-duplicate-field-id');
 const protections=quantitativeProtectedRects(scene,config,viewport),p=config.plotRect,depth=config.variant==='signed-columns'?config.depth:null,envelope=depth?{x:p.x,y:p.y+depth.y,width:p.width+depth.x,height:p.height-depth.y}:p;
 if(!rect(envelope)||protections.some(r=>overlaps(r,envelope)))issues.push('whole-chart-and-depth-envelope-overlaps-protected-area');
 for(const f of all){if(!rect(f.rect)||protections.some(r=>overlaps(r,f.rect)))issues.push('complete-text-or-number-overlaps-speaker-subtitle-or-protected-area');if(f.role!=='copy'&&overlaps(envelope,f.rect))issues.push('chart-geometry-covers-explicit-label-or-number');}
 for(let i=0;i<all.length;i++)for(let j=i+1;j<all.length;j++)if(sameTime(all[i],all[j])&&overlaps(all[i].rect,all[j].rect))issues.push('simultaneous-complete-text-windows-overlap');
 return unique(issues);
}
export function quantitativeReadiness(scene,config,measurement,speakerProof,viewport={width:1920,height:1080},projectionProof){
 const issues=quantitativeIssues(scene,config,viewport,projectionProof),b=config?.binding;
 if(!speakerProof||speakerProof.kind!=='same-source-video'||speakerProof.src!==b?.src||speakerProof.sha256!==b?.sha256||speakerProof.startMs!==b?.startMs||speakerProof.endMs!==b?.endMs)issues.push('same-source-real-speaker-proof-required');
 if(issues.length)return {status:'blocked',issues:unique(issues)};
 if(!measurement)return {status:'waiting',issues:['loaded-font-and-final-number-atlas-required']};
 if(!measurement.fontKey||measurement.key!==quantitativeMeasurementKey(scene,config,viewport,measurement.fontKey))return {status:'blocked',issues:['stale-font-geometry-content-or-source-measurement']};
 const waiting=[],exposure=sourceTokenExposure(scene);
 for(const f of quantitativeFieldPlan(scene,config)){const m=measurement.fields?.find(m=>m.id===f.id);const check=m?.text===f.text?sourceTokenTextReadiness(f.text,m.fit,f,exposure,{singlePage:f.singlePage}):{status:'waiting',issues:['complete-field-measurement-required']};(check.status==='waiting'?waiting:issues).push(...check.issues);}
 for(const n of quantitativeNumberPlans(config)){const m=measurement.numbers?.find(m=>m.id===n.id),key=JSON.stringify(n);if(!m||m.specKey!==key)waiting.push('loaded-final-value-sign-unit-atlas-required');else if(m.unplaceable)issues.push('final-value-sign-and-unit-do-not-fit');const ms=Math.max(0,Math.min(n.endMs,exposure.endMs)-Math.max(n.atMs,exposure.startMs))/exposure.speed;if(ms<1200)issues.push('every-final-value-needs-retained-speed-adjusted-hold');}
 const motions=config.variant==='annotated-line'?config.series.map(s=>({start:s.points[0].atMs,end:s.points.at(-1).atMs})):config.items.map(i=>({start:i.atMs,end:i.atMs+i.durationMs}));
 for(const motion of motions)if(motion.start<exposure.startMs-.01||motion.end+1200*exposure.speed>Math.min(exposure.endMs,config.chartWindow.endMs)+.01)issues.push('complete-authored-motion-and-final-hold-must-survive-cut-and-speed');
 return {status:issues.length?'blocked':waiting.length?'waiting':'ready',issues:unique([...issues,...waiting])};
}
const ease=p=>{const t=clamp(p);return t*t*(3-2*t);};
export function quantitativeBarStates(config,elapsed){
 if(config.variant==='annotated-line')return [];
 const p=config.plotRect,a=config.axis,h=config.variant==='horizontal-bars',zero=quantitativeAxisPosition(a,a.scale==='log10'?a.min:0),n=config.items.length;
 return config.items.map((item,i)=>{const progress=ease((elapsed-item.atMs)/item.durationMs),value=item.from+(item.to-item.from)*progress,pos=quantitativeAxisPosition(a,value),slot=h?p.height/n:p.width/n,r=h?{x:p.x+Math.min(zero,pos)*p.width,y:p.y+(i+.22)*slot,width:Math.abs(pos-zero)*p.width,height:slot*.56}:{x:p.x+(i+.22)*slot,y:p.y+(1-Math.max(zero,pos))*p.height,width:slot*.56,height:Math.abs(pos-zero)*p.height};return {id:item.id,progress,value,rect:r,zero:h?p.x+zero*p.width:p.y+(1-zero)*p.height,text:quantitativeNumber(value,item.decimals,a.unit,!h),numericText:quantitativeNumber(value,item.decimals,'',!h),visible:elapsed>=item.atMs,color:item.color??['#70cfff','#e7c967','#e99886'][i%3]};});
}
export function quantitativeLinePoint(config,p){const r=config.plotRect;return {x:r.x+quantitativeAxisPosition(config.xAxis,p.x)*r.width,y:r.y+(1-quantitativeAxisPosition(config.yAxis,p.y))*r.height};}
export function quantitativeLineStates(config,elapsed){
 if(config.variant!=='annotated-line')return [];
 return config.series.map(series=>{const result=[];for(let i=0;i<series.points.length;i++){const point=series.points[i];if(elapsed>=point.atMs)result.push(quantitativeLinePoint(config,point));else{if(i&&elapsed>=series.points[i-1].atMs){const prev=series.points[i-1],u=clamp((elapsed-prev.atMs)/(point.atMs-prev.atMs)),a=quantitativeLinePoint(config,prev),b=quantitativeLinePoint(config,point);result.push({x:a.x+(b.x-a.x)*u,y:a.y+(b.y-a.y)*u});}break;}}return {id:series.id,points:result,color:series.color??'#76d8f4'};});
}
export function quantitativeRegion(config,r){const a=quantitativeLinePoint(config,{x:r.xMin,y:r.yMax}),b=quantitativeLinePoint(config,{x:r.xMax,y:r.yMin});return {x:a.x,y:a.y,width:b.x-a.x,height:b.y-a.y};}
export function quantitativeState(scene,config,elapsed,measurement,speakerProof,viewport={width:1920,height:1080},projectionProof){
 const ready=quantitativeReadiness(scene,config,measurement,speakerProof,viewport,projectionProof),valid=finite(elapsed)&&elapsed>=0&&elapsed<dynamicSceneDuration(scene),base={readiness:valid?ready.status:'blocked',issues:unique([...ready.issues,...(!valid?['source-elapsed-outside-original-scene']:[])]),canApply:false,uiAccepted:false,automaticAllowed:false,needsFaceReview:true,copyVisible:false,chartVisible:false,fields:[],bars:[],lines:[],regions:[],activeCodeLineIds:[]};
 if(!valid||ready.status!=='ready')return base;
 const fields=quantitativeFieldPlan(scene,config).map(f=>({...f,page:sourceTokenPageState(measurement.fields.find(m=>m.id===f.id).fit.pages,elapsed,f)})),chartVisible=elapsed>=config.chartWindow.atMs&&elapsed<config.chartWindow.endMs,active=(config.conditions??[]).filter(c=>elapsed>=c.atMs&&elapsed<c.endMs);
 return {...base,fields,copyVisible:fields.some(f=>f.role==='copy'&&f.page.visible),chartVisible,bars:chartVisible?quantitativeBarStates(config,elapsed):[],lines:chartVisible?quantitativeLineStates(config,elapsed):[],regions:chartVisible?active.map(c=>({id:c.id,rect:quantitativeRegion(config,c.region)})):[],activeCodeLineIds:chartVisible?unique(active.flatMap(c=>c.codeLineIds)):[]};
}

const rectangle=(key,label)=>({key,label,type:'stage-rect',coordinates:'normalized-output',subtitleBottom:.86});
const time=(key,label)=>({key,label,type:'source-ms',min:0});
const stableId={key:'id',label:'稳定ID',type:'stable-id',readonly:true};
const axisFields=[{key:'scale',label:'显式尺度',type:'select',options:['linear','log10']},...['min','max','decimals'].map(key=>({key,label:key,type:'number'})),{key:'ticks',label:'显式刻度值',type:'number-list'},{key:'unit',label:'真实单位（无量纲可留空）',type:'text'},{key:'label',label:'完整轴名称',type:'text'}];
const axisLayoutFields=[rectangle('tickBandRect','完整刻度文字带'),rectangle('labelRect','完整轴标题')];
export const quantitativeChartControls=['horizontal-bars','signed-columns','annotated-line'].map(variant=>({kind:'quantitative-chart',variant,label:{'horizontal-bars':'显式线性／对数横条','signed-columns':'共同零线正负柱','annotated-line':'显式折线与条件代码对应'}[variant],stage:'experimental-independent',canApply:false,uiAccepted:false,automaticAllowed:false,fields:[
 {key:'clock',label:'完整原场相对毫秒',type:'text',readonly:true,fixed:'scene-source-relative-ms'},
 {key:'binding',label:'绝对源身份',type:'record',readonly:true,fields:['sceneId','src','sha256','startMs','endMs'].map(key=>({key,label:key,type:key.endsWith('Ms')?'number':'text'}))},
 {key:'dataKind',label:'数据性质（界面说明，不烧入固定角标）',type:'select',options:['explicit','illustration']},{key:'provenance',label:'数据来源与限定',type:'text'},
 {key:'copyWindow',label:'完整正文阅读时窗',type:'record',fields:[time('atMs','开始ms'),time('endMs','结束ms'),rectangle('rect','完整大字阅读区')]},{key:'chartWindow',label:'图表时窗',type:'record',fields:[time('atMs','开始ms'),time('endMs','结束ms')]},rectangle('plotRect','数据绘图区'),rectangle('speakerRect','真实原声人物插槽'),
 ...(variant==='annotated-line'?[
  ...['x','y'].flatMap(k=>[{key:k+'Axis',label:k+'轴数据',type:'record',fields:axisFields},{key:k+'AxisLayout',label:k+'轴字框',type:'record',fields:axisLayoutFields}]),
  {key:'series',label:'显式折线',type:'list',preserveId:true,itemFields:[stableId,{key:'nodeId',label:'完整原节点名',type:'node-ref'},rectangle('labelRect','系列标题'),{key:'color',label:'系列颜色',type:'color'},{key:'points',label:'明确数据点／出现时点',type:'list',preserveId:true,itemFields:[stableId,...['x','y'].map(key=>({key,label:key,type:'number'})),time('atMs','源时点ms')]}]},
  {key:'code',label:'中性代码说明板（不冒充运行截图）',type:'record',fields:[rectangle('rect','完整代码区域'),{key:'provenance',label:'代码说明来源',type:'text'},{key:'lines',label:'完整原文行',type:'list',preserveId:true,itemFields:[stableId,{key:'nodeId',label:'原节点完整代码',type:'node-ref'},{key:'lineNumber',label:'明确行号',type:'number',min:1}]}]},
  {key:'conditions',label:'显式条件区域与代码对应',type:'list',preserveId:true,itemFields:[stableId,{key:'nodeId',label:'完整条件原节点',type:'node-ref'},rectangle('textRect','完整条件说明'),time('atMs','出现ms'),time('endMs','结束ms'),{key:'region',label:'数据坐标范围（不自动推阈值）',type:'record',fields:['xMin','xMax','yMin','yMax'].map(key=>({key,label:key,type:'number'}))},{key:'codeLineIds',label:'对应稳定代码行ID',type:'stable-ref-list',source:'code.lines'}]}
 ]:[{key:'axis',label:'显式共同数值轴',type:'record',fields:axisFields},{key:'axisLayout',label:'轴文字布局',type:'record',fields:axisLayoutFields},{key:'items',label:'明确资料值（无默认统计）',type:'list',preserveId:true,itemFields:[stableId,{key:'nodeId',label:'完整原节点',type:'node-ref'},...['from','to','decimals'].map(key=>({key,label:key,type:'number'})),time('atMs','开始ms'),time('durationMs','增长用时ms'),rectangle('labelRect','完整项目标题'),rectangle('valueRect','符号／数值／单位'),{key:'color',label:'颜色',type:'color'}]},...(variant==='signed-columns'?[{key:'depth',label:'原创厚侧面位移',type:'record',fields:[{key:'x',label:'右侧归一位移',type:'number',min:0,max:.03},{key:'y',label:'向上归一位移',type:'number',min:-.03,max:0}]}]:[])]),
 {key:'annotation',label:'额外可编辑说明（默认空）',type:'text'},{key:'protectedAreas',label:'明确保护区',type:'list',itemFields:[{key:'label',label:'名称',type:'text'},rectangle('rect','保护范围')]}
 ]}));
