import {completeSourceCopyInventory} from '../src/complete-source-copy.mjs';
import {sourceTokenAdditionalCopy,sourceTokenGraphemes} from '../src/source-token-transfer.mjs';
import {fieldRollBoardIssues} from '../src/field-roll-board.mjs';

const nonempty=value=>typeof value==='string'&&value.trim().length>0;
const rect=()=>({x:0,y:0,width:0,height:0});
const boardKeys=new Set(['copyWindow','titleRect','speakerRect']);
const cardKeys=new Set(['rect','enterAtMs','enterMs','exitAtMs','exitMs']);
const fieldKeys=new Set(['label','to','rect','labelRect','rollAtMs','cellRollMs','staggerMs','direction','provenance']);

/** Same complete inventory as the renderer. No shortened option copy or
 * independent translation/counter inference is introduced by these controls. */
export function fieldRollControlSources(scene){
 const original=completeSourceCopyInventory(scene);
 return [...original,...sourceTokenAdditionalCopy(scene).filter(item=>!original.some(old=>old.id===item.id))].map(item=>({...item,graphemeCount:sourceTokenGraphemes(item.text).length}));
}
export function fieldRollControlMedia(scene){
 return [...(scene.media?.src?[{id:'scene:media',src:scene.media.src,kind:scene.media.kind}]:[]),...(scene.nodes??[]).filter(node=>node.assetSrc).map(node=>({id:'node:'+node.id,src:node.assetSrc,kind:'node-asset',text:node.text}))];
}
export function parseFieldRollControlNumber(value,{seconds=false}={}){
 if(typeof value!=='string'||!value.trim())return {ok:false,message:'请输入有限数字；留空不会修改原设置。'};
 const number=Number(value),converted=number*(seconds?1000:1);
 return Number.isFinite(number)&&Number.isFinite(converted)?{ok:true,value:converted}:{ok:false,message:'请输入有限数字。'};
}
export function newFieldRollControlCard(id){
 if(!nonempty(id))throw Error('field-roll-card-id-required');
 return {id,rect:rect(),enterAtMs:0,enterMs:300,exitAtMs:0,exitMs:300,fields:[]};
}
export function newFieldRollControlField(id){
 if(!nonempty(id))throw Error('field-roll-field-id-required');
 return {id,sourceRef:'',label:'',from:'',to:'',rect:rect(),labelRect:rect(),rollAtMs:0,cellRollMs:300,staggerMs:0,direction:'up',provenance:{kind:'authored-update',citation:''}};
}
const move=(items,index,delta)=>{
 const target=index+delta;
 if(![-1,1].includes(delta)||target<0||target>=items.length)return false;
 const [item]=items.splice(index,1);items.splice(target,0,item);return true;
};

/** Draft-only immutable edits. Identity, source binding and full original text
 * cannot be patched. Selecting a new source resets the old target/provenance;
 * incomplete new items deliberately remain blocked by the renderer contract. */
export function editFieldRollControl(config,action,scene){
 if(!config||config.kind!=='field-roll-board'||!action||typeof action.type!=='string')return config;
 const next=structuredClone(config),cards=next.cards??[];
 if(action.type==='board'){
  if(!boardKeys.has(action.key))return config;
  next[action.key]=structuredClone(action.value);return next;
 }
 if(action.type==='add-card'){
  if(!nonempty(action.id)||cards.length>=8||cards.some(card=>card.id===action.id))return config;
  next.cards=[...cards,newFieldRollControlCard(action.id)];return next;
 }
 if(action.type==='add-protection'){
  next.protectedAreas=[...(next.protectedAreas??[]),{label:'',rect:rect()}];return next;
 }
 if(action.type==='protection'||action.type==='remove-protection'){
  const areas=next.protectedAreas??[];
  if(!Number.isInteger(action.index)||action.index<0||action.index>=areas.length)return config;
  if(action.type==='remove-protection')areas.splice(action.index,1);
  else if(['label','rect'].includes(action.key))areas[action.index][action.key]=structuredClone(action.value);
  else return config;
  next.protectedAreas=areas;return next;
 }
 const index=cards.findIndex(card=>card.id===action.cardId);
 if(index<0)return config;
 if(action.type==='remove-card'){cards.splice(index,1);return next;}
 if(action.type==='move-card')return move(cards,index,action.delta)?next:config;
 const card=cards[index];
 if(action.type==='card'){
  if(!cardKeys.has(action.key))return config;
  card[action.key]=structuredClone(action.value);return next;
 }
 if(action.type==='add-field'){
  if(!nonempty(action.id)||cards.flatMap(card=>card.fields??[]).length>=24||cards.some(card=>card.fields?.some(field=>field.id===action.id)))return config;
  card.fields=[...(card.fields??[]),newFieldRollControlField(action.id)];return next;
 }
 const fieldIndex=card.fields?.findIndex(field=>field.id===action.fieldId)??-1;
 if(fieldIndex<0)return config;
 if(action.type==='remove-field'){card.fields.splice(fieldIndex,1);return next;}
 if(action.type==='move-field')return move(card.fields,fieldIndex,action.delta)?next:config;
 const field=card.fields[fieldIndex];
 if(action.type==='select-source'){
  const source=fieldRollControlSources(scene).find(item=>item.id===action.sourceRef);
  if(action.sourceRef!==''&&!source)return config;
  if(action.sourceRef===field.sourceRef&&field.from===(source?.text??''))return config;
  field.sourceRef=action.sourceRef;field.from=source?.text??'';field.to='';
  field.provenance={kind:field.provenance?.kind??'authored-update',citation:''};
  return next;
 }
 if(action.type==='field'){
  if(!fieldKeys.has(action.key))return config;
  field[action.key]=structuredClone(action.value);return next;
 }
 return config;
}

/** This is a configuration diagnostic, never a renderer/apply receipt. */
export function fieldRollControlAssessment(scene,config,viewport={width:1920,height:1080},projectionProof){
 let issues;
 try{issues=fieldRollBoardIssues(scene,config,viewport,projectionProof);}catch{issues=['field-roll-current-configuration-unreadable'];}
 return {issues,media:fieldRollControlMedia(scene),canApply:false,rendererMeasured:false};
}
