const full=n=>n?[n.text,n.detail,...(n.bullets??[])].filter(s=>typeof s==='string'&&s.length).join('\n'):undefined;
const field=(key,label,type,extra={})=>({key,label,type,...extra}),record=(key,label,fields)=>field(key,label,'record',{fields}),list=(key,label,itemFields)=>field(key,label,'list',{itemFields,preserveId:true}),id=field('id','稳定身份','stable-id',{readonly:true}),time=(key,label)=>field(key,label,'source-ms'),r=(key,label)=>field(key,label,'stage-rect'),p=(key,label)=>field(key,label,'stage-point'),choice=(key,label,options)=>field(key,label,'select',{source:'explicit-choice',options}),ref=(key,label,source)=>field(key,label,'conditional-object-ref',{source});
const source=()=>record('sourceRef','完整原节点来源',[field('nodeId','来源原节点','node-ref'),field('expectedText','完整原文与条件','text',{readonly:true})]);
const window=(key,label)=>record(key,label,[time('atMs','开始'),time('endMs','结束')]);
const path=record('path','原创明确曲线',[p('from','起点'),p('control1','控制点一'),p('control2','控制点二'),p('to','终点')]);
export const conditionalSetViewControls={kind:'conditional-set',label:'条件集合与门控（独立准备）',uiAccepted:false,automaticAllowed:false,fields:[field('version','版本','number',{readonly:true,fixed:1}),field('clock','源时钟','text',{readonly:true,fixed:'scene-source-relative-ms'}),field('binding','当前原片身份','source-binding',{readonly:true}),record('provenance','作者明确示意',[field('kind','数据性质','text',{readonly:true,fixed:'illustration'}),field('note','示意含义与来源限制','text')]),record('outcomeLabels','作者完整结果文案',[field('allowed','允许结果完整文案','text'),field('blocked','拒绝结果完整文案','text')]),record('copyWindow','完整正文和条件阅读窗口',[time('atMs','开始'),time('endMs','结束'),r('rect','完整文字区域')]),window('graphicWindow','图解与历史保留时段'),
 list('sets','条件集合',[id,source(),ref('parentId','父集合（可留空）','sets'),record('boundary','集合边界',[choice('kind','边界形状',['ellipse','rect']),r('rect','边界区域')]),r('labelRect','集合完整标签区域'),time('atMs','出现'),time('drawMs','描边时长')]),
 list('gates','独立条件门',[id,source(),ref('fromSetId','来源集合','sets'),ref('toSetId','目标集合','sets'),record('boundary','门开口',[choice('axis','门轴',['x','y']),field('position','门所在坐标','number'),field('min','开口起点','number'),field('max','开口终点','number')]),r('labelRect','完整条件标签区域'),time('atMs','出现'),record('condition','明确条件',[choice('kind','条件类型',['authored','membership','capacity']),choice('result','作者明确结果',['allowed','blocked']),ref('setId','所属条件集合','sets'),choice('mode','成员条件',['inside','outside']),field('factKey','明确数值事实键','text'),choice('operator','容量比较',['lt','lte']),field('limit','明确上限','number'),field('unit','明确共同单位','text')])]),
 list('actors','稳定对象',[id,source(),field('useSourceImage','使用此原节点已核实图片','boolean'),field('assetIdentity','当前原图片身份','source-binding',{readonly:true}),ref('initialSetId','初始成员集合','sets'),p('initialPoint','初始中心'),record('size','完整对象大小',[field('width','宽度','number'),field('height','高度','number')]),r('labelRect','完整对象与事实标签区域'),time('atMs','出现'),list('facts','作者明确数值事实',[field('key','事实键','text'),field('value','明确数值','number'),field('unit','明确单位','text'),source()])]),
 list('events','显式源时间事件',[id,choice('type','事件类型',['travel','evaluate']),ref('actorId','同一个对象','actors'),ref('gateId','独立条件门','gates'),time('atMs','事件开始'),choice('expectedResult','明确核验结果',['allowed','blocked']),choice('phase','原创运动阶段',['approach','retreat','pass','reroute']),ref('blockedGateId','先前拒绝门（改道时必填）','gates'),time('endMs','运动结束'),path]),
 list('gateViews','持续保留结果区域',[ref('gateId','对应独立门','gates'),r('historyRect','该门全部历史结果区域')]),field('annotation','作者可编辑补充说明','text')
]};
const node=(scene,id)=>{const ns=(scene?.nodes??[]).filter(n=>n.id===id);return ns.length===1?ns[0]:undefined;};
/** Only a current unique node and actual image identity can fill readonly copy. */
export function bindConditionalSetViewDraft(value,scene,assets=[]){
 const next=structuredClone(value),bind=r=>r?{...r,expectedText:full(node(scene,r.nodeId))}:r;
 for(const key of ['sets','gates','actors'])if(Array.isArray(next[key]))next[key]=next[key].map(o=>({...o,sourceRef:bind(o.sourceRef)}));
 if(Array.isArray(next.gates))next.gates=next.gates.map(g=>{const c=g.condition;if(!c)return g;const condition=c.kind==='authored'?{kind:c.kind,result:c.result}:c.kind==='membership'?{kind:c.kind,setId:c.setId,mode:c.mode}:c.kind==='capacity'?{kind:c.kind,factKey:c.factKey,operator:c.operator,limit:c.limit,unit:c.unit}:{kind:c.kind};return{...g,condition};});
 if(Array.isArray(next.actors))next.actors=next.actors.map(a=>{const n=node(scene,a.sourceRef?.nodeId),asset=assets.filter(i=>i.src===n?.assetSrc&&i.kind==='image'&&/^[a-f0-9]{64}$/i.test(i.sha256??'')&&[i.width,i.height].every(n=>Number.isInteger(n)&&n>0)),useSourceImage=a.useSourceImage??!!a.assetIdentity;return{...a,useSourceImage,assetIdentity:useSourceImage&&asset.length===1?{kind:'image',src:asset[0].src,sha256:asset[0].sha256,width:asset[0].width,height:asset[0].height}:undefined,facts:(a.facts??[]).map(f=>({...f,sourceRef:bind(f.sourceRef)}))};});
 return next;
}
export function conditionalSetReferenceOptions(field,value){
 return (value?.[field.source]??[]).map((o,i)=>({value:o.id,label:`${i+1} · ${o.sourceRef?.expectedText?.replaceAll('\n',' · ')||'待选择原节点'}`}));
}
export function conditionalSetVisibleFields(fields,siblings){return fields.filter(f=>{
 if(siblings.kind==='authored')return !['setId','mode','factKey','operator','limit','unit'].includes(f.key);
 if(siblings.kind==='membership')return !['result','factKey','operator','limit','unit'].includes(f.key);
 if(siblings.kind==='capacity')return !['result','setId','mode'].includes(f.key);
 if(siblings.type==='evaluate')return !['phase','blockedGateId','endMs','path'].includes(f.key);
 if(siblings.type==='travel')return f.key!=='expectedResult'&&(f.key!=='blockedGateId'||siblings.phase==='reroute');
 return true;
});}
export function createConditionalSetViewDraft(scene,identity){return{version:1,kind:'conditional-set',clock:'scene-source-relative-ms',binding:{sceneId:scene.id,src:scene.src,sha256:identity?.src===scene.src?identity.sha256:undefined,startMs:scene.startMs,endMs:scene.endMs},provenance:{kind:'illustration',note:''},outcomeLabels:{allowed:'',blocked:''},copyWindow:undefined,graphicWindow:undefined,sets:[],gates:[],actors:[],events:[],gateViews:[]};}
