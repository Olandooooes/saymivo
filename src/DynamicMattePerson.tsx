import React,{useEffect,useLayoutEffect,useMemo,useRef,useState}from'react';
import{Img,staticFile,delayRender,continueRender,cancelRender,getRemotionEnvironment}from'remotion';
import{bindDynamicMatteElement,dynamicMatteFrameAt,type DynamicMatteEvidence,type DynamicMatteFrame}from'./dynamic-matte.mjs';
type Resource={key:string;url:string;inverseUrl:string;frame:DynamicMatteFrame};
const cache=new Map<string,Promise<Resource>>();
const frameKey=(e:DynamicMatteEvidence,f:DynamicMatteFrame)=>e.sequenceSha256+':'+f.index+':'+f.sha256;
const digest=async(bytes:ArrayBuffer)=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');
/** Cache only immutable checked bytes. Both foreground and inverse-alpha background use this exact PNG. */
export function loadDynamicMatteFrame(e:DynamicMatteEvidence,f:DynamicMatteFrame):Promise<Resource>{
 const key=frameKey(e,f);if(cache.has(key)){const value=cache.get(key)!;cache.delete(key);cache.set(key,value);return value;}
 const pending=(async()=>{const response=await fetch(staticFile(f.src));if(!response.ok)throw Error('人物PNG读取失败');const bytes=await response.arrayBuffer();if(await digest(bytes)!==f.sha256)throw Error('人物PNG字节已变化，请重新预览');const url=URL.createObjectURL(new Blob([bytes],{type:'image/png'}));try{const image=new Image();image.src=url;await image.decode();if(image.naturalWidth!==f.width||image.naturalHeight!==f.height)throw Error('人物PNG实际解码尺寸已改变');const canvas=document.createElement('canvas');canvas.width=f.width;canvas.height=f.height;const context=canvas.getContext('2d');if(!context)throw Error('无法读取实际人物透明通道');context.fillStyle='white';context.fillRect(0,0,f.width,f.height);context.globalCompositeOperation='destination-out';context.drawImage(image,0,0);const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('人物反向透明遮罩失败')),'image/png'));return{key,url,inverseUrl:URL.createObjectURL(blob),frame:f};}catch(error){URL.revokeObjectURL(url);throw error;}})();
 cache.set(key,pending);while(cache.size>64){const oldest=cache.keys().next().value!,retired=cache.get(oldest)!;cache.delete(oldest);void retired.then(r=>{URL.revokeObjectURL(r.url);URL.revokeObjectURL(r.inverseUrl);},()=>{});}pending.catch(()=>cache.delete(key));return pending;
}
export function useDynamicMatteFrame(evidence:DynamicMatteEvidence|undefined,sourceMs:number){
 const frame=dynamicMatteFrameAt(evidence,sourceMs),key=evidence&&frame?frameKey(evidence,frame):'',rendering=getRemotionEnvironment().isRendering;
 const [state,setState]=useState<{key:string;resource?:Resource;error?:string}>({key:''});
 const handle=useMemo(()=>rendering&&key?delayRender('读取已核验的实际RGBA人物源帧'):null,[rendering,key]);
 useEffect(()=>{let alive=true,released=false;const release=()=>{if(handle!==null&&!released){released=true;continueRender(handle);}};if(!evidence||!frame){setState({key,error:evidence?'人物帧未覆盖当前源时间':undefined});release();return;}
  loadDynamicMatteFrame(evidence,frame).then(resource=>{if(alive)setState({key,resource});}).catch(error=>{if(alive){setState({key,error:String(error.message??error)});if(rendering)cancelRender(error);}}).finally(()=>{release();});
  // A few source frames ahead amortize local PNG decode; this is not evidence
  // of visibility. Only the actual mounted current Img can certify a person.
  if(!rendering)for(const f of evidence.frames.slice(frame.index+1,frame.index+5))void loadDynamicMatteFrame(evidence,f).catch(()=>{});
  return()=>{alive=false;release();};
 },[key,handle]);
 return state.key===key?{...state,frame}:{key,frame};
}
export function DynamicMattePerson({resource,draftKey,sequenceSha256,style,outerStyle,fallback,onStatus}:{resource?:Resource;draftKey:string;sequenceSha256:string;style:React.CSSProperties;outerStyle:React.CSSProperties;fallback:React.ReactNode;onStatus:(value:{key:string;status:'waiting'|'blocked'|'ready'})=>void}){
 const ref=useRef<HTMLImageElement>(null),key=resource?.key??'waiting',[loaded,setLoaded]=useState('');
 // Readiness is keyed by actual PNG identity; mounting is never ready.
 // Do not reset in a passive effect after a cached image's onLoad has fired.
 const ready=resource&&loaded===key;
 useLayoutEffect(()=>{if(!resource||!ready||!ref.current)return;const element=ref.current;if(!element.complete||(element.currentSrc||element.src)!==resource.url||element.naturalWidth!==resource.frame.width||element.naturalHeight!==resource.frame.height)return;return bindDynamicMatteElement(element,{draftKey,sequenceSha256,frameSha256:resource.frame.sha256,frameIndex:resource.frame.index,sourceMs:resource.frame.sourceMs,blobUrl:resource.url,checkedBytes:true});},[resource,ready,draftKey,sequenceSha256]);
 return <div data-dynamic-real-matte="true" style={{width:'100%',height:'100%',position:'relative'}}>{!ready&&fallback}{resource&&<div style={{...outerStyle,position:'absolute',inset:0}}><Img ref={ref} data-dynamic-matte-frame={resource.frame.index} src={resource.url} style={{...style,position:'absolute',inset:0,opacity:ready?1:0}} onLoad={event=>{const image=event.currentTarget;if((image.currentSrc||image.src)!==resource.url)return;if(image.naturalWidth===resource.frame.width&&image.naturalHeight===resource.frame.height){setLoaded(key);onStatus({key,status:'ready'});}else onStatus({key,status:'blocked'});}} onError={()=>onStatus({key,status:'blocked'})}/></div>}</div>;
}
