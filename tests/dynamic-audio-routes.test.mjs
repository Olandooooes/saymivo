import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {probeDynamicAsset} from '../server/dynamic-asset-routes.mjs';
import {createDynamicAudioRoute,dynamicAudioFfmpegBinary,dynamicAudioWaveform,probeDynamicAudioClock,decodeDynamicAudioPcm,pcmFromDynamicAudioWav} from '../server/dynamic-audio-routes.mjs';
const project=path.resolve(import.meta.dirname,'..'),json=(res,status,value)=>Object.assign(res,{status,value}),hash=v=>createHash('sha256').update(v).digest('hex');
function fixture(t){const ROOT=fs.mkdtempSync(path.join(os.tmpdir(),'dynamic-audio-')),PUBLIC=path.join(ROOT,'public');fs.mkdirSync(path.join(PUBLIC,'audio'),{recursive:true});t.after(()=>fs.rmSync(ROOT,{force:true,recursive:true}));return {ROOT,PUBLIC,file:path.join(PUBLIC,'audio/source.wav')};}
const clock={basis:'container-start',sourceOriginSec:0,audioFirstPtsSec:0,audioOffsetMs:0,audioStreamIndex:0,originalChannels:1};
function pcm(){const b=Buffer.alloc(32000);for(let i=4000;i<8000;i++)b.writeInt16LE(16384,i*2);for(let i=8000;i<12000;i++)b.writeInt16LE(-8192,i*2);return b;}
function wav(samples){const h=Buffer.alloc(44);h.write('RIFF');h.writeUInt32LE(36+samples.length,4);h.write('WAVE',8);h.write('fmt ',12);h.writeUInt32LE(16,16);h.writeUInt16LE(1,20);h.writeUInt16LE(1,22);h.writeUInt32LE(16000,24);h.writeUInt32LE(32000,28);h.writeUInt16LE(2,32);h.writeUInt16LE(16,34);h.write('data',36);h.writeUInt32LE(samples.length,40);return Buffer.concat([h,samples]);}
const request=(api,src='audio/source.wav',extra='')=>{const res={};return api.route({method:'GET'},res,new URL('http://localhost/api/dynamic-audio?src='+encodeURIComponent(src)+'&startMs=250&endMs=750&bins=16'+extra)).then(handled=>({handled,...res}));};

