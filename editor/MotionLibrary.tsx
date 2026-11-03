import React,{useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {Player} from '@remotion/player';
import {MultiClipVideo} from '../src/MultiClipVideo';
import {visualPreset,visualPresets,suggestVisualPresets,visualPresetIssues,type VisualPresetId} from '../src/visual-presets.mjs';
import {projectStoryboard,matchingSource} from '../src/storyboard.mjs';
import {presentationSize} from '../src/presentation.mjs';
import {totalDurationFrames} from '../src/timeline';
import {applyVisualPresetToStore} from './apply-visual-preset.mjs';
import {useEditor} from './store';
import {TextLayoutReportContext,type TextLayoutReport} from '../src/MeasuredText';
import {evidenceGroups} from '../src/diagram-layout.mjs';
import {generateMotionPlan,updateMotionPlanSelection,applyMotionPlanToStore,motionPlanSignature,type MotionPlan,type MotionPlanRow,type PlanChoice} from '../src/motion-planner.mjs';
import {loadDisplayFont} from '../src/DisplayFont';
import {displayFontFamily} from '../src/display-fonts.mjs';
import {ReferenceMechanisms} from './ReferenceMechanisms';
import {DynamicMotionEditor} from './DynamicMotionEditor';
import {DynamicMotionPlanner} from './DynamicMotionPlanner';

export function MotionLibrary({onClose}:{onClose:()=>void}){
 const s=useEditor(),dialog=useRef<HTMLDialogElement>(null);
 const active=projectStoryboard(s.presentation.scenes,s.clips,s.meta?.fps??30).find(scene=>s.currentFrame/(s.meta?.fps??30)*1000>=scene.startMs&&s.currentFrame/(s.meta?.fps??30)*1000<scene.endMs);
 const [sceneId,setSceneId]=useState(active?.sourceId??s.presentation.scenes?.[0]?.id??'');
 const scene=s.presentation.scenes?.find(item=>item.id===sceneId),[choice,setChoice]=useState<PlanChoice>(scene?.visualPreset?.id??'keep'),[side,setSide]=useState<'left'|'right'>(scene?.visualPreset?.side??'left'),[message,setMessage]=useState('');
 const [dynamicEntryId,setDynamicEntryId]=useState<string|undefined>();
 const [mode,setMode]=useState<'references'|'single'|'dynamic'|'dynamic-plan'|'plan'>('references'),[plan,setPlan]=useState<MotionPlan|null>(null),[preserveExisting,setPreserveExisting]=useState(true),[generating,setGenerating]=useState(false);
 const [primaryNodeIds,setPrimaryNodeIds]=useState<string[]|null>(scene?.visualPreset?.primaryNodeIds??null),primaryKey=JSON.stringify(primaryNodeIds);
 const settings=choice==='keep'?undefined:{id:choice,version:1 as const,side,...(choice==='grouped-evidence'&&primaryNodeIds!==null?{primaryNodeIds}:{})};
 const candidate=scene?(settings?{...scene,visualPreset:settings}:scene):null;
 const primaryMembers=candidate?evidenceGroups(candidate).primary.map(n=>n.id):[];
 const [reports,setReports]=useState<Record<string,TextLayoutReport>>({});
 const report=useCallback((value:TextLayoutReport)=>setReports(previous=>previous[value.key]?previous:{...previous,[value.key]:value}),[]);
 useEffect(()=>setReports({}),[sceneId,choice,side,primaryKey]);
 useEffect(()=>{const element=dialog.current;element?.showModal();return()=>element?.close();},[]);
 const size=presentationSize(s.presentation),fps=s.meta?.fps??30;
 const preview=useMemo(()=>{
  if(!scene)return null;
  const clips=s.clips.filter(clip=>matchingSource(scene,clip)&&clip.outSec*1000>scene.startMs&&clip.inSec*1000<scene.endMs).map(clip=>({...clip,inSec:Math.max(clip.inSec,scene.startMs/1000),outSec:Math.min(clip.outSec,scene.endMs/1000)}));
  return {clips,captions:s.captions,brolls:s.brolls,music:null,accentColor:s.accentColor,presentation:{...s.presentation,scenes:[candidate!]}};
 },[scene,s.clips,s.captions,s.brolls,s.accentColor,s.presentation,choice,side,primaryKey]);
 const issues=candidate?(choice==='keep'?[]:visualPresetIssues(candidate,choice)):['先添加或选择一个分镜'];
 if(Object.values(reports).some(r=>r.unplaceable))issues.push('当前文字区无法容纳最小可读字号，请换一侧或预设');
 const suggestions=scene?suggestVisualPresets(scene):[];
 const apply=(id:VisualPresetId|null)=>{const result=applyVisualPresetToStore(useEditor,sceneId,id,{side,...(primaryNodeIds!==null?{primaryNodeIds}:{})});setMessage(result.ok?(result.changed?'已应用本场，可撤销一次还原。':'本场已使用这一设置。'):result.error);};
 const preset=visualPreset(choice);
 const stale=!!plan&&plan.signature!==motionPlanSignature(s);
 const previewRow=(row:MotionPlanRow)=>{const item=s.presentation.scenes?.find(scene=>scene.id===row.sceneId);setSceneId(row.sceneId);setChoice(row.selected);setSide(row.options.side??item?.visualPreset?.side??'left');setPrimaryNodeIds(row.options.primaryNodeIds??item?.visualPreset?.primaryNodeIds??null);setMessage('');};
 const generate=async()=>{
  setGenerating(true);setMessage('');
  try{
   const state=useEditor.getState(),signature=motionPlanSignature(state);await loadDisplayFont(state.presentation.displayFont);
   if(signature!==motionPlanSignature(useEditor.getState()))throw Error('字体准备时工程已变化，请重新生成');
   const canvas=document.createElement('canvas').getContext('2d');if(!canvas)throw Error('当前浏览器无法测量完整文字');
   const family=displayFontFamily(state.presentation.displayFont);
   const generated=generateMotionPlan(state,{preserveExisting,measure:(text,size,weight)=>{canvas.font=`${weight} ${size}px ${family}`;const metrics=canvas.measureText(text);return {width:metrics.width,ascent:metrics.actualBoundingBoxAscent,descent:metrics.actualBoundingBoxDescent};}});
   setPlan(generated);if(generated.rows.length)previewRow(generated.rows.find(row=>row.sceneId===sceneId)??generated.rows[0]);setMessage(`已生成${generated.rows.length}场本地规则方案。请逐场预览并修改后应用。`);
  }catch(error){setMessage(error instanceof Error?error.message:'方案生成失败，请重试');}finally{setGenerating(false);}
 };
 const changePlanChoice=(row:MotionPlanRow,selected:PlanChoice)=>{if(!plan)return;const result=updateMotionPlanSelection(plan,row.sceneId,selected);if(!result.ok){setMessage(result.error);return;}setPlan(result.plan);previewRow(result.plan.rows.find(item=>item.sceneId===row.sceneId)!);};
 const applyPlan=()=>{if(!plan)return;const result=applyMotionPlanToStore(useEditor,plan);setMessage(result.ok?(result.changed?'整案已应用，一次撤销可还原全部视觉选择。':'方案全部保留当前编排，没有改动。'):result.error);};
 return <dialog ref={dialog} aria-labelledby="motion-library-title" className="bg-surface-container text-on-surface border border-outline-variant rounded-xl p-0 w-[min(1240px,96vw)] max-h-[94vh] backdrop:bg-black/70" onKeyDown={e=>e.stopPropagation()} onCancel={e=>{e.preventDefault();onClose();}}>
  <div className="sticky top-0 z-10 bg-surface-container border-b border-outline-variant p-4 flex justify-between"><div><h2 id="motion-library-title" className="font-bold">动效库 · 先按口播生成呈现方案</h2><a href="/motion-review" target="_blank" rel="noreferrer" className="inline-block text-sm underline mt-2">打开逐项播放与原片对照验收页 ↗</a><p className="text-xs opacity-70 mt-1">本地语义规则 · 不上传口播文字。原声、字幕、内容和源时间不变。</p><div className="flex flex-wrap gap-3 mt-3"><button type="button" aria-pressed={mode==='references'} onClick={()=>setMode('references')} className="border rounded px-3 py-1">1. 五条参考机制清单</button><button type="button" aria-pressed={mode==='single'} onClick={()=>{setMode('single');if(choice==='keep')setChoice(scene?.visualPreset?.id??'type-relay');}} className="border rounded px-3 py-1">2. 可用动效与预览</button><button type="button" aria-pressed={mode==='dynamic'} onClick={()=>setMode('dynamic')} className="border rounded px-3 py-1">3. 动态机制与参数</button><button type="button" aria-pressed={mode==='dynamic-plan'} onClick={()=>setMode('dynamic-plan')} className="border rounded px-3 py-1">4. 按内容生成动效建议</button><button type="button" aria-pressed={mode==='plan'} onClick={()=>setMode('plan')} className="border rounded px-3 py-1">5. 基础编排方案</button></div></div><button type="button" onClick={onClose} aria-label="关闭动效库">关闭</button></div>
  <div hidden={mode!=='dynamic-plan'}><DynamicMotionPlanner onPreview={(id,entryId)=>{setSceneId(id);setDynamicEntryId(entryId);setMode('dynamic');}}/></div>
  {mode==='references'&&<ReferenceMechanisms onTryDynamic={id=>{setDynamicEntryId(id);setMode('dynamic');}} onTry={id=>{setMode('single');setChoice(id);setMessage('相关能力仅覆盖清单所列已实现部分，请完整预览本场。');}}/>}
  {mode==='dynamic'&&<div className="p-4"><label className="block text-sm mb-4">当前分镜<select aria-label="动态机制当前分镜" className="bg-surface-container-lowest p-2 ml-3 max-w-full" value={sceneId} onChange={e=>setSceneId(e.target.value)}><option value="" disabled>选择分镜</option>{s.presentation.scenes?.map((item,i)=><option key={item.id} value={item.id}>{i+1}. {item.title}</option>)}</select></label><DynamicMotionEditor sceneId={sceneId} initialEntryId={dynamicEntryId}/></div>}
  {mode==='plan'&&<div className="p-4 border-b border-outline-variant"><p className="text-sm">匹配当前保留范围内的字幕与场景内容，再检查素材、真实遮挡层、字量时长和人物安全区；同类近分表达才会减少相邻重复，不为换花样牺牲语义。</p><div className="flex flex-wrap items-center gap-4 mt-3"><label className="text-sm flex gap-2"><input type="checkbox" checked={preserveExisting} onChange={e=>setPreserveExisting(e.target.checked)}/>生成时保留已有人选的动效</label><button type="button" disabled={generating||!s.presentation.scenes?.length} onClick={generate} className="px-4 py-2 bg-primary-container text-on-primary-container rounded disabled:opacity-40">{generating?'正在测字与分析…':plan?'重新生成方案':'生成全片动效方案'}</button><button type="button" disabled={!plan||stale||generating} onClick={applyPlan} className="px-4 py-2 border rounded disabled:opacity-40">应用整案 · 一次撤销</button></div>{stale&&<p role="alert" className="text-sm text-amber-300 mt-2">工程已变化，旧方案已失效。请重新生成后再应用。</p>}<p className="text-xs opacity-70 mt-2">逐场“保留当前编排”可锁住人工决定；修改单选只改方案，应用整案才写入工程。未应用前关闭窗口会丢弃草稿。字量预算是提示，不能替代完整播放。</p></div>}
  {(mode==='single'||mode==='plan')&&<div className="p-4 grid lg:grid-cols-[320px_1fr] gap-5">
   <div>{mode==='plan'?<div className="space-y-3">{!plan&&<p role="status" className="text-sm opacity-70">先生成全片方案，再逐场预览推荐、依据和前置不足。</p>}{plan?.rows.map((row,index)=><article key={row.sceneId} className={`border rounded-lg p-3 ${sceneId===row.sceneId?'border-primary':'border-outline-variant/50'}`}><button type="button" className="text-left w-full font-bold text-sm" onClick={()=>previewRow(row)}>{index+1}. {row.title}</button><p className="text-xs opacity-70 mt-1">源{(row.sourceStartMs/1000).toFixed(2)}–{(row.sourceEndMs/1000).toFixed(2)}秒 · 有效阅读{(row.retainedMs/1000).toFixed(2)}秒 · {row.characters}字</p><label className="block text-xs mt-2">本场选择<select aria-label={`方案分镜${index+1}动效`} className="w-full bg-surface-container-lowest p-2 mt-1" value={row.selected} onChange={e=>changePlanChoice(row,e.target.value as PlanChoice)}><option value="keep">保留当前编排</option>{visualPresets.map(item=>{const option=row.candidates.find(candidate=>candidate.id===item.id);return <option key={item.id} value={item.id} disabled={!!option?.issues.length}>{item.name}{option?.issues.length?' · 条件不足':option&&!option.automaticAllowed?' · 需复核':''}</option>;})}</select></label><p className="text-xs mt-2">规则推荐：{visualPreset(row.recommended??undefined)?.name??'保留当前编排'}{row.recommended?' · '+(row.candidates.find(candidate=>candidate.id===row.recommended)?.reasons.join('；')??''):''}</p><p className="text-xs mt-1">{row.reasons.join('；')}</p>{row.signals.length>0&&<p className="text-xs opacity-70 mt-1">识别：{row.signals.map(signal=>`${signal.label}（${signal.terms.join('、')}）`).join('；')}</p>}{row.warnings.map(warning=><p key={warning} className="text-xs text-amber-300 mt-1">{warning}</p>)}<details className="text-xs mt-2"><summary>口播依据与前置不足</summary><p className="whitespace-pre-wrap mt-2">{row.spokenText||'没有可确认的保留字幕'}</p>{row.candidates.filter(candidate=>candidate.issues.length||!candidate.automaticAllowed).map(candidate=><p key={candidate.id} className="opacity-70 mt-1">{visualPreset(candidate.id)?.name}：{[...candidate.issues,...candidate.warnings].join('；')}</p>)}</details><button type="button" onClick={()=>previewRow(row)} className="text-xs underline mt-2">完整循环预览本场</button></article>)}</div>:<><label className="block text-sm">当前分镜<select aria-label="动效库当前分镜" className="w-full bg-surface-container-lowest p-2 mt-2" value={sceneId} onChange={e=>{const item=s.presentation.scenes?.find(x=>x.id===e.target.value);setSceneId(e.target.value);setChoice(item?.visualPreset?.id??'type-relay');setSide(item?.visualPreset?.side??'left');setPrimaryNodeIds(item?.visualPreset?.primaryNodeIds??null);setMessage('');}}><option value="" disabled>选择分镜</option>{s.presentation.scenes?.map((item,i)=><option key={item.id} value={item.id}>{i+1}. {item.title}</option>)}</select></label>
    <div className="space-y-2 mt-4">{visualPresets.map(item=>{const recommendation=suggestions.find(r=>r.id===item.id);return <button key={item.id} type="button" aria-pressed={choice===item.id} onClick={()=>{setChoice(item.id);setMessage('');}} className={`w-full text-left rounded-lg border p-3 ${choice===item.id?'border-primary bg-primary/10':'border-outline-variant/40'}`}><strong>{item.name}</strong><small className="block opacity-70">{item.intent} · {item.id==='person-backdrop'?'真实遮挡层':item.id==='floating-evidence'?'2.5D＋真实素材':item.id==='fine-process'?'1—6个对象':'完整文字适配'}</small><p className="text-xs mt-2">{recommendation?.issues.length?recommendation.issues.join('；'):recommendation?.reason??item.description}</p></button>;})}</div>
   </>}</div>
   <div className="self-start lg:sticky lg:top-44">{scene&&preview&&preview.clips.length>0&&issues.length===0?<TextLayoutReportContext.Provider value={report}><Player key={`${sceneId}-${choice}-${side}-${primaryKey}`} component={MultiClipVideo} inputProps={preview} compositionWidth={size.width} compositionHeight={size.height} fps={fps} durationInFrames={totalDurationFrames(preview.clips,fps)} controls autoPlay loop initiallyMuted style={{width:'100%',maxHeight:'58vh',aspectRatio:`${size.width}/${size.height}`,borderRadius:10,background:'#111'}}/></TextLayoutReportContext.Provider>:<div className="rounded-lg bg-black/30 p-12 text-center" role="status">{issues.join('；')||'本场尚未对应到可播放的原片范围'}</div>}
    <p className="text-sm mt-3">{preset?.description}</p>
    <label className="block text-sm mt-3">文字/证据区域<select aria-label="动效内容避让方向" disabled={mode==='plan'} value={side} onChange={e=>setSide(e.target.value as 'left'|'right')} className="ml-3 bg-surface-container-lowest p-2"><option value="left">人物左侧</option><option value="right">人物右侧</option></select>{mode==='plan'&&<small className="block opacity-70 mt-1">方案已按整场人物窗包络选择可用侧；细调可切换逐场手动模式。</small>}</label>
    {mode==='single'&&choice==='grouped-evidence'&&<fieldset className="mt-3 p-3 border border-outline-variant/40 rounded"><legend className="text-sm">宽主组包含哪些对象</legend><p className="text-xs opacity-70 mb-2">未选对象进入独立窄组；只保存分组关系，不改对象原文与ID。</p>{scene?.nodes?.map(node=><label key={node.id} className="flex gap-2 text-sm mt-1"><input type="checkbox" aria-label={'主组对象 '+node.id} checked={primaryMembers.includes(node.id)} onChange={e=>setPrimaryNodeIds(e.target.checked?[...primaryMembers,node.id]:primaryMembers.filter(id=>id!==node.id))}/><span>{node.text}</span></label>)}</fieldset>}
    <p className="text-xs opacity-70 mt-2">按人物窗留出空间，完整文字使用所选字体实测并分行；空间不足会完整分页。全幅真人请在预览中确认脸部、手部和字幕避让，当前不做连续人脸跟踪。</p>
    {Object.values(reports).some(r=>r.pages>1)&&<p className="text-xs text-amber-300 mt-2">本场有较长文字，将完整分为最多{Math.max(...Object.values(reports).map(r=>r.pages))}页；请播放整场确认阅读时间，或选择更适合的表达。</p>}
    <p className="text-xs opacity-70 mt-2">{preset?.provenance?<><a href={preset.provenance.url} target="_blank" rel="noreferrer" className="underline">机制参考：{preset.provenance.creator}</a> · 发布{preset.provenance.publishedAt} · {preset.provenance.timeRange}（原创自适应实现）</>:'原创实现 / 我的偏好；不标为博主最近作品来源'}</p>
    {mode==='single'&&<div className="flex gap-3 mt-4"><button type="button" disabled={choice==='keep'||issues.length>0||!preview?.clips.length} onClick={()=>{if(choice!=='keep')apply(choice);}} className="px-4 py-2 bg-primary-container text-on-primary-container rounded disabled:opacity-40">应用本场</button><button type="button" disabled={!scene?.visualPreset} onClick={()=>apply(null)} className="px-4 py-2 border border-outline-variant rounded disabled:opacity-40">恢复本场原编排</button></div>}<p role="status" className="text-sm mt-3">{message}</p>
    <p className="text-xs opacity-60 mt-4">当前方案仅在7类已实现能力与保留当前编排之间选择，不代表五条参考的所有机制均已实现。完整三维与不等大小纸张翻页尚未实现。</p>
   </div>
  </div>}
 </dialog>;
}
