import React,{useCallback,useContext,useEffect,useLayoutEffect,useState}from'react';
import{AbsoluteFill,Img,staticFile,useVideoConfig}from'remotion';
import{DisplayFontContext}from'./DisplayFont';
import{useMeasuredText}from'./MeasuredText';
import{sourceTokenPageState}from'./source-token-transfer.mjs';
import type{TextFit}from'./text-fit.mjs';
import type{ConditionalSetContext}from'./conditional-set.mjs';
import{conditionalSetViewIssues,conditionalSetViewKey,conditionalSetViewFields,conditionalSetViewReadiness,conditionalSetViewSample,type ConditionalSetViewConfig,type ConditionalViewField,type ConditionalViewAssets,type ConditionalViewReadiness}from'./conditional-set-view.mjs';

type Report={id:string;text:string;fit:TextFit|null;family:string};
type Props={config:ConditionalSetViewConfig;context:ConditionalSetContext;sourceMs:number;onReadiness?:(r:ConditionalViewReadiness)=>void};
function Measure({field,onReport}:{field:ConditionalViewField;onReport:(r:Report)=>void}){
 const{width,height}=useVideoConfig(),{fit,family}=useMeasuredText(field.text,field.rect.width*width*.94,field.rect.height*height*.90,{minFont:height*.025,maxFont:height*(field.role==='copy'?.052:.039),weight:600,preferredPhrases:field.text.split('\n')});
 useLayoutEffect(()=>onReport({id:field.id,text:field.text,fit,family}),[field.id,field.text,fit,family,onReport]);return null;
}
function useImages(config:ConditionalSetViewConfig,context:ConditionalSetContext){
 const key=conditionalSetViewKey(config,context),identities=config.actors.map(a=>a.assetIdentity).filter((a):a is NonNullable<typeof a>=>!!a),[state,setState]=useState<ConditionalViewAssets>({key:'',items:[]});
 useEffect(()=>{let current=true;const images:HTMLImageElement[]=[],items=identities.map(a=>({src:a.src,status:'waiting' as 'waiting'|'ready'|'blocked'}));setState({key,items});for(const a of identities){const image=new Image();images.push(image);const finish=(ok:boolean)=>{if(!current)return;setState(p=>p.key===key?{key,items:p.items.map(i=>i.src===a.src?{src:i.src,status:ok?'ready':'blocked'}:i)}:p);};image.onload=()=>finish(image.naturalWidth===a.width&&image.naturalHeight===a.height);image.onerror=()=>finish(false);image.src=staticFile(a.src);}return()=>{current=false;for(const image of images){image.onload=null;image.onerror=null;}};},[key]);return state.key===key?state:null;
}
function Prepared({config,context,sourceMs,onReadiness}:Props){
 const{width,height}=useVideoConfig(),font=useContext(DisplayFontContext),fontKey=font??'system-display-font',key=conditionalSetViewKey(config,context,fontKey),fields=conditionalSetViewFields(config,context),[reports,setReports]=useState<{key:string;fields:Record<string,Report>}>({key:'',fields:{}}),assets=useImages(config,context);
 const report=useCallback((r:Report)=>setReports(p=>{const current=p.key===key?p:{key,fields:{}};return JSON.stringify(current.fields[r.id])===JSON.stringify(r)?p:{key,fields:{...current.fields,[r.id]:r}};}),[key]);
 const current=reports.key===key?reports.fields:{},state=conditionalSetViewSample(config,context,sourceMs),readiness=conditionalSetViewReadiness(config,context,{key,fontKey,fields:Object.values(current)},assets),status=state.status==='blocked'?'blocked':readiness.status,issues=state.status==='blocked'?state.issues:readiness.issues,issueKey=JSON.stringify(issues),elapsed=sourceMs-config.binding.startMs;
 useLayoutEffect(()=>onReadiness?.({status,issues:JSON.parse(issueKey),canApply:false,uiAccepted:false,needsFaceReview:true}),[status,issueKey,onReadiness]);
 const px=(r:{x:number;y:number;width:number;height:number})=>({left:r.x*width,top:r.y*height,width:r.width*width,height:r.height*height});
 return<AbsoluteFill data-experimental-mechanism="conditional-set" data-layout-status={status} style={{pointerEvents:'none'}}>
 {fields.map(f=><Measure key={f.id} field={f} onReport={report}/>)}
 {status==='ready'&&<>
  <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{position:'absolute',inset:0}}>
   {state.sets.filter(s=>s.visible).map(s=>{const r=s.boundary.rect,color=s.parentId?'#7dc8d8':'#a3c9ef',common={fill:'none',stroke:color,strokeWidth:Math.max(2,height*.003),pathLength:1,strokeDasharray:'1',strokeDashoffset:1-s.drawProgress};return<g key={s.id} data-set-id={s.id} data-set-parent={s.parentId??''} data-set-draw-progress={s.drawProgress}>{s.boundary.kind==='ellipse'?<ellipse {...common} cx={(r.x+r.width/2)*width} cy={(r.y+r.height/2)*height} rx={r.width*width/2} ry={r.height*height/2}/>:<rect {...common} x={r.x*width} y={r.y*height} width={r.width*width} height={r.height*height}/>}</g>;})}
   {state.gates.filter(g=>g.visible).map(g=>{const b=config.gates.find(c=>c.id===g.id)!.boundary,outcome=g.outcomes.at(-1)?.result,color=outcome==='blocked'?'#f19a9a':outcome==='allowed'?'#8edcc6':'#b9cbe0';return<line key={g.id} data-gate-id={g.id} data-gate-current-outcome={outcome??'unevaluated'} x1={(b.axis==='x'?b.position:b.min)*width} x2={(b.axis==='x'?b.position:b.max)*width} y1={(b.axis==='y'?b.position:b.min)*height} y2={(b.axis==='y'?b.position:b.max)*height} stroke={color} strokeWidth={height*.006} strokeLinecap="butt"/>;})}
  </svg>
  {state.actors.filter(a=>a.visible).map(a=><div key={a.id} data-conditional-actor={a.id} data-member-set={a.memberSetId} data-motion-event={a.motion?.eventId} data-motion-phase={a.motion?.phase??'held'} style={{position:'absolute',...px(a.rect),boxSizing:'border-box',border:`${Math.max(1,height*.002)}px solid #9ad6ed`,background:a.assetIdentity?'#14253a':'#50728e',borderRadius:height*.003}}>{a.assetIdentity&&<Img src={staticFile(a.assetIdentity.src)} data-conditional-source-image={a.assetIdentity.src} style={{width:'100%',height:'100%',objectFit:'contain'}}/>}</div>)}
  {fields.map(f=>{const r=current[f.id],fit=r?.fit;if(!fit)return null;const page=sourceTokenPageState(fit.pages,elapsed,{atMs:f.atMs,endMs:f.endMs});if(!page.visible)return null;const event=f.eventId?config.events.find(e=>e.id===f.eventId):null;return<div key={f.id} data-measured-text="true" data-conditional-field={f.id} data-condition-gate={f.gateId} data-condition-result={event?.type==='evaluate'?event.expectedResult:undefined} style={{position:'absolute',...px(f.rect),boxSizing:'border-box',background:f.role==='copy'?'#12263ced':f.role==='history'?'#14293be8':undefined,border:f.role==='history'?`1px solid ${event?.type==='evaluate'&&event.expectedResult==='blocked'?'#d98787':'#79bbaa'}`:undefined}}><div style={{position:'absolute',left:'3%',top:'5%',width:'94%',height:'90%',fontFamily:r.family,fontSize:fit.fontSize,fontWeight:600,lineHeight:`${fit.rowHeight}px`,whiteSpace:'pre',color:'#edf4ff'}}>{fit.pages.map((lines,i)=><div key={i} aria-hidden={i!==page.index} data-conditional-page={i} style={{position:'absolute',inset:0,opacity:i===page.index?1:0}}>{lines.map((line,j)=><div key={j}>{line||'\u00a0'}</div>)}</div>)}</div></div>;})}
 </>}
 </AbsoluteFill>;
}
/** Independent overlay: caller retains current real speaker, original audio and
 * captions. Native readiness cannot grant a workbench render receipt. */
export function ConditionalSetScene(props:Props){
 const{width,height}=useVideoConfig(),context={...props.context,viewport:{width,height}},issues=conditionalSetViewIssues(props.config,context),issueKey=JSON.stringify(issues);
 useLayoutEffect(()=>{if(issues.length)props.onReadiness?.({status:'blocked',issues:JSON.parse(issueKey),canApply:false,uiAccepted:false,needsFaceReview:true});},[issueKey,props.onReadiness]);
 return issues.length?<AbsoluteFill data-experimental-mechanism="conditional-set" data-layout-status="blocked" data-mechanism-unavailable={issues.join('；')}/>:<Prepared {...props} context={context}/>;
}
