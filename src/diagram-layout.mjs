// Stable, source-independent geometry for original explanatory visuals.
export function orbitGeometry(rect,elapsed,count=34){
 const diameter=Math.min(rect.width*.49,rect.height*.75),radius=diameter/2;
 const center={x:rect.x+rect.width*.27,y:rect.y+rect.height*.43};
 const dots=Array.from({length:count},(_,i)=>{
  const angle=i*2.399963229728653+elapsed/18000,radiusFraction=.28+.62*Math.sqrt((i+.5)/count);
  return {id:i,x:center.x+Math.cos(angle)*radius*radiusFraction,y:center.y+Math.sin(angle)*radius*radiusFraction,r:3+(i%3)*1.3,opacity:.4+(i%5)*.11};
 });
 return {center,radius,dots,media:{x:rect.x+rect.width*.66,y:rect.y+rect.height*.04,width:rect.width*.31,height:rect.height*.79}};
}
export function unequalGroupGeometry(rect){
 return {primary:{x:rect.x,y:rect.y+rect.height*.08,width:rect.width*.59,height:rect.height*.74},secondary:{x:rect.x+rect.width*.73,y:rect.y+rect.height*.28,width:rect.width*.27,height:rect.height*.46}};
}
export function evidenceGroups(scene){
 const nodes=scene.nodes??[],primary=nodes.find(n=>n.id===scene.visualPreset?.primaryNodeId)??nodes[0];
 if(!primary)return {primary:[],secondary:[]};
 const explicit=scene.visualPreset?.primaryNodeIds;
 const group=Array.isArray(explicit)?nodes.filter(n=>explicit.includes(n.id)):primary.category?nodes.filter(n=>n.category===primary.category):[primary],ids=new Set(group.map(n=>n.id));
 return {primary:group,secondary:nodes.filter(n=>!ids.has(n.id))};
}
