import {visualSequence} from './visual-presets.mjs';
import {hubFlowIssues} from './hub-flow.mjs';
import {regionFocusIssues} from './region-focus.mjs';

const graphemes=new Intl.Segmenter('zh-CN',{granularity:'grapheme'});
const chars=text=>[...graphemes.segment(String(text??''))].map(piece=>piece.segment);
const clamp=value=>Math.max(0,Math.min(1,value));
const ease=value=>{const x=clamp(value);return x*x*(3-2*x);};
const mix=(a,b,t)=>t<=0?a:t>=1?b:a+(b-a)*t;
const mixRect=(a,b,t)=>Object.fromEntries(['x','y','width','height'].map(key=>[key,mix(a[key],b[key],t)]));
export const dynamicMechanismResearch={complete:false,source:{episode:77,url:'https://www.douyin.com/video/7699453390744489226',publishedAt:'2026-10-22'},observedRanges:[[1,16],[15,40],[53,60],[89,91],[94,119],[152,155],[166,170]],boundaryPrecision:'seconds',method:'continuous-dense-observation-not-source-frame-exact',note:'原创动态曲线与独立原语；未接入现有七类预设，不代表五条机制研究或真实成片验收完成'};
export const dynamicSceneDuration=scene=>visualSequence(scene,0).duration;

export function flipBoardPages(scene,{columns=12,rows=4}={}){
 if(!Number.isInteger(columns)||columns<1||!Number.isInteger(rows)||rows<1)throw Error('翻字板需要正整数行列');
 const entries=(scene.nodes?.length?scene.nodes:[{id:scene.id,text:scene.title,detail:scene.body}]).flatMap(node=>[node.text,node.detail,...(node.bullets??[])].filter(text=>typeof text==='string'&&text.length).map((text,field)=>({nodeId:node.id,field,text})));
 const lines=[];
 for(const entry of entries)for(const paragraph of entry.text.split('\n')){
  const glyphs=chars(paragraph);if(!glyphs.length)lines.push({...entry,glyphs:[]});
  for(let offset=0;offset<glyphs.length;offset+=columns)lines.push({...entry,glyphs:glyphs.slice(offset,offset+columns)});
 }
 const pages=[];for(let start=0;start<lines.length;start+=rows){const page=lines.slice(start,start+rows);pages.push({lines:page,cells:page.flatMap((line,row)=>Array.from({length:columns},(_,column)=>({id:`${start+row}:${column}`,row,column,nodeId:line.nodeId,glyph:line.glyphs[column]??' '})))});}
 return {columns,rows,pages,entries};
}

export function flipBoardState(scene,config,elapsed){
 const board=flipBoardPages(scene,config),duration=dynamicSceneDuration(scene)-(config.atMs??0),pageMs=duration/Math.max(1,board.pages.length),time=elapsed-(config.atMs??0);
 const pageIndex=Math.max(0,Math.min(board.pages.length-1,Math.floor(Math.max(0,time)/pageMs))),page=board.pages[pageIndex],local=time-pageIndex*pageMs;
 const holdMs=config.holdMs??1200,fillMs=Math.max(1,Math.min(config.fillMs??1200,pageMs-holdMs-240));
 const active=page?.cells.filter(cell=>cell.glyph!==' ')??[],flipMs=Math.min(config.flipMs??320,fillMs),stagger=Math.max(0,Math.min(config.staggerMs??34,(fillMs-flipMs)/Math.max(1,active.length-1)));
 let lastFinish=fillMs;const alphabet=chars('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'),cells=(page?.cells??[]).map(cell=>{
  const anchored=Object.hasOwn(config.nodeAtMs??{},cell.nodeId)?config.nodeAtMs[cell.nodeId]:undefined,pool=anchored===undefined?active:active.filter(active=>active.nodeId===cell.nodeId),index=pool.findIndex(active=>active.id===cell.id),start=anchored===undefined?0:Math.max(0,anchored-(config.atMs??0)-pageIndex*pageMs),finish=start+Math.max(0,index)*stagger+flipMs;lastFinish=Math.max(lastFinish,finish);
  const age=local-start-Math.max(0,index)*stagger,p=clamp(age/flipMs),cycle=Math.min(2,Math.floor(p*3)),phase=p>=1?0:p*3-cycle;
  const final=cell.glyph,settled=p>=1||final===' ',seed=(cell.row*board.columns+cell.column)*7;
  return {...cell,finalGlyph:final,settled,frontGlyph:settled?final:age<=0?' ':alphabet[(seed+cycle)%alphabet.length],backGlyph:cycle===2?final:alphabet[(seed+cycle+1)%alphabet.length],rotationDeg:settled?0:-180*ease(phase)};
 });
 return {...board,pageIndex,cells,pageMs,fillMs:lastFinish,holdMs:Math.max(0,pageMs-lastFinish-240),opacity:ease(local/160)*ease((pageMs-local)/180),phase:local<0?'waiting':local<lastFinish?'filling':local<pageMs-180?'hold':'exit'};
}

