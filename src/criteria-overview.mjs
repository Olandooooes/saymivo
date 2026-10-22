// Preview explicitly announced criteria, quoting the immediately following source scene.
export function attachCriteriaOverviews(scenes=[]){
 return scenes.map((scene,index)=>{
  if(scene.layout!=='speaker'||scene.media||scene.nodes?.length||scene.endMs-scene.startMs<1800)return scene;
  const count=/三(?:件事|点|项|个方面)/.test(scene.sourceText??'')?3:/两(?:件事|点|项|个方面)/.test(scene.sourceText??'')?2:0;
  const next=scenes[index+1];
  if(!count||!next||next.layout!=='cards'||next.src!==scene.src||next.clipId!==scene.clipId||next.nodes?.length!==count||next.startMs<scene.endMs||next.startMs-scene.endMs>1500)return scene;
  return {...scene,layout:'overview',overviewMode:'preview',overviewSourceSceneId:next.id,
   title:count===3?'三项判断，先看总览':'两项判断，先看总览',label:'口述结构 · 总览',
   sourceNote:'预览随后原话中的判断，未新增结论',sourceCaptionIds:[...new Set([...(scene.sourceCaptionIds??[]),...(next.sourceCaptionIds??[])])],
   nodes:next.nodes.map((node,i)=>({id:`${scene.id}-overview-${i+1}`,text:node.text.match(/任务|结果|出错/)?.[0]??node.text,
    detail:node.text+(node.detail?'，'+node.detail:''),atMs:i*550}))};
 });
}
