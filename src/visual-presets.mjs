import {personMatteFrame} from './person-matte.mjs';
import {evidenceGroups} from './diagram-layout.mjs';
const latestReference={creator:'柱子哥TzFilm',url:'https://www.douyin.com/video/7699453390744489226',publishedAt:'2026-10-22',verifiedAt:'2026-10-22'};
export const visualPresets=[
 {id:'type-relay',version:1,name:'大字接力',intent:'逐项讲清',description:'完整句子逐项占据主画面，前后错向进入。',speaker:'slide',requires:[],provenance:null},
 {id:'clear-type',version:1,name:'透明融字',intent:'强调原话',description:'没有实体底板的完整文字，柔和进入并转为轮廓。',speaker:'speaker',requires:[],provenance:null},
 {id:'person-backdrop',version:1,name:'人物后景大字',intent:'真人融合',description:'文字被同源真实人物遮挡层遮住；无抠像时不可应用。',speaker:'speaker',requires:['matte'],provenance:{...latestReference,timeRange:'03:00'}},
 {id:'floating-evidence',version:1,name:'悬浮证据窗',intent:'呈现证据',description:'真实素材与标记一起在透视窗中推进，保留持续人物。',speaker:'slide',requires:['media'],provenance:{...latestReference,timeRange:'02:00'}},
 {id:'fine-process',version:1,name:'细线节点过程',intent:'讲清关系',description:'单节点聚焦，青色细线按原有对象顺序接力，不套三栏。',speaker:'slide',requires:['nodes'],provenance:{...latestReference,timeRange:'02:00'}},
 {id:'orbit-evidence',version:1,name:'圈点环绕',intent:'范围与集合',description:'圈内概念点阵与真实资料卡并存，文字按口述接力；装饰点阵不编码实际数量。',speaker:'slide',requires:['media'],provenance:{...latestReference,timeRange:'00:53–01:00'}},
 {id:'grouped-evidence',version:1,name:'不等宽分组',intent:'集合与外部对象',description:'宽主容器容纳一组对象，细线连接独立窄组；可编辑主组成员。',speaker:'slide',requires:['nodes'],provenance:{...latestReference,url:'https://www.douyin.com/video/7697586978954497290',publishedAt:'2026-10-17',timeRange:'00:30 / 01:00'}},
];
export const visualPreset=id=>visualPresets.find(p=>p.id===id);
export function visualPresetIssues(scene,id){
 const preset=visualPreset(id);if(!preset)return ['未知动效预设'];const issues=[];
 if(preset.requires.includes('media')&&!scene.media?.src)issues.push('先为本场绑定真实图片或录屏');
 if(preset.requires.includes('nodes')&&!scene.nodes?.length)issues.push('先为本场添加图解对象');
 if(id==='fine-process'&&scene.nodes?.length>6)issues.push('细线过程适合1—6个对象；更多对象可选大字接力逐项讲清');
 if(id==='grouped-evidence'){
  if((scene.nodes?.length??0)<2||(scene.nodes?.length??0)>6)issues.push('不等宽分组需要2—6个对象');
  const groups=evidenceGroups(scene);if(!groups.primary.length||!groups.secondary.length)issues.push('主组与外部组都需要对象，请调整主组成员');
  if(scene.visualPreset?.primaryNodeIds?.some(id=>!scene.nodes?.some(n=>n.id===id)))issues.push('主组包含已不存在的对象，请重新选择');
 }
 if(preset.requires.includes('matte')){
  const matte=scene.personMatte;
  if(!matte?.src||!/^[a-f0-9]{64}$/i.test(matte.sourceSha256??'')||!(matte.width>0)||!(matte.height>0)||(scene.src&&matte.src!==scene.src))issues.push('需要可核验、与当前原片相同的真实人物遮挡层');
  if(!personMatteFrame(matte,scene.startMs)||!personMatteFrame(matte,scene.endMs-1))issues.push('人物遮挡层没有覆盖本场完整源时间');
 }
 if(id!=='person-backdrop'&&visualContentRect({...scene,visualPreset:{...scene.visualPreset,id}},1,1).width<.16)issues.push('所选侧空间不足；请换另一侧或调整本场人物窗');
 return issues;
}
export function applyVisualPreset(presentation,sceneId,id,options={}){
 const scene=presentation.scenes?.find(s=>s.id===sceneId);if(!scene)return {ok:false,error:'没有选中的分镜'};
 const settings={id,version:1,...(['left','right'].includes(options.side)?{side:options.side}:{}),...(id==='grouped-evidence'&&Array.isArray(options.primaryNodeIds)?{primaryNodeIds:[...new Set(options.primaryNodeIds)]}:{})};
 if(id!==null){const issues=visualPresetIssues({...scene,visualPreset:settings},id);if(issues.length)return {ok:false,error:issues.join('；')};}
 const next={...scene};delete next.dynamicMotion;if(id===null)delete next.visualPreset;else next.visualPreset=settings;
 return {ok:true,presentation:{...presentation,scenes:presentation.scenes.map(s=>s.id===sceneId?next:s)}};
}
export function visualContentRect(scene,width,height){
 const preset=visualPreset(scene.visualPreset?.id),inset=preset?.speaker==='slide';
 const person=inset?(scene.window??(width>height?{x:.76,y:.46,size:.205}:{x:.645,y:.62,size:.32})):{x:.38,y:.12,size:.25};
 // A fixed text region must clear the entire authored camera path. Reserving
 // its horizontal envelope also covers interpolation between keyframes.
 const positions=inset?[person,...(scene.window?.keyframes??[])]:[person];
 const personLeft=Math.min(...positions.map(p=>p.x)),personRight=Math.max(...positions.map(p=>p.x+p.size));
 const left=Math.max(0,personLeft-.10),right=Math.max(0,.94-personRight);
 const side=scene.visualPreset?.side??(left>=right?'left':'right');
 return {x:width*(side==='left'?.05:Math.min(.95,personRight+.04)),y:height*.13,width:width*(side==='left'?left:right),height:height*.64,side};
}
export function suggestVisualPresets(scene){
 const count=scene.nodes?.length??0;
 return visualPresets.map(p=>{
  const issues=visualPresetIssues(scene,p.id);let score=0,reason='可编辑选择；先确认完整文字与人物位置';
  if(!issues.length){
   if(p.id==='floating-evidence'){score=95;reason='本场已有真实素材，可让证据成为主画面';}
   if(p.id==='fine-process'){score=80;reason=`已有${count}个图解对象，适合依次讲清关系`;}
   if(p.id==='type-relay'){score=count>1?85:65;reason=count>1?'完整内容逐项讲，避免挤成多列':'完整标题与正文可按实际字量分行';}
   if(p.id==='clear-type'){score=70;reason='保留完整真人画面，用侧边透明字强调原话';}
   if(p.id==='person-backdrop'){score=Array.from(scene.title).length<=12?90:55;reason='已绑定覆盖本场的真实人物遮挡层';}
   if(p.id==='orbit-evidence'){score=/范围|集合|群体|受众|观众|生态|覆盖|复杂/.test(scene.title+(scene.body??''))?92:60;reason='真实资料可与概念集合并列呈现；点阵不代表实际数量';}
   if(p.id==='grouped-evidence'){score=scene.nodes?.some(n=>n.category)?93:75;reason='已有多个对象，可把工具集合与外部对象分开解释';}
  }
  return {id:p.id,score,reason,issues};
 }).sort((a,b)=>b.score-a.score);
}
// Preserve authored object entry points when they exist; otherwise distribute
// the full source window. All content IDs, wording and source times stay intact.
export function visualSequence(scene,elapsed){
 const nodes=scene.nodes?.length?scene.nodes:[{id:scene.id+'-title',text:scene.title,detail:scene.body}];
 // Projected start/end delimit only the retained timeline fragment. Entry,
 // focus, pagination and exit still use the full authored source-scene clock.
 const phaseDuration=(scene.phaseEndMs-scene.phaseStartMs)*(scene.speed??1);
 const duration=Number.isFinite(phaseDuration)&&phaseDuration>0?phaseDuration:scene.endMs-scene.startMs,explicit=nodes.some(n=>(n.focusMs??n.atMs??0)>0);
 const starts=nodes.map((n,i)=>explicit?(n.focusMs??n.atMs??0):i*duration/nodes.length);
 let index=0;for(let i=0;i<nodes.length;i++)if(elapsed>=starts[i])index=i;
 return {nodes,starts,index,current:nodes[index],from:starts[index],to:starts[index+1]??duration,duration};
}
