import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

// Inert JSX and persistent hooks exercise async receipts, rerenders and cleanup.
// This does not open a browser, project, media file or network connection.
let serial=0;
async function harness(){
 const reactCode=`export const slots=[];let index=0;export function begin(){index=0}export function useRef(v){let i=index++;return slots[i]??={current:v}}export function useState(v){let i=index++;slots[i]??={value:v};return[slots[i].value,x=>{slots[i].value=typeof x==='function'?x(slots[i].value):x}]}export function useEffect(fn,deps){let i=index++,s=slots[i];if(!s||deps.some((d,n)=>d!==s.deps[n])){s?.cleanup?.();slots[i]={deps,cleanup:fn()}}}export function dispose(){for(const s of slots)s?.cleanup?.()}const React={createElement:(type,props,...children)=>({type,props:{...props,children}})};export default React;//${serial++}`;
 const reactUrl='data:text/javascript;base64,'+Buffer.from(reactCode).toString('base64'),url=new URL('../editor/MatteTools.tsx',import.meta.url);
 const source=ts.transpileModule(fs.readFileSync(url,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText.replace(/from (["'])([^"']+)\1/g,(_,q,s)=>`from ${JSON.stringify(s==='react'?reactUrl:new URL(s,url).href)}`);
 const {MatteTools}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64')),hooks=await import(reactUrl),bound=[];
 let scene={id:'s',clipId:'c',src:'clips/synthetic.mp4',startMs:0,endMs:100};
 const walk=n=>!n||typeof n!=='object'?[]:[n,...(n.props?.children??[]).flatMap(c=>Array.isArray(c)?c.flatMap(walk):walk(c))];
 const render=(next=scene)=>{scene=next;hooks.begin();return walk(MatteTools({scene,onBind:m=>bound.push(m)}));};
 const button=label=>render().find(n=>n.type==='button'&&n.props.children[0]===label);
 return {render,button,bound,dispose:hooks.dispose,job:()=>hooks.slots[0].value,busy:()=>hooks.slots[1].value};
}
const settle=async()=>{for(let n=0;n<30;n++)await Promise.resolve();};
const response=(value,ok=true)=>({ok,json:async()=>value});
const matte={src:'clips/synthetic.mp4',prefix:'broll-assets/synthetic/frame-',sourceSha256:'a'.repeat(64),width:16,height:9,
 sourceStartMs:0,fps:30,count:3,timesMs:[0,1000/30,2000/30],endMs:100};

test('closing before the POST receipt arrives cancels its exact job, without polling or binding',async t=>{
 const prior=globalThis.fetch,calls=[];let resolvePost;globalThis.fetch=(url,options)=>{calls.push({url,options});return url.endsWith('/analyze')?new Promise(r=>resolvePost=r):Promise.resolve(response({status:'cancelled'}));};
 t.after(()=>globalThis.fetch=prior);const h=await harness();t.after(h.dispose);
 h.button('生成本段人物分层').props.onClick();await settle();h.dispose();resolvePost(response({jobId:'late-receipt'}));await settle();
 assert.deepEqual(calls.map(c=>c.url),['/api/person-matte/analyze','/api/person-matte/late-receipt/cancel']);assert.equal(calls[0].options.signal,undefined);assert.equal(h.bound.length,0);
});
test('an old delayed cancel response cannot overwrite a newer running job',async t=>{
 const prior=globalThis.fetch;let jobs=0,cancels=0,finishFirst;
 globalThis.fetch=(url,options)=>{
  if(url.endsWith('/analyze'))return Promise.resolve(response({jobId:'job'+ ++jobs}));
  if(url==='/api/person-matte/job1/cancel'){cancels++;return cancels===1?new Promise(r=>finishFirst=r):Promise.resolve(response({status:'cancelled'}));}
  return Promise.resolve(response({id:url.includes('job2')?'job2':'job1',status:options?.method==='POST'?'cancelled':'running'}));
 };
 t.after(()=>globalThis.fetch=prior);const h=await harness();t.after(h.dispose);
 h.button('生成本段人物分层').props.onClick();await settle();h.button('取消分层').props.onClick();await settle();
 assert.equal(h.button('生成本段人物分层').props.disabled,true,'wait for a confirmed remote cancellation');
 h.button('取消分层').props.onClick();await settle();h.button('生成本段人物分层').props.onClick();await settle();
 assert.equal(h.job().id,'job2');finishFirst(response({status:'cancelled'}));await settle();
 assert.equal(h.job().id,'job2');assert.equal(h.job().status,'running');assert.equal(h.busy(),true);
});
test('changing the scene aborts polling and immediately cancels its old job, never binding a late done',async t=>{
 const prior=globalThis.fetch,calls=[];let finishGet,getSignal;
 globalThis.fetch=(url,options)=>{calls.push(url);if(url.endsWith('/analyze'))return Promise.resolve(response({jobId:'scene-old'}));if(url.endsWith('/cancel'))return Promise.resolve(response({status:'cancelled'}));getSignal=options.signal;return new Promise(r=>finishGet=r);};
 t.after(()=>globalThis.fetch=prior);const h=await harness();t.after(h.dispose);
 h.button('生成本段人物分层').props.onClick();await settle();h.render({id:'new-scene',clipId:'new-clip',src:'clips/other.mp4',startMs:200,endMs:300});await settle();
 assert.equal(getSignal.aborted,true);assert.ok(calls.includes('/api/person-matte/scene-old/cancel'));
 finishGet(response({id:'scene-old',status:'done',result:{personMatte:matte}}));await settle();assert.equal(h.bound.length,0);
});
test('a source change while POST is pending cancels the eventual receipt without polling',async t=>{
 const prior=globalThis.fetch,calls=[];let finishPost;
 globalThis.fetch=url=>{calls.push(url);return url.endsWith('/analyze')?new Promise(r=>finishPost=r):Promise.resolve(response({status:'cancelled'}));};
 t.after(()=>globalThis.fetch=prior);const h=await harness();t.after(h.dispose);
 h.button('生成本段人物分层').props.onClick();await settle();h.render({id:'s',clipId:'c',src:'clips/synthetic.mp4',startMs:1,endMs:100});
 finishPost(response({jobId:'changed-source'}));await settle();assert.deepEqual(calls,['/api/person-matte/analyze','/api/person-matte/changed-source/cancel']);assert.equal(h.bound.length,0);
});
test('invalid done results remain unbound and never display binding success',async t=>{
 const prior=globalThis.fetch;globalThis.fetch=url=>Promise.resolve(response(url.endsWith('/analyze')?{jobId:'invalid'}:{id:'invalid',status:'done',result:{personMatte:{...matte,src:'clips/wrong.mp4'}}}));
 t.after(()=>globalThis.fetch=prior);const h=await harness();t.after(h.dispose);h.button('生成本段人物分层').props.onClick();await settle();
 const text=JSON.stringify(h.render());assert.equal(h.bound.length,0);assert.match(text,/未绑定/);assert.doesNotMatch(text,/已生成并绑定/);
});
test('a failed remote cancel is not reported as cancelled and can be retried',async t=>{
 const prior=globalThis.fetch;let cancelled=0;
 globalThis.fetch=(url,options)=>Promise.resolve(response(url.endsWith('/analyze')?{jobId:'retry'}:url.endsWith('/cancel')?(++cancelled===1?{error:'network failure'}:{status:'cancelled'}):{id:'retry',status:'running'},!url.endsWith('/cancel')||cancelled!==1));
 t.after(()=>globalThis.fetch=prior);const h=await harness();t.after(h.dispose);h.button('生成本段人物分层').props.onClick();await settle();h.button('取消分层').props.onClick();await settle();
 assert.equal(h.job().status,'stopping');assert.match(JSON.stringify(h.render()),/取消未确认/);
 h.button('重试取消后台任务').props.onClick();await settle();assert.equal(h.job().status,'cancelled');
});
test('a valid completion binds once and later unmount does not cancel its saved media',async t=>{
 const prior=globalThis.fetch,calls=[];globalThis.fetch=url=>{calls.push(url);return Promise.resolve(response(url.endsWith('/analyze')?{jobId:'valid'}:{id:'valid',status:'done',result:{personMatte:matte}}));};
 t.after(()=>globalThis.fetch=prior);const h=await harness();t.after(h.dispose);h.button('生成本段人物分层').props.onClick();await settle();
 assert.equal(h.bound.length,1);assert.match(JSON.stringify(h.render()),/已生成并绑定/);h.dispose();await settle();assert.equal(calls.length,2);
});
