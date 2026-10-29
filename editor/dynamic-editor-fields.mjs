import {bindConditionalSetViewDraft} from './conditional-set-fields.mjs';
const record=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
function lookup(value,path){return String(path??'').split('.').filter(Boolean).reduce((v,k)=>v?.[k],value);}
/** Adapt independent control contracts into existing structured form controls. */
export function dynamicEditorFields(fields,config){return fields.map(f=>({...f,
 ...(f.type==='source-seconds'?{type:'number',label:f.label+'（原场秒）'}:{}),
 ...(f.type==='path-segment-ref'?{type:'select',options:(config.path?.segments??[]).map(s=>s.id)}:{}),
 ...(f.type==='number-list'?{type:'list',itemFields:[{key:'value',label:'明确数值',type:'number'}]}:{}),
 ...(f.type==='stable-ref-list'?{type:'list',itemFields:[{key:'value',label:'对应原对象',type:'select',options:(lookup(config,f.source)??[]).map(s=>s.id)}]}:{}),
 ...(f.fields?{fields:dynamicEditorFields(f.fields,config)}:{}),...(f.itemFields?{itemFields:dynamicEditorFields(f.itemFields,config)}:{})}));}
function transform(fields,value,decode,newId){
 const out=record(value)?structuredClone(value):{};
 for(const f of fields){const v=out[f.key];
  if(['number-list','stable-ref-list'].includes(f.type)&&Array.isArray(v))out[f.key]=decode?v.map(item=>item?.value):v.map(value=>({value}));
  else if(f.type==='record'&&record(v))out[f.key]=transform(f.fields??[],v,decode,newId);
  else if(f.type==='list'&&Array.isArray(v))out[f.key]=v.map(item=>transform(f.itemFields??[],item,decode,newId));
  if(decode&&f.key==='id'&&f.readonly&&typeof out.id!=='string')out.id=newId();
 }
 return out;
}
export function dynamicEditorFormValue(fields,value){return transform(fields,value,false);}
export function dynamicEditorConfigValue(fields,value,{newId=()=>crypto.randomUUID()}={}){return transform(fields,value,true,newId);}

/** Only this evidence path can supply the readonly full-frame target identity. */
export function dynamicEditorBindSourceEvidence(config,scene,assets=[]){
 const next=structuredClone(config);
 if(next.kind==='conditional-set')return bindConditionalSetViewDraft(next,scene,assets);
 if(next.kind==='typed-data-clock'){
  for(const key of ['durationTracks','eventTracks','receiptTracks'])next[key]=(next[key]??[]).map(t=>{const ns=(scene.nodes??[]).filter(n=>n.id===t.nodeId),n=ns.length===1?ns[0]:undefined,expectedText=n?[n.text,n.detail,...(n.bullets??[])].filter(s=>typeof s==='string'&&s.length).join('\n'):undefined;const value=t.value?.basis==='source-elapsed'?{basis:'source-elapsed'}:t.value;return {...t,expectedText,...(key==='durationTracks'?{value}:{})};});
 }
 if(next.kind==='persistent-entities'){
  const source=id=>{const ns=(scene.nodes??[]).filter(n=>n.id===id);return ns.length===1?ns[0]:undefined;},full=n=>n?[n.text,n.detail,...(n.bullets??[])].filter(t=>typeof t==='string'&&t.length).join('\n'):undefined;
  if(next.mediaStack){const r=next.mediaStack;r.anchorExpectedText=full(source(r.anchorNodeId));r.items=(r.items??[]).map(i=>{const n=source(i.nodeId),a=assets.find(a=>a.src===n?.assetSrc&&a.kind==='image'&&/^[a-f0-9]{64}$/i.test(a.sha256??'')&&[a.width,a.height].every(v=>Number.isSafeInteger(v)&&v>0));return {...i,expectedText:full(n),assetIdentity:a?{kind:'image',src:a.src,sha256:a.sha256,width:a.width,height:a.height}:undefined};});}
  if(next.checklist){const r=next.checklist;r.archiveExpectedText=full(source(r.archiveNodeId));r.items=(r.items??[]).map(i=>({...i,expectedText:full(source(i.nodeId))}));}
 }
 if(next.kind==='full-frame-blur-zoom'){
  if(next.target?.kind==='source-video')next.target={kind:'source-video'};
  else if(next.target?.kind==='scene-image'){
   const nodeId=next.target.nodeId,src=nodeId?scene.nodes?.find(n=>n.id===nodeId)?.assetSrc:scene.media?.src,asset=assets.find(a=>a.src===src&&a.kind==='image'&&/^[a-f0-9]{64}$/i.test(a.sha256??'')&&[a.width,a.height].every(n=>Number.isSafeInteger(n)&&n>0));
   next.target={kind:'scene-image',...(nodeId?{nodeId}:{}),identity:asset?{src:asset.src,sha256:asset.sha256,width:asset.width,height:asset.height,kind:'image'}:undefined};
  }
 }
 return next;
}
