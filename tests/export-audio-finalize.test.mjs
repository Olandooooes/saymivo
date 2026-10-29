import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createExportAudioFinalizer,verifyFinalizedPackets,finishRenderedExportAudio,exactPictureSamples} from '../server/export-audio-finalize.mjs';

const ROOT=path.resolve(import.meta.dirname,'..'),bin=path.join(ROOT,'node_modules/@remotion/compositor-darwin-arm64'),ffmpeg=path.join(bin,'ffmpeg'),ffprobe=path.join(bin,'ffprobe');
const sha=b=>createHash('sha256').update(b).digest('hex');
const available=process.platform==='darwin'&&process.arch==='arm64'&&fs.existsSync(ffmpeg);
const execute=(exe,args,opts={})=>new Promise((resolve,reject)=>{const p=spawn(exe,args,{env:{...process.env,DYLD_LIBRARY_PATH:bin},...opts}),out=[],err=[];p.stdout.on('data',b=>out.push(b));p.stderr.on('data',b=>err.push(b));p.once('error',reject);p.once('close',code=>code===0?resolve(Buffer.concat(out).toString()):reject(Error(Buffer.concat(err).toString())));});

async function fixture(t){
 const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'export-audio-finalize-'))),exports=path.join(root,'public/exports');fs.mkdirSync(exports,{recursive:true});
 fs.symlinkSync(path.join(ROOT,'node_modules'),path.join(root,'node_modules'),'dir');fs.copyFileSync(path.join(ROOT,'remotion.config.ts'),path.join(root,'remotion.config.ts'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const pcm=Buffer.alloc(48000*2*4);let seed=17;for(let i=0;i<96000;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const v=Math.round((seed/2**32-.5)*6000);pcm.writeInt16LE(v,i*4);pcm.writeInt16LE(v,i*4+2);}
 const h=Buffer.alloc(44);h.write('RIFF');h.writeUInt32LE(pcm.length+36,4);h.write('WAVEfmt ',8);h.writeUInt32LE(16,16);h.writeUInt16LE(1,20);h.writeUInt16LE(2,22);h.writeUInt32LE(48000,24);h.writeUInt32LE(192000,28);h.writeUInt16LE(4,32);h.writeUInt16LE(16,34);h.write('data',36);h.writeUInt32LE(pcm.length,40);
 const wav=path.join(root,'synthetic.wav'),png=path.join(root,'still.png'),video=path.join(root,'silent.mp4'),adts=path.join(root,'audio.aac');
 fs.writeFileSync(wav,Buffer.concat([h,pcm]));fs.writeFileSync(png,Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL1sAAAAASUVORK5CYII=','base64'));
 await execute(ffmpeg,['-hide_banner','-loop','1','-i',png,'-t','2','-r','30','-vf','scale=16:16','-c:v','libx264','-pix_fmt','yuv420p','-an','-f','mp4',video]);
 await execute(ffmpeg,['-hide_banner','-i',wav,'-c:a','libfdk_aac','-b:a','320k','-cutoff','18000','-f','adts',adts]);
 const props=path.join(root,'.props-synthetic.json');fs.writeFileSync(props,'{"synthetic":true}');
 const make=async(name='edited-synthetic.mp4',negative=false)=>{const raw=path.join(exports,name);await execute(ffmpeg,['-hide_banner','-i',video,...(negative?['-itsoffset','-0.04266666666666667']:[]),'-i',adts,'-map','0:v:0','-map','1:a:0','-c','copy','-avoid_negative_ts','disabled','-use_editlist','1','-movie_timescale','48000','-f','mp4',raw]);return raw;};
 return {root,exports,props,wav,make,args:raw=>['remotion','render','MultiClip',raw,'--props='+props,'--concurrency=1','--x264-preset=veryfast','--offthreadvideo-cache-size-in-bytes=500000000']};
}

test('actual calibrated FDK ADTS video COPY finalization preserves every packet and exact tail PCM; repeat cannot overwrite', {skip:!available},async t=>{
 const f=await fixture(t),raw=await f.make(),before=sha(fs.readFileSync(raw)),api=createExportAudioFinalizer({ROOT:f.root,EXPORTS:f.exports});
 const proof=await api.captureRender({args:f.args(raw),outFile:raw,propsFile:f.props}),result=await api.finalizeCompleted({proof,expectedRawSha256:before});
 assert.equal(result.status,'finalized');assert.equal(result.packetProof.video.packets,60);assert.equal(result.packetProof.audio.packets,96);
 assert.equal(result.pcmProof.skippedSamples,2048);assert.equal(result.pcmProof.tailPaddingSamples,256);assert.equal(result.pcmProof.identicalRawAfterSkip,true);
 assert.equal(result.pcmProof.finalSamples,96256);assert.equal(sha(fs.readFileSync(raw)),before);assert.ok(fs.existsSync(path.join(f.exports,result.file)));assert.ok(fs.existsSync(path.join(f.exports,result.proofFile)));
 // Independent direct-MP4 encoder metadata is the calibration oracle. This is
 // not merely asserting that the requested 2048 shift appeared in a candidate.
 const direct=path.join(f.root,'direct.m4a'),decoded=path.join(f.root,'direct.wav');
 await execute(ffmpeg,['-hide_banner','-i',f.wav,'-c:a','libfdk_aac','-b:a','320k','-cutoff','18000','-f','mp4',direct]);
 await execute(ffmpeg,['-hide_banner','-i',direct,'-c:a','pcm_s16le','-ar','48000','-ac','2',decoded]);
 const directProbe=JSON.parse(await execute(ffprobe,['-v','error','-select_streams','a:0','-read_intervals','%+#1','-show_packets','-of','json',direct]));
 assert.equal(directProbe.packets[0].side_data_list.find(s=>s.side_data_type==='Skip Samples').skip_samples,2048);
 const bytes=fs.readFileSync(decoded);let data;for(let i=12;i+8<=bytes.length;){const n=bytes.readUInt32LE(i+4);if(bytes.toString('ascii',i,i+4)==='data'){data=bytes.subarray(i+8,i+8+n);break;}i+=8+n+(n%2);}
 assert.equal(sha(data),result.pcmProof.pcmSha256,'COPY-finalized PCM exactly equals independently direct-MP4 encoded PCM');
 assert.equal(fs.readdirSync(f.exports).some(n=>n.startsWith('.audio-finalize-')),false);
 const again=await api.captureRender({args:f.args(raw),outFile:raw,propsFile:f.props});await assert.rejects(()=>api.finalizeCompleted({proof:again}),/EEXIST/);
 assert.equal(sha(fs.readFileSync(raw)),before);assert.equal(sha(fs.readFileSync(path.join(f.exports,result.file))),result.sha256);
});

test('already represented FDK skip is unchanged; wrong raw SHA and unknown/changed chain never publish', {skip:!available},async t=>{
 const f=await fixture(t),raw=await f.make('edited-proper.mp4',true),api=createExportAudioFinalizer({ROOT:f.root,EXPORTS:f.exports}),before=sha(fs.readFileSync(raw));
 const capture=()=>api.captureRender({args:f.args(raw),outFile:raw,propsFile:f.props});
 assert.equal((await api.finalizeCompleted({proof:await capture()})).status,'already-timed');assert.equal(sha(fs.readFileSync(raw)),before);
 await assert.rejects(()=>api.finalizeCompleted({proof:{}}),/编码链/);
 const wrongHashProof=await capture();await assert.rejects(()=>api.finalizeCompleted({proof:wrongHashProof,expectedRawSha256:'0'.repeat(64)}),/SHA/);
 const p=await capture();fs.appendFileSync(path.join(f.root,'remotion.config.ts'),'\n// changed');await assert.rejects(()=>api.finalizeCompleted({proof:p}),/校准/);
 assert.deepEqual(fs.readdirSync(f.exports),['edited-proper.mp4']);
});

test('tool failure after writing a candidate and cancellation preserve raw and clean all unpublished artifacts', {skip:!available},async t=>{
 const f=await fixture(t),raw=await f.make(),before=sha(fs.readFileSync(raw));
 const api=createExportAudioFinalizer({ROOT:f.root,EXPORTS:f.exports,runCommand:async(exe,args,opts)=>{const r=await execute(exe,args,opts);if(args.includes('+faststart'))throw Error('injected post-copy failure');return r;}});
 const proof=await api.captureRender({args:f.args(raw),outFile:raw,propsFile:f.props});await assert.rejects(()=>api.finalizeCompleted({proof}),/post-copy/);
 assert.deepEqual(fs.readdirSync(f.exports),['edited-synthetic.mp4']);assert.equal(sha(fs.readFileSync(raw)),before);
 const controller=new AbortController();controller.abort();const p=await api.captureRender({args:f.args(raw),outFile:raw,propsFile:f.props});await assert.rejects(()=>api.finalizeCompleted({proof:p,signal:controller.signal}),/取消/);
 assert.deepEqual(fs.readdirSync(f.exports),['edited-synthetic.mp4']);
});

test('packet proof rejects altered video PTS, missing/reordered AAC data, shortened tail and duplicate skip',()=>{
 const hash='SHA256:'+'a'.repeat(64),other='SHA256:'+'b'.repeat(64),streams=[{index:0,codec_type:'video',codec_name:'h264',time_base:'1/90000',extradata_hash:hash},{index:1,codec_type:'audio',codec_name:'aac',time_base:'1/48000',extradata_hash:hash}];
 const packet=(index,pts,duration,data_hash=hash)=>({stream_index:index,pts,dts:pts,duration,data_hash,size:'12'});
 const raw={streams,packets:[packet(0,0,3000),packet(1,0,1024),packet(1,1024,1024,other)]},candidate=structuredClone(raw);
 for(const p of candidate.packets)if(p.stream_index===1){p.pts-=2048;p.dts-=2048;}candidate.packets[1].side_data_list=[{side_data_type:'Skip Samples',skip_samples:2048,discard_padding:0}];
 assert.equal(verifyFinalizedPackets(raw,candidate).audio.packets,2);
 const cases=[p=>p.packets[0].pts++,p=>p.packets.pop(),p=>p.packets[2].data_hash=hash,p=>p.packets[2].duration--,p=>p.packets[2].side_data_list=[{side_data_type:'Skip Samples',skip_samples:1}]];
 for(const mutate of cases){const p=structuredClone(candidate);mutate(p);assert.throws(()=>verifyFinalizedPackets(raw,p));}
});

test('actual export completion coordinator stays running until final proof and exposes no candidate on failure',async()=>{
 let resolve;const wait=new Promise(r=>{resolve=r;}),states=[];
 const pending=finishRenderedExportAudio({finalizer:{finalizeCompleted:()=>wait},proof:{},onState:s=>states.push(s)});
 assert.deepEqual(states,[{status:'running',progress:99,label:'正在校验音画同步'}]);
 await Promise.resolve();assert.equal(states.length,1);
 resolve({status:'finalized',file:'edited-1-final.mp4',sha256:'verified'});await pending;
 assert.equal(states[1].status,'done');assert.equal(states[1].file,'/exports/edited-1-final.mp4');
 const failed=[];await finishRenderedExportAudio({finalizer:{finalizeCompleted:async()=>{throw Error('packet mismatch');}},proof:{},onState:s=>failed.push(s)});
 assert.equal(failed[1].status,'error');assert.equal('file' in failed[1],false);assert.match(failed[1].error,/原始渲染已保留/);
});

test('changing the real source during copy is rejected without publishing a final', {skip:!available},async t=>{
 const f=await fixture(t),raw=await f.make();let changed=false;
 const api=createExportAudioFinalizer({ROOT:f.root,EXPORTS:f.exports,runCommand:async(exe,args,opts)=>{const output=await execute(exe,args,opts);if(args.includes('+faststart')){fs.appendFileSync(raw,Buffer.from([0]));changed=true;}return output;}});
 const proof=await api.captureRender({args:f.args(raw),outFile:raw,propsFile:f.props});await assert.rejects(()=>api.finalizeCompleted({proof}),/已变化/);assert.equal(changed,true);assert.deepEqual(fs.readdirSync(f.exports),['edited-synthetic.mp4']);
});

test('exact movie duration accepts a normal 61-frame cut and never uses rounded six-decimal duration',()=>{
 assert.equal(exactPictureSamples({duration:'2.033333',duration_ts:183000,time_base:'1/90000'}),97600);
 assert.equal(exactPictureSamples({duration:'286.800000',duration_ts:25812000,time_base:'1/90000'}),13766400);
 assert.throws(()=>exactPictureSamples({duration:'2.033333'}),/精确/);
 assert.throws(()=>exactPictureSamples({duration_ts:1,time_base:'1/90000'}),/精确映射/);
});
