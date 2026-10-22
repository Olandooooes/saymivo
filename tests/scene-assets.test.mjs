import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {missingSceneAssets} from '../server/scene-assets.mjs';
test('render preflight checks both main media and every gallery picture',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'scene-assets-'));
 try{
  fs.mkdirSync(path.join(dir,'broll-assets'));
  fs.writeFileSync(path.join(dir,'broll-assets','exists.jpg'),'fixture');
  const scene={id:'s',media:{src:'broll-assets/exists.jpg'},nodes:[{assetSrc:'broll-assets/gone.jpg'}]};
  assert.equal(missingSceneAssets([scene],dir)[0].src,'broll-assets/gone.jpg');
  assert.deepEqual(missingSceneAssets([{...scene,nodes:[]}],dir),[]);
  assert.equal(missingSceneAssets([{id:'s',media:{src:'broll-assets'}}],dir).length,1);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
