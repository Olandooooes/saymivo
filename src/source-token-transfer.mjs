import {dynamicSceneDuration} from './dynamic-mechanisms.mjs';

const segmenter=new Intl.Segmenter('zh-CN',{granularity:'grapheme'});
export const sourceTokenGraphemes=text=>[...segmenter.segment(String(text??''))].map(piece=>({text:piece.segment,index:piece.index}));
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const unique=items=>[...new Set(items)];
const clamp=value=>Math.max(0,Math.min(1,value));
const rectValid=rect=>rect&&['x','y','width','height'].every(key=>finite(rect[key]))&&rect.x>=0&&rect.y>=0&&rect.width>0&&rect.height>0&&rect.x+rect.width<=1.000001&&rect.y+rect.height<=.86;
const pointValid=point=>point&&finite(point.x)&&finite(point.y)&&point.x>=0&&point.x<=1&&point.y>=0&&point.y<=.86;
const overlaps=(a,b)=>a.x<b.x+b.width-1e-7&&a.x+a.width>b.x+1e-7&&a.y<b.y+b.height-1e-7&&a.y+a.height>b.y+1e-7;
const contains=(outer,inner,tolerance=1e-5)=>inner.x>=outer.x-tolerance&&inner.y>=outer.y-tolerance&&inner.x+inner.width<=outer.x+outer.width+tolerance&&inner.y+inner.height<=outer.y+outer.height+tolerance;
const center=rect=>({x:rect.x+rect.width/2,y:rect.y+rect.height/2});
const fullNode=node=>[node.text,node.detail,...(node.bullets??[])].filter(text=>typeof text==='string'&&text.length).join('\n');

export function sourceTokenSources(scene,config){
 return (Array.isArray(config?.sources)?config.sources:[]).map(source=>({source,node:scene.nodes?.find(node=>node.id===source?.nodeId)})).filter(item=>item.node).map(({source,node})=>({...source,node,text:fullNode(node)}));
}
export function sourceTokenAdditionalCopy(scene){
 return [{id:'title',text:scene.title},{id:'body',text:scene.body},{id:'label',text:scene.label},{id:'sourceNote',text:scene.sourceNote},...(scene.tags??[]).map(tag=>({id:'tag:'+tag.id,text:tag.text})),...(scene.links??[]).map(link=>({id:'link:'+link.id,text:link.label}))].filter(item=>typeof item.text==='string'&&item.text.length);
}

export function sourceTokenExposure(scene){
 const duration=dynamicSceneDuration(scene),speed=scene.speed??1,projected=scene.phaseStartMs!==undefined||scene.phaseEndMs!==undefined;
 return {startMs:projected?(scene.startMs-scene.phaseStartMs)*speed:0,endMs:projected?(scene.endMs-scene.phaseStartMs)*speed:duration,speed};
}

export function sourceTokenTransferKey(scene,config,viewport,fontKey){
 // A playhead move or a different retained projection does not change glyph
 // geometry. Wording, authored clock, face path, font and geometry do.
 return JSON.stringify([scene.sourceId??scene.id,scene.src,dynamicSceneDuration(scene),scene.nodes,sourceTokenAdditionalCopy(scene),scene.window,config,viewport,fontKey]);
}

export function sourceTokenProtectedRects(scene,config,viewport){
 const points=scene.window?[scene.window,...(scene.window.keyframes??[])]:[];
 const rects=points.map(point=>({x:point.x,y:point.y,width:point.size,height:point.size*viewport.width/viewport.height}));
 if(rects.length&&rects.every(rect=>['x','y','width','height'].every(key=>finite(rect[key])))){
  const x=Math.min(...rects.map(rect=>rect.x)),y=Math.min(...rects.map(rect=>rect.y)),right=Math.max(...rects.map(rect=>rect.x+rect.width)),bottom=Math.max(...rects.map(rect=>rect.y+rect.height));
  rects.push({x,y,width:right-x,height:bottom-y});
 }
 return [...rects,...(Array.isArray(config?.protectedAreas)?config.protectedAreas.map(area=>area.rect):[])];
}

