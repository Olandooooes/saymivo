// Draft-only form helpers. They never edit a project, source text or asset identity.
import {sourceTokenGraphemes} from '../src/source-token-transfer.mjs';
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const own=(object,key)=>Object.hasOwn(object??{},key);
const fullNode=node=>node?[node.text,node.detail,...(node.bullets??[])].filter(text=>typeof text==='string'&&text.length).join('\n'):'';
const sourceTokenConfig=value=>record(value)&&value.kind==='source-token-transfer';
const uniqueNode=(scene,id)=>{const nodes=(scene?.nodes??[]).filter(node=>node.id===id);return nodes.length===1?nodes[0]:undefined;};

/** Source IDs belong to config.sources, and are deliberately not scene node IDs. */
export function sourceTokenControlOptions(rootValue,scene){
 if(!sourceTokenConfig(rootValue)||!Array.isArray(rootValue.sources))return [];
 return rootValue.sources.flatMap((source,index)=>{
  if(!record(source)||typeof source.id!=='string'||!source.id||rootValue.sources.filter(item=>item?.id===source.id).length!==1)return [];
  const node=uniqueNode(scene,source.nodeId),text=fullNode(node);
  return node&&text.trim()&&source.expectedText===text?[{value:source.id,label:`第${index+1}句 · ${text}`,text,nodeId:node.id,graphemeCount:sourceTokenGraphemes(text).length}]:[];
 });
}

function sourceTokenDerived(token,rootValue,scene){
 const source=sourceTokenControlOptions(rootValue,scene).find(option=>option.value===token.sourceId),range=token.range;
 if(!source||!record(range)||!Number.isInteger(range.start)||!Number.isInteger(range.end)||range.start<0||range.end<=range.start||range.end>source.graphemeCount)return {};
 const text=sourceTokenGraphemes(source.text).slice(range.start,range.end).map(piece=>piece.text).join('');
 return text.trim()&&!/[\r\n]/.test(text)?{nodeId:source.nodeId,text}:{};
}

function syncSourceTokens(value,scene){
 if(!sourceTokenConfig(value))return value;
 // Resync sources first, so changing a source's node also updates its tokens in
 // the same draft edit. Invalid/removed references cannot retain old copy.
 if(Array.isArray(value.sources))value.sources=value.sources.map(source=>record(source)?{...source,expectedText:fullNode(uniqueNode(scene,source.nodeId))}:source);
 if(Array.isArray(value.tokens))value.tokens=value.tokens.map(token=>{
  if(!record(token))return token;
  const next={...token},derived=sourceTokenDerived(token,value,scene);
  for(const key of ['nodeId','text'])if(own(derived,key))next[key]=derived[key];else delete next[key];
  return next;
 });
 return value;
}

export function controlFieldValue(field,value,{scene,siblings={},rootValue}={}){
 if(own(field,'fixed'))return field.fixed;
 if(['persistent-entities','typed-data-clock'].includes(rootValue?.kind)&&field.readonly&&field.source==='scene-node-complete-text'){const n=uniqueNode(scene,siblings.nodeId);return n?fullNode(n):undefined;}
 if(sourceTokenConfig(rootValue)&&field.readonly){
  if(field.key==='expectedText')return fullNode(uniqueNode(scene,siblings.nodeId));
  if(field.key==='nodeId'||field.key==='text')return sourceTokenDerived(siblings,rootValue,scene)[field.key];
 }
 if(field.readonly&&field.source==='scene-node-complete-text'){const n=scene?.nodes?.find(node=>node.id===siblings.nodeId);return n?[n.text,n.detail,...(n.bullets??[])].filter(v=>typeof v==='string'&&v.length).join('\n'):'';}
 if(field.readonly&&field.source==='scene-node-text')return scene?.nodes?.find(node=>node.id===siblings.nodeId)?.text??'';
 return value;
}

export function newControlValue(field,{newId=()=>'',scene,siblings={},rootValue}={}){
 if(own(field,'fixed'))return structuredClone(field.fixed);
 if(field.key==='id'&&field.readonly)return newId();
 if(field.readonly)return controlFieldValue(field,undefined,{scene,siblings,rootValue});
 if(field.type==='list'||['source-ms-list','node-ref-list','stage-points'].includes(field.type))return [];
 if(field.type==='record')return Object.fromEntries((field.fields??[]).map(child=>[child.key,newControlValue(child,{newId,scene,siblings,rootValue})]).filter(([,value])=>value!==undefined));
 if(field.type==='node-time-map')return Object.fromEntries((scene?.nodes??[]).map(node=>[node.id,node.atMs??0]));
 if(field.type==='boolean')return false;
 if(field.type==='select')return field.source==='explicit-choice'?undefined:field.options?.[0];
 if(field.type==='text')return field.key==='id'?newId():'';
 // No default number, ROI, source dimensions or statistical result is invented.
 return undefined;
}

export function syncControlSourceFields(fields,value,scene,{rootValue}={}){
 if(!record(value))return value;
 const next=structuredClone(value),root=sourceTokenConfig(next)?next:rootValue;
 for(const field of fields??[]){
  if(own(field,'fixed')||field.readonly&&(['scene-node-text','scene-node-complete-text'].includes(field.source)||sourceTokenConfig(root)&&['expectedText','nodeId','text'].includes(field.key))){
   const derived=controlFieldValue(field,next[field.key],{scene,siblings:next,rootValue:root});if(derived===undefined)delete next[field.key];else next[field.key]=derived;
  }
  else if(field.type==='record'&&record(next[field.key]))next[field.key]=syncControlSourceFields(field.fields,next[field.key],scene,{rootValue:root});
  else if(field.type==='list'&&Array.isArray(next[field.key]))next[field.key]=next[field.key].map(item=>syncControlSourceFields(field.itemFields,item,scene,{rootValue:root}));
 }
 return syncSourceTokens(next,scene);
}

export function parseControlNumber(text,{seconds=false,integer=false}={}){
 if(typeof text!=='string')return {ok:false,message:'请输入数字'};
 if(!text.trim())return {ok:true,value:undefined};
 // Number('0x10') and Infinity are accepted by HTML in inconsistent ways.
 if(!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text.trim()))return {ok:false,message:'请输入有限的十进制数字'};
 const value=Number(text)*(seconds?1000:1);
 if(!Number.isFinite(value)||integer&&!Number.isInteger(value))return {ok:false,message:integer?'请输入整数':'请输入有限数字'};
 return {ok:true,value};
}

export function patchControlRecord(fields,value,key,nextValue,scene,context={}){
 const field=fields.find(item=>item.key===key);
 if(!field||field.readonly||own(field,'fixed'))throw Error('该字段由来源或实际素材绑定');
 const next={...(record(value)?structuredClone(value):{})};
 if(nextValue===undefined)delete next[key];else next[key]=structuredClone(nextValue);
 return syncControlSourceFields(fields,next,scene,context);
}