test('PCM analysis uses actual signed samples and duration, preserves silence, and never normalizes a row to a fake peak',()=>{
 const p=pcm(),a=dynamicAudioWaveform(p,{startMs:0,endMs:1000,bins:16});assert.equal(a.sampleCount,16000);assert.equal(a.durationMs,1000);assert.equal(a.pcmSha256,hash(p));assert.equal(a.bins[0].rms,0);assert.equal(a.bins[4].max,.5);assert.equal(a.bins[4].min,.5);assert.equal(a.bins[4].rms,.5);assert.equal(a.bins[8].max,-.25);assert.equal(a.bins[8].rms,.25);
 assert.equal(a.bins[0].startSample,0);assert.equal(a.bins.at(-1).endSample,16000);for(let i=1;i<a.bins.length;i++)assert.equal(a.bins[i].startSample,a.bins[i-1].endSample);
 const partial=dynamicAudioWaveform(p,{startMs:250.01,endMs:750,bins:16});assert.deepEqual(partial.range,{startSample:4000,endSample:12000,startMs:250,endMs:750});assert.equal(partial.bins[0].rms,.5);assert.equal(partial.bins.at(-1).rms,.25);
 for(const opts of [{startMs:0,endMs:1001,bins:16},{startMs:0,endMs:1000,bins:0},{startMs:NaN,endMs:1000,bins:16},{startMs:0,endMs:0,bins:16}])assert.throws(()=>dynamicAudioWaveform(p,opts));
});
test('route hashes the complete held source, returns only real PCM receipt, and changes cannot reuse an old hash',async t=>{
 const f=fixture(t),p=pcm();fs.writeFileSync(f.file,wav(p));let decodes=0;
 const api=createDynamicAudioRoute({...f,json,probe:async()=>clock,decode:async()=>{decodes++;return p;}}),result=await request(api);
 assert.equal(result.status,200);assert.equal(result.value.sha256,hash(fs.readFileSync(f.file)));assert.equal(result.value.method,'pcm16-source-zero-waveform-v1');assert.equal(result.value.range.startMs,250);assert.equal(result.value.clock.basis,'container-start');assert.equal(result.value.bins[0].rms,.5);assert.equal(result.value.bins.at(-1).rms,.25);
 const {analysisSha256,...payload}=result.value;assert.equal(analysisSha256,hash(JSON.stringify(payload)));const before=fs.readFileSync(f.file),prior=fs.statSync(f.file);fs.writeFileSync(f.file,wav(Buffer.alloc(p.length,17)));fs.utimesSync(f.file,prior.atime,prior.mtime);
 const after=await request(api);assert.equal(after.status,200);assert.notEqual(after.value.sha256,result.value.sha256);assert.equal(decodes,2,'no stale file/SHA cache');assert.notDeepEqual(before,fs.readFileSync(f.file));
});
test('PUBLIC traversal, symlink escapes, protocols and malformed/duplicate ranges never reach decoder',async t=>{
 const f=fixture(t);fs.writeFileSync(f.file,wav(pcm()));const outside=path.join(f.ROOT,'private.wav');fs.writeFileSync(outside,'not-public');fs.symlinkSync(outside,path.join(f.PUBLIC,'audio/outside.wav'));let calls=0;
 const api=createDynamicAudioRoute({...f,json,probe:async()=>{calls++;return clock;},decode:async()=>pcm()});
 for(const src of ['../private.wav','/etc/passwd','https://example.com/a.wav','audio/../source.wav','audio\\source.wav','audio/outside.wav'])assert.equal((await request(api,src)).status,400);
 assert.equal(calls,0);
 for(const extra of ['&src=audio/source.wav','&bins=20','&startMs=1','&other=secret'])assert.equal((await request(api,'audio/source.wav',extra)).status,400);
 const res={};assert.equal(await api.route({method:'POST'},res,new URL('http://localhost/api/dynamic-audio')),true);assert.equal(res.status,405);
 await assert.rejects(()=>api.analyze('audio/source.wav',{startMs:0,endMs:60001,bins:16}),e=>e.status===400);assert.equal(await api.route({method:'GET'},{},new URL('http://localhost/other')),false);
});
test('mutating/retargeting audio during decode is rejected without publishing a waveform or leaking absolute paths',async t=>{
 const f=fixture(t);fs.writeFileSync(f.file,wav(pcm()));const api=createDynamicAudioRoute({...f,json,probe:async()=>clock,decode:async()=>{fs.writeFileSync(f.file,'changed');return pcm();}}),r=await request(api);assert.equal(r.status,409);assert.equal('bins' in r.value,false);assert.equal(r.value.error.includes(f.ROOT),false);
});
test('source-zero decode preserves first-video origin and all tools read only the checked descriptor with local demuxers',async t=>{
 const f=fixture(t);fs.writeFileSync(f.file,wav(pcm()));const handle=await fs.promises.open(f.file,'r');t.after(()=>handle.close());let probeCall,decodeCall;
 const c=await probeDynamicAudioClock(handle,{ROOT:f.ROOT,run:async(bin,args,opts)=>{probeCall={bin,args,opts};return {code:0,stdout:JSON.stringify({streams:[{index:0,codec_type:'video',start_pts:90000,time_base:'1/90000'},{index:1,codec_type:'audio',channels:2,start_pts:57600,time_base:'1/48000'}],format:{start_time:'1',duration:'2'}})};}});
 assert.equal(c.sourceOriginSec,1);assert.equal(c.audioFirstPtsSec,1.2);assert.ok(Math.abs(c.audioOffsetMs-200)<.0001);
 const result=await decodeDynamicAudioPcm(handle,c,{ROOT:f.ROOT,run:async(bin,args,opts)=>{decodeCall={bin,args,opts};return {code:0,stdout:wav(pcm())};}});assert.deepEqual(result,pcm());
 for(const call of [probeCall,decodeCall]){assert.equal(call.opts.stdio[3],handle.fd);assert.equal(call.args.includes(f.file),false);assert.equal(call.args[call.args.indexOf('-protocol_whitelist')+1],'file,pipe');assert.ok(!call.args[call.args.indexOf('-format_whitelist')+1].split(',').some(v=>['hls','concat','image2'].includes(v)));}
 assert.equal(decodeCall.args[decodeCall.args.indexOf('-af')+1],'asetpts=PTS-(1)/TB,aresample=16000:first_pts=0');assert.ok(decodeCall.args.includes('-copyts'));assert.equal(decodeCall.args[decodeCall.args.indexOf('-map')+1],'0:1');
});
test('real local ffprobe/ffmpeg derives exact waveform from a synthetic WAV and rejects a local playlist',async t=>{
 const f=fixture(t),binary=dynamicAudioFfmpegBinary(project),directory=path.dirname(binary),env={...process.env,DYLD_LIBRARY_PATH:directory,LD_LIBRARY_PATH:directory};
 if(spawnSync(binary,['-version'],{env}).status!==0){t.skip('local audio decoder unavailable');return;}
 const original=wav(pcm());fs.writeFileSync(f.file,original);const api=createDynamicAudioRoute({...f,json,probe:(h,opts)=>probeDynamicAudioClock(h,{...opts,ROOT:project}),decode:(h,c,opts)=>decodeDynamicAudioPcm(h,c,{...opts,ROOT:project})});
 const result=await request(api);assert.equal(result.status,200,JSON.stringify(result.value));assert.equal(result.value.durationMs,1000);assert.equal(result.value.sampleCount,16000);assert.equal(result.value.pcmSha256,hash(pcm()));assert.equal(result.value.bins[0].max,.5);assert.equal(result.value.bins.at(-1).min,-.25);assert.deepEqual(fs.readFileSync(f.file),original,'analysis never mutates or writes the source');
 fs.writeFileSync(f.file,'#EXTM3U\n#EXTINF:1,\nhttps://invalid.example/private.ts\n');const blocked=await request(api);assert.equal(blocked.status,422);assert.equal('bins' in blocked.value,false);
});

