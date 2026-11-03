import {dynamicSceneDuration} from './dynamic-mechanisms.mjs';

const clamp=x=>Math.max(0,Math.min(1,x));
const smooth=x=>{const p=clamp(x);return p*p*(3-2*p);};
const graphemes=text=>[...new Intl.Segmenter('zh-CN',{granularity:'grapheme'}).segment(String(text??''))].map(piece=>piece.segment);
const fullNode=node=>[node.text,node.detail,...(node.bullets??[])].filter(Boolean).join('\n');
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const safeRect=rect=>rect&&['x','y','width','height'].every(key=>finite(rect[key]))&&rect.x>=0&&rect.y>=0&&rect.width>0&&rect.height>0&&rect.x+rect.width<=1.00001&&rect.y+rect.height<=.86;
const initialScale=(config,item)=>item.fromScale??(config.kind==='emphasis-phrase'?1.2:config.kind==='cumulative-phrases'?1.08:1);
const intersects=(a,b)=>a.x<b.x+b.width-.00001&&a.x+a.width>b.x+.00001&&a.y<b.y+b.height-.00001&&a.y+a.height>b.y+.00001;
const simultaneous=(a,b)=>a.atMs<b.endMs&&a.endMs>b.atMs;
export function phraseMotionEnvelope(config,item,viewport={width:1920,height:1080}){
 const scale=initialScale(config,item),rect=item.rect,padX=item.extrusion?7/viewport.width:0,padY=item.extrusion?9/viewport.height:0;
 return {x:rect.x-rect.width*(scale-1)/2-padX,y:rect.y-rect.height*(scale-1)/2-padY,width:rect.width*scale+2*padX,height:rect.height*scale+2*padY};
}

export const phraseKinds=['emphasis-phrase','caret-phrase','cumulative-phrases','identity-sweep'];

export function phraseSourceItems(scene,config){
 return (Array.isArray(config?.items)?config.items:[]).map(item=>({item,node:scene.nodes?.find(node=>node.id===item?.nodeId)})).filter(entry=>entry.node).map(({item,node})=>({...item,node,text:fullNode(node)}));
}

export function phraseAdditionalCopy(scene,config){
 const shown=phraseSourceItems(scene,config).map(item=>item.text);
 return [{id:'title',text:scene.title},{id:'body',text:scene.body}].filter(item=>typeof item.text==='string'&&item.text.length&&!shown.includes(item.text));
}