export function sourceTokenTransferIssues(scene,config,viewport={width:1920,height:1080}){
 if(!config||config.kind!=='source-token-transfer')return ['source-token-kind-invalid'];
 const issues=[],duration=dynamicSceneDuration(scene),sources=Array.isArray(config.sources)?config.sources:[],tokens=Array.isArray(config.tokens)?config.tokens:[],nodes=scene.nodes??[],binding=config.binding,exposure=sourceTokenExposure(scene);
 if(![viewport.width,viewport.height,duration,scene.startMs,scene.endMs,exposure.startMs,exposure.endMs,exposure.speed].every(finite)||viewport.width<=0||viewport.height<=0||duration<=0||scene.endMs<=scene.startMs||exposure.speed<=0||exposure.startMs<-.01||exposure.endMs>duration+.01||exposure.endMs<=exposure.startMs||(scene.phaseStartMs!==undefined&&!finite(scene.phaseEndMs))||(scene.phaseEndMs!==undefined&&!finite(scene.phaseStartMs)))issues.push('source-clock-invalid');
 if(!binding||!binding.src||binding.src!==scene.src||binding.sceneId!==(scene.sourceId??scene.id)||!finite(binding.durationMs)||Math.abs(binding.durationMs-duration)>.01||config.clock!=='scene-source-relative-ms')issues.push('source-binding-or-clock-mismatch');
 if(!sources.length||sources.length!==nodes.length||sources.length>12||new Set(sources.map(source=>source?.id)).size!==sources.length||new Set(sources.map(source=>source?.nodeId)).size!==sources.length||new Set(nodes.map(node=>node.id)).size!==nodes.length||nodes.some(node=>!sources.some(source=>source?.nodeId===node.id)))issues.push('complete-source-node-coverage-required');
 for(const source of sources){
  const node=nodes.find(node=>node.id===source?.nodeId);
  if(!source?.id||!node||typeof source.expectedText!=='string'||source.expectedText!==fullNode(node)||!source.expectedText.trim())issues.push('source-original-text-mismatch');
  if(!rectValid(source?.rect))issues.push('source-rect-outside-safe-area');
  if(!finite(source?.atMs)||source.atMs<0||source.atMs>=duration)issues.push('source-entry-time-invalid');
 }
 if(!tokens.length||tokens.length>32||new Set(tokens.map(token=>token?.id)).size!==tokens.length)issues.push('stable-unique-token-ids-required');
 for(const token of tokens){
  const source=sources.find(source=>source?.id===token?.sourceId),pieces=sourceTokenGraphemes(source?.expectedText),range=token?.range;
  if(!token?.id||!source||token.nodeId!==source.nodeId)issues.push('token-source-node-mismatch');
  if(!range||!Number.isInteger(range.start)||!Number.isInteger(range.end)||range.start<0||range.end<=range.start||range.end>pieces.length)issues.push('token-grapheme-range-invalid');
  else{const text=pieces.slice(range.start,range.end).map(piece=>piece.text).join('');if(typeof token.text!=='string'||token.text!==text||!text.trim()||/[\r\n]/.test(text))issues.push('token-must-copy-identical-source-text');}
  if(!finite(token?.departAtMs)||!finite(token?.arriveAtMs)||token.departAtMs<(source?.atMs??0)+300||token.arriveAtMs-token.departAtMs<200||token.arriveAtMs+900>duration)issues.push('token-transfer-and-persistent-hold-time-invalid');
  if(!rectValid(token?.targetRect)||!pointValid(token?.control1)||!pointValid(token?.control2))issues.push('token-target-or-bezier-outside-safe-area');
 }
 const copy=sourceTokenAdditionalCopy(scene),window=config.copyWindow;
 if(copy.length&&(!window||!rectValid(window.rect)||!finite(window.atMs)||!finite(window.endMs)||window.atMs<0||window.endMs>duration||window.endMs-window.atMs<900))issues.push('complete-title-body-readable-window-required');
 const areas=config.protectedAreas??[];
 if(!Array.isArray(areas)||areas.some(area=>!rectValid(area?.rect)))issues.push('protected-area-invalid');
 if(scene.window){
  const points=[scene.window,...(scene.window.keyframes??[])];
  if(points.some(point=>!['x','y','size'].every(key=>finite(point[key]))||point.size<=0||point.x<0||point.y<0||point.x+point.size>1||point.y+point.size*viewport.width/viewport.height>.86))issues.push('speaker-window-invalid');
  const times=(scene.window.keyframes??[]).map(point=>point.atMs);
  if(times.some(time=>!finite(time)||time<0||time>duration)||new Set(times).size!==times.length)issues.push('speaker-keyframe-clock-invalid');
 }
 const protection=sourceTokenProtectedRects(scene,config,viewport).filter(rect=>rectValid(rect));
 const layers=[...sources.filter(source=>rectValid(source?.rect)).map(source=>({id:source.id,rect:source.rect,atMs:source.atMs,endMs:duration})),...tokens.filter(token=>rectValid(token?.targetRect)).map(token=>({id:token.id,rect:token.targetRect,atMs:token.departAtMs,endMs:duration})),...(copy.length&&window&&rectValid(window.rect)?[{id:'scene-copy',rect:window.rect,atMs:window.atMs,endMs:window.endMs}]:[])];
 for(let i=0;i<layers.length;i++){
  if(protection.some(rect=>overlaps(rect,layers[i].rect)))issues.push('text-overlaps-protected-person-path');
  for(let j=i+1;j<layers.length;j++)if(layers[i].atMs<layers[j].endMs&&layers[j].atMs<layers[i].endMs&&overlaps(layers[i].rect,layers[j].rect))issues.push('persistent-text-regions-overlap');
 }
 if(scene.media?.src||nodes.some(node=>node.assetSrc))issues.push('this-text-only-mechanism-does-not-display-existing-media');
 return unique(issues);
}

