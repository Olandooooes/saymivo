/** Standalone v1 motion kit. Pure, deterministic, no project/media/store access. */
export const KIT_VERSION=1;
export const kitIds=['emphasis-phrase','flip-board','source-token-transfer','screenshot-region-focus','evidence-handoff','orbit-flow-variant','field-roll-board','persistent-entities'];
export const clone=x=>structuredClone(x);
export const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n));
export const ease=t=>1-Math.pow(1-clamp(t),3);
export const progress=(t,start,duration)=>t<=start?0:t>=start+duration-1e-9?1:clamp((t-start)/Math.max(.001,duration));
export const lerp=(a,b,p)=>a+(b-a)*p;
export const mixRect=(a,b,p)=>Object.fromEntries(['x','y','width','height'].map(k=>[k,lerp(a[k],b[k],p)]));
export const glyphs=text=>Array.from(new Intl.Segmenter('zh',{granularity:'grapheme'}).segment(text),x=>x.segment);
export const commonFields=[
 {key:'title',label:'画面标题',type:'text'},
 {key:'accent',label:'强调色',type:'color'},
 {key:'background',label:'背景色',type:'color'},
 {key:'fontSize',label:'字号上限（1080p）',type:'range',min:36,max:120,step:2},
 {key:'fontId',label:'字体',type:'select',options:['source-han','douyin','smiley']},
 {key:'enter',label:'进入时长（秒）',type:'range',min:.2,max:1.5,step:.05},
 {key:'move',label:'变化时长（秒）',type:'range',min:.4,max:2,step:.05},
 {key:'hold',label:'阅读停留（秒）',type:'range',min:.4,max:5,step:.1},
 {key:'gap',label:'对象间隔（秒）',type:'range',min:.1,max:1.2,step:.05},
 {key:'exit',label:'退出时长（秒）',type:'range',min:.2,max:1.2,step:.05}
];
export const specificFields={
 'emphasis-phrase':[{key:'exitMode',label:'结束方式',type:'select',options:['cut','fade']},{key:'mode',label:'文字组织',type:'select',options:['stacked','sequential']},{key:'secondaryColor',label:'次级重点色',type:'color'},{key:'phrases',label:'完整短语（每行一项）',type:'lines'},{key:'fromScale',label:'进入尺度',type:'range',min:1,max:1.5,step:.02},{key:'tracking',label:'初始字距（em）',type:'range',min:0,max:.12,step:.005},{key:'depth',label:'厚影深度',type:'range',min:0,max:12,step:1}],
 'flip-board':[{key:'lines',label:'板中文字（每行一项）',type:'lines'},{key:'columns',label:'每行字格',type:'range',min:6,max:20,step:1},{key:'rows',label:'板行数',type:'range',min:2,max:6,step:1},{key:'stagger',label:'格间错峰（秒）',type:'range',min:0,max:.06,step:.005}],
 'source-token-transfer':[{key:'source',label:'完整原句',type:'textarea'},{key:'tokens',label:'抽取原词（每行一项，必须存在于原句）',type:'lines'},{key:'targetColumns',label:'目标槽列数',type:'range',min:1,max:4,step:1},{key:'curve',label:'飞行弧度',type:'range',min:0,max:.25,step:.01}],
 'screenshot-region-focus':[{key:'focusMode',label:'聚焦方式',type:'select',options:['spotlight','zoom']},{key:'roiX',label:'原图区域 X（%）',type:'range',min:0,max:90,step:1},{key:'roiY',label:'原图区域 Y（%）',type:'range',min:0,max:90,step:1},{key:'roiW',label:'区域宽（%）',type:'range',min:10,max:100,step:1},{key:'roiH',label:'区域高（%）',type:'range',min:8,max:100,step:1},{key:'dim',label:'周围压暗强度',type:'range',min:0,max:.8,step:.05},{key:'zoom',label:'局部放大倍率',type:'range',min:1.2,max:3.5,step:.1}],
 'evidence-handoff':[{key:'captions',label:'资料标题（每行一项）',type:'lines'},{key:'focusScale',label:'焦点宽度（画面比例）',type:'range',min:.55,max:.88,step:.02}],
 'orbit-flow-variant':[{key:'count',label:'装饰点数（不表示统计量）',type:'range',min:12,max:120,step:4},{key:'opening',label:'开口角度',type:'range',min:24,max:110,step:2},{key:'targetSide',label:'目标方向',type:'select',options:['right','left','down','up']}],
 'field-roll-board':[{key:'cards',label:'卡片字段',type:'cards'},{key:'direction',label:'字段滚动方向',type:'select',options:['up','down']},{key:'stagger',label:'字格错峰（秒）',type:'range',min:0,max:.09,step:.005}],
 'persistent-entities':[{key:'mode',label:'收束方式',type:'select',options:['timeline','archive']},{key:'items',label:'核查条目（每行一项）',type:'lines'},{key:'summary',label:'汇总文字',type:'text'},{key:'archiveLabel',label:'归档目标文字',type:'text'}]
};
export function defaultKitConfig(id){
 if(!kitIds.includes(id))throw Error('Unknown motion kit id');
 const base={version:1,id,title:'把信息关系讲清楚',accent:'#9ce4d3',background:'#101b2b',fontSize:68,fontId:'source-han',enter:.6,move:1,hold:2,gap:.35,exit:.5};
 const data={
 'emphasis-phrase':{title:'',phrases:['一份资料','多条线索'],mode:'stacked',exitMode:'cut',accent:'#ffffff',secondaryColor:'#fff39a',fontSize:112,enter:.28,gap:.65,hold:.6,exit:.2,fromScale:1.16,tracking:.02,depth:5},
 'flip-board':{title:'资料总览',lines:['资料甲  REVIEW  等待核对','资料乙  REVIEW  等待核对'],columns:20,rows:3,stagger:.02},
 'source-token-transfer':{title:'原始需求',accent:'#67d8ed',source:'请核对这份资料的来源，保留完整的上下文，再检查必要条件。确认过程记录完整后，将结果整理归档。',tokens:['来源','条件','结果'],targetColumns:3,curve:.09},
 'screenshot-region-focus':{title:'从完整资料，找到当前重点',focusMode:'spotlight',accent:'#f1d86c',image:{src:'motion-kit-demo/evidence.png',width:1280,height:800},roiX:22,roiY:50,roiW:72,roiH:20,dim:.6,zoom:1.8},
 'evidence-handoff':{title:'让资料接棒，不丢失上下文',image:{src:'motion-kit-demo/evidence.png',width:1280,height:800},images:['evidence','code','note'].map(n=>({src:'motion-kit-demo/'+n+'.png',width:1280,height:800})),captions:['原始记录','处理过程','核查笔记'],focusScale:.76},
 'orbit-flow-variant':{title:'集合 → 开口 → 流向目标',count:48,opening:64,targetSide:'right'},
 'field-roll-board':{title:'同一对象，只更新字段',cards:[{id:'card-a',label:'内容类型',from:'讲解',to:'Explain'},{id:'card-b',label:'当前状态',from:'待核对',to:'Checked'}],direction:'up',stagger:.035},
 'persistent-entities':{title:'一组任务，保持连续关系',mode:'timeline',items:['保留来源','检查条件','记录过程','核对结果'],summary:'一轮核查',archiveLabel:'下一步'}
 };
 return {...base,...data[id]};
}
export function tokenRanges(source,tokens){
 let used=[];return tokens.map((text,index)=>{let at=source.indexOf(text);while(at>=0&&used.some(x=>at<x.end&&at+text.length>x.start))at=source.indexOf(text,at+1);if(!text||at<0)throw Error(`抽取词“${text}”不在原句中，或已被其他抽取词占用。`);const r={id:'token-'+index,text,start:at,end:at+text.length};used.push(r);return r;});
}
export function boardPages(config){
 const rows=[];for(const line of config.lines){const chars=glyphs(line);for(let i=0;i<chars.length;i+=config.columns)rows.push(chars.slice(i,i+config.columns));if(!chars.length)rows.push([]);}
 const pages=[];for(let i=0;i<rows.length;i+=config.rows)pages.push(rows.slice(i,i+config.rows));return pages.length?pages:[[[]]];
}
const lineList=(v,max=8)=>Array.isArray(v)&&v.length>=1&&v.length<=max&&v.every(x=>typeof x==='string'&&x.trim().length>0&&glyphs(x).length<=240);
export function kitIssues(c){
 const issues=[];if(!c||c.version!==1||!kitIds.includes(c.id))return ['无法识别组件配置版本或类型。'];
 if(typeof c.title!=='string'||glyphs(c.title).length>120)issues.push('标题需为120字以内的完整文字。');
 for(const key of ['accent','background'])if(!/^#[a-f0-9]{6}$/i.test(c[key]??''))issues.push(`${key}需要六位十六进制颜色。`);
 for(const field of [...commonFields,...specificFields[c.id]]){if(field.type==='select'&&!field.options.includes(c[field.key]))issues.push(`${field.label}选项无效。`);if(field.type==='color'&&!/^#[a-f0-9]{6}$/i.test(c[field.key]??''))issues.push(`${field.label}需要六位颜色。`);if(field.type==='range'){
  const n=c[field.key];if(typeof n!=='number'||!Number.isFinite(n)||n<field.min-1e-8||n>field.max+1e-8)issues.push(`${field.label}应在${field.min}至${field.max}之间。`);
  if(field.step===1&&!Number.isInteger(n))issues.push(`${field.label}需要整数。`);
 }
 }
 if(c.id==='emphasis-phrase'){if(!lineList(c.phrases))issues.push('需要1至8条完整短语。');if(!['stacked','sequential'].includes(c.mode))issues.push('文字组织方式无效。');if(!/^#[a-f0-9]{6}$/i.test(c.secondaryColor??''))issues.push('次级重点色无效。');}
 if(c.id==='flip-board'&&!lineList(c.lines,20))issues.push('字板需要1至20行文字。');
 if(c.id==='source-token-transfer'){
  if(typeof c.source!=='string'||!c.source.trim()||glyphs(c.source).length>360)issues.push('原句需要1至360字。');
  if(!lineList(c.tokens,8))issues.push('抽取词需要1至8项。');
  else if(typeof c.source==='string')try{tokenRanges(c.source,c.tokens);}catch(e){issues.push(e.message);}
 }
 if(['screenshot-region-focus','evidence-handoff'].includes(c.id)){
  const a=c.image;if(!a||typeof a.src!=='string'||!a.src||/^(?:[a-z]+:|\/)|(?:^|\/)\.\.(?:\/|$)|[\\\x00-\x1f]/i.test(a.src)||!Number.isInteger(a.width)||!Number.isInteger(a.height)||a.width<1||a.height<1)issues.push('需要明确尺寸的本地图片相对路径。');
 }
 if(c.id==='screenshot-region-focus'&&!['spotlight','zoom'].includes(c.focusMode))issues.push('聚焦方式无效。');
 if(c.id==='screenshot-region-focus'&&(c.roiX+c.roiW>100||c.roiY+c.roiH>100))issues.push('聚焦区域超出原图边界；请减小起点或区域尺寸。');
 if(c.id==='evidence-handoff'&&c.images!==undefined&&(!Array.isArray(c.images)||c.images.length>4||c.images.some(a=>!a||typeof a.src!=='string'||/^(?:[a-z]+:|\/)|(?:^|\/)\.\.(?:\/|$)|[\\\x00-\x1f]/i.test(a.src)||!Number.isInteger(a.width)||!Number.isInteger(a.height)||a.width<=0||a.height<=0)))issues.push('各资料图片需要安全的本地路径和明确尺寸。');
 if(c.id==='evidence-handoff'&&!lineList(c.captions,4))issues.push('资料标题需要1至4项。');
 if(c.id==='orbit-flow-variant'&&!Number.isInteger(c.count))issues.push('装饰点数需要整数。');
 if(c.id==='orbit-flow-variant'&&!['right','left','down','up'].includes(c.targetSide))issues.push('目标方向无效。');
 if(c.id==='field-roll-board'){
  if(!Array.isArray(c.cards)||!c.cards.length||c.cards.length>4||c.cards.some(x=>!x||typeof x.id!=='string'||!x.id||!['label','from','to'].every(k=>typeof x[k]==='string'&&x[k].trim()&&glyphs(x[k]).length<=60)))issues.push('需要1至4张有稳定ID、标签和完整起止文字的卡片。');
  else if(new Set(c.cards.map(x=>x.id)).size!==c.cards.length)issues.push('卡片ID不可重复。');
  if(!['up','down'].includes(c.direction))issues.push('滚动方向无效。');
 }
 if(c.id==='persistent-entities'){
  if(!['timeline','archive'].includes(c.mode))issues.push('收束方式无效。');
  if(!lineList(c.items))issues.push('核查条目需要1至8项。');
  for(const k of ['summary','archiveLabel'])if(typeof c[k]!=='string'||!c[k].trim()||glyphs(c[k]).length>60)issues.push('汇总和归档文字需要1至60字。');
 }
 return issues;
}
export function kitTimeline(c){
 const issues=kitIssues(c);if(issues.length)throw Error(issues.join(' '));
 const start=c.id==='emphasis-phrase'?0:.3,enterEnd=start+c.enter;let motionEnd,duration;
 if(c.id==='emphasis-phrase'){const out=c.exitMode==='cut'?0:c.exit,cycle=c.enter+c.hold+out+c.gap;duration=c.mode==='stacked'?start+c.enter+(c.phrases.length-1)*c.gap+c.hold+out:start+c.phrases.length*cycle-c.gap;return{start,enterEnd,motionEnd:duration-out,exitAt:duration-out,duration,cycle};}
 if(c.id==='flip-board'){const pages=boardPages(c),cellCount=c.columns*c.rows,cycle=c.move+(cellCount-1)*c.stagger+c.hold+c.gap;motionEnd=enterEnd+pages.length*cycle-c.gap;return{start,enterEnd,motionEnd,exitAt:motionEnd,duration:motionEnd+c.exit,cycle,pages};}
 if(c.id==='source-token-transfer')motionEnd=enterEnd+c.hold*.5+c.tokens.length*(c.move+c.gap)-c.gap;
 if(c.id==='screenshot-region-focus')motionEnd=enterEnd+c.hold+c.move+c.hold+c.move;
 if(c.id==='evidence-handoff')motionEnd=enterEnd+c.captions.length*(c.move*2+c.hold+c.gap)-c.gap;
 if(c.id==='orbit-flow-variant')motionEnd=enterEnd+c.move+c.gap+c.move*.6+c.gap+c.move*2;
 if(c.id==='field-roll-board')motionEnd=enterEnd+c.hold+(c.cards.length-1)*c.gap+Math.max(...c.cards.map(x=>Math.max(glyphs(x.from).length,glyphs(x.to).length)))*c.stagger+c.move;
 if(c.id==='persistent-entities')motionEnd=enterEnd+c.items.length*(c.move*.45+c.gap)+c.hold+c.move+c.hold+c.move;
 duration=motionEnd+c.hold+c.exit;return{start,enterEnd,motionEnd,exitAt:duration-c.exit,duration};
}
export function kitEnvelope(t,c){const tl=kitTimeline(c);if(c.id==='emphasis-phrase'&&c.exitMode==='cut')return t<tl.duration?progress(t,tl.start,c.enter):0;return progress(t,tl.start,c.enter)*(1-progress(t,tl.exitAt,c.exit));}
export function emphasisSample(c,t){const tl=kitTimeline(c),local=t-tl.start,index=Math.max(0,Math.min(c.phrases.length-1,Math.floor(local/tl.cycle))),at=tl.start+index*tl.cycle,p=ease(progress(t,at,c.enter));return {index,text:c.phrases[index],opacity:c.exitMode==='cut'?(t<at+c.enter+c.hold?progress(t,at,c.enter):0):progress(t,at,c.enter)*(1-progress(t,at+c.enter+c.hold,c.exit)),scale:lerp(c.fromScale,1,p),tracking:lerp(c.tracking,0,p)};}
export function fieldCells(from,to,t,start,c){const a=glyphs(from),b=glyphs(to);return Array.from({length:Math.max(a.length,b.length)},(_,i)=>({id:i,from:a[i]??' ',to:b[i]??' ',p:ease(progress(t,start+i*c.stagger,c.move))}));}
export function focusSample(c,t){const tl=kitTimeline(c),at=tl.enterEnd+c.hold;return ease(progress(t,at,c.move))*(1-ease(progress(t,at+c.move+c.hold,c.move)));}
export function evidenceSample(c,t,index){const tl=kitTimeline(c),cycle=c.move*2+c.hold+c.gap,at=tl.enterEnd+index*cycle;return ease(progress(t,at,c.move))*(1-ease(progress(t,at+c.move+c.hold,c.move)));}
export function orbitSample(c,t,index){const tl=kitTimeline(c),gather=progress(t,tl.enterEnd,c.move),openAt=tl.enterEnd+c.move+c.gap,opening=progress(t,openAt,c.move*.6),flowAt=openAt+c.move*.6+c.gap,flow=progress(t,flowAt+(index/c.count)*c.move,c.move);return{gather:ease(gather),opening:ease(opening),flow:ease(flow),arrived:flow===1};}
export function exportKitConfig(c){const issues=kitIssues(c);if(issues.length)throw Error(issues.join(' '));return JSON.stringify(c,null,2);}
export function importKitConfig(text,expectedId){const c=JSON.parse(text);const issues=kitIssues(c);if(expectedId&&c.id!==expectedId)issues.push('配置类型与当前组件不一致。');if(issues.length)throw Error(issues.join(' '));return clone(c);}
/** Inspection markers point at actual native motion, not half of a long idle window. */
export function kitMarkers(c){
 const tl=kitTimeline(c);let middle=tl.enterEnd+(tl.motionEnd-tl.enterEnd)/2;
 if(c.id==='flip-board')middle=tl.enterEnd+c.move*.5+c.columns*c.rows*c.stagger*.5;
 if(c.id==='source-token-transfer')middle=tl.enterEnd+c.hold*.5+Math.floor(c.tokens.length/2)*(c.move+c.gap)+c.move*.5;
 if(c.id==='screenshot-region-focus')middle=tl.enterEnd+c.hold+c.move+c.hold*.5;
 if(c.id==='evidence-handoff')middle=tl.enterEnd+c.move+c.hold*.5;
 if(c.id==='orbit-flow-variant')middle=tl.enterEnd+c.move+c.gap+c.move*.6+c.gap+c.move;
 if(c.id==='field-roll-board')middle=tl.enterEnd+c.hold+c.move*.5+Math.max(...c.cards.map(x=>Math.max(glyphs(x.from).length,glyphs(x.to).length)))*c.stagger*.5;
 return [0,tl.enterEnd,middle,tl.motionEnd,Math.max(0,tl.duration-.08)];
}
