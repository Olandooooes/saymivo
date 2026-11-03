import {persistentEntitiesIssues,persistentEntitiesState,persistentEntitiesSourceCopy} from './persistent-entities.mjs';
import {projectStoryboard,sceneSpeakerLayout,storyboardFrameRange} from './storyboard.mjs';
import {speakerBox} from './presentation.mjs';
import {sourceTokenExposure,sourceTokenTextReadiness} from './source-token-transfer.mjs';

const finite=Number.isFinite,unique=a=>[...new Set(a)],text=s=>typeof s==='string'&&!!s.trim();
const full=n=>n?[n.text,n.detail,...(n.bullets??[])].filter(t=>typeof t==='string'&&t.length).join('\n'):'';
const strip=s=>{const {dynamicMotion,visualPreset,...raw}=s;return raw;};
const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().filter(k=>v[k]!==undefined).map(k=>[k,stable(v[k])])):v;
const same=(a,b)=>JSON.stringify(stable(a))===JSON.stringify(stable(b));
const box=r=>r&&['x','y','width','height'].every(k=>finite(r[k]))&&r.x>=0&&r.y>=0&&r.width>0&&r.height>0&&r.x+r.width<=1.000001&&r.y+r.height<=.86;
const canvasBox=r=>r&&['x','y','width','height'].every(k=>finite(r[k]))&&r.x>=0&&r.y>=0&&r.width>0&&r.height>0&&r.x+r.width<=1.000001&&r.y+r.height<=1.000001;
const intersects=(a,b)=>a.x<b.x+b.width-1e-7&&b.x<a.x+a.width-1e-7&&a.y<b.y+b.height-1e-7&&b.y<a.y+a.height-1e-7;
const hull=rs=>{const x=Math.min(...rs.map(r=>r.x)),y=Math.min(...rs.map(r=>r.y));return{x,y,width:Math.max(...rs.map(r=>r.x+r.width))-x,height:Math.max(...rs.map(r=>r.y+r.height))-y};};
const compose=(p,c)=>({x:p.x+c.x*p.width,y:p.y+c.y*p.height,width:p.width*c.width,height:p.height*c.height});
const inset=(r,x=.025,y=.04)=>({x:r.x+r.width*x,y:r.y+r.height*y,width:r.width*(1-x*2),height:r.height*(1-y*2)});
const must=(value,message)=>{if(!value)throw Error(message);};
const owner=(containerId,slotId)=>({containerId,slotId});
const sourceContext=(raw,identity,assets)=>({scene:strip(raw),sourceIdentity:identity,assets:assets.filter(a=>a.kind==='image')});
const field=(id,content,rect,atMs,endMs,role)=>({id,text:content,rect,atMs,endMs,role});

