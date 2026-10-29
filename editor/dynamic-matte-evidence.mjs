import{requiresDynamicMatte,dynamicMatteEvidenceIssues}from'../src/dynamic-matte.mjs';
export async function fetchDynamicMatteEvidence(scene,config,sourceIdentity,{fetcher=fetch,signal}={}){
 if(!requiresDynamicMatte(config))return undefined;
 const m=scene?.personMatte;if(!m)throw Error('本场尚无人物分层，请先在原场生成人物层后重新建立草稿');
 const params=new URLSearchParams({src:scene.src,prefix:m.prefix,startMs:String(scene.startMs),endMs:String(scene.endMs)}),response=await fetcher('/api/dynamic-matte?'+params,{signal}),result=await response.json();if(!response.ok)throw Error(result.error??'人物序列核验失败');
 const issues=dynamicMatteEvidenceIssues(scene,config,{sourceIdentity,matteEvidence:result});if(issues.length)throw Error(issues.join('；'));return result;
}