/** UTF-16 offsets for real DOM Range calls, derived from exact full text. */
export function sourceTokenLineRanges(text,lines){
 let cursor=0;const result=[];
 for(let index=0;index<lines.length;index++){
  const line=lines[index];if(typeof line!=='string'||text.slice(cursor,cursor+line.length)!==line)return null;
  result.push({index,text:line,startUtf16:cursor,endUtf16:cursor+line.length});cursor+=line.length;
  if(text[cursor]==='\n')cursor++;
 }
 return cursor===text.length?result:null;
}
export function sourceTokenRangeLocation(text,lines,range){
 const pieces=sourceTokenGraphemes(text),lineRanges=sourceTokenLineRanges(text,lines);
 if(!lineRanges||!Number.isInteger(range?.start)||!Number.isInteger(range?.end)||range.start<0||range.end<=range.start||range.end>pieces.length)return null;
 const start=pieces[range.start].index,end=range.end===pieces.length?text.length:pieces[range.end].index,line=lineRanges.find(line=>start>=line.startUtf16&&end<=line.endUtf16);
 return line?{lineIndex:line.index,startUtf16:start-line.startUtf16,endUtf16:end-line.startUtf16,text:text.slice(start,end)}:null;
}

export function sourceTokenPageState(pages,elapsed,window){
 const duration=window.endMs-window.atMs,count=Math.max(1,pages.length),index=Math.min(count-1,Math.max(0,Math.floor((elapsed-window.atMs)/Math.max(1,duration)*count)));
 return {index,visible:elapsed>=window.atMs&&elapsed<window.endMs,lines:pages[index]??[]};
}
export function sourceTokenTextReadiness(text,fit,window,exposure,{singlePage=false}={}){
 if(!fit)return {status:'waiting',issues:['loaded-font-measurement-required']};
 const issues=[],pages=fit.pages??[],lines=pages.flat(),duration=window.endMs-window.atMs;
 if(fit.unplaceable||!pages.length||!sourceTokenLineRanges(text,lines)||(singlePage&&pages.length!==1))issues.push('complete-text-does-not-fit-without-omission');
 if(![duration,exposure.startMs,exposure.endMs,exposure.speed].every(finite)||duration<=0||exposure.speed<=0||exposure.endMs<=exposure.startMs)issues.push('reading-exposure-invalid');
 else for(let index=0;index<pages.length;index++){
  const start=window.atMs+duration*index/pages.length,end=window.atMs+duration*(index+1)/pages.length,shown=Math.max(0,Math.min(end,exposure.endMs)-Math.max(start,exposure.startMs))/exposure.speed;
  if(shown<Math.max(1000,sourceTokenGraphemes(pages[index].join('')).length*85))issues.push('retained-speed-adjusted-reading-time-insufficient');
 }
 return {status:issues.length?'blocked':'ready',issues:unique(issues)};
}