const numberFormats=new Map();
export function formatCounterValue(value,config){const key=JSON.stringify([config.locale??'zh-CN',config.grouping??false,config.decimals??0]);if(!numberFormats.has(key)){if(numberFormats.size>=48)numberFormats.delete(numberFormats.keys().next().value);numberFormats.set(key,new Intl.NumberFormat(config.locale??'zh-CN',{useGrouping:config.grouping??false,minimumFractionDigits:config.decimals??0,maximumFractionDigits:config.decimals??0}));}return numberFormats.get(key).format(value);}
export function counterMeasurementSpec(config){
 const first=formatCounterValue(config.from,config),last=formatCounterValue(config.to,config),numericSlots=Math.max(chars(first).length,chars(last).length),unit=config.unit??'';
 const localeDigits=Array.from({length:10},(_,digit)=>formatCounterValue(digit,{...config,decimals:0,grouping:false})).join('');
 return {samples:[first,last,'8'.repeat(numericSlots)],glyphs:'0123456789-−,.+ '+localeDigits+first+last,numericSlots,unit,key:JSON.stringify([first,last,numericSlots,unit,localeDigits])};
}
export function counterState(scene,config,elapsed){
 const duration=dynamicSceneDuration(scene),at=config.atMs??0,countMs=config.countMs??Math.min(2000,duration*.4),progress=ease((elapsed-at)/countMs);
 const value=progress>=1?config.to:progress<=0?config.from:config.from+(config.to-config.from)*progress;
 return {value,text:formatCounterValue(value,config),progress,phase:elapsed<at?'waiting':progress<1?'counting':'hold',measurement:counterMeasurementSpec(config),opacity:ease((elapsed-at)/180)*ease((duration-elapsed)/250)};
}

