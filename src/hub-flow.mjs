import {visualSequence} from './visual-presets.mjs';
import {visibleTextClock} from './dynamic-text-clock.mjs';
const clamp=value=>Math.max(0,Math.min(1,value));
const ease=value=>{const p=clamp(value);return p*p*(3-2*p);};
const mix=(a,b,p)=>p<=0?a:p>=1?b:a+(b-a)*p;
const mixRect=(a,b,p)=>Object.fromEntries(['x','y','width','height'].map(key=>[key,mix(a[key],b[key],p)]));
const center=rect=>({x:rect.x+rect.width/2,y:rect.y+rect.height/2});
const rectValid=rect=>rect&&['x','y','width','height'].every(key=>Number.isFinite(rect[key]))&&rect.x>=0&&rect.y>=0&&rect.width>0&&rect.height>0&&rect.x+rect.width<=1.001&&rect.y+rect.height<=.86;
const pointValid=point=>point&&Number.isFinite(point.x)&&Number.isFinite(point.y)&&point.x>=0&&point.x<=1&&point.y>=0&&point.y<=.86;
export function hubDefaultRects(scene,config,viewport={width:1920,height:1080}){
 const wide=viewport.width>viewport.height,nodes=scene.nodes??[],positions=new Map((config.positions??[]).map(position=>[position.nodeId,position]));
 const base=new Map();
 for(const node of nodes){
  const output=config.outputNodeIds.indexOf(node.id),input=config.inputNodeIds.indexOf(node.id),isHub=node.id===config.hubNodeId;
  const columns=wide?Math.min(4,Math.max(1,config.outputNodeIds.length)):2,rowCount=Math.ceil(config.outputNodeIds.length/columns),row=Math.floor(output/columns),quote=(config.quotedLineCues??[]).some(cue=>cue.nodeId===node.id);
  const fallback=isHub?{x:wide?.40:.50,y:wide?.29:.27}:input>=0?{x:wide?.11:.19,y:wide?.22+input*.18:.12+input*.12}:output>=0?{x:wide?.11+((output%columns)+.5)*.59/columns:.27+(output%2)*.46,y:wide?(rowCount>1?.58+row*.18:.65):(rowCount>1?.49+row*.29/(rowCount-1):.58)}:{x:wide?.82:.50,y:wide?.34:.65};
  const position=positions.get(node.id)??fallback,width=position.width??(quote?(wide?.23:.78):isHub?(wide?.16:.31):wide?.14:.36),height=position.height??(quote?(wide?.35:.18):wide?.135:.125);
  base.set(node.id,{x:position.x-width/2,y:position.y-height/2,width,height});
 }
 return base;
}
function initialEdges(config){return config.edges?.length?config.edges:[...config.inputNodeIds.map(id=>({id:`${id}->${config.hubNodeId}`,from:id,to:config.hubNodeId,route:'orthogonal'})),...config.outputNodeIds.map(id=>({id:`${config.hubNodeId}->${id}`,from:config.hubNodeId,to:id,route:'orthogonal'}))];}
function edgesAt(config,elapsed){
 let previous=initialEdges(config),current=previous,event=null,p=1,born=new Map(previous.map(edge=>[edge.id,config.flowAtMs]));
 for(const phase of [...(config.rearrangements??[])].sort((a,b)=>a.atMs-b.atMs)){if(elapsed<phase.atMs)break;event=phase;current=phase.edges;p=ease((elapsed-phase.atMs)/phase.durationMs);for(const edge of current)if(!born.has(edge.id))born.set(edge.id,phase.atMs);if(p<1)break;previous=current;born=new Map(current.map(edge=>[edge.id,born.get(edge.id)]));}
 if(!event||p>=1)return current.map(edge=>({...edge,opacity:1,birthAtMs:born.get(edge.id),removedAtMs:Infinity}));
 const old=new Map(previous.map(edge=>[edge.id,edge])),next=new Map(current.map(edge=>[edge.id,edge]));
 return [...new Set([...old.keys(),...next.keys()])].map(id=>({...next.get(id)??old.get(id),opacity:old.has(id)&&next.has(id)?1:next.has(id)?p:1-p,birthAtMs:born.get(id),removedAtMs:next.has(id)?Infinity:event.atMs}));
}
function edgePath(edge,rects){
 const a=rects.get(edge.from),b=rects.get(edge.to),ac=center(a),bc=center(b),vertical=Math.abs(bc.y-ac.y)>.08;
 const start=vertical?{x:ac.x,y:bc.y>=ac.y?a.y+a.height:a.y}:{x:bc.x>=ac.x?a.x+a.width:a.x,y:ac.y};
 const end=vertical?{x:bc.x,y:bc.y>=ac.y?b.y:b.y+b.height}:{x:bc.x>=ac.x?b.x:b.x+b.width,y:bc.y};
 if(edge.route==='bezier')return {kind:'bezier',points:[start,...(edge.points?.length===2?edge.points:[{x:start.x,y:(start.y+end.y)/2},{x:end.x,y:(start.y+end.y)/2}]),end]};
 return {kind:'polyline',points:[start,...(edge.points?.length?edge.points:vertical?[{x:start.x,y:(start.y+end.y)/2},{x:end.x,y:(start.y+end.y)/2}]:[{x:(start.x+end.x)/2,y:start.y},{x:(start.x+end.x)/2,y:end.y}]),end]};
}
export function sampleFlowPath(path,p,viewport={width:1920,height:1080}){
 let points=path.points;
 if(path.kind==='bezier'){const [a,b,c,d]=points;points=Array.from({length:49},(_,index)=>{const t=index/48,q=1-t;return {x:q*q*q*a.x+3*q*q*t*b.x+3*q*t*t*c.x+t*t*t*d.x,y:q*q*q*a.y+3*q*q*t*b.y+3*q*t*t*c.y+t*t*t*d.y};});}
 const lengths=points.slice(1).map((point,index)=>Math.hypot((point.x-points[index].x)*viewport.width,(point.y-points[index].y)*viewport.height)),total=lengths.reduce((sum,length)=>sum+length,0);let distance=clamp(p)*total;
 for(let index=0;index<lengths.length;index++){if(distance<=lengths[index]||index===lengths.length-1){const amount=lengths[index]?distance/lengths[index]:0;return {x:mix(points[index].x,points[index+1].x,amount),y:mix(points[index].y,points[index+1].y,amount)};}distance-=lengths[index];}
 return points[0];
}
export function flowPathD(path,width=1920,height=1080){const points=path.points.map(point=>({x:point.x*width,y:point.y*height}));return path.kind==='bezier'?`M${points[0].x} ${points[0].y} C${points[1].x} ${points[1].y},${points[2].x} ${points[2].y},${points[3].x} ${points[3].y}`:points.map((point,index)=>`${index?'L':'M'}${point.x} ${point.y}`).join(' ');}
function gateEnabled(gates,time){let enabled=true;for(const gate of gates)if(gate.atMs<=time)enabled=gate.enabled;return enabled;}
function particlesFor(edge,path,config,elapsed,viewport){
 const start=Math.max(config.flowAtMs,edge.birthAtMs),life=config.flowMs,spacing=life/config.particleCount,gates=(config.edgeGates??[]).filter(gate=>gate.edgeId===edge.id).sort((a,b)=>a.atMs-b.atMs),particles=[];
 const latest=Math.floor((elapsed-start)/spacing),earliest=Math.max(0,Math.floor((elapsed-start-life)/spacing));
 for(let index=earliest;index<=latest;index++){const birth=start+index*spacing,age=elapsed-birth;if(birth>=edge.removedAtMs||!gateEnabled(gates,birth)||age<0||age>=life)continue;const stop=gates.find(gate=>!gate.enabled&&gate.atMs>=birth&&gate.atMs<=elapsed);if(stop&&elapsed>=stop.atMs+stop.drainMs)continue;const progress=stop?mix((stop.atMs-birth)/life,1,clamp((elapsed-stop.atMs)/Math.min(stop.drainMs,life-(stop.atMs-birth)))):age/life;particles.push({id:`${edge.id}:${index}`,birthMs:birth,progress,...sampleFlowPath(path,progress,viewport),opacity:edge.opacity});}
 return particles;
}
export function hubFlowState(scene,config,elapsed,viewport={width:1920,height:1080}){
 const base=hubDefaultRects(scene,config,viewport),rects=new Map(base),membership=new Set([config.hubNodeId,...config.inputNodeIds,...config.outputNodeIds,...(config.quotedLineCues??[]).map(cue=>cue.nodeId)]),enters=new Map(),assets=new Map(),maxRects=new Map(base),births=new Map([...membership].map(id=>[id,0])),duration=visualSequence(scene,0).duration;
 for(const phase of [...(config.rearrangements??[])].sort((a,b)=>a.atMs-b.atMs)){
  for(const entry of phase.nodes){if(!births.has(entry.nodeId))births.set(entry.nodeId,phase.atMs);const existing=maxRects.get(entry.nodeId)??entry.rect;maxRects.set(entry.nodeId,{x:0,y:0,width:Math.max(existing.width,entry.rect.width,entry.fromRect?.width??0),height:Math.max(existing.height,entry.rect.height,entry.fromRect?.height??0)});}
  if(elapsed<phase.atMs)continue;const p=ease((elapsed-phase.atMs)/phase.durationMs);
  for(const entry of phase.nodes){const existed=membership.has(entry.nodeId),from=existed?(rects.get(entry.nodeId)??entry.rect):(entry.fromRect??{...entry.rect,y:Math.max(0,entry.rect.y-.12)});rects.set(entry.nodeId,mixRect(from,entry.rect,p));membership.add(entry.nodeId);if(!existed)enters.set(entry.nodeId,p);if(entry.assetNodeId)assets.set(entry.nodeId,entry.assetNodeId);}
 }
 const nodes=(scene.nodes??[]).map(node=>{
  const output=config.outputNodeIds.indexOf(node.id),entryAt=output<0?0:config.branchesAtMs+config.branchDrawMs+output*config.nodeStaggerMs;
  // Moving an already visible node is not a new reading lifetime. A completed
  // hide followed by reactivation is; quote lines also wait for their parent.
  const birth=Math.max(births.get(node.id)??Infinity,entryAt),windows=[];let visibleFrom=birth;
  for(const event of [...(config.nodeStates??[])].filter(event=>event.nodeId===node.id).sort((a,b)=>a.atMs-b.atMs)){
   if(event.state==='hidden'){if(visibleFrom!==null){windows.push({startMs:visibleFrom,endMs:event.atMs+event.durationMs});visibleFrom=null;}}
   else if(visibleFrom===null)visibleFrom=Math.max(birth,event.atMs);
  }
  if(visibleFrom!==null)windows.push({startMs:visibleFrom,endMs:duration});
  const visibleWindows=windows.map(window=>({startMs:Math.max(window.startMs,config.matchToDiagram?.atMs??0),endMs:Math.min(window.endMs,duration)})),textClock=visibleTextClock(elapsed,visibleWindows);
  let opacity=membership.has(node.id)?ease((elapsed-entryAt)/280):0,saturation=1,trendAngle=null,metric=null;
  if(enters.has(node.id))opacity*=enters.get(node.id);
  for(const event of [...(config.nodeStates??[])].filter(event=>event.nodeId===node.id).sort((a,b)=>a.atMs-b.atMs)){
   if(elapsed<event.atMs)break;const p=ease((elapsed-event.atMs)/event.durationMs),target=event.state==='hidden'?0:event.state==='dim'?.28:1;opacity=mix(opacity,target,p);saturation=mix(saturation,event.state==='dim'?.25:1,p);
   if(event.trend)trendAngle=mix(trendAngle??0,event.trend==='down'?90:event.trend==='flat'?45:0,p);
   if(event.explicitValue){const value=mix(event.explicitValue.from,event.explicitValue.to,p);metric={...event.explicitValue,value,fraction:(value-event.explicitValue.scale.min)/(event.explicitValue.scale.max-event.explicitValue.scale.min)};}
  }
  // A state event cannot reveal an object before its topology/branch entry.
  if(!membership.has(node.id)||elapsed<entryAt)opacity=0;
  const quote=(config.quotedLineCues??[]).find(cue=>cue.nodeId===node.id),assetSource=(scene.nodes??[]).find(source=>source.id===assets.get(node.id));
  return {node,rect:rects.get(node.id),measurementRect:maxRects.get(node.id),footerReserved:(config.nodeStates??[]).some(event=>event.nodeId===node.id&&(event.explicitValue||event.trend)),opacity,saturation,trendAngle,metric,textClock,assetSrc:assetSource?.assetSrc??node.assetSrc,quoteLines:quote?.lines.map(line=>({...line,textClock:visibleTextClock(elapsed,visibleWindows.map(window=>({...window,startMs:Math.max(window.startMs,line.atMs)}))),opacity:ease((elapsed-line.atMs)/260),highlighted:!!line.highlightText&&elapsed>=(line.highlightAtMs??line.atMs)}))??[]};
 });
 const edges=edgesAt(config,elapsed).map(edge=>{const output=config.outputNodeIds.indexOf(edge.to),drawAt=config.branchesAtMs+Math.max(0,output)*config.nodeStaggerMs,path=edgePath(edge,rects),draw=ease((elapsed-drawAt)/config.branchDrawMs),gates=(config.edgeGates??[]).filter(gate=>gate.edgeId===edge.id).sort((a,b)=>a.atMs-b.atMs);return {...edge,path,draw,enabled:gateEnabled(gates,elapsed),particles:draw>0?particlesFor(edge,path,config,elapsed,viewport):[]};});
 const match=config.matchToDiagram,total=match?.durationMs??900,fade=total*.35,mixAmount=match?ease((elapsed-match.atMs)/fade):1,personMix=match?ease((elapsed-match.atMs-fade)/(total-fade)):1;
 // First remove the actual room while alpha still aligns; only then move the
 // person. Inverse alpha is transparency, never reconstructed hidden scenery.
 return {nodes,edges,diagramMix:mixAmount,speakerRect:match?mixRect(match.from,match.to,personMix):null,requiresRealCutout:!!match};
}
export function hubFlowIssues(scene,config,viewport={width:1920,height:1080}){
 const issues=[],duration=visualSequence(scene,0).duration,ids=new Set((scene.nodes??[]).map(node=>node.id)),references=[config.hubNodeId,...(config.inputNodeIds??[]),...(config.outputNodeIds??[])];
 if(!config.hubNodeId||!config.inputNodeIds?.length||!config.outputNodeIds?.length||references.some(id=>!ids.has(id))||new Set(references).size!==references.length)return ['中心、输入与输出须为互不重复的真实节点'];
 if(![config.branchesAtMs,config.branchDrawMs,config.nodeStaggerMs,config.flowAtMs,config.flowMs,config.particleCount].every(Number.isFinite)||config.branchesAtMs<0||config.branchDrawMs<=0||config.nodeStaggerMs<0||config.flowAtMs<config.branchesAtMs||config.flowMs<=0||!Number.isInteger(config.particleCount)||config.particleCount<1||config.particleCount>32)issues.push('分支、节点和粒子时钟参数无效');
 if(config.branchesAtMs+config.branchDrawMs+(config.outputNodeIds.length-1)*config.nodeStaggerMs+400>duration||config.flowAtMs+config.flowMs>duration)issues.push('源时段不足以完成节点出现与一次粒子通过');
 if(new Set((config.positions??[]).map(position=>position.nodeId)).size!==(config.positions??[]).length||(config.positions??[]).some(position=>!ids.has(position.nodeId)||!pointValid(position)))issues.push('节点位置须唯一且对应当前原节点');
 if((scene.nodes??[]).some(node=>node.assetSrc&&/^(?:https?:|file:|\/|.*\.\.)/.test(node.assetSrc)))issues.push('图中证据须来自本地真实素材');
 if(config.evidenceRelay?.length)issues.push('Hub内证据接力尚未接入，请使用独立证据焦点交接原语');
 const edges=initialEdges(config),edgeIds=new Set(edges.map(edge=>edge.id));
 for(const phase of config.rearrangements??[])for(const edge of phase.edges??[])edgeIds.add(edge.id);
 const validEdges=list=>{if(new Set(list.map(edge=>edge.id)).size!==list.length)issues.push('连线ID不能重复');for(const edge of list)if(!ids.has(edge.from)||!ids.has(edge.to)||edge.from===edge.to||!['orthogonal','bezier'].includes(edge.route)||(edge.points??[]).some(point=>!pointValid(point))||edge.route==='bezier'&&edge.points&&edge.points.length!==2)issues.push('连线端点、类型或控制点无效');};validEdges(edges);
 const rects=hubDefaultRects(scene,config,viewport);if([...rects.values()].some(rect=>!rectValid(rect)))issues.push('节点布局超出安全画幅，请调整响应式位置');
 let lastEnd=-1;const knownEdges=new Map(edges.map(edge=>[edge.id,edge]));for(const phase of [...(config.rearrangements??[])].sort((a,b)=>a.atMs-b.atMs)){if(phase.atMs<lastEnd)issues.push('网络重排时段不可重叠');lastEnd=phase.atMs+phase.durationMs;for(const edge of phase.edges??[]){const prior=knownEdges.get(edge.id);if(prior&&(prior.from!==edge.from||prior.to!==edge.to||prior.route!==edge.route||JSON.stringify(prior.points??[])!==JSON.stringify(edge.points??[])))issues.push('改变连线关系或路径须使用新边ID，使旧边退出、新边入场');knownEdges.set(edge.id,edge);}}
 for(const phase of config.rearrangements??[]){if(!Number.isFinite(phase.atMs)||phase.atMs<0||!(phase.durationMs>0)||phase.atMs+phase.durationMs>duration)issues.push('重排时段须在原场内');validEdges(phase.edges??[]);for(const entry of phase.nodes??[])if(!ids.has(entry.nodeId)||!rectValid(entry.rect)||entry.fromRect&&!rectValid(entry.fromRect)||entry.assetNodeId&&!scene.nodes.some(node=>node.id===entry.assetNodeId&&node.assetSrc))issues.push('重排需要有效节点、真实素材绑定与安全矩形');}
 for(const gate of config.edgeGates??[])if(!edgeIds.has(gate.edgeId)||!Number.isFinite(gate.atMs)||gate.atMs<0||gate.atMs>=duration||!Number.isFinite(gate.drainMs)||gate.drainMs<0||gate.atMs+gate.drainMs>duration||typeof gate.enabled!=='boolean')issues.push('支路开关需要有效边与排空时长');
 const nodeEnds=new Map();for(const event of [...(config.nodeStates??[])].sort((a,b)=>a.atMs-b.atMs)){if(!ids.has(event.nodeId)||!['active','dim','hidden'].includes(event.state)||!Number.isFinite(event.atMs)||event.atMs<0||!(event.durationMs>0)||event.atMs+event.durationMs>duration||event.trend&&!['up','down','flat'].includes(event.trend))issues.push('节点状态事件无效');if(event.atMs<(nodeEnds.get(event.nodeId)??-1))issues.push('同节点的状态过渡不可重叠');nodeEnds.set(event.nodeId,event.atMs+event.durationMs);const value=event.explicitValue;if(value&&(![value.from,value.to,value.scale?.min,value.scale?.max].every(Number.isFinite)||value.scale.max<=value.scale.min||Math.min(value.from,value.to)<value.scale.min||Math.max(value.from,value.to)>value.scale.max||typeof value.unit!=='string'))issues.push('节点数值需显式数据、单位和共同尺度');}
 for(const quote of config.quotedLineCues??[]){if(!ids.has(quote.nodeId)||!quote.provenance?.trim())issues.push('引用需要原节点与来源');for(const line of quote.lines??[])if(typeof line.text!=='string'||!line.text.length||!Number.isFinite(line.atMs)||line.atMs<0||line.atMs>=duration||line.highlightText&&!line.text.includes(line.highlightText)||line.highlightAtMs!==undefined&&(!Number.isFinite(line.highlightAtMs)||line.highlightAtMs<line.atMs||line.highlightAtMs>=duration))issues.push('引用行或高亮必须有完整原文与有效时点');}
 if(config.matchToDiagram){const match=config.matchToDiagram;if(!match.from||!match.to||![match.from,match.to].every(rect=>rect&&['x','y','width','height'].every(key=>Number.isFinite(rect[key])))||!Number.isFinite(match.atMs)||match.atMs<0||match.atMs+(match.durationMs??900)>duration)issues.push('实拍转图解须显式匹配人物起止画布和有效时段');}
 return [...new Set(issues)];
}