/** One compiler for two composable authored recipes, never two renderers. */
export function compilePersistentMotion(rawScene,config,sourceIdentity,assets=[]){
 const context=sourceContext(rawScene,sourceIdentity,assets),duration=rawScene.endMs-rawScene.startMs;
 const timeline={version:1,clock:'scene-source-relative-ms',binding:config.binding,provenance:config.provenance,entities:[],containers:[],events:[]};
 const fields=[],media=[],groups=[],actions=[];
 const extra=config.checklist?.summaryText;
 const copy=[persistentEntitiesSourceCopy(context),extra].filter(text).join('\n');
 must(config.kind==='persistent-entities'&&config.clock==='scene-source-relative-ms','持久对象配置或原场时钟无效');
 must(config.mediaStack||config.checklist,'请添加图片入栈或任务归档参数组');
 const cw=config.copyWindow;
 must(cw&&box(cw.rect)&&[cw.atMs,cw.endMs].every(finite)&&cw.atMs>=0&&cw.endMs>cw.atMs&&cw.endMs<=duration,'请设置完整原文的独立阅读窗口');
 fields.push(field('complete-copy',copy,cw.rect,cw.atMs,cw.endMs,'copy'));
 const node=id=>{const matches=(rawScene.nodes??[]).filter(n=>n.id===id);must(matches.length===1,'请选择当前唯一原节点');return matches[0];};
 const time=(start,end)=>{must([start,end].every(finite)&&start>=cw.endMs&&end>start&&end<=duration,'原生动作须在全文窗口后且完整处于原场');actions.push([start,end]);};
 if(config.mediaStack){
  const r=config.mediaStack,items=r.items;
  must(text(r.id)&&box(r.stackRect)&&box(r.anchorRect)&&Array.isArray(items)&&items.length>=2&&items.length<=3&&unique(items.map(i=>i.id)).length===items.length,'图片组需要稳定ID、2—3张原图和有效堆栈/锚点区域');
  const anchor=node(r.anchorNodeId);must(r.anchorExpectedText===full(anchor),'锚点原文已变化，请重新选择');
  const slotPose=i=>({x:.04,y:.64-i*.28,width:.92,height:.32});
  const slots=items.map(i=>({id:i.id+':slot',pose:slotPose(0)}));
  const stackId=r.id+':stack',anchorId=r.id+':anchor',anchorSlot={x:0,y:0,width:1,height:1};
  timeline.containers.push({id:stackId,kind:'stack',pose:r.stackRect,slots},{id:anchorId,kind:'anchor',pose:r.anchorRect,slots:[{id:'group',pose:anchorSlot}]});
  let last=cw.endMs,poses=slots.map(s=>s.pose);
  for(const [index,item] of items.entries()){
   const n=node(item.nodeId),asset=item.assetIdentity;
   must(item.expectedText===full(n)&&n.assetSrc===asset?.src&&asset?.kind==='image','图片对象须绑定当前原节点完整原文和真实图片身份');
   must(box(item.entryRect)&&[item.appearAtMs,item.readUntilMs,item.pushEndMs].every(finite)&&item.appearAtMs>=last&&item.readUntilMs>item.appearAtMs&&item.pushEndMs-item.readUntilMs>=500,'每张图片需要独立完整阅读及推入时段，不能重叠抢读');
   time(item.appearAtMs,item.pushEndMs);last=item.pushEndMs;
   timeline.entities.push({id:item.id,kind:'media',sourceRef:{asset,nodeId:n.id,expectedText:full(n)}});
   timeline.events.push({id:item.id+':spawn',type:'spawn',atMs:item.appearAtMs,instanceId:item.id,to:null,pose:item.entryRect});
   const moveEnd=item.pushEndMs-200,slotId=slots[index].id;
   timeline.events.push({id:item.id+':push',type:'move',atMs:item.readUntilMs,endMs:moveEnd,subject:{kind:'entity',id:item.id},from:null,to:owner(stackId,slotId),fromPose:item.entryRect,toPose:compose(r.stackRect,poses[index])});
   const next=slots.map((_,j)=>j<=index?slotPose(index-j):poses[j]);
   timeline.events.push({id:item.id+':layout',type:'layout',atMs:moveEnd,endMs:item.pushEndMs,containerId:stackId,slots:slots.map((s,j)=>({id:s.id,fromPose:poses[j],toPose:next[j]}))});poses=next;
   const imageRect={...item.entryRect,height:item.entryRect.height*.65},labelRect={x:item.entryRect.x,y:item.entryRect.y+item.entryRect.height*.68,width:item.entryRect.width,height:item.entryRect.height*.32};
   fields.push(field('media:'+item.id,full(n),inset(labelRect),item.appearAtMs,item.readUntilMs,'media-label'));
   media.push({id:item.id,asset,imageRect,atMs:item.appearAtMs,endMs:item.readUntilMs,entryRect:item.entryRect,pushAtMs:item.readUntilMs});
  }
  must(r.attachAtMs>=last,'整组附着须在所有推栈动作之后');time(r.attachAtMs,r.attachEndMs);
  timeline.events.push({id:r.id+':attach',type:'attach',atMs:r.attachAtMs,endMs:r.attachEndMs,subject:{kind:'container',id:stackId},from:null,to:owner(anchorId,'group'),fromPose:r.stackRect,toPose:r.anchorRect});
  const anchorLabel={x:r.anchorRect.x,y:r.anchorRect.y+r.anchorRect.height+.012,width:r.anchorRect.width,height:.08};
  fields.push(field('anchor:'+r.id,full(anchor),anchorLabel,r.attachEndMs,duration,'anchor'));
  groups.push({id:r.id,kind:'media',atMs:items[0].appearAtMs,endMs:duration,envelope:hull([r.stackRect,r.anchorRect,...items.map(i=>i.entryRect),anchorLabel])});
 }
 if(config.checklist){
  const r=config.checklist,items=r.items;
  must(text(r.id)&&box(r.rect)&&box(r.summaryRect)&&box(r.archiveRect)&&Array.isArray(items)&&items.length===5&&unique(items.map(i=>i.id)).length===5,'任务组需要5个稳定原任务和有效列表/摘要/归档区域');
  must(text(r.summaryText),'摘要须由作者明确提供，不能自动编造');
  const archive=node(r.archiveNodeId);must(r.archiveExpectedText===full(archive),'归档标签须绑定当前完整原文');
  must(finite(r.atMs)&&r.atMs>=cw.endMs&&r.summaryAtMs>r.atMs&&r.archiveAtMs>r.summaryAtMs,'列表、摘要及归档须按明确原场时点依次出现');
  time(r.atMs,r.archiveEndMs);
  const checklistId=r.id+':tasks',archiveId=r.id+':archive',summaryId=r.id+':summary';
  const rows=items.map((i,index)=>({id:i.id+':row',pose:{x:0,y:index*.2,width:1,height:.18}}));
  timeline.containers.push({id:checklistId,kind:'checklist',pose:r.rect,memberIds:items.map(i=>i.id),slots:rows},{id:archiveId,kind:'archive',pose:r.archiveRect,slots:[{id:'summary',pose:{x:0,y:0,width:1,height:1}}]});
  timeline.entities.push({id:summaryId,kind:'summary',text:r.summaryText,provenance:config.provenance});
  for(const [index,item] of items.entries()){
   const n=node(item.nodeId);must(item.expectedText===full(n),'任务完整原文已变化，请重新选择');
   must(finite(item.doneAtMs)&&item.doneAtMs>=r.atMs&&item.doneAtMs<r.summaryAtMs,'每项完成必须是摘要之前的明确作者示意时点');
   timeline.entities.push({id:item.id,kind:'task',sourceRef:{nodeId:n.id,expectedText:full(n)},initialStatus:'pending',provenance:config.provenance});
   timeline.events.push({id:item.id+':show',type:'spawn',atMs:r.atMs,instanceId:item.id,to:owner(checklistId,rows[index].id),pose:compose(r.rect,rows[index].pose)},{id:item.id+':done',type:'setStatus',atMs:item.doneAtMs,instanceId:item.id,from:'pending',to:'done',provenance:config.provenance});
   const row=compose(r.rect,rows[index].pose),label={x:row.x+row.width*.08,y:row.y,width:row.width*.92,height:row.height};
   fields.push(field('task:'+item.id,full(n),inset(label),r.atMs,r.summaryAtMs,'task'));
  }
  timeline.events.push({id:r.id+':summarize',type:'summarize',atMs:r.summaryAtMs,instanceId:summaryId,containerId:checklistId,memberIds:items.map(i=>i.id),expectedMembers:items.map(i=>({instanceId:i.id,text:i.expectedText,status:'done'})),completion:'all-done',provenance:config.provenance,to:null,pose:r.summaryRect},{id:r.id+':archive',type:'archive',atMs:r.archiveAtMs,endMs:r.archiveEndMs,subject:{kind:'entity',id:summaryId},from:null,to:owner(archiveId,'summary'),fromPose:r.summaryRect,toPose:r.archiveRect});
  const summaryTextRect=rect=>inset({x:rect.x+(rect.width-Math.min(r.summaryRect.width,r.archiveRect.width))/2,y:rect.y+(rect.height-Math.min(r.summaryRect.height,r.archiveRect.height))/2,width:Math.min(r.summaryRect.width,r.archiveRect.width),height:Math.min(r.summaryRect.height,r.archiveRect.height)});
  fields.push(field('summary:'+r.id,r.summaryText,summaryTextRect(r.summaryRect),r.summaryAtMs,r.archiveAtMs,'summary'),field('archived:'+r.id,r.summaryText,summaryTextRect(r.archiveRect),r.archiveEndMs,duration,'archived'));
  const label={x:r.archiveRect.x,y:r.archiveRect.y+r.archiveRect.height+.012,width:r.archiveRect.width,height:.08};
  fields.push(field('archive-label:'+r.id,full(archive),label,r.archiveEndMs,duration,'archive-label'));
  groups.push({id:r.id,kind:'checklist',atMs:r.atMs,endMs:duration,envelope:hull([r.rect,r.summaryRect,r.archiveRect,label])});
 }
 timeline.events.sort((a,b)=>a.atMs-b.atMs);
 const issues=persistentEntitiesIssues(timeline,context);must(!issues.length,issues.join('；'));
 return {timeline,context,fields,media,groups,actions,duration};
}