export function sourceTokenBezier(from,control1,control2,to,progress){
 const p=clamp(progress),q=1-p;return {x:q*q*q*from.x+3*q*q*p*control1.x+3*q*p*p*control2.x+p*p*p*to.x,y:q*q*q*from.y+3*q*q*p*control1.y+3*q*p*p*control2.y+p*p*p*to.y};
}
export function sourceTokenMotionEnvelope(token,origin){
 const a=center(origin),b=center(token.targetRect);
 const extrema=(p0,p1,p2,p3)=>{
  const aa=-p0+3*p1-3*p2+p3,bb=3*p0-6*p1+3*p2,cc=-3*p0+3*p1,roots=[0,1],A=3*aa,B=2*bb,C=cc;
  if(Math.abs(A)<1e-12){if(Math.abs(B)>1e-12)roots.push(-C/B);}else{const d=B*B-4*A*C;if(d>=0){roots.push((-B+Math.sqrt(d))/(2*A),(-B-Math.sqrt(d))/(2*A));}}
  return roots.filter(p=>p>=0&&p<=1).map(p=>((aa*p+bb)*p+cc)*p+p0);
 };
 const edge=(axis,sign)=>{
  const size=axis==='x'?'width':'height',start=origin[size]/2,end=token.targetRect[size]/2;
  return extrema(a[axis]+sign*start,token.control1[axis]+sign*(start+(end-start)/3),token.control2[axis]+sign*(start+2*(end-start)/3),b[axis]+sign*end);
 };
 const left=Math.min(...edge('x',-1)),right=Math.max(...edge('x',1)),top=Math.min(...edge('y',-1)),bottom=Math.max(...edge('y',1));
 return {x:left,y:top,width:right-left,height:bottom-top};
}