export function phraseChoreographyIssues(scene,config,viewport={width:1920,height:1080}){
 if(!config||typeof config!=='object')return ['未知短语动效'];
 const issues=[],duration=dynamicSceneDuration(scene),items=Array.isArray(config.items)?config.items:[],nodes=scene.nodes??[];
 if(!phraseKinds.includes(config?.kind))issues.push('未知短语动效');
 if(!items.length||items.length!==nodes.length||new Set(items.map(item=>item?.nodeId)).size!==items.length||nodes.some(node=>!items.some(item=>item?.nodeId===node.id)))issues.push('请为本场每个完整对象安排一次短语，不漏掉条件或重复编号');
 for(const item of items){
  if(!item||typeof item!=='object'){issues.push('短语配置须对应本场原对象');continue;}
  if(!nodes.some(node=>node.id===item.nodeId))issues.push('短语来源对象已不在本场');
  if(!finite(item.atMs)||!finite(item.endMs)||item.atMs<0||item.endMs>duration||item.endMs<=item.atMs)issues.push('短语出现和结束须在完整源场内');
  const enter=item.entryMs??280,exit=item.exitMs??180,scale=initialScale(config,item);
  if(![enter,exit,scale].every(finite)||enter<0||exit<0||scale<1||scale>2||item.endMs-item.atMs-enter-exit<700)issues.push('短语需要有效入退场和完整可读停留');
  if(!safeRect(item.rect))issues.push('短语框须在画面与字幕安全区内');
  else if(!safeRect(phraseMotionEnvelope(config,item,viewport)))issues.push('短语初始放大和厚影范围会超出画面或字幕区，请缩小字框或起始尺度');
  if(config.kind==='identity-sweep'&&item.rect&&(item.rect.width*viewport.width<=viewport.height*.028||item.rect.height*viewport.height<=viewport.height*.028))issues.push('身份条区域不足以容纳内边距和完整文字，请扩大区域');
  if(item.fromTrackingEm!==undefined&&(!finite(item.fromTrackingEm)||item.fromTrackingEm<0||item.fromTrackingEm>.25))issues.push('字距收束范围须为0至0.25em');
 }
 const extra=phraseAdditionalCopy(scene,config);
 if(extra.length){const copy=config.copyWindow;if(!copy||!safeRect(copy.rect)||!finite(copy.atMs)||!finite(copy.endMs)||copy.atMs<0||copy.endMs>duration||copy.endMs-copy.atMs<900)issues.push('请为完整标题和正文安排可读说明时段');}
 const layers=items.filter(item=>item&&safeRect(item.rect)).map(item=>({...item,rect:phraseMotionEnvelope(config,item,viewport)}));
 if(extra.length&&config.copyWindow&&safeRect(config.copyWindow.rect))layers.push({...config.copyWindow,rect:config.copyWindow.rect});
 for(let i=0;i<layers.length;i++)for(let j=i+1;j<layers.length;j++)if(simultaneous(layers[i],layers[j])&&intersects(layers[i].rect,layers[j].rect))issues.push('同时显示的完整短语或正文区域重叠，请分时呈现或调整位置');
 const authorAreas=config.protectedAreas??[];
 if(!Array.isArray(authorAreas)||authorAreas.some(area=>!area?.rect||!['x','y','width','height'].every(key=>finite(area.rect[key]))||area.rect.x<0||area.rect.y<0||area.rect.width<=0||area.rect.height<=0||area.rect.x+area.rect.width>1||area.rect.y+area.rect.height>1))issues.push('人物保护区域无效');
 const windows=scene.window?[scene.window,...(scene.window.keyframes??[])]:[],personRects=windows.map(point=>({x:point.x,y:point.y,width:point.size,height:point.size*viewport.width/viewport.height})),protectedRects=[...personRects,...(Array.isArray(authorAreas)?authorAreas.filter(area=>area?.rect).map(area=>area.rect):[])];
 if(personRects.length){const left=Math.min(...personRects.map(rect=>rect.x)),top=Math.min(...personRects.map(rect=>rect.y)),right=Math.max(...personRects.map(rect=>rect.x+rect.width)),bottom=Math.max(...personRects.map(rect=>rect.y+rect.height));protectedRects.push({x:left,y:top,width:right-left,height:bottom-top});}
 if(layers.some(layer=>protectedRects.some(rect=>intersects(layer.rect,rect))))issues.push('文字运动范围与人物窗路径或已标记保护区重叠，请调整位置');
 if(config.kind==='cumulative-phrases'){
  const ends=items.map(item=>item?.endMs).filter(finite);if(ends.length&&Math.max(...ends)-Math.min(...ends)>.01)issues.push('累积清单须让旧项保持到共同结束时点');
 }
 return [...new Set(issues)];
}

export function phraseChoreographyState(scene,config,elapsed){
 const items=phraseSourceItems(scene,config).map(item=>{
  const enter=item.entryMs??280,exit=item.exitMs??180,age=elapsed-item.atMs,remaining=item.endMs-elapsed,enterProgress=smooth(age/Math.max(1,enter)),out=smooth(remaining/Math.max(1,exit));
  return {...item,opacity:age<0||remaining<=0?0:enterProgress*out,scale:1+(initialScale(config,item)-1)*(1-enterProgress),trackingEm:(item.fromTrackingEm??0)*(1-enterProgress),visible:age>=0&&remaining>0,localMs:age,durationMs:item.endMs-item.atMs,readAtMs:item.atMs+enter,readMs:item.endMs-item.atMs-enter-exit,sweepProgress:enterProgress,phase:age<0?'pending':remaining<=0?'finished':age<enter?'entering':remaining<exit?'exiting':'holding'};
 });
 return {kind:config.kind,items,additionalCopy:phraseAdditionalCopy(scene,config),automaticAllowed:false,sourceClock:'scene-relative-ms',issues:phraseChoreographyIssues(scene,config)};
}

