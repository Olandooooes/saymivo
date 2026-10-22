import fs from 'node:fs';
import path from 'node:path';
// Resolve every authored scene asset before starting a costly render.
export function missingSceneAssets(scenes=[],publicDir){
 const root=fs.realpathSync(publicDir),issues=[];
 for(const scene of scenes){
  const sources=[scene.media?.src,...(scene.nodes??[]).map(n=>n.assetSrc)].filter(Boolean);
  for(const src of new Set(sources)){
   try{
    const file=fs.realpathSync(path.resolve(root,src));
    if(!file.startsWith(root+path.sep)||!fs.statSync(file).isFile())throw Error('invalid');
   }catch{issues.push({id:scene.id,src,message:'找不到分镜素材，请重新绑定：'+src});}
  }
 }
 return issues;
}