export function sourceTokenMeasurementReadiness(scene,config,measurement,viewport={width:1920,height:1080}){
 const structural=sourceTokenTransferIssues(scene,config,viewport);if(structural.length)return {status:'blocked',issues:structural};
 if(!measurement)return {status:'waiting',issues:['loaded-font-and-dom-range-anchors-required']};
 if(!measurement.fontKey||measurement.key!==sourceTokenTransferKey(scene,config,viewport,measurement.fontKey))return {status:'blocked',issues:['stale-font-or-layout-measurement']};
 if(measurement.issues?.length)return {status:'blocked',issues:unique(measurement.issues)};
 const duration=dynamicSceneDuration(scene),exposure=sourceTokenExposure(scene),issues=[],waiting=[],sources=sourceTokenSources(scene,config),protectedRects=sourceTokenProtectedRects(scene,config,viewport);
 for(const source of sources){
  const measured=measurement.sources?.find(value=>value.id===source.id);
  if(!measured||measured.text!==source.text){waiting.push('source-font-layout-required');continue;}
  const check=sourceTokenTextReadiness(source.text,measured.fit,{atMs:source.atMs,endMs:duration},exposure,{singlePage:true});(check.status==='waiting'?waiting:issues).push(...check.issues);
 }
 for(const token of config.tokens){
  const source=sources.find(source=>source.id===token.sourceId),sourceFit=measurement.sources?.find(value=>value.id===token.sourceId)?.fit,target=measurement.targets?.find(value=>value.id===token.id),anchor=measurement.anchors?.find(value=>value.id===token.id);
  if(!target||target.text!==token.text){waiting.push('target-font-layout-required');continue;}
  const check=sourceTokenTextReadiness(token.text,target.fit,{atMs:token.arriveAtMs,endMs:duration},exposure,{singlePage:true});(check.status==='waiting'?waiting:issues).push(...check.issues);
  if(target.fit&&target.fit.lines.length!==1)issues.push('flying-token-requires-complete-single-line-label');
  if(!sourceFit){waiting.push('source-font-layout-required');continue;}
  const location=sourceFit?sourceTokenRangeLocation(source.text,sourceFit.lines,token.range):null;
  if(sourceFit&&!location)issues.push('token-range-crosses-source-line-or-layout-is-incomplete');
  if(!anchor){waiting.push('actual-dom-range-anchor-required');continue;}
  if(anchor.text!==token.text||anchor.sourceId!==source.id||anchor.nodeId!==token.nodeId||anchor.range?.start!==token.range.start||anchor.range?.end!==token.range.end||!sourceFit||anchor.fontSize!==sourceFit.fontSize||!rectValid(anchor.rect)||!contains(source.rect,anchor.rect,.002))issues.push('actual-source-range-anchor-mismatch');
  else{
   const envelope=sourceTokenMotionEnvelope(token,anchor.rect);
   if(!rectValid(envelope))issues.push('token-motion-envelope-outside-safe-area');
   if(protectedRects.some(rect=>overlaps(rect,envelope)))issues.push('token-motion-crosses-protected-person-path');
   if(sources.some(other=>other.id!==source.id&&overlaps(other.rect,envelope)))issues.push('token-motion-covers-another-persistent-sentence');
   const copyWindow=config.copyWindow,extraCopy=sourceTokenAdditionalCopy(scene);
   if(extraCopy.length&&copyWindow&&token.departAtMs<copyWindow.endMs&&token.arriveAtMs>copyWindow.atMs&&overlaps(copyWindow.rect,envelope))issues.push('token-motion-covers-readable-scene-copy');
   for(const other of config.tokens.filter(other=>other.id!==token.id)){
    if(other.arriveAtMs<token.arriveAtMs&&overlaps(other.targetRect,envelope))issues.push('token-motion-covers-already-settled-label');
    const otherAnchor=measurement.anchors?.find(anchor=>anchor.id===other.id);
    if(otherAnchor&&rectValid(otherAnchor.rect)&&token.departAtMs<other.arriveAtMs&&other.departAtMs<token.arriveAtMs&&overlaps(sourceTokenMotionEnvelope(other,otherAnchor.rect),envelope))issues.push('simultaneous-token-motion-envelopes-overlap');
   }
  }
 }
 const copy=sourceTokenAdditionalCopy(scene);if(copy.length){
  const text=copy.map(item=>item.text).join('\n'),measured=measurement.copy;
  if(!measured||measured.text!==text)waiting.push('full-title-body-measurement-required');
  else{const check=sourceTokenTextReadiness(text,measured.fit,config.copyWindow,exposure);(check.status==='waiting'?waiting:issues).push(...check.issues);}
 }
 return {status:issues.length?'blocked':waiting.length?'waiting':'ready',issues:unique(issues.length?issues:waiting)};
}

