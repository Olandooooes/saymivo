import React,{useEffect,useId,useState} from 'react';
import type {StoryScene} from '../src/storyboard.mjs';
import type {StageRect} from '../src/dynamic-mechanisms.mjs';
import type {FieldRollBoardConfig,FieldRollCard,FieldRollField,FieldRollProjectionProof} from '../src/field-roll-board.mjs';
import {fieldRollCompleteCopy} from '../src/field-roll-board.mjs';
import {editFieldRollControl,fieldRollControlAssessment,fieldRollControlSources,parseFieldRollControlNumber} from './field-roll-control-values.mjs';
import type {FieldRollControlAction} from './field-roll-control-values.mjs';

const inputClass='w-full rounded border border-outline-variant bg-surface-container-lowest px-2 py-1.5 text-sm';
const groupClass='rounded border border-outline-variant/50 p-3 space-y-3';
const buttonClass='rounded border border-outline-variant px-2 py-1 text-xs disabled:opacity-40';
type Edit=(action:FieldRollControlAction)=>void;
type Props={scene:StoryScene;value:FieldRollBoardConfig;onChange:(value:FieldRollBoardConfig)=>void;projectionProof?:FieldRollProjectionProof;viewport?:{width:number;height:number};disabled?:boolean;newId?:()=>string};

function Text({label,value,onChange,readOnly=false,rows=3}:{label:string;value:string;onChange?:(value:string)=>void;readOnly?:boolean;rows?:number}){
 const id=useId();
 return <div><label className="block text-xs mb-1" htmlFor={id}>{label}</label><textarea id={id} className={inputClass} rows={rows} value={value} readOnly={readOnly} onChange={onChange?event=>onChange(event.target.value):undefined}/></div>;
}
function NumberValue({label,value,onChange,seconds=false}:{label:string;value:number;onChange:(value:number)=>void;seconds?:boolean}){
 const id=useId(),display=Number.isFinite(value)?String(value/(seconds?1000:1)):'',[draft,setDraft]=useState(display),[error,setError]=useState('');
 useEffect(()=>{setDraft(display);setError('');},[display]);
 return <div><label className="block text-xs mb-1" htmlFor={id}>{label}{seconds?'（原场景相对秒）':''}</label><input id={id} type="number" step="any" className={inputClass} value={draft} aria-invalid={!!error} onChange={event=>{const text=event.target.value;setDraft(text);const result=parseFieldRollControlNumber(text,{seconds});setError(result.message??'');if(result.ok&&result.value!==undefined)onChange(result.value);}}/>{error&&<p role="alert" className="text-xs mt-1">{error}</p>}</div>;
}
function Rect({label,value,onChange}:{label:string;value:StageRect;onChange:(value:StageRect)=>void}){
 const labels={x:'距左侧',y:'距顶部',width:'宽度',height:'高度'};
 return <fieldset className={groupClass}><legend className="text-xs px-1">{label}（画面比例 0–1）</legend><div className="grid grid-cols-2 gap-2">{(['x','y','width','height'] as const).map(key=><NumberValue key={key} label={labels[key]} value={value[key]} onChange={next=>onChange({...value,[key]:next})}/>)}</div></fieldset>;
}
function OrderButtons({label,index,length,onMove,onRemove}:{label:string;index:number;length:number;onMove:(delta:-1|1)=>void;onRemove:()=>void}){
 return <div className="flex flex-wrap gap-2"><button type="button" className={buttonClass} disabled={index===0} aria-label={`上移${label}`} onClick={()=>onMove(-1)}>上移</button><button type="button" className={buttonClass} disabled={index===length-1} aria-label={`下移${label}`} onClick={()=>onMove(1)}>下移</button><button type="button" className={buttonClass} aria-label={`移除${label}`} onClick={onRemove}>移除</button></div>;
}

