// Source-anchored visual scenes, independent from spoken subtitle pages.
import {overviewComparisonIssues} from './overview-comparison.mjs';
import {visualPreset,visualPresetIssues} from './visual-presets.mjs';
export const sceneLayouts=['speaker','headline','chapter','slide','spotlight','cards','flow','demo','outro','overview','stack','route','gallery'];
export const sceneLabels={speaker:'真人全屏',headline:'真人与重点大字',chapter:'章节页',slide:'图文讲义',spotlight:'文档聚焦',cards:'对比卡片',flow:'流程图',demo:'操作演示',outro:'总结页',overview:'总览导航与当前节点',stack:'分层纸张展开',route:'分支连线图解',gallery:'多素材总结展示'};
export function matchingSource(scene,clip){
 if(scene.clipInstanceId)return scene.clipInstanceId===clip.id&&scene.src===clip.src;
 // Scenes use original-source seconds, so all retained siblings of that media
 // must share the scene even when their generated IDs have different branches.
 // Exact paths keep different uploads isolated; IDs only anchor legacy scenes.
 return typeof scene.src==='string'&&scene.src.length>0?scene.src===clip.src:scene.clipId===clip.id;
}
export function activeStoryboard(scenes=[],ms,clip){return scenes.filter(s=>(!clip||matchingSource(s,clip))&&ms>=s.startMs&&ms<s.endMs).sort((a,b)=>b.startMs-a.startMs)[0];}
export function projectStoryboard(scenes=[],clips=[],fps=30){
 let offset=0;const out=[];
 for(const clip of clips){const speed=clip.speed??1,start=clip.inSec*1000,end=clip.outSec*1000,duration=Math.max(1,Math.round((end-start)/speed/1000*fps))/fps*1000;
  for(const scene of scenes){if(!matchingSource(scene,clip))continue;const a=Math.max(start,scene.startMs),b=Math.min(end,scene.endMs);if(b<=a)continue;
   out.push({...scene,id:scene.id+':'+clip.id,sourceId:scene.id,clipId:clip.id,startMs:offset+(a-start)/speed,endMs:Math.min(offset+duration,offset+(b-start)/speed),phaseStartMs:offset+(scene.startMs-start)/speed,phaseEndMs:offset+(scene.endMs-start)/speed,sourceOffsetMs:a-scene.startMs,speed});
  }offset+=duration;
 }return out.sort((a,b)=>a.startMs-b.startMs);
}
export function validateStoryboard(scenes,clips){
 const issues=[];const ids=new Set();
 for(const s of scenes??[]){
  if(ids.has(s.id))issues.push({id:s.id,message:'分镜编号重复'});ids.add(s.id);
  if(!Number.isFinite(s.startMs)||!Number.isFinite(s.endMs)||s.endMs<=s.startMs)issues.push({id:s.id,message:'分镜时间范围无效'});
  if(s.stackStyle!==undefined&&!['cards','folder'].includes(s.stackStyle))issues.push({id:s.id,message:'未知分层展开形式'});
  if(!sceneLayouts.includes(s.layout))issues.push({id:s.id,message:'未知版式'});
  if(s.visualPreset){if(s.visualPreset.version!==1)issues.push({id:s.id,message:'未知动效预设版本'});for(const message of visualPresetIssues(s,s.visualPreset.id))issues.push({id:s.id,message});}
  if(s.titleTreatment!==undefined&&!['airy','embedded'].includes(s.titleTreatment))issues.push({id:s.id,message:'未知标题画面风格'});
  if(!clips.some(c=>matchingSource(s,c)&&s.endMs>c.inSec*1000&&s.startMs<c.outSec*1000))issues.push({id:s.id,message:'分镜未对应当前时间轴'});
  if(s.media?.src&&/^(?:https?:|file:|\/|.*\.\.)/.test(s.media.src))issues.push({id:s.id,message:'配套素材须位于本地媒体库'});
  if(s.personMatte&&(!s.personMatte.prefix||/^(?:https?:|file:|\/|.*\.\.)/.test(s.personMatte.prefix)||!Number.isFinite(s.personMatte.sourceStartMs)||!Number.isFinite(s.personMatte.fps)||s.personMatte.fps<=0||!Number.isInteger(s.personMatte.count)||s.personMatte.count<=0))issues.push({id:s.id,message:'人物遮挡层须使用本地原片对齐帧'});
  if(s.missing)issues.push({id:s.id,message:'待补素材：'+s.missing});
  // Source seconds such as 64.76 can produce 4539.999999999993ms spans.
  // Keep a sub-millisecond tolerance when a user enters the visible endpoint.
  const duration=Math.round((s.endMs-s.startMs)*1000)/1000;
  if(s.overviewComparison!==undefined){
   if(s.layout!=='overview')issues.push({id:s.id,message:'原片与成片对照须用于总览版式'});
   for(const message of overviewComparisonIssues(s.overviewComparison,duration))issues.push({id:s.id,message});
  }
  if(s.folderCloseMs!==undefined&&(!Number.isFinite(s.folderCloseMs)||s.folderCloseMs<1450||s.folderCloseMs+850>duration))issues.push({id:s.id,message:'文件夹合拢须在展开后开始，并在场景结束前完成'});
  if(s.iconDrawMs!==undefined&&(!Number.isFinite(s.iconDrawMs)||s.iconDrawMs<0||s.iconDrawMs>2000))issues.push({id:s.id,message:'图标绘制时长须在0—2000毫秒之间'});
  if(s.transitionMs!==undefined&&(!Number.isFinite(s.transitionMs)||s.transitionMs<0||s.transitionMs>1000))issues.push({id:s.id,message:'转场时长须在0—1000毫秒之间'});
  if(s.containerPose&&Object.entries({rotateY:[-15,15],rotateZ:[-10,10],perspective:[1000,5000]}).some(([key,[min,max]])=>s.containerPose[key]!==undefined&&(!Number.isFinite(s.containerPose[key])||s.containerPose[key]<min||s.containerPose[key]>max)))issues.push({id:s.id,message:'窗口倾斜或透视距离超出可编辑范围'});
  const typography=s.chapterTypography;
  if(typography&&((typography.entry!==undefined&&typography.entry!=='sweep')||(typography.delayMs!==undefined&&(!Number.isFinite(typography.delayMs)||typography.delayMs<0||typography.delayMs>500))||(typography.labelScale!==undefined&&(!Number.isFinite(typography.labelScale)||typography.labelScale<.5||typography.labelScale>2.5))||(typography.lineScales!==undefined&&(!Array.isArray(typography.lineScales)||typography.lineScales.some(scale=>!Number.isFinite(scale)||scale<.5||scale>2.2)))))issues.push({id:s.id,message:'章节字号或入场参数无效'});
  const tagIds=new Set();
  for(const t of s.tags??[]){
   if(t.contextAtMs!==undefined&&(!Number.isFinite(t.contextAtMs)||t.contextAtMs<t.atMs||t.contextAtMs>=t.endMs))issues.push({id:s.id,message:'转为轮廓时点须位于标签可见时段内'});
   if(t.width!==undefined&&(!Number.isFinite(t.width)||t.width<.08||t.width>.92||t.x+t.width>.981))issues.push({id:s.id,message:'关键词可用宽度无效或超出画幅'});
   if(t.animation!==undefined&&(!t.animation||typeof t.animation!=='object'||Array.isArray(t.animation)||Object.entries(t.animation).some(([key,value])=>!['inMs','outMs','lineDelayMs'].includes(key)||(value!==undefined&&(!Number.isFinite(value)||value<0||value>(key==='lineDelayMs'?500:2000))))))issues.push({id:s.id,message:'标签入退场须在0—2000毫秒、逐行间隔须在0—500毫秒之间'});
   if(t.lineAtMs!==undefined&&(!Array.isArray(t.lineAtMs)||t.lineAtMs.length<2||t.lineAtMs.length!==(typeof t.text==='string'?t.text.split('\n').length:0)||t.lineAtMs.some((value,index,values)=>!Number.isFinite(value)||value<t.atMs-.001||value>=t.endMs||(index>0&&value<values[index-1]))))issues.push({id:s.id,message:'逐行口述时点须对应每一行、按顺序且位于标签可见时段内'});
   if(tagIds.has(t.id)||!t.text?.trim()||!['x','y','atMs','endMs'].every(k=>Number.isFinite(t[k]))||t.x<0||t.x>1||t.y<0||t.y>.8||t.atMs<0||t.endMs<=t.atMs||t.endMs>duration||(t.scale!==undefined&&(!Number.isFinite(t.scale)||t.scale<.5||t.scale>2))||(t.rotate!==undefined&&(!Number.isFinite(t.rotate)||Math.abs(t.rotate)>30)))issues.push({id:s.id,message:'独立标签的文字、位置或时间无效'});
   tagIds.add(t.id);
  }
  if((s.nodes??[]).some(n=>n.assetSrc&&(!/^broll-assets\//.test(n.assetSrc)||n.assetSrc.includes('..')||!/[.](png|jpe?g|webp|svg)$/i.test(n.assetSrc))))issues.push({id:s.id,message:'展示图片须来自本地图片素材库'});
  const nodeIds=(s.nodes??[]).map(n=>n.id);
  if(['overview','stack','route'].includes(s.layout)&&nodeIds.length<(s.layout==='overview'?1:2))issues.push({id:s.id,message:'此版式需要添加图解对象'});
  if(new Set(nodeIds).size!==nodeIds.length)issues.push({id:s.id,message:'图解对象编号重复'});
  if(s.activeNodeId&&!nodeIds.includes(s.activeNodeId))issues.push({id:s.id,message:'当前节点未对应图解对象'});
  if((s.links??[]).some(l=>!nodeIds.includes(l.from)||!nodeIds.includes(l.to)||l.from===l.to))issues.push({id:s.id,message:'连线端点无效'});
  if(new Set((s.links??[]).map(l=>l.id)).size!==(s.links??[]).length)issues.push({id:s.id,message:'连线编号重复'});
  if((s.links??[]).some(l=>l.atMs!==undefined&&(!Number.isFinite(l.atMs)||l.atMs<0||l.atMs>=duration)))issues.push({id:s.id,message:'连线入场超出场景范围'});
  if(s.layout==='route'&&(s.nodes??[]).some((n,i)=>(n.width!==undefined&&n.width<=0)||(n.x??(i===0?.35:.02+(i-1)*.33))+(n.width??.28)>1.001))issues.push({id:s.id,message:'图解节点宽度超出内容区域'});
  if((s.nodes??[]).some(n=>['x','y','width'].some(k=>n[k]!==undefined&&(!Number.isFinite(n[k])||n[k]<0||n[k]>1))))issues.push({id:s.id,message:'图解位置超出内容区域'});

  if((s.nodes??[]).some(n=>n.atMs!==undefined&&(!Number.isFinite(n.atMs)||n.atMs<0||n.atMs>=duration)))issues.push({id:s.id,message:'图解对象入场超出场景范围'});
  if((s.nodes??[]).some(n=>n.focusMs!==undefined&&(!Number.isFinite(n.focusMs)||n.focusMs<(n.atMs??0)||n.focusMs>=duration)))issues.push({id:s.id,message:'对象聚焦时间须在入场之后且位于场景内'});
  if((s.nodes??[]).some(n=>n.textCues!==undefined&&(!Array.isArray(n.textCues)||n.textCues.some(c=>typeof c.text!=='string'||!c.text.trim()||!n.text.includes(c.text)||!Number.isFinite(c.atMs)||c.atMs<0||c.atMs>=duration))))issues.push({id:s.id,message:'文字强调须对应对象原文且位于场景内'});
  if(s.window&&(!['x','y','size'].every(k=>Number.isFinite(s.window[k]))||s.window.size<=0||s.window.x<0||s.window.y<0||s.window.x+s.window.size>1))issues.push({id:s.id,message:'人物窗范围无效'});
  if((s.window?.keyframes??[]).some((k,i,a)=>!['atMs','x','y','size'].every(f=>Number.isFinite(k[f]))||k.atMs<0||k.atMs>duration||k.x<0||k.y<0||k.size<.12||k.size>.35||k.x+k.size>1||k.y+k.size*(16/9)>.83||a.some((p,j)=>j<i&&p.atMs===k.atMs)))issues.push({id:s.id,message:'人物窗关键帧时间或位置无效，请避开字幕区域'});
  if(s.media){
   if((s.highlights?.length||s.media.cursor?.length)&&(!(s.media.width>0)||!(s.media.height>0)))issues.push({id:s.id,message:'请补充素材尺寸以精确定位标记'});
   if(s.media.kind==='video'&&((s.media.rate!==undefined&&(!Number.isFinite(s.media.rate)||s.media.rate<=0))||(s.media.freezeAtSec!==undefined&&(!Number.isFinite(s.media.freezeAtSec)||s.media.freezeAtSec<0))))issues.push({id:s.id,message:'录屏速度或定格时间无效'});
   if((s.media.cursor??[]).some((p,i,a)=>!['atMs','x','y'].every(k=>Number.isFinite(p[k]))||p.atMs<0||p.atMs>duration||p.x<0||p.x>1||p.y<0||p.y>1||a.some((q,j)=>j<i&&q.atMs===p.atMs)))issues.push({id:s.id,message:'示意光标时间或坐标无效，时间不可重复'});
   if((s.media.camera??[]).some(k=>!['atMs','scale','x','y'].every(f=>Number.isFinite(k[f]))||k.atMs<0||k.atMs>duration||k.scale<=0))issues.push({id:s.id,message:'素材镜头关键帧无效'});
  }
  if((s.nodes??[]).some(n=>!n.text?.trim()))issues.push({id:s.id,message:'存在空白图解对象'});
  if(new Set((s.highlights??[]).map(h=>h.id)).size!==(s.highlights??[]).length)issues.push({id:s.id,message:'高亮区域编号重复'});
  if((s.highlights??[]).some(h=>!['x','y','w','h'].every(k=>Number.isFinite(h[k]))||h.x<0||h.y<0||h.w<=0||h.h<=0||h.x+h.w>1.001||h.y+h.h>1.001))issues.push({id:s.id,message:'高亮范围超出素材'});
  if((s.highlights??[]).some(h=>!Number.isFinite(h.atMs)||h.atMs<0||h.atMs>=duration||(h.endMs!==undefined&&(!Number.isFinite(h.endMs)||h.endMs<=h.atMs||h.endMs>duration))))issues.push({id:s.id,message:'高亮入场或退出时间超出场景范围'});
 }return issues;
}

export function sceneSpeakerLayout(scene){
 if(!scene)return 'speaker';
 if(scene.visualPreset)return visualPreset(scene.visualPreset.id)?.speaker??'speaker';
 if(scene.titleTreatment==='embedded')return 'speaker';
 if(scene.titleTreatment==='airy'&&['chapter','headline'].includes(scene.layout)&&(!scene.headlinePosition||scene.headlinePosition==='left'))return 'editorial';
 if(scene.layout==='headline'&&scene.headlinePosition&&scene.headlinePosition!=='left')return 'speaker';
 if(scene.layout==='outro')return 'slide';
 if(['chapter','headline'].includes(scene.layout))return 'headline';
 if(['slide','spotlight','cards','flow','demo','overview','stack','route','gallery'].includes(scene.layout))return 'slide';
 return 'speaker';
}

export function sampleSceneWindow(scene,elapsed=0){
 if(!scene?.window)return undefined;
 const {x,y,size}=scene.window;
 const points=(scene.window.keyframes??[]).slice().sort((a,b)=>a.atMs-b.atMs);
 if(!points.length)return {x,y,size};
 if(points[0].atMs>0)points.unshift({atMs:0,x,y,size});
 const pick=p=>({x:p.x,y:p.y,size:p.size});
 if(elapsed<=points[0].atMs)return pick(points[0]);
 for(let i=1;i<points.length;i++){
  const a=points[i-1],b=points[i];if(elapsed>b.atMs)continue;
  const t=Math.max(0,Math.min(1,(elapsed-a.atMs)/(b.atMs-a.atMs))),p=t*t*(3-2*t);
  return {x:a.x+(b.x-a.x)*p,y:a.y+(b.y-a.y)*p,size:a.size+(b.size-a.size)*p};
 }
 return pick(points.at(-1));
}

export function focusedNodeId(scene,elapsed=0){
 if(scene.activeNodeId)return scene.activeNodeId;
 return (scene.nodes??[]).filter(n=>elapsed>=(n.atMs??0)&&elapsed>=(n.focusMs??n.atMs??0)).slice().sort((a,b)=>(a.focusMs??a.atMs??0)-(b.focusMs??b.atMs??0)).at(-1)?.id;
}
export function nodeFocusAmount(scene,id,elapsed=0){
 const active=focusedNodeId(scene,elapsed);
 if(scene.activeNodeId)return active===id?1:0;
 const selected=scene.nodes?.find(n=>n.id===active);if(!selected)return 0;
 const at=selected.focusMs??selected.atMs??0,previous=focusedNodeId(scene,at-.001);
 const x=Math.max(0,Math.min(1,(elapsed-at)/250)),p=x*x*(3-2*x);
 return id===active?(previous?p:1):id===previous?1-p:0;
}

// Use rendered chronology, never the storage order of authored scene objects.
export function previousStoryboardScene(scenes,current){
 if(!current)return undefined;
 return scenes.filter(s=>s.id!==current.id&&s.endMs<=current.startMs+1).sort((a,b)=>b.endMs-a.endMs)[0];
}

// A frame is active iff its timestamp is in [startMs,endMs). Ceil both
// boundaries so separately-rounded start/duration cannot leave a blank frame.
export function storyboardFrameRange(scene,fps=30){
 const from=Math.ceil(scene.startMs/1000*fps-1e-7);
 const end=Math.ceil(scene.endMs/1000*fps-1e-7);
 return {from,durationInFrames:Math.max(1,end-from)};
}
