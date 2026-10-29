import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {createDynamicAssetRoute,dynamicAssetProbeBinary,probeDynamicAsset,validateDynamicAssetSource} from '../server/dynamic-asset-routes.mjs';

const digest=value=>createHash('sha256').update(value).digest('hex');
// ext4 multigrain timestamps keep mtime/ctime unchanged for a same-size rewrite
// inside the current coarse tick. Wait until a fresh file lands on a later tick
// so the following rewrite is visible to the dev/ino/size/mtime/ctime stamp.
async function waitForTimestampTick(file){
 const st=fs.statSync(file,{bigint:true}),seen=new Set([st.mtimeNs,st.ctimeNs]),probe=file+'.tick',deadline=Date.now()+3000;
 try{
  while(Date.now()<deadline){
   fs.writeFileSync(probe,'t');
   if(!seen.has(fs.statSync(probe,{bigint:true}).mtimeNs))return;
   await new Promise(resolve=>setTimeout(resolve,20));
  }
 }finally{fs.rmSync(probe,{force:true});}
 throw Error('filesystem timestamp did not advance');
}
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'dynamic-asset-')),PUBLIC=path.join(root,'public');fs.mkdirSync(path.join(PUBLIC,'assets'),{recursive:true});
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return {ROOT:root,PUBLIC,file:path.join(PUBLIC,'assets/a.bin')};
}
const image=async()=>({width:640,height:360,kind:'image'});
function request(api,method='GET',url='http://localhost/api/dynamic-asset?src=assets%2Fa.bin'){
 const res={};return api.route({method},res,new URL(url)).then(handled=>({handled,...res}));
}
const json=(res,status,value)=>Object.assign(res,{status,value});

test('local route streams exact source hash and returns only actual metadata without mutating source',async t=>{
 const f=fixture(t),bytes=Buffer.alloc(3*1024*1024,17);fs.writeFileSync(f.file,bytes);
 let calls=0;const api=createDynamicAssetRoute({...f,json,probe:async handle=>{calls++;assert.equal((await handle.stat()).size,bytes.length);return {width:1920,height:1080,kind:'video',durationSec:2.5};}});
 const result=await request(api);
 assert.deepEqual(result,{handled:true,status:200,value:{src:'assets/a.bin',sha256:digest(bytes),width:1920,height:1080,kind:'video',durationSec:2.5}});
 assert.deepEqual(fs.readFileSync(f.file),bytes);assert.equal(calls,1);
 assert.deepEqual((await request(api)).value,result.value);assert.equal(calls,1,'unchanged file uses in-memory fingerprint cache');
});

test('relative path validation rejects traversal, absolute paths, protocols and escaped separators',async t=>{
 const f=fixture(t);fs.writeFileSync(f.file,'x');const api=createDynamicAssetRoute({...f,json,probe:image});
 for(const src of ['../secret','assets/../a.bin','/etc/passwd','C:\\private\\a.png','file:secret','https://x/a.png','assets\\a.bin','assets//a.bin','assets/./a.bin','assets/a.bin\u0000','assets/a.bin?x','assets/a.bin#x']){
  const r=await request(api,'GET','http://localhost/api/dynamic-asset?src='+encodeURIComponent(src));assert.equal(r.status,400,src);assert.equal('sha256' in r.value,false);
 }
 assert.equal((await request(api,'GET','http://localhost/api/dynamic-asset?src=..%2Fsecret')).status,400);
 assert.equal((await request(api,'GET','http://localhost/api/dynamic-asset')).status,400);
 assert.equal((await request(api,'GET','http://localhost/api/dynamic-asset?src=assets/a.bin&src=assets/a.bin')).status,400);
 assert.equal((await request(api,'POST')).status,405);assert.equal((await request(api,'GET','http://localhost/other')).handled,false);
});

test('PUBLIC and every symlink target must remain inside this project public root',async t=>{
 const f=fixture(t),outside=path.join(f.ROOT,'outside.bin');fs.writeFileSync(f.file,'inside');fs.writeFileSync(outside,'private');
 fs.symlinkSync(outside,path.join(f.PUBLIC,'assets/escape.bin'));fs.symlinkSync(path.join(f.ROOT),path.join(f.PUBLIC,'escape-dir'));
 const api=createDynamicAssetRoute({...f,json,probe:image});
 assert.equal((await request(api,'GET','http://localhost/api/dynamic-asset?src=assets/escape.bin')).status,400);
 assert.equal((await request(api,'GET','http://localhost/api/dynamic-asset?src=escape-dir/outside.bin')).status,400);
 assert.equal((await request(api,'GET','http://localhost/api/dynamic-asset?src=assets')).status,400);
 fs.symlinkSync(f.file,path.join(f.PUBLIC,'assets/alias.bin'));
 assert.equal((await request(api,'GET','http://localhost/api/dynamic-asset?src=assets/alias.bin')).status,200,'safe in-public aliases can bind their exact src');
 const other=fs.mkdtempSync(path.join(os.tmpdir(),'dynamic-outside-'));t.after(()=>fs.rmSync(other,{recursive:true,force:true}));
 assert.throws(()=>validateDynamicAssetSource('a.bin',{ROOT:f.ROOT,PUBLIC:other}),e=>e.status===400);
 const linkedPublic=path.join(f.ROOT,'linked-public');fs.symlinkSync(other,linkedPublic);
 assert.throws(()=>validateDynamicAssetSource('a.bin',{ROOT:f.ROOT,PUBLIC:linkedPublic}),e=>e.status===400);
});

