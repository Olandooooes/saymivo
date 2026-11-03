import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {auditRetakeRender} from './audit-retake-render.mjs';

const [inputFile,outputFile]=process.argv.slice(2);
const controller=new AbortController();for(const event of ['SIGTERM','SIGINT'])process.once(event,()=>controller.abort(Error('声音审计已取消')));
try{
 const input=JSON.parse(fs.readFileSync(inputFile,'utf8'));
 const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),PUBLIC=process.env.KOUBO_PUBLIC_DIR??path.join(ROOT,'public');
 const result=await auditRetakeRender(input,{ROOT,PUBLIC,jobDirectory:input.jobDirectory,outputDirectory:input.outputDirectory,signal:controller.signal,
  onProgress:(progress,label)=>console.log(`PROGRESS:${progress*100}:${label}`)});
 fs.writeFileSync(outputFile,JSON.stringify({status:result.report.status,summary:result.report.summary,
  signalStatus:result.report.waveformValidation.status,warnings:result.report.warnings,
  listeningPerformed:false,editorialAcceptance:false},null,2));
}catch(error){console.error(error.message);process.exitCode=1;}
