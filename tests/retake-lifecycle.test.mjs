import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

// Exercise the component's async lifecycle with inert hooks and virtual JSX.
// This is not browser/UI validation and never opens a project or network port.
let serial=0;
async function componentHarness({applyResult}={}){
 const reactUrl='data:text/javascript;base64,'+Buffer.from(`export const effects=[];export const calls=[];export const useRef=v=>({current:v});export const useState=v=>[v,value=>calls.push(value)];export const useEffect=fn=>effects.push(fn());const React={createElement:(type,props,...children)=>({type,props:{...props,children}})};export default React;//${serial++}`).toString('base64');
 const url=new URL('../editor/RetakeTools.tsx',import.meta.url);
 const source=ts.transpileModule(fs.readFileSync(url,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText.replace(/from (["'])([^"']+)\1/g,(_,q,s)=>`from ${JSON.stringify(s==='react'?reactUrl:s==='./SourceAudition'?'data:text/javascript,export function SourceAudition(){}':new URL(s,url).href)}`);
 const {RetakeTools}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
 const hooks=await import(reactUrl),applied=[],applyOptions=[];
 const view=RetakeTools({clips:[{id:'v',src:'clips/synthetic.mp4',inSec:0,outSec:5,speed:1,sourceDurationSec:5}],onApply:(job,options)=>{applied.push(job);applyOptions.push(options);return applyResult??{ok:true,changed:false,appliedIds:[],session:{retainedClipIds:{v:['v']}}};},onSeekSource:()=>{},onPausePreview:()=>{}});
 const walk=node=>!node||typeof node!=='object'?[]:[node,...(node.props?.children??[]).flatMap(v=>Array.isArray(v)?v.flatMap(walk):walk(v))];
 const start=walk(view).find(n=>n.type==='button'&&n.props.children[0]==='本地识别并精剪');
 return {start:()=>start.props.onClick(),dispose:()=>hooks.effects.forEach(cleanup=>cleanup?.()),applied,applyOptions,calls:hooks.calls,view,elements:walk(view)};
}
const settle=async()=>{for(let n=0;n<15;n++)await Promise.resolve();};
const response=value=>({ok:true,json:async()=>value});
const withCapabilities=handler=>(url,options)=>url==='/api/retakes/capabilities'?Promise.resolve(response({codex:{ready:false,reason:'真实声音验证中'}})):handler(url,options);

test('closing during the analyze POST cancels the returned job without polling or applying',async()=>{
 const previous=globalThis.fetch,calls=[];let resolvePost;
 globalThis.fetch=withCapabilities((url,options)=>{calls.push({url,options});return url==='/api/retakes/analyze'?new Promise(resolve=>{resolvePost=resolve;}):Promise.resolve(response({status:'cancelled'}));});
 try{
  const h=await componentHarness();h.start();await settle();assert.equal(calls.length,1);
  h.dispose();resolvePost(response({jobId:'synthetic-race'}));await settle();
  assert.deepEqual(calls.map(c=>c.url),['/api/retakes/analyze','/api/retakes/synthetic-race/cancel']);assert.deepEqual(h.applied,[]);
  assert.equal(calls[0].options.signal,undefined); // preserve the receipt ID needed to cancel
 }finally{globalThis.fetch=previous;}
});

test('closing during a status request aborts polling and cancels the exact job',async()=>{
 const previous=globalThis.fetch,calls=[];
 globalThis.fetch=withCapabilities((url,options)=>{calls.push({url,options});if(url==='/api/retakes/analyze')return Promise.resolve(response({jobId:'synthetic-running'}));if(url.endsWith('/cancel'))return Promise.resolve(response({status:'cancelled'}));return new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(Error('aborted')),{once:true}));});
 try{
  const h=await componentHarness();h.start();await settle();assert.equal(calls.length,2);h.dispose();await settle();
  assert.equal(calls[1].options.signal.aborted,true);assert.equal(calls[2].url,'/api/retakes/synthetic-running/cancel');assert.deepEqual(h.applied,[]);
 }finally{globalThis.fetch=previous;}
});

test('a completed job applies once and closing afterwards does not cancel it',async()=>{
 const previous=globalThis.fetch,calls=[];
 globalThis.fetch=withCapabilities((url,options)=>{calls.push({url,options});return Promise.resolve(response(url==='/api/retakes/analyze'?{jobId:'synthetic-done'}:{id:'synthetic-done',status:'done',candidates:[]}));});
 try{
  const h=await componentHarness();h.start();await settle();assert.equal(h.applied.length,1);h.dispose();await settle();assert.equal(calls.length,2);
 }finally{globalThis.fetch=previous;}
});

test('initial UI keeps Codex unavailable until capability check and never offers Gemini',async()=>{
 const previous=globalThis.fetch;globalThis.fetch=withCapabilities(()=>{throw Error('unexpected analysis request');});
 try{
  const h=await componentHarness();
  const codex=h.elements.find(node=>node.type==='option'&&node.props.value==='codex');
  assert.equal(codex.props.disabled,true);assert.match(codex.props.children[0],/验证中/);
  assert.doesNotMatch(JSON.stringify(h.view),/Gemini/);
  await settle();h.dispose();assert.deepEqual(h.applied,[]);
 }finally{globalThis.fetch=previous;}
});

test('a completed review-only job never asks application to force review cuts',async()=>{
 const previous=globalThis.fetch;const candidate={id:'review',status:'review',confidence:'review'};
 globalThis.fetch=withCapabilities(url=>Promise.resolve(response(url==='/api/retakes/analyze'?{jobId:'synthetic-review'}:{id:'synthetic-review',status:'done',candidates:[candidate]})));
 try{
  const h=await componentHarness();h.start();await settle();assert.equal(h.applied.length,1);
  assert.deepEqual(h.applied[0].candidates,[candidate]);
  assert.equal(h.applyOptions[0],undefined,'poll completion never forces allowReview or explicit candidate IDs');
  assert.ok(h.calls.some(value=>typeof value==='string'&&/未应用删除.*不表示原片没有重录/.test(value)));
  h.dispose();
 }finally{globalThis.fetch=previous;}
});


test('whole-clip completion audits the exact applied snapshots once and never reapplies on audit status',async()=>{
 const previous=globalThis.fetch,calls=[],before={clips:[{id:'old'}]},after={clips:[{id:'remaining'}]};let polls=0;
 globalThis.fetch=withCapabilities((url,options)=>{
  calls.push({url,options});
  if(url==='/api/retakes/analyze')return Promise.resolve(response({jobId:'full'}));
  if(url.endsWith('/audit'))return Promise.resolve(response({jobId:'full',auditId:'audit-1'}));
  return Promise.resolve(response(++polls===1?{id:'full',status:'done',features:{independentRecall:true},candidates:[]}:{id:'full',status:'done',audit:{status:'done',signalStatus:'passed'},candidates:[]}));
 });
 try{
  const h=await componentHarness({applyResult:{ok:true,changed:true,appliedIds:['cut-1'],project:after,session:{base:before,retainedClipIds:{v:['v1']}}}});
  h.start();await settle();await settle();assert.equal(h.applied.length,1);
  const auditPost=calls.find(c=>c.url.endsWith('/audit'));assert.deepEqual(JSON.parse(auditPost.options.body),{projectBefore:before,projectAfter:after});
  assert.equal(auditPost.options.signal,undefined);h.dispose();await settle();
  assert.equal(calls.some(c=>c.url.endsWith('/cancel')),false);
 }finally{globalThis.fetch=previous;}
});

test('closing during audit creation preserves application but cancels the late audit receipt',async()=>{
 const previous=globalThis.fetch,calls=[];let resolveAudit;
 globalThis.fetch=withCapabilities((url,options)=>{
  calls.push({url,options});
  if(url==='/api/retakes/analyze')return Promise.resolve(response({jobId:'full-race'}));
  if(url.endsWith('/audit'))return new Promise(resolve=>{resolveAudit=resolve;});
  if(url.endsWith('/cancel'))return Promise.resolve(response({status:'cancelled'}));
  return Promise.resolve(response({id:'full-race',status:'done',features:{independentRecall:true},candidates:[]}));
 });
 try{
  const h=await componentHarness({applyResult:{ok:true,changed:true,appliedIds:['cut'],project:{clips:[]},session:{base:{clips:[]},retainedClipIds:{}}}});
  h.start();await settle();assert.equal(typeof resolveAudit,'function');assert.equal(h.applied.length,1);
  h.dispose();resolveAudit(response({jobId:'full-race',auditId:'late'}));await settle();
  assert.equal(h.applied.length,1);assert.equal(calls.filter(c=>c.url==='/api/retakes/full-race/cancel').length,2);
  assert.equal(calls.filter(c=>c.url==='/api/retakes/full-race').length,1,'no polling after close');
 }finally{globalThis.fetch=previous;}
});
