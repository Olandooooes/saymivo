import React,{useState} from 'react';
import {useEditor} from './store';
import {captionStylePresets,resolveCaptionStyle,sanitizeCaptionStyle,type CaptionStyle} from '../src/caption-style.mjs';
type Saved={id:string;name:string;style:Partial<CaptionStyle>};
const storageKey='saymivo-caption-style-presets-v1';
export const CaptionStylePanel:React.FC=()=>{
 const {presentation,captions,selectedId,setPresentation,pushHistory,setCaptions}=useEditor();
 const selected=captions.find(c=>c.id===selectedId);
 const [local,setLocal]=useState(false),[name,setName]=useState(''),[message,setMessage]=useState('');
 const [saved,setSaved]=useState<Saved[]>(()=>{try{const value=JSON.parse(localStorage.getItem(storageKey)??'[]');return Array.isArray(value)?value.filter(p=>p&&typeof p.name==='string'&&typeof p.id==='string').slice(0,20).map(p=>({...p,style:sanitizeCaptionStyle(p.style)})):[];}catch{return [];}});
 const scope=local&&selected;
 const inherited=scope?{fontSize:Math.round((presentation.style==='reference'?68:62)*(selected.scale??1)),topPct:selected.topPct,...presentation.captionStyle}:presentation.captionStyle;
 const style=resolveCaptionStyle(inherited,scope?selected.styleOverride:undefined);
 const update=(patch:Partial<CaptionStyle>,replace=false)=>{
  if(scope){pushHistory();setCaptions(captions.map(c=>c.id===selected.id?{...c,styleOverride:sanitizeCaptionStyle(replace?patch:{...c.styleOverride,...patch})}:c));}
  else setPresentation({...presentation,captionStyle:sanitizeCaptionStyle(replace?patch:{...style,...patch})});
 };
 const number=(label:string,key:keyof CaptionStyle,min:number,max:number,step=1)=><label className="block text-xs">{label}：{String(style[key])}<input aria-label={`字幕${label}`} type="range" min={min} max={max} step={step} value={Number(style[key])} onChange={e=>update({[key]:Number(e.target.value)})} className="w-full"/></label>;
 const color=(label:string,key:'color'|'accentColor'|'strokeColor'|'backgroundColor')=><label className="flex items-center justify-between text-xs">{label}<input aria-label={`字幕${label}`} type="color" value={style[key]} onChange={e=>update({[key]:e.target.value})}/></label>;
 return <section aria-label="字幕风格设置" className="space-y-4 mb-5">
  <h3 className="font-bold">字幕风格</h3>
  <label className="block text-xs">调整范围<select aria-label="字幕样式调整范围" value={scope?'local':'all'} onChange={e=>setLocal(e.target.value==='local')} className="w-full p-2 bg-surface-container-lowest"><option value="all">全片字幕</option><option value="local" disabled={!selected}>所选字幕 · 单条例外</option></select></label>
  {!presentation.captionStyle&&!scope&&<p className="text-xs opacity-70">选择预设或调整任一项，启用全片样式。旧工程在启用前保持原样。</p>}
  <label className="block text-xs">风格预设<select aria-label="字幕风格预设" value="" onChange={e=>{const p=[...captionStylePresets,...saved].find(p=>p.id===e.target.value);if(p)update(p.style,true);}} className="w-full p-2 bg-surface-container-lowest"><option value="" disabled>选择风格</option>{[...captionStylePresets,...saved].map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
  <label className="block text-xs">字体<select aria-label="字幕字体" value={style.font} onChange={e=>update({font:e.target.value as CaptionStyle['font']})} className="w-full p-2 bg-surface-container-lowest"><option value="pingfang">苹方黑体</option><option value="system">系统无衬线</option><option value="song">宋体</option></select></label>
  {number('字号','fontSize',24,110)}{number('字重','weight',400,900,50)}{number('垂直位置（%）','topPct',5,92)}{number('行距','lineHeight',1,1.8,.05)}
  {color('文字颜色','color')}{color('重点词颜色','accentColor')}{color('描边颜色','strokeColor')}{number('描边粗细','strokeWidth',0,5,.5)}{number('阴影强度','shadow',0,15)}
  {color('底条颜色','backgroundColor')}{number('底条不透明度','backgroundOpacity',0,.95,.05)}
  {scope&&<button type="button" onClick={()=>{pushHistory();setCaptions(captions.map(c=>{if(c.id!==selected.id)return c;const {styleOverride,...rest}=c;return rest;}));}} className="text-xs underline">清除这条例外，跟随全片样式</button>}
  <div className="border-t border-outline-variant/40 pt-3 space-y-2"><label className="block text-xs">保存为我的预设<input aria-label="字幕预设名称" maxLength={32} value={name} onChange={e=>setName(e.target.value)} className="w-full p-2 bg-surface-container-lowest" placeholder="例如：我的底部白字"/></label><button type="button" disabled={!name.trim()} onClick={()=>{const next=[...saved.filter(p=>p.name!==name.trim()),{id:'custom-'+Date.now(),name:name.trim(),style}].slice(-20);try{localStorage.setItem(storageKey,JSON.stringify(next));setSaved(next);setMessage('已保存到本机浏览器，可在其他工程选择。');}catch{setMessage('保存失败，请检查浏览器存储。');}}} className="text-xs underline disabled:opacity-40">保存当前风格</button><p role="status" className="text-xs">{message}</p></div>
  <p className="text-xs opacity-70">实时预览并用于导出。靠近底边时自动留出字幕高度，防止裁字。全片调整保留单条例外；文字、时间与原声不变。预设保存在本机浏览器，项目当前样式随工程保存。</p>
 </section>;
};