export function persistentMotionKey(raw,config,identity,assets,viewport,fontKey,projection){return JSON.stringify(stable([strip(raw),config,identity,assets,viewport,fontKey,projection&&strip(projection)]));}
export function persistentMotionProtectedRects(raw,viewport,protectedAreas=[]){
 const frames=raw.window?.keyframes??[],points=raw.window?[raw.window,...frames]:[],rs=points.map(p=>({x:p.x,y:p.y,width:p.size,height:p.size*viewport.width/viewport.height}));
 if(!rs.length){const r=speakerBox(sceneSpeakerLayout({...raw,visualPreset:undefined}),viewport.width,viewport.height);rs.push({x:r.left/viewport.width,y:r.top/viewport.height,width:r.width/viewport.width,height:r.height/viewport.height});}
 return [...rs,hull(rs),...protectedAreas.map(p=>p.rect)];
}
/** Keep the same local picture box on both sides of a reading/moving boundary. */
export function persistentMotionImageRect(carrier){return {...carrier,height:carrier.height*.65};}
/** Caption hold is output milliseconds; legacy cues are already output-clock.
 * Match placeClips/projectCaptions, including rounding and owner out clamp. */
export function persistentMotionCaptionBands(scene,proof){
 let frames=0;const placed=new Map(proof.clips.map(c=>{const startMs=frames/proof.fps*1000;frames+=Math.max(1,Math.round(Math.max(0,(c.outSec-c.inSec)/(c.speed??1))*proof.fps));return[c.id,{clip:c,startMs,endMs:frames/proof.fps*1000}];}));
 const range=storyboardFrameRange(scene,proof.fps),from=range.from/proof.fps*1000,to=(range.from+range.durationInFrames)/proof.fps*1000;
 return(proof.captions??[]).flatMap(c=>{
  let start=c.startMs,end=c.endMs,max=c.holdMaxMs??Infinity;
  if(c.clipId){const pc=placed.get(c.clipId);if(!pc||c.startMs>=pc.clip.outSec*1000||c.endMs<=pc.clip.inSec*1000)return[];const abs=n=>pc.startMs+(n-pc.clip.inSec*1000)/(pc.clip.speed??1);start=abs(start);end=Math.min(abs(end),pc.endMs);max=pc.endMs;}
  const holdEnd=Math.min(end+Math.max(0,c.holdMs??700),max);if(!finite(c.topPct)||start>=to||holdEnd<=from)return[];
  const top=Math.max(0,c.topPct/100-.08*Math.max(1,c.scale??1));return[{x:0,y:top,width:1,height:1-top}];
 });
}
export function persistentMotionIssues(scene,raw,config,identity,assets,viewport,proof){
 try{
  const compiled=compilePersistentMotion(raw,config,identity,assets),issues=[],duration=compiled.duration;
  must(proof?.rawScene&&same(strip(proof.rawScene),strip(raw))&&Array.isArray(proof.clips)&&finite(proof.fps)&&proof.fps>0,'需要当前原场和真实剪辑实例的投影证明');
  const expected=projectStoryboard([raw],proof.clips,proof.fps).find(p=>p.id===scene.id&&p.clipId===scene.clipId);must(expected&&same(strip(expected),strip(scene)),'当前投影不再匹配原场源时钟');
  const exposure=sourceTokenExposure(scene),keys=raw.window?.keyframes??[];
  must(keys.every(k=>finite(k.atMs)&&k.atMs>=0&&k.atMs<=duration)&&unique(keys.map(k=>k.atMs)).length===keys.length,'人物关键帧时钟无效');
  const protectedRects=persistentMotionProtectedRects(raw,viewport,config.protectedAreas??[]);
  must(protectedRects.every(canvasBox),'需要位于安全画幅内的已知人物窗及全部路径');
  protectedRects.push(...persistentMotionCaptionBands(scene,proof));
  for(const f of compiled.fields)if(!box(f.rect)||protectedRects.some(r=>intersects(f.rect,r)))issues.push('完整文字与已知人物/字幕保护区重叠：'+f.id);
  for(const group of compiled.groups)if(!box(group.envelope)||protectedRects.some(r=>intersects(group.envelope,r)))issues.push('整组运动包络跨越人物或字幕区：'+group.id);
  for(let i=0;i<compiled.groups.length;i++)for(let j=i+1;j<compiled.groups.length;j++){
   const a=compiled.groups[i],b=compiled.groups[j];if(a.atMs<b.endMs&&b.atMs<a.endMs&&intersects(a.envelope,b.envelope))issues.push('两组持久对象同时显示的完整包络重叠');
  }
  for(const f of compiled.fields)if(f.atMs<exposure.startMs-.02||f.endMs>exposure.endMs+.02)issues.push('全文及原生阅读窗口须完整保留：'+f.id);
  for(const [a,b] of compiled.actions)if(a<exposure.startMs-.02||b+1000*exposure.speed>exposure.endMs+.02)issues.push('入场、附着及终态停留必须完整保留');
  for(const item of config.checklist?.items??[])if((config.checklist.summaryAtMs-item.doneAtMs)/exposure.speed<600)issues.push('完成状态缺少可见停留');
  const used=compiled.media.map(m=>m.asset.src),declared=[raw.media?.src,...(raw.nodes??[]).map(n=>n.assetSrc)].filter(Boolean);
  if(declared.some(src=>!used.includes(src)))issues.push('本场还有未保留的实际资料，请绑定全部资料或保留原编排');
  return unique(issues);
 }catch(error){return [error instanceof Error?error.message:'持久对象参数尚未完整'];}
}
export function persistentMotionReadiness(scene,raw,config,identity,assets,viewport,proof,measurement){
 const issues=persistentMotionIssues(scene,raw,config,identity,assets,viewport,proof);if(issues.length)return{status:'blocked',issues};
 if(!measurement?.fontKey||measurement.key!==persistentMotionKey(raw,config,identity,assets,viewport,measurement.fontKey,scene))return{status:'waiting',issues:['等待当前字体与完整参数的实际测量']};
 const compiled=compilePersistentMotion(raw,config,identity,assets),waiting=[],exposure=sourceTokenExposure(scene);
 for(const f of compiled.fields){const m=measurement.fields?.find(m=>m.id===f.id),r=m?.text===f.text?sourceTokenTextReadiness(f.text,m.fit,f,exposure):{status:'waiting',issues:['等待完整文字测量']};(r.status==='waiting'?waiting:issues).push(...r.issues.map(i=>f.id+'：'+i));}
 for(const m of compiled.media){const current=measurement.media?.find(a=>a.id===m.id&&same(a.asset,m.asset));if(current?.status==='error')issues.push('实际图片解码失败：'+m.id);else if(current?.status!=='ready')waiting.push('等待当前真实原图解码：'+m.id);if((m.endMs-m.atMs)/exposure.speed<1200)issues.push('完整图片缺少独立保留阅读时长：'+m.id);}
 return{status:issues.length?'blocked':waiting.length?'waiting':'ready',issues:unique([...issues,...waiting])};
}
export function persistentMotionSample(scene,raw,config,identity,assets,elapsed){const c=compilePersistentMotion(raw,config,identity,assets);return persistentEntitiesState(c.timeline,c.context,raw.startMs+elapsed);}

