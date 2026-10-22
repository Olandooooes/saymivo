import React,{useEffect,useRef,useState} from 'react';
type Region={id:string;x:number;y:number;w:number;h:number;cue?:string;color?:string};
type PickerProps={src:string;regions:Region[];onChange:(id:string,box:{x:number;y:number;w:number;h:number})=>void;preview?:React.ReactNode;selectedId?:string;onSelectedIdChange?:(id:string)=>void;targetLabel?:string;drawLabel?:string;drawingHint?:string;disabled?:boolean};
export function MediaRegionPicker({src,regions,onChange,preview,selectedId,onSelectedIdChange,targetLabel='图片框选目标',drawLabel='在图片上重画区域',drawingHint='在下图拖出目标区域；松开应用，Esc取消。保存到配画库后供后续生成使用。',disabled=false}:PickerProps){
 const [selected,setSelected]=useState(regions[0]?.id??''),[drawing,setDrawing]=useState(false),[draft,setDraft]=useState<Region|null>(null);
 const active=selectedId??selected;
 const select=(id:string)=>{setSelected(id);onSelectedIdChange?.(id);};
 const drag=useRef<{x:number;y:number;pointerId:number}|null>(null);
 useEffect(()=>{if(!regions.some(r=>r.id===active)){const id=regions[0]?.id??'';setSelected(id);onSelectedIdChange?.(id);}},[regions,active,onSelectedIdChange]);
 useEffect(()=>{setDrawing(false);setDraft(null);drag.current=null;},[src]);
 useEffect(()=>{if(disabled){setDrawing(false);setDraft(null);drag.current=null;}},[disabled]);
 const point=(e:React.PointerEvent<HTMLDivElement>)=>{const r=e.currentTarget.getBoundingClientRect();return {x:Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),y:Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))};};
 const box=(a:{x:number;y:number},b:{x:number;y:number})=>({x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),w:Math.abs(a.x-b.x),h:Math.abs(a.y-b.y)});
 const cancel=()=>{drag.current=null;setDraft(null);setDrawing(false);};
 return <div className="mt-2"><label>框选目标<select aria-label={targetLabel} value={active} onChange={e=>{cancel();select(e.target.value);}}>{regions.map((r,i)=><option key={r.id} value={r.id}>{i+1} · {r.cue||'尚未填写触发词'}</option>)}</select></label><button type="button" disabled={!active||disabled} aria-pressed={drawing} onClick={()=>drawing?cancel():setDrawing(true)}>{drawing?'取消框选':drawLabel}</button>{drawing&&<p role="status">{drawingHint}</p>}
 <div aria-label="讲义区域框选画布" tabIndex={drawing?0:undefined} onKeyDown={e=>{if(e.key==='Escape')cancel();}} style={{position:'relative',marginTop:8,cursor:drawing?'crosshair':undefined,touchAction:drawing?'none':undefined,userSelect:'none'}}
 onPointerDown={e=>{if(!drawing||!active||disabled||e.button!==0)return;e.preventDefault();e.currentTarget.focus();e.currentTarget.setPointerCapture(e.pointerId);drag.current={...point(e),pointerId:e.pointerId};setDraft({id:active,...point(e),w:0,h:0});}}
 onPointerMove={e=>{if(drag.current?.pointerId===e.pointerId)setDraft({id:active,...box(drag.current,point(e))});}}
 onPointerUp={e=>{const start=drag.current;if(!start||start.pointerId!==e.pointerId)return;const value=box(start,point(e)),r=e.currentTarget.getBoundingClientRect();if(!disabled&&value.w*r.width>=3&&value.h*r.height>=3)onChange(active,value);cancel();if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}}
 onPointerCancel={cancel}>
 {preview??<img src={'/'+src} alt="素材标记模板预览" draggable={false} style={{width:'100%',display:'block',pointerEvents:'none'}}/>}
 <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{position:'absolute',inset:0,width:'100%',height:'100%',pointerEvents:'none'}}>{regions.map(r=>{const b=draft?.id===r.id?draft:r;return <rect key={r.id} x={b.x*100} y={b.y*100} width={b.w*100} height={b.h*100} fill={r.color??'#ffd94d'} fillOpacity={r.id===active ? .4 : .13} stroke={r.id===active?'#e78127':'#7d8ea8'} strokeWidth={r.id===active?'.65':'.3'}/>;})}</svg>
 </div></div>;
}
