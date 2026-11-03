import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {applyRetakePlan,retakeClipSnapshot} from '../src/retake-plan.mjs';
import {validateRetakeRequest} from '../server/retake-input.mjs';
import {runBounded} from './codex-retake-decision.mjs';
import {verifyRefinedSourceEvidence} from './refine-retake-clocks.mjs';

const digest=value=>createHash('sha256').update(value).digest('hex');
const fileHash=async file=>{const h=createHash('sha256');for await(const bytes of fs.createReadStream(file))h.update(bytes);return h.digest('hex');};

// The browser supplies project snapshots, never a keep interval list or EDL.
// ROOT/PUBLIC/jobDirectory/outputDirectory are trusted server-owned arguments.
export async function prepareRetakeAuditInput({analysis,projectBefore,projectAfter},{ROOT,PUBLIC,jobDirectory,verifyClocks=verifyRefinedSourceEvidence}={}){
 if(!ROOT||!PUBLIC||!jobDirectory)throw Error('Audit requires server-owned repository, media and job directories');
 if(!analysis||analysis.status!=='done')throw Error('Only completed automatic retake results can be audited');
 validateRetakeRequest({clips:projectBefore?.clips,mode:'local'},{PUBLIC});
 const duration=projectBefore.clips.reduce((sum,clip)=>sum+(clip.outSec-clip.inSec)/(clip.speed??1),0);
 if(duration>3600||!Array.isArray(projectAfter?.clips)||projectAfter.clips.length>2000)throw Error('Audio audit exceeds the one-hour/2000-clip job limit');
 const fps=projectAfter.meta?.fps??projectBefore.meta?.fps??30;
 if(!Number.isFinite(fps)||fps<=0||fps>240)throw Error('Invalid audit frame rate');
 const replay=applyRetakePlan(projectBefore,analysis);
 if(!replay.ok)throw Error('Automatic edit replay rejected: '+replay.error);
 if(JSON.stringify(retakeClipSnapshot(replay.project.clips))!==JSON.stringify(retakeClipSnapshot(projectAfter?.clips??[])))throw Error('Actual clips differ from the automatic result; manual EDL or stale snapshots are not audited');
 const expandedEvidence=path.join(jobDirectory,'evidence-sources.json');
 const evidenceFile=fs.existsSync(expandedEvidence)?expandedEvidence:path.join(jobDirectory,'verification-input.json');
 const evidenceBytes=fs.existsSync(evidenceFile)?fs.readFileSync(evidenceFile):null;
 const evidence=evidenceBytes?JSON.parse(evidenceBytes.toString('utf8')):{sources:[]};
 const sourceNames=[...new Set(projectBefore.clips.map(c=>c.src))],sources=[];
 for(const src of sourceNames){
  const receipt=(analysis.sources??[]).find(source=>source.src===src),records=(evidence.sources??[]).map((source,index)=>({source,index})).filter(row=>row.source.src===src),observed=records[0]?.source;
  if(!receipt||receipt.audioClock?.sourceSha256!==receipt.sourceSha256)throw Error('Missing source clock identity');
  const file=fs.realpathSync(path.join(PUBLIC,src));
  if(await fileHash(file)!==receipt.sourceSha256)throw Error('Source video changed before retake audit');
  if(records.some(row=>row.source.sourceSha256!==receipt.sourceSha256||(row.source.audioClock??row.source.clock)?.sourceSha256&&
   (row.source.audioClock??row.source.clock).sourceSha256!==receipt.sourceSha256))throw Error('Word evidence belongs to another source');
  const observationClocks=[],supersededClocks=[];
  for(const {source,index}of records){
   if(source.rawObservationPasses)await verifyClocks(source,{root:ROOT});
   for(const [i,pass]of (source.rawObservationPasses??[]).entries())supersededClocks.push({id:`source-${index}:raw-pass-${i}:${pass.id??'unnamed'}`,provider:pass.provider??source.provider,status:'superseded-timing-observation',words:pass.words??[],unresolved:pass.unresolved??[],clockRefinement:source.clockRefinement??null});
   const provider=String(source.provider??source.recognizer??(index===records[0].index?'primary-asr':'independent-asr'));
   const passes=source.observationPasses??[],passIds=passes.map((pass,i)=>`source-${index}:pass-${i}:${pass.id??'unnamed'}`);
   const equivalent=passes.findIndex(pass=>JSON.stringify(pass.words??[])===JSON.stringify(source.words??[]));
   observationClocks.push({id:`source-${index}:main`,provider,kind:'asr',role:index===records[0].index?'primary':'independent',
    modelSha256:source.modelSha256,timingProvider:source.timingProvider,clockRefinement:source.clockRefinement,words:source.words??[],unresolved:source.unresolved??[],...(equivalent>=0?{aliasOf:passIds[equivalent]}:{})});
   for(const [i,pass]of passes.entries())observationClocks.push({id:passIds[i],provider:String(pass.provider??provider),kind:'asr',role:'independent-pass',passId:pass.id,
    modelSha256:pass.modelSha256??source.modelSha256,timingProvider:pass.timingProvider??source.timingProvider,clockRefinement:source.clockRefinement,words:pass.words??[],
    unresolved:[...new Map([...(source.unresolved??[]),...(pass.unresolved??[])].map(item=>[JSON.stringify(item),item])).values()]});
  }
  // Different boundary windows can overlap and align different supplied text.
  // Each is a timing observation, never another free-recognition transcript.
  for(const [candidateIndex,candidate]of (analysis.candidates??[]).entries())if(candidate.src===src){
   for(const [evidenceIndex,item]of (candidate.evidence??[]).entries())if(item?.kind==='source-boundary-v2'){
    for(const [alignmentIndex,alignment]of (item.details?.alignments??[]).entries()){
     const id=`source-boundary-v2:candidate-${candidateIndex}:evidence-${evidenceIndex}:alignment-${alignmentIndex}`,words=[],unresolved=[];
     for(const group of alignment.observedGroups??[]){
      if(group.valid===true&&Number.isFinite(group.startSec)&&Number.isFinite(group.endSec)&&0<=group.startSec&&group.startSec<=group.endSec){
       words.push({word:group.text,startMs:group.startSec*1000,endMs:group.endSec*1000});
      }else unresolved.push({...group,reason:group.reason??'invalid-supplied-text-boundary-group'});
     }
     observationClocks.push({id,provider:'qwen-forced-alignment',kind:'forced-alignment',role:'supplied-text-timestamps',independentRecognition:false,
      candidateId:candidate.id,evidenceIndex,alignmentIndex,alignmentSide:alignment.side??null,
      observationSourceRangeSec:alignment.sourceRange??null,alignmentSha256:digest(JSON.stringify(alignment)),
      scope:'Given-text alignment supplies boundary times only; it is not independent speech recognition or a separate ASR vote.',words,unresolved});
    }
   }
  }
  sources.push({src,file,sourceSha256:receipt.sourceSha256,audioClock:receipt.audioClock,
   ...(observed?.wav?{wav:path.resolve(observed.wav)}:{}),words:observed?.words??[],observationClocks,supersededClocks});
 }
 const approved=(analysis.candidates??[]).filter(c=>c.status==='approved'&&c.confidence==='high');
 return {version:1,source:'automatic-retake-result',jobId:analysis.id,fps,
  analysisSha256:digest(JSON.stringify(analysis)),evidenceSha256:evidenceBytes?digest(evidenceBytes):null,
  beforeClips:retakeClipSnapshot(projectBefore.clips),afterClips:retakeClipSnapshot(projectAfter.clips),
  retainedClipIds:replay.session.retainedClipIds,
  exportAudioConditions:{musicPresent:Boolean(projectAfter.music),nonDefaultClipAudio:projectAfter.clips.some(clip=>clip.muted||(clip.volume??1)!==1),
   replacementAudio:(projectAfter.presentation?.scenes??[]).some(scene=>scene.audioEvidence?.length||scene.dynamicMotion?.config?.audioOwner)},
  appliedCandidateIds:replay.appliedIds,automaticRemoveParts:approved.flatMap(c=>c.removeParts??[{...c.remove,clipId:c.clipId,src:c.src}]),
  sources,warnings:replay.warnings??[],listeningPerformed:false,editorialAcceptance:false};
}

