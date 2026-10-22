import {matchingSource} from './storyboard.mjs';
import {readableSubtitle,headlineLines} from './reference-motion.mjs';
// Local rule proposals only. The preview is reviewed before replacing one scene.
export function proposeScene(scene,captions,clips){
 const families=new Set(clips.filter(c=>matchingSource(scene,c)).map(c=>c.id));
 const selected=captions.filter(c=>families.has(c.clipId)&&c.endMs>scene.startMs&&c.startMs<scene.endMs).sort((a,b)=>a.startMs-b.startMs);
 const words=selected.flatMap(c=>c.words.filter(w=>w.endMs>scene.startMs&&w.startMs<scene.endMs));
 if(!words.length)return {error:'本段没有对应字幕，请先识别或导入字幕。'};
 const text=readableSubtitle(words).replace(/\s+/g,' ').trim();
 const numbered=text.split(/(?:第一|第二|第三|第四|首先|其次|最后)[，、,:：]?/).slice(1).map(t=>t.trim().replace(/[，。！？,?.!]+$/,'')).filter(Boolean);
 const clauses=text.split(/[，。！？,?!]+/).map(t=>t.trim()).filter(Boolean);
 const actions=clauses.filter(t=>/^(搜索|打开|提取|整理|导入|安排|标出|再让我|再整理|调整)/.test(t));
 let layout='headline',parts=[];
 if(numbered.length>=2&&numbered.length<=4){layout='cards';parts=numbered;}
 else if(actions.length>=2&&actions.length<=4){layout='flow';parts=actions;}
 const available=Math.max(0,scene.endMs-scene.startMs-500);
 const nodes=parts.map((t,i)=>({id:scene.id+'-draft-'+i,text:t,atMs:Math.round(available*i/Math.max(1,parts.length))}));
 const title=layout==='headline'?(clauses[0]?headlineLines(clauses[0],12)[0]:scene.title):scene.title;
 return {sourceText:text,captionIds:selected.map(c=>c.id),method:'local-rules',scene:{...scene,layout,title,body:undefined,nodes,activeNodeId:undefined,links:undefined,media:undefined,highlights:undefined,missing:undefined}};
}