test('same-size replacement with copied mtime cannot reuse the previous SHA or dimensions',async t=>{
 const f=fixture(t);fs.writeFileSync(f.file,'AAAA');let calls=0;
 const api=createDynamicAssetRoute({...f,json,probe:async()=>({width:++calls*100,height:100,kind:'image'})});
 const before=await api.inspect('assets/a.bin'),old=fs.statSync(f.file),replacement=f.file+'.new';
 fs.writeFileSync(replacement,'BBBB');fs.utimesSync(replacement,old.atime,old.mtime);fs.renameSync(replacement,f.file);
 const after=await api.inspect('assets/a.bin');assert.notEqual(after.sha256,before.sha256);assert.equal(after.sha256,digest('BBBB'));assert.equal(after.width,200);assert.equal(calls,2);
 // In-place bytes changed with the previous mtime restored also change ctime.
 const old2=fs.statSync(f.file);await waitForTimestampTick(f.file);fs.writeFileSync(f.file,'CCCC');fs.utimesSync(f.file,old2.atime,old2.mtime);
 assert.equal((await api.inspect('assets/a.bin')).sha256,digest('CCCC'));assert.equal(calls,3);
});

test('a source changed or unlinked while probing is rejected and never cached',async t=>{
 const f=fixture(t);fs.writeFileSync(f.file,'AAAA');let calls=0;
 const api=createDynamicAssetRoute({...f,json,probe:async()=>{calls++;if(calls===1){await waitForTimestampTick(f.file);fs.writeFileSync(f.file,'BBBB');}return {width:calls*100,height:100,kind:'image'};}});
 assert.equal((await request(api)).status,409);const retry=await request(api);assert.equal(retry.status,200);assert.equal(retry.value.sha256,digest('BBBB'));assert.equal(retry.value.width,200);
 const unlinked=createDynamicAssetRoute({...f,json,probe:async()=>{fs.unlinkSync(f.file);return image();}});assert.equal((await request(unlinked)).status,404);
});

test('symlink retarget during probe cannot expose or cache an outside asset',async t=>{
 const f=fixture(t),alias=path.join(f.PUBLIC,'assets/alias.bin'),outside=path.join(f.ROOT,'outside.bin');fs.writeFileSync(f.file,'safe');fs.writeFileSync(outside,'secret');fs.symlinkSync(f.file,alias);
 const api=createDynamicAssetRoute({...f,json,probe:async handle=>{assert.equal((await handle.readFile()).toString(),'safe');fs.unlinkSync(alias);fs.symlinkSync(outside,alias);return image();}});
 const r=await request(api,'GET','http://localhost/api/dynamic-asset?src=assets/alias.bin');assert.equal(r.status,400);assert.equal('sha256' in r.value,false);
});

test('probe uses inherited validated descriptor, local protocols and a playlist-free demuxer allowlist',async t=>{
 const f=fixture(t);fs.writeFileSync(f.file,'fixture');const handle=await fs.promises.open(f.file,'r');t.after(()=>handle.close());
 let invocation;const result=await probeDynamicAsset(handle,{ROOT:f.ROOT,run:async(command,args,opts)=>{invocation={command,args,opts};return {code:0,stdout:JSON.stringify({streams:[{codec_type:'video',width:720,height:1280,side_data_list:[{rotation:90}]}],format:{format_name:'mov,mp4,m4a,3gp,3g2,mj2',duration:'1.25'}})};}});
 assert.deepEqual(result,{width:1280,height:720,kind:'video',durationSec:1.25});
 assert.equal(invocation.opts.stdio[3],handle.fd);assert.equal(invocation.args.includes(f.file),false);assert.equal(invocation.args.includes('file,pipe'),true);
 const allowed=invocation.args[invocation.args.indexOf('-format_whitelist')+1].split(',');assert.equal(allowed.includes('hls'),false);assert.equal(allowed.includes('concat'),false);assert.equal(allowed.includes('image2'),false);assert.equal(invocation.opts.timeout,20000);
});

