const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const allowed=(value,keys)=>record(value)&&Object.keys(value).every(key=>keys.includes(key));
const localImage=src=>typeof src==='string'&&src.startsWith('broll-assets/')&&!src.includes('..')&&!/[\\?#\0]/.test(src)&&/\.(png|jpe?g|webp|svg)$/i.test(src);
const shortText=(text,max)=>typeof text==='string'&&text.trim().length>0&&text.length<=max;

export function overviewComparisonIssues(value,durationMs){
 if(value===undefined)return [];
 const time=at=>Number.isFinite(at)&&at>=0&&at<durationMs;
 if(!allowed(value,['before','after','steps'])||!['before','after'].every(key=>allowed(value[key],['src','label','atMs'])&&localImage(value[key].src)&&shortText(value[key].label,24)&&time(value[key].atMs)))return ['原片与成片对照须选择本地图片，并填写标签与有效入场时点'];
 if(value.before.src===value.after.src)return ['原片与成片请选择两张不同图片'];
 if(!Array.isArray(value.steps)||value.steps.length<1||value.steps.length>5||new Set(value.steps.map(step=>step?.id)).size!==value.steps.length||value.steps.some(step=>!allowed(step,['id','text','atMs'])||!shortText(step.id,100)||!shortText(step.text,20)||!time(step.atMs)))return ['对照加工项须有1—5个独立标签，入场时点位于场景内'];
 return [];
}

export function createOverviewComparison(beforeSrc,afterSrc,durationMs=10000){
 const scale=Math.min(1,Math.max(0,durationMs-1)/3000);
 return {before:{src:beforeSrc,label:'原片',atMs:1200*scale},after:{src:afterSrc,label:'成片',atMs:2360*scale},steps:[{id:'captions',text:'字幕',atMs:1450*scale},{id:'visuals',text:'画面',atMs:1750*scale},{id:'emphasis',text:'重点',atMs:2050*scale}]};
}
