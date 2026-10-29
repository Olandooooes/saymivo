import {visualSequence} from './visual-presets.mjs';
const clamp=value=>Math.max(0,Math.min(1,value)),ease=value=>{const p=clamp(value);return p*p*(3-2*p);},mix=(a,b,p)=>p<=0?a:p>=1?b:a+(b-a)*p;
const validRect=rect=>rect&&['x','y','width','height'].every(key=>Number.isFinite(rect[key]))&&rect.x>=0&&rect.y>=0&&rect.width>0&&rect.height>0&&rect.x+rect.width<=1.001&&rect.y+rect.height<=.86;
function fitAspect(rect,sourceWidth,sourceHeight,viewport){const scale=Math.min(rect.width*viewport.width/sourceWidth,rect.height*viewport.height/sourceHeight),width=sourceWidth*scale/viewport.width,height=sourceHeight*scale/viewport.height;return {x:rect.x+(rect.width-width)/2,y:rect.y+(rect.height-height)/2,width,height};}
export function regionFocusMedia(scene,config){if(config.mediaNodeId){const node=scene.nodes?.find(node=>node.id===config.mediaNodeId);return node?.assetSrc?{src:node.assetSrc,kind:'image'}:null;}return scene.media??null;}
export function regionFocusState(scene,config,elapsed,viewport={width:1920,height:1080}){
 const wide=viewport.width>viewport.height,assetRect=config.assetRect??(wide?{x:.55,y:.14,width:.39,height:.59}:{x:.08,y:.13,width:.84,height:.43}),contentRect=fitAspect(assetRect,config.sourceWidth,config.sourceHeight,viewport),region=config.focusRegion;
 const origin={x:contentRect.x+region.x/config.sourceWidth*contentRect.width,y:contentRect.y+region.y/config.sourceHeight*contentRect.height,width:region.width/config.sourceWidth*contentRect.width,height:region.height/config.sourceHeight*contentRect.height};
 const target=fitAspect(config.focusRect,region.width,region.height,viewport),age=elapsed-config.atMs,expand=config.expandMs,hold=config.holdMs,ret=config.returnMs;
 let p=0,phase='overview';if(age>=0&&age<expand){phase='expanding';p=ease(age/expand);}else if(age>=expand&&age<expand+hold){phase='focus';p=1;}else if(age>=expand+hold&&age<expand+hold+ret){phase='return';p=1-ease((age-expand-hold)/ret);}
 const focusRect=Object.fromEntries(['x','y','width','height'].map(key=>[key,mix(origin[key],target[key],p)]));
 return {media:regionFocusMedia(scene,config),assetRect,contentRect,origin,focusRect,phase,progress:p,assetDimOpacity:config.dimOpacity*p,cropOpacity:age>=0&&age<expand+hold+ret?ease(age/120)*p:0,explanationRect:config.explanationRect??(wide?{x:.55,y:.75,width:.39,height:.095}:{x:.08,y:.66,width:.84,height:.16}),explanationLines:(config.explanationCues??[]).flatMap(cue=>cue.lines.map(line=>({...line,opacity:ease((elapsed-line.atMs)/220)*(phase==='return'?p:elapsed>=config.atMs+expand+hold+ret?0:1)})))};
}
export function regionFocusIssues(scene,config){
 const issues=[],duration=visualSequence(scene,0).duration,media=regionFocusMedia(scene,config),region=config.focusRegion;
 if(!media||media.kind!=='image')issues.push('独立区域聚焦需要绑定真实图片，不能使用占位录屏');
 if(media&&/^(?:https?:|file:|\/|.*\.\.)/.test(media.src))issues.push('区域图片须位于本地素材库');
 if(!['screenshot','illustration'].includes(config.sourceKind)||!config.provenance?.trim())issues.push('须明确原图来源及真实截图/示意图类别');
 if(config.maskScope!=='asset-only'||config.regionUnits!=='source-pixels')issues.push('遮罩仅限原图；区域坐标须为源图像素');
 if(![config.sourceWidth,config.sourceHeight].every(value=>Number.isFinite(value)&&value>0)||!region||!['x','y','width','height'].every(key=>Number.isFinite(region[key]))||region.x<0||region.y<0||region.width<=0||region.height<=0||region.x+region.width>config.sourceWidth||region.y+region.height>config.sourceHeight)issues.push('源图尺寸与ROI边界无效');
 if(media?.width&&media.width!==config.sourceWidth||media?.height&&media.height!==config.sourceHeight)issues.push('配置尺寸与已绑定原图不一致');
 if(!validRect(config.focusRect)||config.assetRect&&!validRect(config.assetRect)||config.explanationRect&&!validRect(config.explanationRect))issues.push('图片、区域和说明框须在字幕上方');
 if(![config.atMs,config.expandMs,config.holdMs,config.returnMs].every(Number.isFinite)||config.atMs<0||config.expandMs<=0||config.holdMs<600||config.returnMs<=0||config.atMs+config.expandMs+config.holdMs+config.returnMs>duration)issues.push('区域放大、停留与还原时段无效');
 if(!Number.isFinite(config.dimOpacity)||config.dimOpacity<0||config.dimOpacity>.85)issues.push('原图暗化程度无效');
 for(const cue of config.explanationCues??[]){if(!cue.provenance?.trim()||!scene.nodes?.some(node=>node.id===cue.nodeId))issues.push('说明行需要本场原节点与明确来源');for(const line of cue.lines??[])if(!line.text?.length||!Number.isFinite(line.atMs)||line.atMs<0||line.atMs>=duration||line.highlightText&&!line.text.includes(line.highlightText)||line.highlightAtMs!==undefined&&(!Number.isFinite(line.highlightAtMs)||line.highlightAtMs<line.atMs||line.highlightAtMs>=duration))issues.push('说明行须保留完整文字与有效高亮时点');}
 return [...new Set(issues)];
}
