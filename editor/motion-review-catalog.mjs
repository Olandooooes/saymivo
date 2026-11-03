/** Read-only gallery model. A valid manifest is not a decoder report, and a
 * configured example is not UI acceptance. Only explicit matching feedback can
 * mark the current pair accepted. No store, network, media or project access. */
const own=(object,key)=>Object.prototype.hasOwnProperty.call(object,key);
const record=value=>value&&typeof value==='object'&&!Array.isArray(value);
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const statuses=new Set(['pending','accepted','rework']);

function canonical(value,seen=new Set()){
 if(value===null||typeof value==='string'||typeof value==='boolean')return JSON.stringify(value);
 if(typeof value==='number'){if(!Number.isFinite(value))throw Error('non-finite identity');return JSON.stringify(value);}
 if(typeof value!=='object'||seen.has(value))throw Error('non-JSON identity');
 const prototype=Object.getPrototypeOf(value);
 if(!Array.isArray(value)&&prototype!==Object.prototype&&prototype!==null)throw Error('non-plain identity');
 seen.add(value);
 let result;
 if(Array.isArray(value))result='['+value.map(item=>canonical(item,seen)).join(',')+']';
 else result='{'+Object.keys(value).filter(key=>value[key]!==undefined).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key],seen)).join(',')+'}';
 seen.delete(value);return result;
}

/** Exact canonical identity, not a probabilistic short hash. Per-entry manifest
 * data is included; unrelated entries and manifest.updatedAt are not. */
export function motionReviewFingerprint(fixture,reference){
 try{return 'motion-review-v1:'+canonical({fixture:fixture??null,reference:reference??null});}catch{return null;}
}