test('missing tracks, corrupt metadata, unsupported rotation and failed probe are actionable without path leakage',async t=>{
 const f=fixture(t);fs.writeFileSync(f.file,'x');const handle=await fs.promises.open(f.file,'r');t.after(()=>handle.close());
 const bad=[{code:1,stdout:'',stderr:f.file},{code:0,stdout:'bad'},{code:0,stdout:'{}'},{code:0,stdout:JSON.stringify({streams:[{codec_type:'video',width:0,height:2}],format:{format_name:'png_pipe'}})},{code:0,stdout:JSON.stringify({streams:[{codec_type:'video',width:2,height:2,tags:{rotate:45}}],format:{format_name:'mov',duration:2}})},{code:0,stdout:JSON.stringify({streams:[{codec_type:'video',width:2,height:2}],format:{format_name:'mov',duration:'N/A'}})}];
 for(const result of bad)await assert.rejects(()=>probeDynamicAsset(handle,{ROOT:f.ROOT,run:async()=>result}),e=>e.status===422&&!e.message.includes(f.ROOT));
});

test('real bundled ffprobe reads a synthetic PNG through the held descriptor',async t=>{
 const f=fixture(t),project=path.resolve(import.meta.dirname,'..'),binary=dynamicAssetProbeBinary(project);
 if(binary==='ffprobe'&&spawnSync(binary,['-version']).status!==0){t.skip('local ffprobe unavailable');return;}
 const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL1sAAAAASUVORK5CYII=','base64');fs.writeFileSync(f.file,bytes);
 const api=createDynamicAssetRoute({...f,json,probe:(handle,opts)=>probeDynamicAsset(handle,{...opts,ROOT:project})});
 const r=await request(api);assert.equal(r.status,200,JSON.stringify(r.value));assert.deepEqual(r.value,{src:'assets/a.bin',sha256:digest(bytes),width:1,height:1,kind:'image'});
});

test('real local probe verifies a synthetic short MP4 and rejects local playlists',async t=>{
 const f=fixture(t),project=path.resolve(import.meta.dirname,'..'),probeBinary=dynamicAssetProbeBinary(project),directory=path.dirname(probeBinary),ffmpeg=probeBinary==='ffprobe'?'ffmpeg':path.join(directory,'ffmpeg');
 const env={...process.env,DYLD_LIBRARY_PATH:directory+(process.env.DYLD_LIBRARY_PATH?path.delimiter+process.env.DYLD_LIBRARY_PATH:''),LD_LIBRARY_PATH:directory+(process.env.LD_LIBRARY_PATH?path.delimiter+process.env.LD_LIBRARY_PATH:'')};
 if(spawnSync(ffmpeg,['-version'],{env}).status!==0){t.skip('local ffmpeg unavailable');return;}
 const png=path.join(f.ROOT,'source.png');fs.writeFileSync(png,Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL1sAAAAASUVORK5CYII=','base64'));
 const made=spawnSync(ffmpeg,['-v','error','-y','-loop','1','-i',png,'-t','0.2','-vf','scale=16:16','-c:v','libx264','-pix_fmt','yuv420p','-f','mp4',f.file],{env,timeout:15000});
 assert.equal(made.status,0,made.stderr?.toString());
 const api=createDynamicAssetRoute({...f,json,probe:(handle,opts)=>probeDynamicAsset(handle,{...opts,ROOT:project})});
 const r=await request(api);assert.equal(r.status,200,JSON.stringify(r.value));assert.equal(r.value.kind,'video');assert.equal(r.value.width,16);assert.equal(r.value.height,16);assert.equal(r.value.durationSec,.2);assert.equal(r.value.sha256,digest(fs.readFileSync(f.file)));
 fs.writeFileSync(f.file,'#EXTM3U\n#EXT-X-TARGETDURATION:2\n#EXTINF:1,\nhttps://invalid.example/private.ts\n#EXT-X-ENDLIST\n');
 assert.equal((await request(api)).status,422,'playlist is not a permitted media container');
});

test('temporary image descriptor alias is removed even when probing fails',async t=>{
 const f=fixture(t);fs.writeFileSync(f.file,Buffer.from('89504e470d0a1a0a0000000000000000','hex'));const handle=await fs.promises.open(f.file,'r');t.after(()=>handle.close());let alias;
 await assert.rejects(()=>probeDynamicAsset(handle,{ROOT:f.ROOT,run:async(_command,args)=>{alias=args.at(-1);assert.equal(fs.realpathSync(alias),'/dev/fd/3');throw Error('fixture failed');}}));
 assert.ok(alias);assert.equal(fs.existsSync(path.dirname(alias)),false,'private alias directory must always be cleaned');
});
