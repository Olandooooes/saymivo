import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {runBounded} from './codex-retake-decision.mjs';

export const RETAKE_COMPARISON_VERSION='bound-retake-comparison-v1';
const sha=value=>createHash('sha256').update(value).digest('hex');
const isSha=value=>typeof value==='string'&&/^[a-f0-9]{64}$/i.test(value);
const originalTexts=candidate=>({remove:candidate.remove?.text??'',retain:candidate.retain?.text??null});
const requireThat=(condition,message)=>{if(!condition)throw Error(message);};
const rawClone=candidate=>{const copy=structuredClone(candidate);delete copy.comparisonCopies;return copy;};

// Match the confirmation comparator: punctuation inside a number, signs,
// percentages and contractions remain meaningful. In particular 1.5 != 15.
export function normalizeRetakeComparison(text){
 const chars=Array.from(String(text??'').normalize('NFKC').toLowerCase().replace(/’/g,"'").replace(/−/g,'-').replace(/\s/gu,''));
 return chars.filter((char,index)=>{
  const before=chars[index-1]??'',after=chars[index+1]??'';
  return /[\p{L}\p{N}\p{S}]/u.test(char)||/\p{P}/u.test(char)&&/\p{Nd}/u.test(before)&&/\p{Nd}/u.test(after)||
   '+-'.includes(char)&&/\p{Nd}/u.test(after)||char==='%'||char==="'"&&/\p{L}/u.test(before)&&/\p{L}/u.test(after);
 }).join('');
}
function validNormalization(value,scriptSha256){
 return value?.version==='opencc-t2s-comparison-v1'&&value.rawRecognitionChanged===false&&value.expectedTextSupplied===false&&
  isSha(value.scriptSha256)&&(!scriptSha256||value.scriptSha256===scriptSha256)&&isSha(value.configSha256)&&typeof value.packageVersion==='string'&&
  Array.isArray(value.dictionaries)&&value.dictionaries.length>0&&value.dictionaries.every(item=>typeof item.name==='string'&&isSha(item.sha256))&&
  Array.isArray(value.implementation)&&value.implementation.length>0&&value.implementation.every(item=>typeof item.name==='string'&&isSha(item.sha256));
}
// A stale or modified comparison copy falls back to the current raw text.
// This binding is integrity evidence, not an additional recognition approval.
export function comparisonTextsForCandidate(candidate){
 const raw=originalTexts(candidate),copy=candidate.comparisonCopies;if(!copy)return {texts:raw,valid:false};
 const receipt=copy.receipt;
 const valid=copy.version===RETAKE_COMPARISON_VERSION&&copy.candidateId===candidate.id&&copy.originalSha256===sha(JSON.stringify(raw))&&
  JSON.stringify(copy.original)===JSON.stringify(raw)&&copy.texts&&typeof copy.texts.remove==='string'&&(raw.retain===null?copy.texts.retain===null:typeof copy.texts.retain==='string')&&
  copy.outputSha256===sha(JSON.stringify(copy.texts))&&receipt?.version===RETAKE_COMPARISON_VERSION&&isSha(receipt.inputSha256)&&isSha(receipt.outputSha256)&&
  copy.normalizationSha256===sha(JSON.stringify(copy.normalization))&&receipt.normalizationSha256===copy.normalizationSha256&&validNormalization(copy.normalization,receipt.scriptSha256);
 return valid?{texts:copy.texts,valid:true}:{texts:raw,valid:false,warning:`候选 ${candidate.id??'未知'} 的比较副本绑定无效，已使用原文比较。`};
}

const converterWrapper='import runpy,sys; sys.stdin=open(sys.argv[2],"r",encoding="utf-8"); sys.stdout=open(sys.argv[3],"x",encoding="utf-8"); runpy.run_path(sys.argv[1],run_name="__main__")';
export async function prepareRetakeComparisons(candidates,{root=process.cwd(),directory,signal,run=runBounded}={}){
 requireThat(Array.isArray(candidates),'缺少候选比较列表');const copies=candidates.map(rawClone);
 if(!copies.length)return {candidates:copies,warnings:[],receipt:null};
 try{
  signal?.throwIfAborted();requireThat(directory,'缺少本地比较副本目录');root=path.resolve(root);directory=path.resolve(directory);fs.mkdirSync(directory,{recursive:true});
  const script=path.join(root,'scripts/normalize-retake-comparison.py'),scriptSha256=sha(fs.readFileSync(script));
  const texts=[],bindings=copies.map(candidate=>{
   const original=originalTexts(candidate);requireThat(typeof original.remove==='string'&&(original.retain===null||typeof original.retain==='string'),'候选原文格式无效');
   const first=texts.length;texts.push(original.remove);if(original.retain!==null)texts.push(original.retain);return {original,first};
  });
  const inputBytes=Buffer.from(JSON.stringify({texts}));requireThat(inputBytes.length<=8*1024*1024,'比较副本文字超出上限');
  const attempt=randomUUID(),input=path.join(directory,attempt+'-input.json'),output=path.join(directory,attempt+'-output.json');fs.writeFileSync(input,inputBytes,{flag:'wx'});
  await run(path.join(root,'.venv/bin/python'),['-c',converterWrapper,script,input,output],{cwd:root,signal,timeoutMs:30000,input:'',log:path.join(directory,'comparison.log')});
  signal?.throwIfAborted();requireThat(fs.statSync(output).size<=16*1024*1024,'比较副本输出超出上限');
  const outputBytes=fs.readFileSync(output),result=JSON.parse(outputBytes);
  requireThat(Array.isArray(result.texts)&&result.texts.length===texts.length&&result.texts.every(value=>typeof value==='string'),'比较副本输出数量或类型无效');
  requireThat(sha(fs.readFileSync(script))===scriptSha256&&validNormalization(result.normalization,scriptSha256),'本地转换器收据不匹配');
  const normalizationSha256=sha(JSON.stringify(result.normalization)),receipt={version:RETAKE_COMPARISON_VERSION,inputSha256:sha(inputBytes),outputSha256:sha(outputBytes),normalizationSha256,scriptSha256,
   normalization:result.normalization,inputPath:input,outputPath:output,rawRecognitionChanged:false,automaticApproval:false};
  for(const [index,candidate]of copies.entries()){
   const {original,first}=bindings[index],texts={remove:result.texts[first],retain:original.retain===null?null:result.texts[first+1]};
   candidate.comparisonCopies={version:RETAKE_COMPARISON_VERSION,candidateId:candidate.id,original,originalSha256:sha(JSON.stringify(original)),texts,outputSha256:sha(JSON.stringify(texts)),
    normalization:result.normalization,normalizationSha256,receipt};
  }
  fs.writeFileSync(path.join(directory,'receipt.json'),JSON.stringify(receipt,null,2));return {candidates:copies,warnings:[],receipt};
 }catch(error){signal?.throwIfAborted();return {candidates:copies.map(rawClone),receipt:null,warnings:[`本地繁简比较副本未完成：${error.message}；保留原文比较，不增加自动批准。`]};}
}