export function sourceTokenTransferState(scene,config,elapsed,measurement,viewport={width:1920,height:1080}){
 const readiness=sourceTokenMeasurementReadiness(scene,config,measurement,viewport),duration=dynamicSceneDuration(scene),issues=[...readiness.issues,...(!finite(elapsed)?['source-elapsed-must-be-finite']:[])],ready=readiness.status==='ready'&&finite(elapsed);
 const sources=sourceTokenSources(scene,config).map(source=>({...source,visible:ready&&elapsed>=source.atMs&&elapsed<duration}));
 const tokens=ready?config.tokens.map(token=>{
  const anchor=measurement.anchors.find(anchor=>anchor.id===token.id),progress=clamp((elapsed-token.departAtMs)/(token.arriveAtMs-token.departAtMs)),position=sourceTokenBezier(center(anchor.rect),token.control1,token.control2,center(token.targetRect),progress),width=anchor.rect.width+(token.targetRect.width-anchor.rect.width)*progress,height=anchor.rect.height+(token.targetRect.height-anchor.rect.height)*progress;
  return {...token,originRect:anchor.rect,rect:progress===0?{...anchor.rect}:progress===1?{...token.targetRect}:{x:position.x-width/2,y:position.y-height/2,width,height},progress,visible:elapsed>=token.departAtMs&&elapsed<duration,phase:elapsed<token.departAtMs?'pending':elapsed<token.arriveAtMs?'flying':elapsed<duration?'settled':'finished'};
 }):[];
 return {readiness:ready?'ready':issues.includes('source-elapsed-must-be-finite')?'blocked':readiness.status,issues:unique(issues),duration,sources,tokens,additionalCopy:sourceTokenAdditionalCopy(scene),sourceClock:'scene-source-relative-ms',automaticAllowed:false,canApply:false,uiAccepted:false,needsFaceReview:true,facePositionKnown:!!scene.window||!!config?.protectedAreas?.length};
}

// Independent editing contract. Stable IDs and original wording are not free
// text fields; selection tooling must supply explicit grapheme offsets.
export const sourceTokenTransferControls={kind:'source-token-transfer',label:'原句词语抽取与持久目标槽',stage:'experimental-independent',automaticAllowed:false,uiAccepted:false,fields:[
 {key:'clock',label:'原场源时钟',type:'text',readonly:true,fixed:'scene-source-relative-ms'},
 {key:'binding',label:'原场绑定',type:'record',readonly:true,fields:[{key:'sceneId',label:'原场ID',type:'text',readonly:true},{key:'src',label:'原片',type:'text',readonly:true},{key:'durationMs',label:'完整源场时长',type:'source-ms',readonly:true}]},
 {key:'sources',label:'完整原句与条件',type:'list',preserveId:true,itemFields:[{key:'id',label:'原句ID',type:'stable-id',readonly:true},{key:'nodeId',label:'来源节点',type:'node-ref'},{key:'expectedText',label:'完整原文（随来源校验）',type:'text',readonly:true},{key:'rect',label:'原句位置',type:'stage-rect'},{key:'atMs',label:'原句出现时点',type:'source-ms'}]},
 {key:'tokens',label:'从原句选择的同文标签',type:'list',preserveId:true,itemFields:[{key:'id',label:'标签ID',type:'stable-id',readonly:true},{key:'sourceId',label:'原句ID',type:'source-token-source-ref'},{key:'nodeId',label:'原节点ID',type:'node-ref',readonly:true},{key:'range',label:'字素范围（结束不含）',type:'record',fields:[{key:'start',label:'开始字素',type:'number',min:0},{key:'end',label:'结束字素',type:'number',min:1}]},{key:'text',label:'范围内完整同文',type:'text',readonly:true},{key:'targetRect',label:'持久目标槽',type:'stage-rect'},{key:'departAtMs',label:'飞出时点',type:'source-ms'},{key:'arriveAtMs',label:'落槽时点',type:'source-ms'},{key:'control1',label:'曲线控制点一',type:'record',fields:[{key:'x',label:'横坐标',type:'number',min:0,max:1},{key:'y',label:'纵坐标',type:'number',min:0,max:.86}]},{key:'control2',label:'曲线控制点二',type:'record',fields:[{key:'x',label:'横坐标',type:'number',min:0,max:1},{key:'y',label:'纵坐标',type:'number',min:0,max:.86}]}]},
 {key:'copyWindow',label:'完整标题与正文时段',type:'record',fields:[{key:'rect',label:'正文位置',type:'stage-rect'},{key:'atMs',label:'开始',type:'source-ms'},{key:'endMs',label:'结束',type:'source-ms'}]},
 {key:'protectedAreas',label:'人物及其他保护区域',type:'list',itemFields:[{key:'label',label:'保护对象',type:'text'},{key:'rect',label:'保护区域',type:'stage-rect'}]},
]};
