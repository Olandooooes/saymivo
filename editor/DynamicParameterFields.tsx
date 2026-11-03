import React,{useId,useState} from 'react';
import type {StoryScene} from '../src/storyboard.mjs';
import type {DynamicControlField} from '../src/dynamic-mechanism-adapter.mjs';
import {controlFieldValue,newControlValue,parseControlNumber,patchControlRecord,sourceTokenControlOptions} from './dynamic-control-values.mjs';

type FieldContext={scene:StoryScene;edges?:{id:string;label?:string}[];disabled?:boolean;onPickRegion?:()=>void;rootValue?:Record<string,unknown>};
type Values=Record<string,unknown>;
const isRecord=(value:unknown):value is Values=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const inputClass='w-full rounded border border-outline-variant bg-surface-container-lowest px-2 py-1.5 text-sm';
const rectLabels:Record<string,string>={x:'距左侧',y:'距顶部',width:'宽度',height:'高度'};
const positionLabels:Record<string,string>={boardRect:'总览位置',focusBoardRect:'聚焦时总览位置',speakerRect:'人物起始位置',focusSpeakerRect:'聚焦时人物位置',focusRect:'放大资料位置'};
const optionLabels:Record<string,string>={left:'左侧',right:'右侧',up:'上升',down:'下降',flat:'持平',inset:'人物窗',cutout:'真实人物抠像',orthogonal:'折线路径',bezier:'弧线路径',active:'正常',dim:'淡出强调',hidden:'隐藏',screenshot:'真实截图',illustration:'绘制图解'};

function NumberField({label,value,onChange,seconds=false,min,max,disabled=false}:{label:string;value:unknown;onChange:(value:unknown)=>void;seconds?:boolean;min?:number;max?:number;disabled?:boolean}){
 const id=useId(),[error,setError]=useState('');
 const number=typeof value==='number'&&Number.isFinite(value)?value/(seconds?1000:1):'';
 return <div><label htmlFor={id} className="block text-xs mb-1">{label}{seconds?'（秒）':''}</label><input id={id} className={inputClass} type="number" step="any" value={number} min={min===undefined?undefined:min/(seconds?1000:1)} max={max===undefined?undefined:max/(seconds?1000:1)} disabled={disabled} aria-invalid={!!error} onChange={event=>{const parsed=parseControlNumber(event.target.value,{seconds});setError(parsed.message??'');if(parsed.ok)onChange(parsed.value);}}/>{error&&<p role="alert" className="text-xs mt-1">{error}</p>}</div>;
}

function CoordinateFields({label,value,onChange,point=false,disabled=false}:{label:string;value:unknown;onChange:(value:unknown)=>void;point?:boolean;disabled?:boolean}){
 const values=isRecord(value)?value:{};
 return <fieldset className="border border-outline-variant/50 rounded p-2"><legend className="text-xs px-1">{label}（画面比例）</legend><div className="grid grid-cols-2 gap-2">{(point?['x','y']:['x','y','width','height']).map(key=><NumberField key={key} label={rectLabels[key]} value={values[key]} min={0} max={1} disabled={disabled} onChange={next=>{const result={...values};if(next===undefined)delete result[key];else result[key]=next;onChange(result);}}/>)}</div></fieldset>;
}