export async function auditRetakeRender(request,{ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),PUBLIC=path.join(ROOT,'public'),jobDirectory,outputDirectory,signal,onProgress=()=>{},run=runBounded}={}){
 if(!outputDirectory)throw Error('Audit needs a new output directory');
 if(fs.existsSync(outputDirectory))throw Error('Refusing to overwrite previous audit evidence');
 const input=await prepareRetakeAuditInput(request,{ROOT,PUBLIC,jobDirectory});
 fs.mkdirSync(path.dirname(outputDirectory),{recursive:true});fs.mkdirSync(outputDirectory);
 const inputFile=path.join(outputDirectory,'input.json'),resultFile=path.join(outputDirectory,'report.json');
 fs.writeFileSync(inputFile,JSON.stringify(input,null,2));
 onProgress(.05,'生成原片时钟下的整片无损音轨与剪口试听');
 await run(path.join(ROOT,'.venv-align/bin/python'),[path.join(ROOT,'scripts/retake_render_audit.py'),inputFile,outputDirectory],
  {cwd:ROOT,signal,timeoutMs:1800000,log:path.join(outputDirectory,'audit.log'),onLine:line=>{if(line.startsWith('AUDIT:'))onProgress(.6,line.slice(6));}});
 const report=JSON.parse(fs.readFileSync(resultFile,'utf8'));
 onProgress(1,'审计资料已生成；数值检查不代表自然听感通过');
 return {report,indexFile:path.join(outputDirectory,'index.html'),reportFile:resultFile,
  audioFiles:{before:path.join(outputDirectory,'before-full.wav'),after:path.join(outputDirectory,'after-full.wav')}};
}

async function main(){
 const [inputFile,outputDirectory,jobDirectory]=process.argv.slice(2);
 if(!jobDirectory)throw Error('Usage: node scripts/audit-retake-render.mjs INPUT_JSON NEW_OUTPUT_DIR JOB_DIR');
 const controller=new AbortController();for(const event of ['SIGINT','SIGTERM'])process.once(event,()=>controller.abort(Error('Audit cancelled')));
 const result=await auditRetakeRender(JSON.parse(fs.readFileSync(inputFile,'utf8')),{jobDirectory:path.resolve(jobDirectory),outputDirectory:path.resolve(outputDirectory),signal:controller.signal,onProgress:(progress,label)=>console.log(`AUDIT_PROGRESS:${progress}:${label}`)});
 console.log(JSON.stringify({indexFile:result.indexFile,reportFile:result.reportFile,status:result.report.status}));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(error.message);process.exitCode=1;});