// The measurement callback must be the actual loaded display font. Keeping
// these checks separate lets the real preview report readable-page failures.
export function phrasePageState(pages,localMs,readMs,{caret=false}={}){
 const count=Math.max(1,pages.length),pageMs=readMs/count,index=Math.min(count-1,Math.max(0,Math.floor(Math.max(0,localMs)/Math.max(1,pageMs)))),lines=pages[index]??[],glyphs=graphemes(lines.join('')),age=Math.max(0,localMs-index*pageMs);
 const holdMs=Math.max(900,glyphs.length*95),writeMs=caret?Math.max(300,glyphs.length*48):0;
 const insufficientDuration=pages.some(page=>pageMs<Math.max(900,graphemes(page.join('')).length*95)+(caret?Math.max(300,graphemes(page.join('')).length*48):0));
 return {pageIndex:index,pageMs,lines,glyphCount:glyphs.length,revealedGlyphs:caret?Math.min(glyphs.length,Math.max(0,Math.floor(age/Math.max(1,writeMs)*glyphs.length))):glyphs.length,insufficientDuration,holdMs,writeMs,caretVisible:caret&&localMs>=0&&age<writeMs&&Math.floor(age/320)%2===0};
}

export function phraseTextReadiness(fit,{atMs,endMs,caret=false},exposure={startMs:0,endMs:Infinity,speed:1}){
 if(!fit)return {status:'waiting',issues:['等待当前展示字体测量']};
 const issues=[],pages=fit.pages??[],duration=endMs-atMs,speed=exposure.speed??1;
 if(fit.unplaceable||!pages.length||!finite(duration)||!(duration>0)||!finite(speed)||!(speed>0)||!finite(exposure.startMs)||!(finite(exposure.endMs)||exposure.endMs===Infinity)||exposure.endMs<=exposure.startMs)issues.push('完整文字在当前区域放不进或阅读时段无效');
 for(let index=0;index<pages.length;index++){
  const glyphCount=graphemes(pages[index].join('')).length,pageMs=duration/pages.length,start=atMs+index*pageMs,writeMs=caret?Math.max(300,glyphCount*48):0;
  const fullStart=start+writeMs,fullEnd=start+pageMs,shown=Math.max(0,Math.min(fullEnd,exposure.endMs)-Math.max(fullStart,exposure.startMs))/speed;
  if(shown<Math.max(900,glyphCount*95))issues.push('完整文字页缺少实际保留和变速后的写入/停留时间，请增时或拆场');
 }
 return {status:issues.length?'blocked':'ready',issues:[...new Set(issues)]};
}

export const phraseChoreographyControls=phraseKinds.map(kind=>({kind,label:({'emphasis-phrase':'厚影重点字与字距收束','caret-phrase':'逐字输入与光标','cumulative-phrases':'保留旧项的短语累积','identity-sweep':'亮扫身份条'})[kind],stage:'experimental-independent',automaticAllowed:false,uiAccepted:false,fields:[{key:'items',label:'完整短语',type:'list',itemFields:[{key:'nodeId',label:'来源对象',type:'node-ref'},{key:'rect',label:'文字位置',type:'stage-rect'},{key:'atMs',label:'出现时点',type:'source-ms'},{key:'endMs',label:'结束时点',type:'source-ms'},{key:'entryMs',label:'入场时长',type:'source-ms'},{key:'exitMs',label:'退场时长',type:'source-ms'},{key:'fromScale',label:'入场起始尺度',type:'number',min:1,max:2},{key:'fromTrackingEm',label:'入场字距',type:'number',min:0,max:.25},{key:'color',label:'文字颜色',type:'text'},{key:'extrusion',label:'厚影层次',type:'boolean'}]},{key:'copyWindow',label:'完整说明时段',type:'record',fields:[{key:'atMs',label:'说明开始',type:'source-ms'},{key:'endMs',label:'说明结束',type:'source-ms'},{key:'rect',label:'说明位置',type:'stage-rect'}]},{key:'protectedAreas',label:'手动保护区域',type:'list',itemFields:[{key:'label',label:'保护对象',type:'text'},{key:'rect',label:'保护位置',type:'stage-rect'}]}]}));