export function evidenceHandoffItems(scene,config={}){
 const nodes=scene.nodes?.length?scene.nodes:[{id:scene.id+'-media',text:scene.title,detail:scene.body}],mediaNodeId=config.mediaNodeId??nodes[0]?.id;
 return nodes.flatMap(node=>node.assetSrc?[{node,media:{src:node.assetSrc,kind:'image'}}]:scene.media&&node.id===mediaNodeId?[{node,media:scene.media}]:[]);
}
function defaultHandoffCues(scene,config){
 const items=evidenceHandoffItems(scene,config),duration=dynamicSceneDuration(scene),sequence=visualSequence(scene,0),explicit=sequence.starts.some(at=>at>0);
 return items.map((item,index)=>({nodeId:item.node.id,atMs:explicit?(sequence.starts[sequence.nodes.findIndex(node=>node.id===item.node.id)]??0):650+index*(duration-1250)/Math.max(1,items.length),travelMs:550,holdMs:Math.max(300,(duration-1250)/Math.max(1,items.length)-1050),returnMs:500}));
}
function curveRect(from,to,p){const c1={x:from.x-.06,y:from.y+.14},c2={x:to.x+.08,y:to.y-.04},q=1-p;return {x:q*q*q*from.x+3*q*q*p*c1.x+3*q*p*p*c2.x+p*p*p*to.x,y:q*q*q*from.y+3*q*q*p*c1.y+3*q*p*p*c2.y+p*p*p*to.y,width:mix(from.width,to.width,p),height:mix(from.height,to.height,p)};}
export function evidenceHandoffState(scene,config,elapsed){
 const items=evidenceHandoffItems(scene,config),cues=config.cues??defaultHandoffCues(scene,config),overview=config.boardRect??{x:.04,y:.15,width:.66,height:.48},focusBoard=config.focusBoardRect??{x:.12,y:.035,width:.76,height:.40};
 const speakerOverview=config.speakerRect??{x:.76,y:.45,width:.205,height:.365},speakerFocus=config.focusSpeakerRect??{x:.81,y:.54,width:.165,height:.294},target=config.focusRect??{x:.055,y:.43,width:.49,height:.36};
 let active=null,amount=0,phase='overview';
 for(const cue of cues){const age=elapsed-cue.atMs,travel=cue.travelMs??550,hold=cue.holdMs??1600,ret=cue.returnMs??500;if(age<0||age>=travel+hold+ret)continue;active=cue;if(age<travel){phase='travel';amount=ease(age/travel);}else if(age<travel+hold){phase='focus';amount=1;}else{phase='return';amount=1-ease((age-travel-hold)/ret);}break;}
 const index=items.findIndex(item=>item.node.id===active?.nodeId),columns=config.columns??2,rows=Math.max(1,Math.ceil(Math.max(1,scene.nodes?.length??items.length)/columns));
 const nodeIndex=Math.max(0,(scene.nodes??items.map(item=>item.node)).findIndex(node=>node.id===active?.nodeId)),origin=active?.origin??{x:overview.x+overview.width*((nodeIndex%columns)+.55)/columns,y:overview.y+.077+(overview.height-.077)*(Math.floor(nodeIndex/columns)+.48)/rows,width:.055,height:.04};
 const boardRect=mixRect(overview,focusBoard,amount),cardRect=curveRect(origin,active?.target??target,amount),ordinarySpeaker=mixRect(speakerOverview,speakerFocus,amount),match=config.matchToLive;
 const matchProgress=match?ease((elapsed-match.atMs)/(match.durationMs??900)):0,backgroundMix=match?ease((elapsed-match.atMs-(match.backgroundDelayMs??250))/(match.backgroundFadeMs??450)):0;
 const oldGraphicsOpacity=match?1-ease((elapsed-match.atMs-(match.graphicsDelayMs??350))/(match.graphicsFadeMs??450)):1;
 const matchFrom=match?(match.from??evidenceHandoffState(scene,{...config,matchToLive:undefined},match.atMs).speakerRect):ordinarySpeaker;
 const speakerRect=match&&elapsed>=match.atMs?mixRect(matchFrom,match.to,matchProgress):ordinarySpeaker;
 if(match&&elapsed>=match.atMs)phase=matchProgress>=1?'live':'match-to-live';
 return {items,cues,activeNodeId:index>=0?items[index].node.id:null,phase,focusAmount:amount,boardRect,cardRect,speakerRect,backgroundMix,oldGraphicsOpacity,matchProgress,requiresRealCutout:!!match||config.speakerMode==='cutout',cardOpacity:active?ease((elapsed-active.atMs)/160)*oldGraphicsOpacity:0};
}

export function glassCapsuleState(scene,config,elapsed){
 const duration=dynamicSceneDuration(scene),sequence=visualSequence(scene,elapsed),side=config.side??'left',rect=config.rect??{x:side==='left'?.035:.69,y:.10,width:.275,height:.65},end=config.endMs??duration;
 const groupOpacity=1-ease((elapsed-(end-(config.outMs??400)))/(config.outMs??400)),gap=config.gap??.014,rowHeight=(rect.height-gap*Math.max(0,sequence.nodes.length-1))/Math.max(1,sequence.nodes.length);
 const items=sequence.nodes.map((node,index)=>{const at=config.atMs?.[index]??sequence.starts[index],enter=ease((elapsed-at)/(config.inMs??420));return {node,atMs:at,rect:{x:rect.x,y:rect.y+index*(rowHeight+gap),width:rect.width,height:rowHeight},opacity:enter*groupOpacity,offsetX:(1-enter)*(side==='left'?-.055:.055),rotateY:(1-enter)*(side==='left'?-10:10)};});
 return {items,groupOpacity,automaticAllowed:false,requiresFaceReview:true,phase:elapsed>=end?'hidden':elapsed>=end-(config.outMs??400)?'group-exit':'staggered-hold'};
}