function localVideoPath(src){
 return typeof src==='string'&&src.length>0&&src.length<=4096&&!/[\\%?#\u0000-\u0020\u007f]/.test(src)&&!src.startsWith('/')&&!/^[a-z][a-z\d+.-]*:/i.test(src)&&!src.split('/').some(part=>!part||part==='.'||part==='..')&&/\.(?:mp4|m4v|mov|webm|mkv)$/i.test(src);
}
function referenceClip(clip,index){
 const issues=[],prefix=`参考片段${index+1}：`;
 if(!record(clip))return {clip:null,issues:[prefix+'缺少片段记录']};
 if(clip.isOriginalVideoExcerpt!==true||clip.isScreenshotDerived!==false)issues.push(prefix+'必须明确为原视频截取，不能使用截图串成的视频');
 if(!localVideoPath(clip.src))issues.push(prefix+'必须使用安全的本地视频相对路径');
 if(!/^[a-f0-9]{64}$/i.test(clip.sha256??''))issues.push(prefix+'缺少当前片段的SHA256身份');
 if(!finite(clip.durationSec)||clip.durationSec<=0)issues.push(prefix+'缺少实际片段时长');
 if(clip.clipTimelineStartSec!==0)issues.push(prefix+'截取文件必须从自身0秒播放');
 if(!finite(clip.startSec)||!finite(clip.endSec)||clip.startSec<0||clip.endSec<=clip.startSec)issues.push(prefix+'缺少有效原视频时间标签');
 if(issues.length)return {clip:null,issues};
 return {clip:{...clip,sourceRange:{startSec:clip.startSec,endSec:clip.endSec},playbackStartSec:0,playbackEndSec:clip.durationSec},issues:[]};
}
function fixtureIssues(fixture){
 const issues=[];
 if(!record(fixture))return ['尚未准备实际组件示例'];
 if(fixture.status!=='configured')issues.push('实际组件示例尚未配置完整');
 for(const issue of fixture.issues??[])if(typeof issue==='string'&&issue)issues.push(issue);
 if(!record(fixture.config)||!record(fixture.scene)||!Array.isArray(fixture.clips)||!fixture.clips.length||!record(fixture.sourceIdentity)||!record(fixture.meta))issues.push('示例缺少当前配置、原场、片段或实际来源身份');
 return issues;
}
function indexed(items){
 const map=new Map(),duplicates=new Set();
 for(const item of items??[]){const id=item?.entryId;if(typeof id!=='string'||!id)continue;if(map.has(id))duplicates.add(id);else map.set(id,item);}
 return {map,duplicates};
}

/** completion describes comparison materials only, separately from acceptance.
 * feedbackByEntryId must contain the human's explicit local review action; never
 * populate it from native-ready, fixture.uiAccepted or manifest completionLabel. */
export function createMotionReviewCatalog(fixtures,manifest,{feedbackByEntryId={}}={}){
 const examples=Array.isArray(fixtures)?fixtures:fixtures?.fixtures??[],references=Array.isArray(manifest?.entries)?manifest.entries:[],a=indexed(examples),b=indexed(references),ids=[...new Set([...a.map.keys(),...b.map.keys()])];
 const rows=ids.map(entryId=>{
  const fixture=a.map.get(entryId)??null,reference=b.map.get(entryId)??null,demoIssues=fixtureIssues(fixture),referenceIssues=[],referenceClips=[];
  if(a.duplicates.has(entryId))demoIssues.push('示例入口身份重复，须先明确唯一配置');
  if(b.duplicates.has(entryId))referenceIssues.push('参考入口身份重复，须先明确唯一对应');
  if(!reference)referenceIssues.push('尚未准备此项对应的原视频参考');
  else if(!Array.isArray(reference.clips)||!reference.clips.length)referenceIssues.push('尚无可播放的本地原视频参考片段');
  else reference.clips.forEach((clip,index)=>{const checked=referenceClip(clip,index);referenceIssues.push(...checked.issues);if(checked.clip)referenceClips.push(checked.clip);});
  const differenceBrief=typeof reference?.differenceBrief==='string'?reference.differenceBrief.trim():'',comparisonIssues=differenceBrief?[]:['尚未记录当前实现与参考的具体差异'];
  const fixtureReady=demoIssues.length===0,referenceReady=referenceClips.length>0&&referenceIssues.length===0,comparisonReady=fixtureReady&&referenceReady&&comparisonIssues.length===0;
  const fingerprint=motionReviewFingerprint(fixture,reference),saved=record(feedbackByEntryId)&&own(feedbackByEntryId,entryId)&&record(feedbackByEntryId[entryId])?feedbackByEntryId[entryId]:null,feedbackStatus=statuses.has(saved?.status)?saved.status:'pending',stale=!!saved&&(!fingerprint||saved.fingerprint!==fingerprint),currentFeedback=stale?'pending':feedbackStatus;
  const accepted=comparisonReady&&!!saved&&currentFeedback==='accepted'&&saved.fingerprint===fingerprint;
  const status=!fixtureReady?'demo-unavailable':!referenceReady||comparisonIssues.length?'needs-reference':accepted?'accepted':currentFeedback==='rework'?'rework':'pending-review';
  const statusLabel={'demo-unavailable':'示例未就绪','needs-reference':'需补参考','pending-review':'可预览但待验收',accepted:'已通过',rework:'需返工'}[status];
  const completion=fixtureReady&&referenceReady?'complete':fixtureReady||referenceReady?'partial':'unavailable',completionLabel={complete:'对照材料完成',partial:'对照材料部分完成',unavailable:'对照材料未完成'}[completion];
  return {entryId,name:fixture?.name??reference?.name??entryId,fixture,reference,referenceClips,fixtureReady,referenceReady,comparisonReady,demoIssues:[...new Set(demoIssues)],referenceIssues:[...new Set(referenceIssues)],missing:[...new Set([...demoIssues,...referenceIssues,...comparisonIssues])],differenceBrief:differenceBrief||'尚未记录当前实现与参考的具体差异。',comparisonRelation:reference?.comparisonRelation??'unmapped',status,statusLabel,completion,completionLabel,fingerprint,accepted,feedback:{status:feedbackStatus,note:typeof saved?.note==='string'?saved.note:'',stale,currentStatus:currentFeedback},warnings:[...(stale?['示例或参考已变化，旧验收标记不适用于当前版本。']:[]),'可预览及材料就绪不代表真实媒体已解码、全段已观看或用户已通过。']};
 });
 return {version:1,rows,summary:{total:rows.length,complete:rows.filter(row=>row.completion==='complete').length,partial:rows.filter(row=>row.completion==='partial').length,unavailable:rows.filter(row=>row.completion==='unavailable').length,demoUnavailable:rows.filter(row=>!row.fixtureReady).length,needsReference:rows.filter(row=>!row.referenceReady||row.status==='needs-reference').length,reviewable:rows.filter(row=>row.comparisonReady).length,accepted:rows.filter(row=>row.accepted).length,rework:rows.filter(row=>row.status==='rework').length,pending:rows.filter(row=>!row.accepted&&row.status!=='rework').length},scope:'comparison-materials-and-explicit-user-feedback-only'};
}
