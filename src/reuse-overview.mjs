// An authored return to the same overview uses an explicit, editable snapshot.
// Keep the target's speech/timing; never inherit another scene's media timing.
export function reuseOverview(target,source,activeNodeId){
 if(target.id===source.id||source.layout!=='overview'||!source.nodes?.length||target.endMs-target.startMs<1800)return {error:'请选择另一张总览，当前段落至少保留1.8秒。'};
 if(activeNodeId&&!source.nodes.some(n=>n.id===activeNodeId))return {error:'当前节点不属于所选总览。'};
 const {media,highlights,links,tags,stackStyle,folderCloseMs,iconDrawMs,chapterTypography,headlinePosition,summarySourceSceneId,missing,...kept}=target;
 return {scene:{...kept,layout:'overview',title:source.title,label:'回到总览 · 前文回顾',
  overviewMode:activeNodeId?undefined:'preview',activeNodeId:activeNodeId||undefined,
  overviewSourceSceneId:source.id,
  sourceCaptionIds:[...new Set([...(target.sourceCaptionIds??[]),...(source.sourceCaptionIds??[])])],
  sourceNote:'前文判断回顾',
  nodes:source.nodes.map(({atMs,focusMs,...node})=>({...structuredClone(node),atMs:0}))}};
}