function RollField({scene,card,field,index,edit}:{scene:StoryScene;card:FieldRollCard;field:FieldRollField;index:number;edit:Edit}){
 const id=useId(),kindId=useId(),directionId=useId(),sources=fieldRollControlSources(scene),selected=sources.find(item=>item.id===field.sourceRef),provenance=field.provenance;
 const patch=(key:'label'|'to',value:string)=>edit({type:'field',cardId:card.id,fieldId:field.id,key,value});
 const provenancePatch=(key:'citation'|'fromLanguage'|'toLanguage',value:string)=>edit({type:'field',cardId:card.id,fieldId:field.id,key:'provenance',value:{...provenance,[key]:value}});
 return <fieldset className={groupClass} data-field-roll-control-field={field.id}><legend className="text-sm px-1">字段 {index+1}</legend>
  <Text label="字段稳定标识（只读）" value={field.id} readOnly rows={1}/>
  <OrderButtons label={`字段${index+1}`} index={index} length={card.fields.length} onMove={delta=>edit({type:'move-field',cardId:card.id,fieldId:field.id,delta})} onRemove={()=>edit({type:'remove-field',cardId:card.id,fieldId:field.id})}/>
  <div><label className="block text-xs mb-1" htmlFor={id}>来源完整字段</label><select id={id} className={inputClass} value={field.sourceRef} onChange={event=>edit({type:'select-source',cardId:card.id,fieldId:field.id,sourceRef:event.target.value})}><option value="">请选择真实来源字段</option>{field.sourceRef&&!selected&&<option value={field.sourceRef} disabled>原来源已不存在：{field.sourceRef}</option>}{sources.map(item=><option key={item.id} value={item.id}>{item.id} — {item.text}</option>)}</select><p className="text-xs mt-1 opacity-70">更换来源会清空旧目标与映射说明，需要重新填写。</p></div>
  <Text label="来源引用（只读）" value={field.sourceRef} readOnly rows={1}/>
  <Text label="滚动前完整值（来源锁定）" value={field.from} readOnly/>
  {selected&&selected.text!==field.from&&<div role="alert" className="text-xs"><p>来源原文已改变，当前保存的滚动前值不匹配。</p><Text label="当前来源完整原文（只读）" value={selected.text} readOnly/><button type="button" className={buttonClass} onClick={()=>edit({type:'select-source',cardId:card.id,fieldId:field.id,sourceRef:field.sourceRef})}>重新绑定当前原文并清空目标与映射说明</button></div>}
  <Text label="滚动后完整值" value={field.to} onChange={value=>patch('to',value)}/>
  <Text label="字段标签" value={field.label} onChange={value=>patch('label',value)} rows={2}/>
  <div><label className="block text-xs mb-1" htmlFor={kindId}>映射类型</label><select id={kindId} className={inputClass} value={provenance.kind} onChange={event=>edit({type:'field',cardId:card.id,fieldId:field.id,key:'provenance',value:{...provenance,kind:event.target.value as FieldRollField['provenance']['kind']}})}><option value="authored-update">明确编写的内容更新</option><option value="format">有依据的显示格式对应</option><option value="translation">有依据的翻译对应</option></select></div>
  <Text label="完整映射来源 / 引用 / 人工编写说明（必填）" value={provenance.citation} onChange={value=>provenancePatch('citation',value)}/>
  {provenance.kind==='translation'&&<div className="grid grid-cols-2 gap-2"><Text label="原语言" value={provenance.fromLanguage??''} onChange={value=>provenancePatch('fromLanguage',value)} rows={1}/><Text label="目标语言" value={provenance.toLanguage??''} onChange={value=>provenancePatch('toLanguage',value)} rows={1}/></div>}
  <div><label className="block text-xs mb-1" htmlFor={directionId}>字形滚动方向</label><select id={directionId} className={inputClass} value={field.direction} onChange={event=>edit({type:'field',cardId:card.id,fieldId:field.id,key:'direction',value:event.target.value as 'up'|'down'})}><option value="up">向上</option><option value="down">向下</option></select></div>
  <div className="grid grid-cols-2 gap-2">{([['rollAtMs','开始滚动'],['cellRollMs','单字滚动时长'],['staggerMs','相邻字延迟']] as const).map(([key,label])=><NumberValue key={key} label={label} value={field[key]} seconds onChange={value=>edit({type:'field',cardId:card.id,fieldId:field.id,key,value})}/>)}</div>
  <Rect label="完整值字形遮罩" value={field.rect} onChange={value=>edit({type:'field',cardId:card.id,fieldId:field.id,key:'rect',value})}/>
  <Rect label="标签位置" value={field.labelRect} onChange={value=>edit({type:'field',cardId:card.id,fieldId:field.id,key:'labelRect',value})}/>
 </fieldset>;
}

/** Standalone draft fields only. Not imported by the running editor, not a
 * preview/readiness/apply component, and never mutates the supplied scene. */
