import {personMatteFrame} from './person-matte.mjs';
const finite=Number.isFinite,sha=v=>/^[a-f0-9]{64}$/i.test(v??''),same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export const requiresDynamicMatte=c=>c?.kind==='evidence-handoff'&&(c.speakerMode==='cutout'||!!c.matchToLive)||c?.kind==='hub-branch-flow'&&!!c.matchToDiagram;
export const dynamicMatteDescriptor=m=>m?Object.fromEntries(['prefix','sourceStartMs','fps','count','timesMs','src','sourceSha256','width','height','endMs'].map(k=>[k,m[k]])):null;
export function dynamicMatteEvidenceIssues(scene,config,environment){
 if(!requiresDynamicMatte(config))return [];
 const issues=[],m=scene.personMatte,e=environment.matteEvidence,s=environment.sourceIdentity;
 if(!m||!e||e.version!==1||e.kind!=='same-source-rgba-sequence')return ['本场需要完整同源RGBA人物序列，请先生成人物分层并读取当前身份'];
 if(!same(dynamicMatteDescriptor(m),dynamicMatteDescriptor(e.matte))||!s||e.sourceIdentity?.src!==s.src||e.sourceIdentity?.sha256!==s.sha256||e.sourceIdentity?.width!==s.width||e.sourceIdentity?.height!==s.height||m.src!==scene.src||m.sourceSha256!==s.sha256||m.width!==s.width||m.height!==s.height)issues.push('人物序列与当前原片SHA、尺寸或绑定已变化');
 if(!sha(e.manifestIdentity?.sha256)||!sha(e.sequenceSha256)||!Array.isArray(e.frames)||e.frames.length!==m.count||m.count>601||!finite(m.fps)||m.fps<=0||!Array.isArray(m.timesMs)||m.timesMs.length!==m.count)issues.push('人物序列缺少真实manifest、逐帧身份或源时钟');
 else if(!finite(m.sourceStartMs)||Math.abs(m.sourceStartMs-m.timesMs[0])>.001||!finite(m.endMs)||m.endMs<=m.timesMs.at(-1)||m.endMs>m.timesMs.at(-1)+1000/m.fps+.01)issues.push('人物序列起止与逐帧源PTS不一致');
 else for(let i=0;i<m.count;i++){const f=e.frames[i],t=m.timesMs[i],b=f?.alphaBounds;if(!f||f.index!==i||f.src!==m.prefix+String(i).padStart(5,'0')+'.png'||!sha(f.sha256)||f.sourceMs!==t||f.width!==s.width||f.height!==s.height||!finite(t)||i&&t<=m.timesMs[i-1]||i&&t-m.timesMs[i-1]>1500/m.fps+.01||!b||!['x','y','width','height'].every(k=>finite(b[k]))||b.x<0||b.y<0||b.width<=0||b.height<=0||b.x+b.width>1.00001||b.y+b.height>1.00001){issues.push('人物逐帧身份、透明区域或连续源时间不完整');break;}}
 if(!personMatteFrame(m,scene.startMs)||!personMatteFrame(m,scene.endMs-.001)||m.endMs<scene.endMs-.001||scene.endMs-scene.startMs>10000.01)issues.push('人物序列必须连续覆盖本场完整原片时间（首版每场最多10秒）');
 if(config.matchToLive&&(config.matchToLive.backgroundDelayMs??250)<(config.matchToLive.durationMs??900))issues.push('背景须在人物完成源平面对齐后再淡入，请将backgroundDelayMs设为至少durationMs；不补画透明人形空洞');
 if(config.matchToLive){const q=config.matchToLive,end=Math.max(q.atMs+(q.durationMs??900),q.atMs+(q.backgroundDelayMs??250)+(q.backgroundFadeMs??450),q.atMs+(q.graphicsDelayMs??350)+(q.graphicsFadeMs??450));if(end>scene.endMs-scene.startMs+.01)issues.push('人物、背景叠化及旧资料退场必须在完整原场内结束');}
 const endpoint=config.matchToLive?.to??config.matchToDiagram?.from;
 if(endpoint&&(!['x','y','width','height'].every(k=>finite(endpoint[k]))||Math.abs(endpoint.x)>1e-6||Math.abs(endpoint.y)>1e-6||Math.abs(endpoint.width-1)>1e-6||Math.abs(endpoint.height-1)>1e-6))issues.push('同源房间匹配端必须为完整源画布 x=0,y=0,width=1,height=1，不能用不同裁切冒充对齐');
 if(config.matchToDiagram&&['backgroundDelayMs','backgroundFadeMs','graphicsDelayMs','graphicsFadeMs'].some(k=>config.matchToDiagram[k]!==undefined))issues.push('Hub房间交接使用同一个durationMs；请移除不支持的独立背景/图解延时参数');
 return [...new Set(issues)];
}
export function dynamicMatteFrameAt(evidence,sourceMs){const frame=personMatteFrame(evidence?.matte,sourceMs),f=frame&&evidence.frames?.[frame.index];return f&&f.src===frame.src&&Math.abs(f.sourceMs-sourceMs)<=1000/evidence.matte.fps+.01?f:null;}
const elements=new WeakMap();
/** Only the trusted loaded-image component calls this with checked PNG bytes. */
export function bindDynamicMatteElement(element,proof){if(element)elements.set(element,proof);return()=>{if(element)elements.delete(element);};}
export function dynamicMatteElementIssues(element,evidence,sourceMs,draftKey){
 const p=elements.get(element),f=dynamicMatteFrameAt(evidence,sourceMs);
 if(!p||!f||p.draftKey!==draftKey||p.sequenceSha256!==evidence.sequenceSha256||p.frameSha256!==f.sha256||p.frameIndex!==f.index||p.sourceMs!==f.sourceMs||!p.checkedBytes||(element.currentSrc||element.src)!==p.blobUrl||!element.complete||element.naturalWidth!==f.width||element.naturalHeight!==f.height)return ['当前可见RGBA人物帧没有同源字节、实际解码或当前源时钟证明'];
 return [];
}
export function dynamicPersonFraming(raw,clip,baseSpeaker,manual={x:0,y:0,scale:1}){const f={x:50,y:50,scale:1,shiftY:0,...baseSpeaker,...raw.speaker};return {outer:{width:'100%',height:'100%',transform:`translateY(${f.shiftY}%) scale(${f.scale*manual.scale})`,transformOrigin:'center'},image:{width:'100%',height:'100%',objectFit:clip.fit??'cover',objectPosition:`${f.x-manual.x}% ${f.y-manual.y}%`}};}

/** Project the actual nontransparent source bounds through the same CSS fit/crop. */
export function dynamicMatteVisibleBounds(image,frame,view){
 const box=image.getBoundingClientRect(),style=view.getComputedStyle(image),fit=style.objectFit??'cover',pos=String(style.objectPosition??'50% 50%').split(/\s+/).map(v=>parseFloat(v)/100),scale=fit==='contain'?Math.min(box.width/frame.width,box.height/frame.height):Math.max(box.width/frame.width,box.height/frame.height),w=frame.width*scale,h=frame.height*scale,b=frame.alphaBounds;
 if(!pos.every(Number.isFinite)||!Number.isFinite(scale)||scale<=0)return null;const left=box.left+(box.width-w)*(pos[0]??.5)+b.x*w,top=box.top+(box.height-h)*(pos[1]??.5)+b.y*h,right=left+b.width*w,bottom=top+b.height*h;return{left:Math.max(box.left,left),top:Math.max(box.top,top),right:Math.min(box.right,right),bottom:Math.min(box.bottom,bottom),width:Math.max(0,Math.min(box.right,right)-Math.max(box.left,left)),height:Math.max(0,Math.min(box.bottom,bottom)-Math.max(box.top,top))};
}
