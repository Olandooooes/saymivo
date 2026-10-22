// Reuse a single earlier criteria scene as an explicitly labelled visual recap.
// Quotes and provenance remain tied to the same source family; no new claims.
export function attachSourceRecaps(scenes=[]){
 return scenes.map((scene,index)=>{
  if(scene.layout!=='outro'||scene.nodes?.length||scene.endMs-scene.startMs<1800)return scene;
  const prior=scenes.slice(0,index).filter(s=>s.layout==='cards'&&s.src===scene.src&&s.clipId===scene.clipId&&s.endMs<=scene.startMs&&s.nodes?.length>=2&&s.nodes.length<=3);
  if(prior.length!==1)return scene;
  const source=prior[0],step=Math.min(350,(scene.endMs-scene.startMs-900)/source.nodes.length);
  return {...scene,window:scene.window??{x:.69,y:.30,size:.29},label:'回顾前文 · '+(source.nodes.length===3?'三项判断':'两项判断'),summarySourceSceneId:source.id,
   sourceCaptionIds:[...new Set([...(scene.sourceCaptionIds??[]),...(source.sourceCaptionIds??[])])],
   sourceNote:'回顾前文已口述的判断 · 未新增结论',
   nodes:source.nodes.map((node,i)=>({id:`${scene.id}-recap-${i+1}`,text:node.text,detail:node.detail,
    icon:/完成|做完/.test(node.text)?'check':/依据|检查/.test(node.text)?'search':/修改|调整/.test(node.text)?'edit':'document',
    atMs:450+i*step}))};
 });
}
