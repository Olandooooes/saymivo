import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {verifyRefinedSourceEvidence} from './refine-retake-clocks.mjs';

export const SPEECH_PROTECTION_VERSION='verified-vad-context-v1';
const sha=value=>createHash('sha256').update(value).digest('hex');
const isSha=value=>typeof value==='string'&&/^[a-f0-9]{64}$/i.test(value);
const requireThat=(value,message)=>{if(!value)throw Error(message);};
const validRange=value=>Array.isArray(value)&&value.length===2&&value.every(Number.isFinite)&&0<=value[0]&&value[0]<value[1];

// The independent Python writer keys caches with json.dumps(sort_keys=True).
// Binding its complete identity to the directory also binds vadPadMs; merely
// checking the observation payload would not detect an edited pad parameter.
function pythonIdentityJSON(value){
 if(value===null||typeof value==='boolean')return JSON.stringify(value);
 if(typeof value==='number'){requireThat(Number.isFinite(value),'缓存身份包含无效数值');return JSON.stringify(value);}
 if(typeof value==='string')return JSON.stringify(value).replace(/[\u007f-\uffff]/g,char=>'\\u'+char.charCodeAt(0).toString(16).padStart(4,'0'));
 if(Array.isArray(value))return '['+value.map(pythonIdentityJSON).join(', ')+']';
 requireThat(value&&typeof value==='object','缓存身份格式无效');
 return '{'+Object.keys(value).sort().map(key=>pythonIdentityJSON(key)+': '+pythonIdentityJSON(value[key])).join(', ')+'}';
}
function cacheFiles(source,root){
 const base=path.join(root,'.auto-jobs/codex-independent-evidence');
 requireThat(typeof source.cache==='string','缺少独立识别缓存路径');
 const cache=path.resolve(source.cache),id=path.basename(cache);
 requireThat(isSha(id)&&path.dirname(cache)===base,'独立识别缓存不在受管目录');
 const actual=fs.realpathSync(cache),actualBase=fs.realpathSync(base);
 requireThat(actual===path.join(actualBase,id),'独立识别缓存路径已重定向');
 const receiptPath=path.join(cache,'receipt.json'),observationPath=path.join(cache,'observations.json');
 for(const file of [receiptPath,observationPath])requireThat(fs.realpathSync(file)===path.join(actual,path.basename(file)),'独立识别收据文件路径已重定向');
 return {id,receiptPath,observationPath};
}
function coreSpeechRanges(speech,range,padSec,sampleRate){
 const sharedBoundaryTolerance=1/sampleRate+1e-9;
 return speech.map(([start,end],index)=>{
  // VAD clips padding at the observation range edges. There is no evidence
  // that a complete pad exists on that side, so retain that original edge.
  if(end-start<=2*padSec+1e-9)return [start,end];
  // Silero/faster-whisper splits a gap shorter than two pads between both
  // neighbors. The resulting padded edges touch (or differ by one sample),
  // so their actual per-side pad can be smaller than the configured maximum.
  // Subtracting the full maximum there would remove real VAD speech evidence.
  const sharedBefore=index>0&&start-speech[index-1][1]<=sharedBoundaryTolerance;
  const sharedAfter=index+1<speech.length&&speech[index+1][0]-end<=sharedBoundaryTolerance;
  return [start<=range[0]+1e-9||sharedBefore?start:start+padSec,end>=range[1]-1e-9||sharedAfter?end:end-padSec];
 });
}

