import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {proofreadCaptions} from './proofread.mjs';
export function proofreadWindows(captions,review=[]){
 const windows=[];
 for(const [index,cap] of captions.entries()){
  const text=cap.words.map(w=>w.text).join('');
  const suspected=review.some(e=>e.clipId===cap.clipId&&e.startMs<cap.endMs&&e.endMs>cap.startMs);
  if(!suspected&&!/[A-Za-z]{2,}/.test(text))continue;
  const window={clipId:cap.clipId,startMs:Math.max(0,cap.startMs-700),endMs:cap.endMs+700,english:/全[称征程]|英文|名为|叫/.test(text)};
  if(window.english){for(const next of captions.slice(index+1,index+3)){if(next.clipId!==cap.clipId||next.startMs-window.endMs>2000||!/[A-Za-z]{2,}/.test(next.words.map(w=>w.text).join('')))break;window.endMs=next.endMs+700;}}
  const last=windows.at(-1);
  if(last?.clipId===window.clipId&&window.startMs<=last.endMs&&window.endMs-last.startMs<=14000){last.endMs=Math.max(last.endMs,window.endMs);last.english||=window.english;}
  else windows.push(window);
 }
 return windows;
}
export async function proofreadSourceCaptions(captions,{root,clips,outputDir,glossary='',mode='local',model,signal}={}){
 const initial=await proofreadCaptions(captions,{glossary,mode:'local'});
 const windows=proofreadWindows(captions,initial.review),sources=[];
 for(const clipId of new Set(windows.map(w=>w.clipId))){
  const clip=clips.find(c=>c.id===clipId);if(!clip)continue;
  const file=path.resolve(root,'public',clip.src),base=path.resolve(root,'public')+path.sep;
  if(!file.startsWith(base))throw Error('Invalid local proofread source');
  const sourceSha256=createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  if(captions.filter(c=>c.clipId===clipId).some(c=>c.audioClock?.sourceSha256!==sourceSha256))continue;
  sources.push({clipId,src:clip.src,sourceSha256,windows:windows.filter(w=>w.clipId===clipId)});
 }
 fs.mkdirSync(outputDir,{recursive:true});
 const request=path.join(outputDir,'proofread-audio-request.json'),result=path.join(outputDir,'proofread-audio-observations.json');
 if(sources.length&&!fs.existsSync(path.join(root,'.models/whisper-medium/model.bin'))){const report={...initial,warnings:[...initial.warnings,'本地medium未就绪，疑似近音错字保留原文，未做原声复核。']};fs.writeFileSync(path.join(outputDir,'proofread.json'),JSON.stringify(report,null,2));return report;}
 if(sources.length){
  fs.writeFileSync(request,JSON.stringify({root,sources}));
  await new Promise((resolve,reject)=>{const child=spawn(path.join(root,'.venv/bin/python'),['scripts/proofread-audio.py',request,result],{cwd:root,signal});let error='';child.stderr.on('data',d=>error=(error+d).slice(-3000));child.stdout.on('data',d=>process.stdout.write(d));child.on('error',reject);child.on('close',code=>code===0?resolve():reject(Error(error||'Local audio proofread failed')));});
 }
 const audioEvidence=sources.length?JSON.parse(fs.readFileSync(result)).observations:[];
 let report=await proofreadCaptions(captions,{glossary,mode,model,signal,audioEvidence});
 const pending=report.review.filter(e=>['contextual-homophone','acronym-consistency'].includes(e.kind));
 if(pending.length&&sources.length&&fs.existsSync(path.join(root,'.models/whisper-small/model.bin'))){
  const secondSources=sources.map(source=>({...source,windows:proofreadWindows(captions.filter(cap=>pending.some(e=>e.clipId===cap.clipId&&e.startMs<cap.endMs&&e.endMs>cap.startMs)),pending).filter(w=>w.clipId===source.clipId)})).filter(s=>s.windows.length);
  const secondRequest=path.join(outputDir,'proofread-audio-second-request.json'),secondResult=path.join(outputDir,'proofread-audio-second-observations.json');
  fs.writeFileSync(secondRequest,JSON.stringify({root,modelSize:'small',sources:secondSources}));
  await new Promise((resolve,reject)=>{const child=spawn(path.join(root,'.venv/bin/python'),['scripts/proofread-audio.py',secondRequest,secondResult],{cwd:root,signal});let error='';child.stderr.on('data',d=>error=(error+d).slice(-3000));child.stdout.on('data',d=>process.stdout.write(d));child.on('error',reject);child.on('close',code=>code===0?resolve():reject(Error(error||'Secondary local audio proofread failed')));});
  audioEvidence.push(...JSON.parse(fs.readFileSync(secondResult)).observations);
  report=await proofreadCaptions(captions,{glossary,mode,model,signal,audioEvidence});
 }
 report.audioVerification={localOnly:true,observations:audioEvidence.length,windows:windows.length};
 fs.writeFileSync(path.join(outputDir,'proofread.json'),JSON.stringify(report,null,2));
 return report;
}