// Opt-in only. The existing orbit preset remains byte-for-byte unchanged.
export function orbitFlowState(config,elapsed){
 const open=ease((elapsed-config.openAtMs)/(config.openMs??550)),flow=ease((elapsed-config.flowAtMs)/(config.flowMs??800)),gather=config.gatherAtMs===undefined?1:ease((elapsed-config.gatherAtMs)/(config.gatherMs??900)),count=config.count??32,center=config.center??{x:.29,y:.43},radius=config.radius??.22,target=config.target??{x:.77,y:.43},viewport=config.viewport??{width:1,height:1},min=Math.min(viewport.width,viewport.height),rx=radius*min/viewport.width,ry=radius*min/viewport.height;
 const gapDeg=(config.gapDegrees??76)*open,dots=Array.from({length:count},(_,index)=>{const angle=index*2.399963229728653,fill=.15+.73*Math.sqrt((index+.5)/count),gp=ease(clamp(gather*1.3-index/count*.3)),p=clamp(flow*1.35-index/count*.35),start={x:center.x+Math.cos(angle)*rx*mix(1.7,fill,gp),y:center.y+Math.sin(angle)*ry*mix(1.7,fill,gp)},q=ease(p);return {id:index,x:mix(start.x,target.x,q),y:mix(start.y,target.y,q)+Math.sin(q*Math.PI)*.09,opacity:(.25+.75*gp)*(1-q*.45)};});
 return {phase:gather<1?'gathering':flow>0?'point-flow':open>0?'opening':'closed',gapDegrees:gapDeg,startDegrees:gapDeg/2,endDegrees:360-gapDeg/2,dots,progress:flow,gatherProgress:gather,center,radiusX:rx,radiusY:ry};
}
export function orbitFlowIssues(scene,config){const issues=[],duration=dynamicSceneDuration(scene);if(!scene.media?.src)issues.push('圈点转移需要本场真实媒体，不生成占位证据');if(![config.openAtMs,config.flowAtMs,config.openMs??550,config.flowMs??800].every(Number.isFinite)||config.openAtMs<0||(config.openMs??550)<=0||(config.flowMs??800)<=0||config.flowAtMs<config.openAtMs+(config.openMs??550)||config.flowAtMs+(config.flowMs??800)>duration)issues.push('聚集、开口、转移须按源时钟依次完成');if(config.gatherAtMs!==undefined&&(!Number.isFinite(config.gatherAtMs)||config.gatherAtMs<0||!(config.gatherMs??900)||config.gatherAtMs+(config.gatherMs??900)>config.openAtMs))issues.push('外部点聚集须在开口前完成');if(!Number.isInteger(config.count??32)||(config.count??32)<4||(config.count??32)>96||!(config.radius??.22)||(config.gapDegrees??76)<=0||(config.gapDegrees??76)>=300)issues.push('圈点几何参数无效');return issues;}

// Explicit data only; independently rendered, without workbench registry wiring.
export function barGroupIssues(scene,config){
 const issues=[],duration=dynamicSceneDuration(scene),scale=config.scale;
 if(!scale||!Number.isFinite(scale.min)||!Number.isFinite(scale.max)||scale.min!==0||scale.max<=scale.min)issues.push('比较条形需要明确的共同零基线和最大尺度');
 if(!Array.isArray(config.items)||config.items.length<2||config.items.length>6)return [...issues,'条形比较需要2—6项显式数据'];
 if(new Set(config.items.map(item=>item.nodeId)).size!==config.items.length)issues.push('比较对象不能重复');if(!Number.isInteger(config.decimals??0)||(config.decimals??0)<0||(config.decimals??0)>4)issues.push('小数位须为0—4');
 for(const item of config.items){if(!scene.nodes?.some(node=>node.id===item.nodeId))issues.push('条形对象须对应原有节点');if(!Number.isFinite(item.from)||!Number.isFinite(item.to)||item.from<0||item.to<0||scale&&(item.from>scale.max||item.to>scale.max))issues.push('数值须有限、非负且处于共同尺度内');if(!Number.isFinite(item.atMs)||item.atMs<0||!(item.countMs>0)||item.atMs+item.countMs+400>duration)issues.push('每项需要明确口述时点、变化时长和终值停留');}
 return [...new Set(issues)];
}
export function barGroupState(scene,config,elapsed){
 const issues=barGroupIssues(scene,config);if(issues.length)return {issues,items:[]};
  return {issues:[],items:config.items.map(item=>{const progress=ease((elapsed-item.atMs)/item.countMs),value=mix(item.from,item.to,progress),formatter={from:item.from,to:item.to,decimals:config.decimals??0,unit:config.unit??'',grouping:config.grouping??false},node=scene.nodes.find(node=>node.id===item.nodeId);return {nodeId:item.nodeId,label:node.text,detail:[node.detail,...(node.bullets??[])].filter(Boolean).join('\n'),value,text:formatCounterValue(value,formatter),unit:config.unit??'',fraction:value/config.scale.max,progress,phase:elapsed<item.atMs?'waiting':progress<1?'growing':'hold',measurement:counterMeasurementSpec(formatter)};})};
}
export function bilingualBoardState(scene,config,elapsed){const duration=dynamicSceneDuration(scene);return {items:(scene.nodes??[]).map(node=>{const pair=config.pairs.find(pair=>pair.nodeId===node.id),p=pair?ease((elapsed-pair.atMs)/pair.rollMs):0;return {node,pair:pair??null,progress:p,rotationDeg:-180*p,phase:pair?elapsed<pair.atMs?'original':p<1?'rolling':'translated':'original',fromText:pair?.fromText??node.text,toText:pair?.toText??node.text,fromLanguage:pair?.fromLanguage??'',toLanguage:pair?.toLanguage??'',frontDuration:pair?.atMs??duration,backDuration:pair?duration-pair.atMs-pair.rollMs:duration};})};}
export function bilingualBoardIssues(scene,config){const issues=[],duration=dynamicSceneDuration(scene),nodes=scene.nodes??[];if(!nodes.length||nodes.length>8||!config.pairs?.length)return ['双语转换需要1—8个完整原节点及显式翻译对'];if(!config.provenance?.trim())issues.push('双语内容需要明确来源，不自动翻译');if(new Set(config.pairs.map(pair=>pair.nodeId)).size!==config.pairs.length)issues.push('翻译对不能重复绑定节点');if(config.columns!==undefined&&(!Number.isInteger(config.columns)||config.columns<1||config.columns>4))issues.push('卡片列数须为1—4');for(const pair of config.pairs){const node=nodes.find(node=>node.id===pair.nodeId);if(!node||pair.fromText!==node.text||!pair.toText?.length||!pair.fromLanguage?.length||!pair.toLanguage?.length)issues.push('翻译对须保留完整原节点文字与两种明确语言');if(!Number.isFinite(pair.atMs)||pair.atMs<500||!(pair.rollMs>0)||pair.atMs+pair.rollMs+600>duration)issues.push('原文、滚动与译文须有完整停留');if(chars(pair.fromText).length/Math.max(.001,pair.atMs/1000)>14||chars(pair.toText).length/Math.max(.001,(duration-pair.atMs-pair.rollMs)/1000)>14)issues.push('完整长文缺少阅读时长，不截字，请调整时点或拆场');}return [...new Set(issues)];}