const time=(key,label)=>({key,label,type:'source-ms'}),rect=(key,label)=>({key,label,type:'stage-rect'}),node=(key,label)=>({key,label,type:'node-ref'}),locked=(key,label)=>({key,label,type:'text',readonly:true,source:'scene-node-complete-text'}),id={key:'id',label:'稳定对象',type:'stable-id',readonly:true};
export const persistentMotionControls={kind:'persistent-entities',label:'持久对象与状态',fields:[
 {key:'clock',label:'原场相对时钟',type:'text',readonly:true,fixed:'scene-source-relative-ms'},
 {key:'binding',label:'当前原片身份',type:'record',readonly:true},
 {key:'provenance',label:'作者明确的示意来源',type:'record',fields:[{key:'kind',label:'原创示意',type:'text',fixed:'illustration'},{key:'note',label:'示意含义与来源（不代表真实执行）',type:'text'}]},
 {key:'copyWindow',label:'完整原文先行窗口',type:'record',fields:[time('atMs','开始'),time('endMs','结束'),rect('rect','全文区域')]},
 {key:'mediaStack',label:'图片入栈→整组附着',type:'record',fields:[id,rect('stackRect','堆栈区域'),rect('anchorRect','附着终点'),node('anchorNodeId','锚点标签原节点'),{key:'anchorExpectedText',label:'完整锚点标签',type:'text',readonly:true},time('attachAtMs','整组开始附着'),time('attachEndMs','整组附着完成'),{key:'items',label:'真实图片实例（2—3项）',type:'list',itemFields:[id,node('nodeId','图片对应原节点'),locked('expectedText','完整原文'),{key:'assetIdentity',label:'实际图片身份',type:'record',readonly:true},rect('entryRect','原图完整阅读区域'),time('appearAtMs','原图出现'),time('readUntilMs','完整阅读结束/开始推入'),time('pushEndMs','推入及旧卡让位完成')]}]},
 {key:'checklist',label:'五任务完成→摘要→归档',type:'record',fields:[id,rect('rect','完整任务列表'),time('atMs','列表出现'),{key:'items',label:'原任务（5项）',type:'list',itemFields:[id,node('nodeId','任务原节点'),locked('expectedText','完整任务及条件'),time('doneAtMs','明确示意完成时点')]},{key:'summaryText',label:'作者明确提供的完整摘要',type:'text'},rect('summaryRect','完整摘要阅读区域'),time('summaryAtMs','摘要出现'),rect('archiveRect','归档终点'),node('archiveNodeId','归档标签原节点'),{key:'archiveExpectedText',label:'完整归档标签',type:'text',readonly:true},time('archiveAtMs','开始归档'),time('archiveEndMs','归档完成')]},
 {key:'protectedAreas',label:'额外人物或重要对象保护',type:'list',itemFields:[rect('rect','保护范围')]}
]};