test('real delayed audio keeps silence relative to the first video frame instead of collapsing it to audio STARTPTS',async t=>{
 const f=fixture(t),binary=dynamicAudioFfmpegBinary(project),directory=path.dirname(binary),env={...process.env,DYLD_LIBRARY_PATH:directory,LD_LIBRARY_PATH:directory};
 if(spawnSync(binary,['-version'],{env}).status!==0){t.skip('local audio decoder unavailable');return;}
 const made=spawnSync(binary,['-v','error','-y','-f','lavfi','-i','color=c=black:s=16x16:r=10:d=1','-itsoffset','0.2','-f','lavfi','-i','sine=frequency=440:sample_rate=16000:duration=1','-map','0:v','-map','1:a','-c:v','libx264','-c:a','pcm_s16le','-t','1.2','-f','matroska',f.file],{env,timeout:15000});assert.equal(made.status,0,made.stderr?.toString());
 const api=createDynamicAudioRoute({...f,json,probe:(h,o)=>probeDynamicAudioClock(h,{...o,ROOT:project}),decode:(h,c,o)=>decodeDynamicAudioPcm(h,c,{...o,ROOT:project})}),a=await api.analyze('audio/source.wav',{startMs:0,endMs:400,bins:32});
 assert.equal(a.clock.basis,'first-video-pts');assert.equal(a.clock.audioOffsetMs,200);assert.equal(a.sampleCount,19200);assert.equal(a.durationMs,1200);assert.ok(a.bins.slice(0,16).every(b=>b.rms===0));assert.ok(a.bins.slice(17).some(b=>b.rms>.05));
 const materializer=createDynamicAudioRoute({...f,json,probe:(h,o)=>probeDynamicAudioClock(h,{...o,ROOT:project}),decode:(h,c,o)=>decodeDynamicAudioPcm(h,c,{...o,ROOT:project}),assetProbe:(h,o)=>probeDynamicAsset(h,{...o,ROOT:project})}),m=await materializer.materialize('audio/source.wav',{startMs:0,endMs:400,bins:32});assert.equal(m.sourceIdentity.kind,'video');assert.equal(m.sourceIdentity.width,16);assert.equal(m.playbackAsset.sampleCount,6400);const published=fs.readFileSync(path.join(f.PUBLIC,m.playbackAsset.src));assert.equal(hash(published),m.playbackAsset.sha256);assert.ok(published.subarray(44,44+6400).every(n=>n===0),'actual published source-zero WAVE retains the 200ms lead silence');
});