export function FieldRollBoardFields({scene,value,onChange,projectionProof,viewport={width:1920,height:1080},disabled=false,newId=()=>crypto.randomUUID()}:Props){
 const edit:Edit=action=>{if(disabled)return;const next=editFieldRollControl(value,action,scene);if(next!==value)onChange(next);};
 const assessment=fieldRollControlAssessment(scene,value,viewport,projectionProof),sources=fieldRollControlSources(scene);
 return <fieldset disabled={disabled} className="space-y-4" data-field-roll-controls="standalone"><legend className="text-sm font-medium mb-2">字段与字形滚动看板</legend>
  <p className="text-xs opacity-70">每个字段只使用明确的原值和目标值。所有时点均以原场景起点为 0；不会自动翻译、生成计数或改动剪口和原声。</p>
  <fieldset className={groupClass}><legend className="text-xs px-1">完整来源与身份（只读）</legend>
   <Text label="完整源文案：标题、正文、全部节点与附加说明" value={fieldRollCompleteCopy(scene)} readOnly rows={6}/>
   <dl className="text-xs space-y-2 break-all" data-field-roll-source-inventory="complete">{sources.map(item=><div key={item.id}><dt className="opacity-70">{item.id}</dt><dd className="whitespace-pre-wrap break-words">{item.text}</dd></div>)}</dl>
   <Text label="原片身份绑定（只读；由父级实际素材身份创建）" value={JSON.stringify(value.binding,null,2)} readOnly rows={7}/>
   <Text label="时钟（只读）" value={value.clock} readOnly rows={1}/>
   {!!assessment.media.length&&<div role="alert" className="text-xs space-y-2" data-field-roll-existing-media="retained"><p>本场已有资料。首版字段滚动不绘制这些素材，当前配置不可应用；请保留原编排或选择支持资料的机制。以下来源及全部原素材设置仍保留。</p>{assessment.media.map(item=><div key={item.id}><p>{item.id} · {item.kind}</p>{item.text&&<p className="whitespace-pre-wrap">{item.text}</p>}<code className="break-all">{item.src}</code></div>)}<Text label="已有资料完整设置（只读）" value={JSON.stringify({media:scene.media,nodes:(scene.nodes??[]).filter(node=>node.assetSrc)},null,2)} readOnly rows={8}/></div>}
  </fieldset>
  <fieldset className={groupClass}><legend className="text-xs px-1">完整原文阅读窗</legend><div className="grid grid-cols-2 gap-2"><NumberValue label="开始" value={value.copyWindow.atMs} seconds onChange={atMs=>edit({type:'board',key:'copyWindow',value:{...value.copyWindow,atMs}})}/><NumberValue label="结束" value={value.copyWindow.endMs} seconds onChange={endMs=>edit({type:'board',key:'copyWindow',value:{...value.copyWindow,endMs}})}/></div><Rect label="完整原文窗口" value={value.copyWindow.rect} onChange={rect=>edit({type:'board',key:'copyWindow',value:{...value.copyWindow,rect}})}/></fieldset>
  <Rect label="标题位置" value={value.titleRect} onChange={next=>edit({type:'board',key:'titleRect',value:next})}/>
  <Rect label="真实人物槽（需父级解码与可见性验证）" value={value.speakerRect} onChange={next=>edit({type:'board',key:'speakerRect',value:next})}/>
  {value.cards.map((card,index)=><fieldset key={card.id} className={groupClass} data-field-roll-control-card={card.id}><legend className="text-sm px-1">卡片 {index+1}</legend>
   <Text label="卡片稳定标识（只读）" value={card.id} readOnly rows={1}/>
   <OrderButtons label={`卡片${index+1}`} index={index} length={value.cards.length} onMove={delta=>edit({type:'move-card',cardId:card.id,delta})} onRemove={()=>edit({type:'remove-card',cardId:card.id})}/>
   <Rect label="稳定卡片位置" value={card.rect} onChange={next=>edit({type:'card',cardId:card.id,key:'rect',value:next})}/>
   <div className="grid grid-cols-2 gap-2">{([['enterAtMs','入场开始'],['enterMs','入场时长'],['exitAtMs','退场开始'],['exitMs','退场时长']] as const).map(([key,label])=><NumberValue key={key} label={label} value={card[key]} seconds onChange={next=>edit({type:'card',cardId:card.id,key,value:next})}/>)}</div>
   {card.fields.map((field,fieldIndex)=><RollField key={field.id} scene={scene} card={card} field={field} index={fieldIndex} edit={edit}/>)}
   <button type="button" className={buttonClass} disabled={value.cards.reduce((count,item)=>count+item.fields.length,0)>=24} onClick={()=>edit({type:'add-field',cardId:card.id,id:newId()})}>添加空字段</button>
  </fieldset>)}
  <button type="button" className={buttonClass} disabled={value.cards.length>=8} onClick={()=>edit({type:'add-card',id:newId()})}>添加空卡片</button>
  <fieldset className={groupClass}><legend className="text-xs px-1">附加保护区</legend><p className="text-xs opacity-70">实际人物全部关键帧包络与当前字幕由父级投影共同检查；附加保护区不会代替它们。</p>{(value.protectedAreas??[]).map((area,index)=><div className={groupClass} key={index}><Text label={`保护区${index+1}说明`} value={area.label??''} rows={2} onChange={next=>edit({type:'protection',index,key:'label',value:next})}/><Rect label={`保护区${index+1}位置`} value={area.rect} onChange={next=>edit({type:'protection',index,key:'rect',value:next})}/><button type="button" className={buttonClass} onClick={()=>edit({type:'remove-protection',index})}>移除保护区{index+1}</button></div>)}<button type="button" className={buttonClass} onClick={()=>edit({type:'add-protection'})}>添加保护区</button></fieldset>
  <div className="text-xs space-y-2" aria-live="polite" data-field-roll-control-assessment="configuration-only"><p>参数检查：{assessment.issues.length?`${assessment.issues.length} 项待处理`:'未发现参数结构问题'}。此结果不代表字体、全文显示、真人或完整循环已通过，不能作为应用凭证。</p>{assessment.issues.length>0&&<ul className="list-disc pl-4 space-y-1">{assessment.issues.map(issue=><li key={issue} className="break-words">{issue}</li>)}</ul>}</div>
 </fieldset>;
}
