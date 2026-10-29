import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {callCodexDecisions,CODEX_RETAKE_VERSION,decisionPrompt} from './codex-retake-decision.mjs';

export function fixtureWords(fixture){
 if(!fixture||!Array.isArray(fixture.clauses)||fixture.clauses.length<3)throw Error('Evaluation fixture requires contextual clauses');
 const words=[];let cursor=0;
 for(const [clauseIndex,clause] of fixture.clauses.entries()){
  if(!clause.clipId||!Array.isArray(clause.tokens)||!clause.tokens.length||clause.tokens.some(token=>typeof token!=='string'||!token.trim()))throw Error('Invalid synthetic clause');
  for(const word of clause.tokens){words.push({id:words.length,word,clipId:clause.clipId,startMs:cursor,endMs:cursor+180,clauseIndex});cursor+=210;}
  cursor+=600;
 }
 return words;
}

// Expectations are used ONLY here, after the decision call. Model input is the
// same word-only schema as the production provider and contains no test labels.
export function evaluateFixture(fixture,words,decisions){
 const clauseIds=indices=>new Set(words.filter(word=>indices.includes(word.clauseIndex)).map(word=>word.id));
 const expectedRemoved=clauseIds(fixture.expectation.removeClauses),protectedIds=clauseIds(fixture.expectation.mustKeepClauses);
 const actualRemoved=new Set(decisions.flatMap(cut=>Array.from({length:cut.last-cut.first+1},(_,index)=>cut.first+index)));
 const missedIds=[...expectedRemoved].filter(id=>!actualRemoved.has(id));
 const unexpectedIds=[...actualRemoved].filter(id=>!expectedRemoved.has(id));
 const deletedProtectedIds=[...actualRemoved].filter(id=>protectedIds.has(id));
 const replacementErrors=[];
 for(const [index,cut] of decisions.entries()){
  if(cut.kind==='filler'){replacementErrors.push({decision:index,reason:'Fixture expects a confirmed retake, not filler removal'});continue;}
  const replacement=words.slice(cut.replacementFirst,cut.replacementLast+1);
  if(!replacement.length||replacement.some(word=>!fixture.expectation.replacementClauses.includes(word.clauseIndex)))replacementErrors.push({decision:index,reason:'Replacement is outside the expected retained full version'});
 }
 return {passed:!missedIds.length&&!unexpectedIds.length&&!deletedProtectedIds.length&&!replacementErrors.length,
  expectedRemovedIds:[...expectedRemoved],actualRemovedIds:[...actualRemoved],missedIds,unexpectedIds,deletedProtectedIds,replacementErrors,
  actualDecisions:decisions.map(cut=>({...cut,removedText:words.slice(cut.first,cut.last+1).map(word=>word.word).join(''),
   replacementText:cut.kind==='filler'?null:words.slice(cut.replacementFirst,cut.replacementLast+1).map(word=>word.word).join(''),
   removedClipIds:[...new Set(words.slice(cut.first,cut.last+1).map(word=>word.clipId))],
   replacementClipIds:cut.kind==='filler'?[]:[...new Set(words.slice(cut.replacementFirst,cut.replacementLast+1).map(word=>word.clipId))]}))};
}

export async function runEvaluation(fixtures,{directory,decide=callCodexDecisions,signal,onProgress=()=>{}}={}){
 if(!directory)throw Error('Evaluation requires its own output directory');
 fs.mkdirSync(directory,{recursive:true});
 const report={version:CODEX_RETAKE_VERSION,createdAt:new Date().toISOString(),provider:'codex-cli',geminiCalled:false,audioUploaded:false,
  scope:'Independent synthetic semantic regression only; does not validate ASR fidelity, audio boundaries, or listening quality',
  groundTruthSentToModel:false,modelOverrideRequested:false,cases:[],summary:{total:fixtures.length,completed:0,passed:0,failed:0,errors:0}};
 const save=()=>fs.writeFileSync(path.join(directory,'report.json'),JSON.stringify(report,null,2));save();
 for(const fixture of fixtures){
  signal?.throwIfAborted();
  if(!/^synthetic-\d{3}$/.test(fixture.id))throw Error('Evaluation case IDs must not disclose ground truth');
  const words=fixtureWords(fixture),caseDirectory=path.join(directory,fixture.id);
  // Remove evaluator-only clause IDs and all ground truth before invoking the
  // production function. No fixture description or expected result enters it.
  const modelWords=words.map(({clauseIndex,...word})=>word);
  fs.mkdirSync(caseDirectory,{recursive:true});fs.writeFileSync(path.join(caseDirectory,'input-units.json'),JSON.stringify(modelWords,null,2));
  const prompt=decisionPrompt(modelWords),promptSha256=createHash('sha256').update(prompt).digest('hex');
  let result;
  try{
   const decisions=await decide(modelWords,{directory:caseDirectory,signal});
   result={id:fixture.id,description:fixture.description,inputSha256:promptSha256,expectation:fixture.expectation,...evaluateFixture(fixture,words,decisions)};
   report.summary[result.passed?'passed':'failed']++;
  }catch(error){result={id:fixture.id,description:fixture.description,inputSha256:promptSha256,expectation:fixture.expectation,passed:false,error:String(error.message??error)};report.summary.errors++;report.summary.failed++;}
  report.cases.push(result);report.summary.completed++;save();onProgress(result,report.summary);
 }
 report.finishedAt=new Date().toISOString();report.passed=report.summary.failed===0;save();return report;
}

async function main(){
 const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
 const fixtures=JSON.parse(fs.readFileSync(path.join(root,'tests','codex-retake-eval-fixtures.json'),'utf8'));
 const directory=path.resolve(process.argv[2]??path.join(root,'inspection','codex-retake-eval-20261024'));
 const controller=new AbortController();const cancel=()=>controller.abort(Error('Evaluation cancelled'));process.once('SIGINT',cancel);process.once('SIGTERM',cancel);
 try{
  const report=await runEvaluation(fixtures,{directory,signal:controller.signal,onProgress:(result,summary)=>console.log(JSON.stringify({case:result.id,passed:result.passed,error:result.error??null,completed:summary.completed,total:summary.total}))});
  console.log(JSON.stringify({report:path.join(directory,'report.json'),...report.summary,allPassed:report.passed}));if(!report.passed)process.exitCode=1;
 }finally{process.removeListener('SIGINT',cancel);process.removeListener('SIGTERM',cancel);}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(error.message);process.exitCode=1;});
