import test from 'node:test';import assert from 'node:assert/strict';
import {proofreadWindows} from '../server/proofread-source.mjs';
const c=(text,startMs,endMs,clipId='a')=>({clipId,startMs,endMs,words:[{text,startMs,endMs}]});
test('full-name observation includes the following English phrase and never another clip',()=>{
 const result=proofreadWindows([c('全称是reverse',9000,11000),c(' engineer anything',12300,15800),c('下一句话',16000,17000)]);
 assert.equal(result.length,1);assert.equal(result[0].endMs,16500);assert.equal(result[0].english,true);
 const isolated=proofreadWindows([c('全称是reverse',9000,11000),c(' engineer anything',12300,15800,'b')]);assert.equal(isolated.length,2);assert.equal(isolated[0].endMs,11700);
});
test('ordinary Chinese without suspicions does not incur audio re-recognition',()=>assert.deepEqual(proofreadWindows([c('今天我们继续讲故事',0,2000)]),[]));
test('missing local model saves the unresolved report without changing source or inventing evidence',async()=>{
 const fs=await import('node:fs');const os=await import('node:os');const path=await import('node:path');const {createHash}=await import('node:crypto');const {proofreadSourceCaptions}=await import('../server/proofread-source.mjs');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'proofread-offline-'));
 try{
  fs.mkdirSync(path.join(root,'public'));fs.writeFileSync(path.join(root,'public/source.bin'),'synthetic-source');
  const cap=c('软件复线功能',0,1000);cap.audioClock={sourceSha256:createHash('sha256').update('synthetic-source').digest('hex')};
  const report=await proofreadSourceCaptions([cap],{root,clips:[{id:'a',src:'source.bin'}],outputDir:path.join(root,'report')});
  assert.ok(report.warnings.length);assert.equal(report.changes.length,0);assert.ok(report.review.length);assert.equal(fs.readFileSync(path.join(root,'public/source.bin'),'utf8'),'synthetic-source');
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root,'report/proofread.json'))),report);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