test('portable WAVE pipe parser accepts real chunk metadata/stream lengths but rejects guessed headers and truncated PCM',()=>{
 const p=pcm(),normal=wav(p);assert.deepEqual(pcmFromDynamicAudioWav(normal),p);
 const metadata=Buffer.concat([normal.subarray(0,36),Buffer.from('JUNK'),Buffer.from([2,0,0,0,9,8]),normal.subarray(36)]);metadata.writeUInt32LE(metadata.length-8,4);assert.deepEqual(pcmFromDynamicAudioWav(metadata),p);
 const streamed=Buffer.from(metadata);streamed.writeUInt32LE(0xffffffff,4);streamed.writeUInt32LE(0xffffffff,50);assert.deepEqual(pcmFromDynamicAudioWav(streamed),p);
 for(const bad of [p,normal.subarray(0,-1),Buffer.from(normal)]){if(bad.length===normal.length)bad.writeUInt16LE(2,22);assert.throws(()=>pcmFromDynamicAudioWav(bad));}
});

test('explicit video materialization atomically publishes exact source-window PCM and never overwrites tampered evidence',async t=>{
 const f=fixture(t),p=pcm();fs.writeFileSync(f.file,wav(p));const videoClock={...clock,basis:'first-video-pts'},api=createDynamicAudioRoute({...f,json,probe:async()=>videoClock,decode:async()=>p,assetProbe:async()=>({kind:'video',width:16,height:16,durationSec:1})});
 const one=await api.materialize('audio/source.wav',{startMs:250,endMs:750,bins:16}),two=await api.materialize('audio/source.wav',{startMs:250,endMs:750,bins:16});assert.deepEqual(one,two);
 const file=path.join(f.PUBLIC,one.playbackAsset.src),actual=fs.readFileSync(file);assert.equal(hash(actual),one.playbackAsset.sha256);assert.equal(hash(actual.subarray(44)),one.playbackAsset.segmentPcmSha256);assert.deepEqual(actual.subarray(44),p.subarray(8000,24000));assert.equal(one.playbackAsset.sampleCount,8000);assert.equal(one.sourceIdentity.sha256,hash(fs.readFileSync(f.file)));assert.ok(fs.readdirSync(path.dirname(file)).every(n=>!n.endsWith('.tmp')));
 fs.writeFileSync(file,'tampered');await assert.rejects(api.materialize('audio/source.wav',{startMs:250,endMs:750,bins:16}),e=>e.status===409);assert.equal(fs.readFileSync(file,'utf8'),'tampered');
 const pure=createDynamicAudioRoute({...f,json,probe:async()=>clock,decode:async()=>p});await assert.rejects(pure.materialize('audio/source.wav',{startMs:0,endMs:500,bins:16}),/实际音轨/);
});

test('materialization rejects a symlinked derived directory and exact-path symlink assets',async t=>{
 const f=fixture(t);fs.writeFileSync(f.file,wav(pcm()));const outside=path.join(f.ROOT,'outside');fs.mkdirSync(outside);fs.symlinkSync(outside,path.join(f.PUBLIC,'derived-audio'));
 const api=createDynamicAudioRoute({...f,json,probe:async()=>({...clock,basis:'first-video-pts'}),decode:async()=>pcm(),assetProbe:async()=>({kind:'video',width:16,height:16,durationSec:1})});await assert.rejects(api.materialize('audio/source.wav',{startMs:250,endMs:750,bins:16}),e=>e.status===400);assert.deepEqual(fs.readdirSync(outside),[]);
});


test('actual bundled FFmpeg fallback decodes its supported WAVE muxer without requiring unavailable s16le muxer',async t=>{
 const f=fixture(t),bundled=path.join(project,'node_modules','@remotion');if(!fs.existsSync(bundled)){t.skip('bundled decoder absent');return;}
 const dirs=fs.readdirSync(bundled).filter(n=>n.startsWith('compositor-')&&fs.existsSync(path.join(bundled,n,'ffmpeg')));if(dirs.length!==1){t.skip('single native bundled decoder absent');return;}
 fs.symlinkSync(path.join(project,'node_modules'),path.join(f.ROOT,'node_modules'));fs.writeFileSync(f.file,wav(pcm()));const h=await fs.promises.open(f.file,'r');try{const p=await decodeDynamicAudioPcm(h,clock,{ROOT:f.ROOT});assert.deepEqual(p,pcm());}finally{await h.close();}
});