function OneControl({field,value,siblings,onChange,context}:{field:DynamicControlField;value:unknown;siblings:Values;onChange:(value:unknown)=>void;context:FieldContext}){
 const id=useId(),label=field.type==='source-token-source-ref'?'来源原句':positionLabels[field.key]??field.label,shown=controlFieldValue(field,value,{scene:context.scene,siblings,rootValue:context.rootValue});
 // Stable identifiers are generated for draft items, never presented as copy.
 if(field.key==='id')return null;
 if(field.readonly&&isRecord(shown))return <fieldset className="border border-outline-variant/50 rounded p-2"><legend className="text-xs px-1">{label}（来源锁定）</legend><dl className="space-y-1 text-xs break-all">{Object.entries(shown).map(([key,item])=><React.Fragment key={key}><dt className="opacity-60">{field.fields?.find(f=>f.key===key)?.label??key}</dt><dd>{item===undefined?'等待来源绑定':String(item)}</dd></React.Fragment>)}</dl></fieldset>;
 if(field.readonly||Object.hasOwn(field,'fixed'))return <div><label htmlFor={id} className="block text-xs mb-1">{label}</label><textarea id={id} className={inputClass} rows={typeof shown==='string'&&shown.length>50?3:1} readOnly value={shown===undefined?'等待来源绑定':String(shown)} /></div>;
 const disabled=context.disabled;
 if(field.type==='source-pixel-rect')return <div className="border border-outline-variant/50 rounded p-3"><p className="text-sm">{label}</p><p className="text-xs opacity-70 my-2">在已加载的原图上圈出需要放大的部分，保留原图比例。</p><button type="button" disabled={disabled||!context.onPickRegion} onClick={context.onPickRegion} className="border rounded px-3 py-1 text-sm disabled:opacity-40">在原图圈选</button>{isRecord(value)&&<p className="text-xs mt-2">已选：左 {String(value.x)}，上 {String(value.y)}，宽 {String(value.width)}，高 {String(value.height)} 像素</p>}</div>;
 if(['number','source-ms','decoded-dimension'].includes(field.type))return <NumberField label={label} value={shown} onChange={onChange} seconds={field.type==='source-ms'} min={field.min} max={field.max} disabled={disabled}/>;
 if(field.type==='stage-rect'||field.type==='stage-point')return <CoordinateFields label={label} value={value} onChange={onChange} point={field.type==='stage-point'} disabled={disabled}/>;
 if(field.type==='boolean')return <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={value===true} disabled={disabled} onChange={event=>onChange(event.target.checked)}/>{label}</label>;
 if(['node-ref','edge-ref','select','source-token-source-ref'].includes(field.type)){
  const sourceOptions=field.type==='source-token-source-ref'?sourceTokenControlOptions(context.rootValue,context.scene):[],selectedSource=sourceOptions.find(option=>option.value===value);
  const options=field.type==='source-token-source-ref'?sourceOptions:field.type==='node-ref'?(context.scene.nodes??[]).map(node=>({value:node.id,label:node.text})):field.type==='edge-ref'?(context.edges??[]).map(edge=>({value:edge.id,label:edge.label??edge.id})):(field.options??[]).map(value=>({value,label:optionLabels[value]??value}));
  return <div><label htmlFor={id} className="block text-xs mb-1">{label}</label><select id={id} className={inputClass} value={typeof value==='string'?value:''} disabled={disabled} onChange={event=>onChange(event.target.value||undefined)}><option value="">未设置</option>{typeof value==='string'&&value&&!options.some(option=>option.value===value)&&<option value={value} disabled>原对象已不存在或原文失配，请重新选择</option>}{options.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</select>{selectedSource&&<p className="text-xs mt-2 whitespace-pre-wrap break-words">{selectedSource.text}{'\n'}共 {selectedSource.graphemeCount} 个字素；开始从 0 计，结束不含该位。</p>}</div>;
 }
 if(field.type==='node-ref-list')return <fieldset className="border border-outline-variant/50 rounded p-2"><legend className="text-xs px-1">{label}</legend>{(context.scene.nodes??[]).map(node=><label key={node.id} className="flex gap-2 text-sm my-2"><input type="checkbox" checked={Array.isArray(value)&&value.includes(node.id)} disabled={disabled} onChange={event=>onChange(event.target.checked?[...(Array.isArray(value)?value:[]),node.id]:(Array.isArray(value)?value:[]).filter(item=>item!==node.id))}/><span className="whitespace-pre-wrap">{node.text}</span></label>)}</fieldset>;
 if(field.type==='node-time-map')return <fieldset className="border border-outline-variant/50 rounded p-2 space-y-2"><legend className="text-xs px-1">{label}</legend>{(context.scene.nodes??[]).map(node=><NumberField key={node.id} label={node.text} value={isRecord(value)?value[node.id]:undefined} seconds min={0} disabled={disabled} onChange={next=>{const result=isRecord(value)?{...value}:{};if(next===undefined)delete result[node.id];else result[node.id]=next;onChange(result);}}/>)}</fieldset>;
 if(field.type==='record')return <fieldset className="border border-outline-variant/50 rounded p-2"><legend className="text-xs px-1">{label}</legend>{isRecord(value)?<><DynamicParameterFields fields={field.fields??[]} value={value} onChange={onChange} context={context}/><button type="button" className="text-xs underline mt-2" disabled={disabled} onClick={()=>onChange(undefined)}>取消这一设置</button></>:<button type="button" className="border rounded px-3 py-1 text-sm" disabled={disabled} onClick={()=>onChange(newControlValue(field,{newId:()=>crypto.randomUUID(),scene:context.scene,siblings,rootValue:context.rootValue}))}>添加{label}</button>}</fieldset>;
 if(['list','source-ms-list','stage-points'].includes(field.type)){
  const items=Array.isArray(value)?value:[],fields=field.itemFields??[];
  return <fieldset className="border border-outline-variant/50 rounded p-2 space-y-3"><legend className="text-xs px-1">{label}</legend>{items.map((item,index)=><div key={isRecord(item)&&typeof item.id==='string'?item.id:index} className="border border-outline-variant/30 rounded p-2"><div className="flex justify-between items-center mb-2"><p className="text-xs">第{index+1}项</p><button type="button" aria-label={`移除${label}第${index+1}项`} className="text-xs underline" disabled={disabled} onClick={()=>onChange(items.filter((_,i)=>i!==index))}>移除</button></div>{field.type==='source-ms-list'?<NumberField label="出现时点" value={item} seconds min={0} disabled={disabled} onChange={next=>onChange(items.map((value,i)=>i===index?next:value))}/>:field.type==='stage-points'?<CoordinateFields label="路径点" value={item} point disabled={disabled} onChange={next=>onChange(items.map((value,i)=>i===index?next:value))}/>:<DynamicParameterFields fields={fields} value={isRecord(item)?item:{}} context={context} onChange={next=>onChange(items.map((value,i)=>i===index?next:value))}/>}</div>)}<button type="button" className="border rounded px-3 py-1 text-sm" disabled={disabled} onClick={()=>{const next=field.type==='source-ms-list'?0:field.type==='stage-points'?{}:newControlValue({key:'item',label:'',type:'record',fields},{newId:()=>crypto.randomUUID(),scene:context.scene,rootValue:context.rootValue});onChange([...items,next]);}}>添加一项</button></fieldset>;
 }
 return <div><label htmlFor={id} className="block text-xs mb-1">{label}</label><textarea id={id} className={inputClass} rows={field.key==='provenance'?2:3} value={typeof value==='string'?value:''} disabled={disabled} onChange={event=>onChange(event.target.value)}/></div>;
}

/** Structured draft controls; deliberately not mounted in the workbench yet. */
export function DynamicParameterFields({fields,value,onChange,context}:{fields:DynamicControlField[];value:Values;onChange:(value:Values)=>void;context:FieldContext}){
 const rootedContext=context.rootValue?context:{...context,rootValue:value};
 return <div className="space-y-3">{fields.map(field=><OneControl key={field.key} field={field} value={value[field.key]} siblings={value} context={rootedContext} onChange={next=>onChange(patchControlRecord(fields,value,field.key,next,context.scene,{rootValue:rootedContext.rootValue}))}/>)}</div>;
}