const validRect=(rect,allowBottom=false)=>rect&&['x','y','width','height'].every(key=>Number.isFinite(rect[key]))&&rect.x>=0&&rect.y>=0&&rect.width>0&&rect.height>0&&rect.x+rect.width<=1.001&&rect.y+rect.height<=(allowBottom?1.001:.86);
export function dynamicMechanismIssues(scene,config,viewport){
 if(config.kind==='hub-branch-flow')return hubFlowIssues(scene,config,viewport);
 if(config.kind==='screenshot-region-focus')return regionFocusIssues(scene,config);
 if(config.kind==='orbit-flow-variant')return orbitFlowIssues(scene,config);
 if(config.kind==='bar-group-variant')return barGroupIssues(scene,config);
 if(config.kind==='bilingual-board-transition')return bilingualBoardIssues(scene,config);
 const issues=[],duration=dynamicSceneDuration(scene);if(!Number.isFinite(duration)||duration<=0)return ['场景源时间无效'];
 const positive=(value,zero=false)=>Number.isFinite(value)&&(zero?value>=0:value>0);
 if(config.kind!=='glass-capsules'&&config.atMs!==undefined&&(!positive(config.atMs,true)||config.atMs>=duration))issues.push('入场时点须在完整原场内');
 if(config.kind==='flip-board'){
  if(!Number.isInteger(config.columns??12)||(config.columns??12)<4||(config.columns??12)>32||!Number.isInteger(config.rows??4)||(config.rows??4)<1||(config.rows??4)>12)return ['翻字板行列超出可读范围'];
  const board=flipBoardPages(scene,config);if(!board.pages.length)issues.push('翻字板没有完整内容');if((duration-(config.atMs??0))/Math.max(1,board.pages.length)<(config.holdMs??1200)+560)issues.push('完整分页没有足够翻字与最终停留时间，请增加行列或保留原编排');
  if((config.holdMs??1200)<600||[config.fillMs,config.flipMs].some(value=>value!==undefined&&!positive(value))||config.staggerMs!==undefined&&!positive(config.staggerMs,true))issues.push('翻字时长需有效，完整内容至少保留600毫秒');
  if(config.nodeAtMs){for(const [id,at] of Object.entries(config.nodeAtMs))if(!scene.nodes?.some(node=>node.id===id)||!positive(at,true)||at>=duration)issues.push('逐行口述时点须绑定现有节点并位于原场内');for(let index=0;index<board.pages.length;index++){const state=flipBoardState(scene,config,(config.atMs??0)+(index+.5)*(duration-(config.atMs??0))/board.pages.length);if(state.holdMs<(config.holdMs??1200))issues.push('逐行时点之后没有足够完整停留，请调整翻字分页或口述时点');}}
 }
 else if(config.kind==='number-counter'){
  if(!Number.isFinite(config.from)||!Number.isFinite(config.to)||Math.max(Math.abs(config.from),Math.abs(config.to))>1e15)issues.push('计数需要明确、有限且可精确表示的起止值');
  if(config.to<config.from&&config.direction!=='down')issues.push('终值小于起值；需要明确选择下降方向');
  if(!Number.isInteger(config.decimals??0)||(config.decimals??0)<0||(config.decimals??0)>4)issues.push('小数位须为0—4');
  if((config.countMs??Math.min(2000,duration*.4))<=0||(config.atMs??0)+(config.countMs??Math.min(2000,duration*.4))+600>duration)issues.push('数值变化后需要保留完整终值停留时间');
  if(config.rect&&!validRect(config.rect))issues.push('数字框须位于字幕上方的安全画幅');if(!issues.length)try{counterMeasurementSpec(config);}catch{issues.push('数字格式或语言设置无效');}
 }
 else if(config.kind==='evidence-handoff'){
  const items=evidenceHandoffItems(scene,config),cues=config.cues??defaultHandoffCues(scene,config);if(!items.length)issues.push('需要对象绑定图片或本场真实媒体，不生成占位证据');
  if(items.some(item=>/^(?:https?:|file:|\/|.*\.\.)/.test(item.media.src)))issues.push('证据媒体须来自本地素材库');
  if(!cues.length)issues.push('需要至少一次证据焦点交接');if(!Number.isInteger(config.columns??2)||(config.columns??2)<1||(config.columns??2)>4)issues.push('总览列数须为1—4');
  let previousEnd=-1;for(const cue of cues){if(!items.some(item=>item.node.id===cue.nodeId))issues.push('焦点条目没有对应真实媒体');const end=cue.atMs+(cue.travelMs??550)+(cue.holdMs??1600)+(cue.returnMs??500);if(!Number.isFinite(cue.atMs)||cue.atMs<0||end>duration||cue.atMs<previousEnd||[cue.travelMs??550,cue.holdMs??1600,cue.returnMs??500].some(value=>!positive(value)))issues.push('焦点交接时段须在原场内且不相互重叠');previousEnd=end;for(const rect of [cue.origin,cue.target].filter(Boolean))if(!validRect(rect))issues.push('证据路径起止框须在安全画幅内');}
  for(const rect of [config.boardRect,config.focusBoardRect,config.focusRect].filter(Boolean))if(!validRect(rect))issues.push('联合构图框超出安全画幅');for(const rect of [config.speakerRect,config.focusSpeakerRect].filter(Boolean))if(!validRect(rect,true))issues.push('人物画布须位于有效画幅');
  if(config.matchToLive){const match=config.matchToLive;if(!positive(match.durationMs??900)||!Number.isFinite(match.atMs)||match.atMs<0||match.atMs+(match.durationMs??900)>duration||!validRect(match.to,true)||match.from&&!validRect(match.from,true)||[match.backgroundDelayMs??250,match.graphicsDelayMs??350].some(value=>!positive(value,true))||[match.backgroundFadeMs??450,match.graphicsFadeMs??450].some(value=>!positive(value)))issues.push('人物匹配叠化需要有效时段与目标人物框');}
 }
 else if(config.kind==='glass-capsules'){
  if((scene.nodes?.length??0)>6)issues.push('玻璃标签最多同时保留六项，避免覆盖真人与字幕');if(config.rect&&!validRect(config.rect))issues.push('标签组须位于字幕上方的安全画幅');
  if(!positive(config.inMs??420)||!positive(config.outMs??400)||!positive(config.endMs??duration)||(config.endMs??duration)>duration||!positive(config.gap??.014,true))issues.push('标签入退场、间距和结束时间须有效');
  if(config.atMs&&(config.atMs.length!==visualSequence(scene,0).nodes.length||config.atMs.some((at,index)=>!Number.isFinite(at)||at<0||at>=(config.endMs??duration)||(index>0&&at<config.atMs[index-1]))))issues.push('胶囊口述时点须逐项对应，按顺序且在退场前');
 }
 else issues.push('未知独立动态机制');
 return [...new Set(issues)];
}