// This is an evidence map for acoustic protection, never new word timing or
// an editing decision. Failure leaves the original padded speech protected.
export async function prepareSpeechProtectionEvidence(sources,{root=process.cwd(),verifyClocks=verifyRefinedSourceEvidence}={}){
 root=path.resolve(root);const evidence=[],warnings=[];
 if(!Array.isArray(sources))return {evidence,warnings:['缺少原声来源，保留全部语音保护。']};
 for(const source of sources){
  try{
   const clocks=await verifyClocks(source,{root});requireThat(clocks?.valid===true,'重定位时钟收据未通过');
   const {id,receiptPath,observationPath}=cacheFiles(source,root),receiptBytes=fs.readFileSync(receiptPath),payload=fs.readFileSync(observationPath);
   const receipt=JSON.parse(receiptBytes),raw=JSON.parse(payload),identity=receipt.identity;
   requireThat(identity&&sha(pythonIdentityJSON(identity))===id,'独立识别缓存身份摘要不匹配');
   requireThat(isSha(receipt.payloadSha256)&&receipt.payloadSha256===sha(payload),'独立识别观察摘要不匹配');
   requireThat(isSha(source.sourceSha256)&&identity.sourceSha256===source.sourceSha256&&raw.sourceSha256===source.sourceSha256,'独立识别原片身份不匹配');
   const clock=source.clock??source.audioClock;
   requireThat(isSha(clock?.wavSha256)&&identity.wavSha256===clock.wavSha256&&(raw.clock??raw.audioClock)?.wavSha256===clock.wavSha256,'独立识别原声身份不匹配');
   requireThat(validRange(source.range)&&isDeepStrictEqual(identity.range,source.range)&&isDeepStrictEqual(raw.range,source.range),'独立识别时间范围不匹配');
   requireThat(typeof source.version==='string'&&identity.version===source.version&&raw.version===source.version&&raw.provider===source.provider,'独立识别版本或提供者不匹配');
   requireThat(raw.audioUploaded===false&&raw.geminiCalled===false,'独立识别来源收据不完整');
   requireThat(Array.isArray(source.speech)&&isDeepStrictEqual(raw.speech,source.speech)&&source.speech.every(value=>validRange(value)&&value[0]>=source.range[0]&&value[1]<=source.range[1]),'当前VAD范围不同于原始观察');
   requireThat(identity.scripts&&typeof identity.scripts==='object','缺少独立识别程序身份');
   for(const file of ['scripts/retake-full-audit.py','scripts/source_audio.py','scripts/source-audio-clock.json'])requireThat(isSha(identity.scripts[file]),'缺少独立识别程序摘要');
   const scriptsRoot=fs.realpathSync(path.join(root,'scripts'));
   for(const [relative,expected]of Object.entries(identity.scripts)){
    const file=path.resolve(root,relative);requireThat(file.startsWith(path.join(root,'scripts')+path.sep)&&isSha(expected),'独立识别程序路径或摘要无效');
    requireThat(fs.realpathSync(file).startsWith(scriptsRoot+path.sep)&&sha(fs.readFileSync(file))===expected,'独立识别程序已变化');
   }
   const padMs=identity.parameters?.vadPadMs;requireThat(Number.isSafeInteger(padMs)&&padMs>=0,'缺少有效的VAD上下文padding参数');
   const padSec=padMs/1000,paddedRanges=source.speech.map(value=>[...value]),sampleRate=clock.sampleRate??16000;
   requireThat(Number.isSafeInteger(sampleRate)&&sampleRate>0,'缺少有效的原声采样率');
   evidence.push({version:SPEECH_PROTECTION_VERSION,coverageVerified:true,src:source.src,sourceSha256:source.sourceSha256,provider:source.provider,sourceVersion:source.version,
    range:[...source.range],paddedRanges,coreRanges:coreSpeechRanges(paddedRanges,source.range,padSec,sampleRate),padSec,padMs,sampleRate,
    padInference:'full configured pad only at separated, unclipped edges; touching/one-sample neighbor edges retained',
    receiptPath,receiptSha256:sha(receiptBytes),observationPath,observationSha256:sha(payload),cacheIdentity:id,wavSha256:clock.wavSha256,
    refinedReceiptPath:clocks.receiptPath??null,refinedCacheIdentity:clocks.cacheIdentity??null});
  }catch(error){warnings.push(`原片 ${source?.src??'未知来源'} 的VAD上下文收据未通过：${error.message}；保留全部语音保护。`);}
 }
 return {evidence,warnings};
}
