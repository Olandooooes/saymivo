import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {visualContentRect} from '../src/visual-presets.mjs';
import {fitMeasuredText} from '../src/text-fit.mjs';

// A persistent synthetic hook host executes the REAL text hooks, async loaded
// font effects and cleanup across seeks. It is not a browser/pixel substitute.
const url=code=>'data:text/javascript;base64,'+Buffer.from(code).toString('base64'),reactUrl=import.meta.resolve('react');
const fakeReact=url(`import React from ${JSON.stringify(reactUrl)};export default React;export const createContext=React.createContext;export const useContext=c=>globalThis.__nativeLifecycle.context(c);export const useState=i=>globalThis.__nativeLifecycle.state(i);export const useLayoutEffect=(f,d)=>globalThis.__nativeLifecycle.effect(f,d);export const useCallback=(f,d)=>globalThis.__nativeLifecycle.callback(f,d);export const useId=()=>globalThis.__nativeLifecycle.id();`);
const common=url(`import React from ${JSON.stringify(reactUrl)};export const DisplayFontContext=React.createContext('synthetic-display');export const loadDisplayFont=()=>globalThis.__nativeLifecycle.fontPromise??Promise.resolve();export const AbsoluteFill=({children,...p})=>React.createElement('div',p,children);export const Img=p=>React.createElement('img',p);export const SceneMedia=()=>React.createElement('div',{'data-real-media-placeholder':true});export const useVideoConfig=()=>globalThis.__nativeLifecycle.viewport;export const delayRender=()=>1;export const continueRender=()=>{};export const cancelRender=e=>{throw e};export const staticFile=p=>p;`);
const cache=new Map();
function compiled(file){const fileUrl=new URL(file,import.meta.url);if(cache.has(fileUrl.href))return cache.get(fileUrl.href);const source=ts.transpileModule(fs.readFileSync(fileUrl,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ESNext,jsx:ts.JsxEmit.React}}).outputText.replace(/from (["'])([^"']+)\1/g,(_,q,s)=>{const target=s==='react'?fakeReact:['remotion','./DisplayFont','./SceneMedia'].includes(s)?common:s.startsWith('.')?(/\.mjs$/.test(s)?new URL(s,fileUrl).href:compiled(new URL(s+'.tsx',fileUrl).href)):import.meta.resolve(s);return `from ${JSON.stringify(target)}`;});const result=url(source);cache.set(fileUrl.href,result);return result;}
const {DynamicMechanismScene}=await import(compiled('../src/DynamicMechanismScene.tsx'));
const {MeasuredText}=await import(compiled('../src/MeasuredText.tsx')),{VisualPresetScene}=await import(compiled('../src/VisualPresetScene.tsx')),{DisplayFontContext}=await import(common);
const equal=(a,b)=>a?.length===b?.length&&a.every((v,i)=>Object.is(v,b[i]));
class HookHost{
 constructor(){this.viewport={width:1920,height:1080,fps:30};this.values=new Map();this.effects=new Map();this.callbacks=new Map();this.contexts=new Map();this.visited=new Set();this.pending=[];this.path='';this.cursor=0;this.dirty=false;this.measurements=0;}
 key(){return this.path+':'+this.cursor++;}
 context(c){this.key();return c===DisplayFontContext&&this.fontId!==undefined?this.fontId:this.contexts.has(c)?this.contexts.get(c):c._currentValue;}
 state(initial){const key=this.key();if(!this.values.has(key))this.values.set(key,typeof initial==='function'?initial():initial);return [this.values.get(key),value=>{const next=typeof value==='function'?value(this.values.get(key)):value;if(!Object.is(next,this.values.get(key))){this.values.set(key,next);this.dirty=true;}}];}
 callback(f,deps){const key=this.key(),old=this.callbacks.get(key);if(!old||!equal(old.deps,deps))this.callbacks.set(key,{deps,value:f});return this.callbacks.get(key).value;}
 effect(f,deps){const key=this.key(),old=this.effects.get(key);if(!old||!equal(old.deps,deps))this.pending.push({key,f,deps,owner:this.path});}
 id(){return 'synthetic-instance-'+this.key();}
 walk(value,path='root'){
  if(value===null||value===undefined||typeof value==='boolean')return null;if(Array.isArray(value))return value.map((child,i)=>{const v=this.walk(child,path+'/'+(React.isValidElement(child)&&child.key!==null?'k'+child.key:i));return React.isValidElement(v)&&v.key===null?React.cloneElement(v,{key:i}):v;});
  if(!React.isValidElement(value))return value;
  if(value.type===React.Fragment)return this.walk(value.props.children,path+'/fragment');
  if(typeof value.type==='function'){const oldPath=this.path,oldCursor=this.cursor;this.path=path;this.cursor=0;this.visited.add(path);const rendered=value.type(value.props);this.path=oldPath;this.cursor=oldCursor;return this.walk(rendered,path+'/render');}
  if(typeof value.type==='object'&&String(value.type.$$typeof).includes('context')){const c=value.type,had=this.contexts.has(c),prior=this.contexts.get(c);this.contexts.set(c,value.props.value);const rendered=this.walk(value.props.children,path+'/provider');if(had)this.contexts.set(c,prior);else this.contexts.delete(c);return rendered;}
  return React.cloneElement(value,undefined,this.walk(value.props.children,path+'/children'));
 }
 async settle(element){
  globalThis.__nativeLifecycle=this;const priorDocument=globalThis.document;
  globalThis.document={createElement:()=>({getContext:()=>({font:'600 24px synthetic',measureText(text){const size=Number(this.font.match(/([\d.]+)px/)?.[1]??24);globalThis.__nativeLifecycle.measurements++;return {width:[...text].reduce((sum,c)=>sum+(/[A-Za-z0-9 .]/.test(c)?.52:1),0)*size*(globalThis.__nativeLifecycle.widthFactor??1),actualBoundingBoxAscent:size*.8,actualBoundingBoxDescent:size*.2};}})})};
  try{for(let cycle=0;cycle<80;cycle++){
   this.dirty=false;this.visited=new Set();this.pending=[];const tree=this.walk(element);
   for(const [key,effect] of this.effects)if(!this.visited.has(effect.owner)){if(typeof effect.cleanup==='function')effect.cleanup();this.effects.delete(key);}
   for(const entry of this.pending){const old=this.effects.get(entry.key);if(typeof old?.cleanup==='function')old.cleanup();const cleanup=entry.f();this.effects.set(entry.key,{...entry,cleanup});}
   await Promise.resolve();await Promise.resolve();await Promise.resolve();
   if(!this.dirty){this.tree=tree;return renderToStaticMarkup(tree);}
  }throw Error('synthetic native hook host failed to settle');}finally{globalThis.document=priorDocument;delete globalThis.__nativeLifecycle;}
 }
}
const scene={id:'source',src:'clips/synthetic.mp4',clipId:'source',startMs:0,endMs:90000,layout:'speaker',title:'完整标题',body:'完整条件不能删掉',nodes:[{id:'a',text:'输入'},{id:'b',text:'中心'},{id:'c',text:'输出',detail:'先验证'}],media:{kind:'image',src:'broll-assets/synthetic.png',width:1000,height:800}};
const copy={atMs:0,endMs:20000,rect:{x:.05,y:.10,width:.65,height:.62},speakerRect:{x:.79,y:.48,width:.14,height:.24}};
const orbit={kind:'orbit-flow-variant',gatherAtMs:25000,gatherMs:1000,openAtMs:28000,flowAtMs:30000,sourceCopyWindow:copy};
const hub={kind:'hub-branch-flow',hubNodeId:'b',inputNodeIds:['a'],outputNodeIds:['c'],branchesAtMs:28000,branchDrawMs:600,nodeStaggerMs:300,flowAtMs:30000,flowMs:2000,particleCount:5,nodeStates:[{nodeId:'c',atMs:40000,durationMs:1000,state:'dim',explicitValue:{from:10,to:2,unit:'次',scale:{min:0,max:10}}}],matchToDiagram:{atMs:25000,durationMs:1000,from:copy.speakerRect,to:{x:.05,y:.55,width:.15,height:.27}},sourceCopyWindow:copy};
const speaker=()=>React.createElement('video',{'data-actual-source':'clips/synthetic.mp4'}),live=React.createElement('div',{'data-live-room':true});
function element(c,elapsed,onReadiness,s=scene){return React.createElement(DynamicMechanismScene,{scene:s,config:c,elapsed,renderSpeaker:speaker,hasRealCutout:true,liveBackground:live,onReadiness});}

test('real text effects settle after orbit node changes and seeking backwards without a stale report census',async()=>{
 const host=new HookHost(),reports=[],callback=r=>reports.push(r);
 for(const elapsed of [10000,31000,61000,31000,10000]){const html=await host.settle(element(orbit,elapsed,callback));assert.equal(reports.at(-1).status,'ready',JSON.stringify(reports.at(-1)));assert.equal(reports.at(-1).nativeReports,reports.at(-1).expectedNativeReports);assert.ok(html.includes('data-complete-source-status="ready"'));}
 const measured=host.measurements;await host.settle(element(orbit,31100,callback));const afterSwitch=host.measurements;await host.settle(element(orbit,31200,callback));assert.equal(host.measurements,afterSwitch,'elapsed alone cannot cause repeated loaded-font measurement');assert.ok(afterSwitch>=measured);
});

test('real hub late metric mount/unmount restores exact ready counts and consecutive animation frames keep layouts',async()=>{
 const host=new HookHost(),reports=[],callback=r=>reports.push(r);
 for(const elapsed of [10000,28000,39999,40000,40500,41000,10000]){const html=await host.settle(element(hub,elapsed,callback));assert.equal(reports.at(-1).status,'ready',JSON.stringify(reports.at(-1)));assert.equal(reports.at(-1).nativeReports,reports.at(-1).expectedNativeReports);assert.ok(html.includes('data-actual-source='));}
 await host.settle(element(hub,40500,callback));const measured=host.measurements;for(let t=40533;t<41000;t+=33)await host.settle(element(hub,t,callback));assert.equal(host.measurements,measured,'changing current value/position does not invalidate final glyph/maximum node boxes');
});

test('real measurement cleanup blocks changed unplaceable content rather than counting its old successful layout',async()=>{
 const host=new HookHost(),reports=[],callback=r=>reports.push(r);await host.settle(element(orbit,31000,callback));assert.equal(reports.at(-1).status,'ready');
 const changed={...scene,nodes:scene.nodes.map(n=>n.id==='b'?{...n,text:'UnbreakableWord'.repeat(100)}:n)};
 const html=await host.settle(element(orbit,31000,callback,changed));assert.equal(reports.at(-1).status,'blocked');assert.ok(html.includes('native-full-font-layout-unplaceable')||html.includes('complete-text-does-not-fit'));assert.ok(!html.includes('data-source-copy-window="true"'));
});

const clearScene=text=>({id:'clear-paragraphs',src:'clips/synthetic.mp4',clipId:'source',startMs:0,endMs:90000,title:'完整原话',nodes:[{id:'authored-lines',text}],visualPreset:{id:'clear-type',version:1,side:'left'}});
const measuredFit=host=>[...host.values.values()].find(value=>value?.fit?.pages)?.fit;
function assertCompleteBounds(fit,text,width,height,factor=1){
 assert.ok(fit);assert.equal(fit.unplaceable,false);assert.equal(fit.pages.flat().join(''),text.replaceAll('\n',''));assert.ok(fit.width<=width+.001);
 for(const page of fit.pages){assert.ok(page.length*fit.rowHeight<=height+.001);for(const line of page)assert.ok([...line].reduce((sum,c)=>sum+(/[A-Za-z0-9 .]/.test(c)?.52:1),0)*fit.fontSize*factor<=width+.001);}
}

test('actual loaded-font clear-type falls back to full wrapping and pages for long paragraphs in wide and portrait regions',async()=>{
 const long='所有限定条件必须完整保留，不能为了大字而丢掉后半句。'.repeat(18),text='未必知道\n'+long+'\n哪一步？';
 for(const viewport of [{width:1920,height:1080,fps:30},{width:1080,height:1920,fps:30}]){
  const host=new HookHost();host.viewport=viewport;const s=clearScene(text),rect=visualContentRect(s,viewport.width,viewport.height),height=rect.height-viewport.height*.15,before=structuredClone(s),html=await host.settle(React.createElement(VisualPresetScene,{scene:s,elapsed:1000})),fit=measuredFit(host);
  assert.ok([...long].length*viewport.height*.034>rect.width,'this paragraph cannot remain whole at the actual minimum font');assert.ok(fit.pages.length>1);assertCompleteBounds(fit,text,rect.width,height);assert.ok(fit.lines.includes('未必知道'));assert.ok(fit.lines.includes('哪一步？'));assert.ok(!html.includes('data-layout-error='));assert.deepEqual(s,before);
  const count=host.measurements;
  for(let page=0;page<fit.pages.length;page++){
   const frame=await host.settle(React.createElement(VisualPresetScene,{scene:s,elapsed:(page+.5)*90000/fit.pages.length}));assert.equal((frame.match(/aria-hidden="false"/g)??[]).length,1);assert.ok(frame.includes(`data-text-pages="${fit.pages.length}"`));assert.ok(!frame.includes('data-layout-error='));
  }
  assert.equal(host.measurements,count,'pagination uses the existing single measured layout');
 }
});

test('the actual portrait font falls back only for a paragraph too wide at minFont and retains every character',async()=>{
 const host=new HookHost();host.viewport={width:1080,height:1920,fps:30};const text='到底能做到\n哪一步？',s=clearScene(text),rect=visualContentRect(s,1080,1920),height=rect.height-1920*.15;
 assert.ok(5*1920*.034>rect.width);const html=await host.settle(React.createElement(VisualPresetScene,{scene:s,elapsed:1000})),fit=measuredFit(host);assert.ok(fit.lines.length>2);assert.ok(fit.lines.includes('哪一步？'));assertCompleteBounds(fit,text,rect.width,height);assert.ok(!html.includes('data-layout-error='));
});

test('paragraph preference waits for the selected loaded font and reevaluates width after changing font identity',async()=>{
 const host=new HookHost(),text='未必知道',props={text,width:100,height:250,minFont:20,maxFont:100,protectedPhrases:[text]};let release;host.fontPromise=new Promise(resolve=>{release=resolve;});host.widthFactor=1.3;
 assert.equal(await host.settle(React.createElement(MeasuredText,props)),'');assert.equal(host.measurements,0,'the paragraph decision must not use guessed or fallback font width');
 release();await host.settle(React.createElement(MeasuredText,props));let fit=measuredFit(host);assert.ok(fit.lines.length>1);assertCompleteBounds(fit,text,100,250,1.3);
 host.fontId='smiley';host.widthFactor=.5;await host.settle(React.createElement(MeasuredText,props));fit=measuredFit(host);assert.deepEqual(fit.lines,[text]);assertCompleteBounds(fit,text,100,250,.5);
});

test('the actual loaded-font type-relay shrinks a complete question or final word and keeps all authored detail/bullet lines',async()=>{
 const make=node=>({...clearScene(node.text),nodes:[node],visualPreset:{id:'type-relay',version:1,side:'left'}});
 for(const text of ['实际做到了什么？','这个方向值得关注']){
  const s=make({id:'original',text}),host=new HookHost(),rect=visualContentRect(s,1920,1080),height=rect.height-1080*.09,old=fitMeasuredText(text,{width:rect.width,height,minFont:1080*.04,maxFont:1080*.16,measure:(text,size)=>({width:[...text].length*size,ascent:size*.8,descent:size*.2})});
  assert.equal(old.lines.at(-1),[...text].at(-1),'the pre-fix maximum-size layout leaves the real punctuation/tail alone');
  const html=await host.settle(React.createElement(VisualPresetScene,{scene:s,elapsed:1000})),fit=measuredFit(host);assert.deepEqual(fit.lines,[text]);assert.ok(fit.fontSize<old.fontSize);assertCompleteBounds(fit,text,rect.width,height);assert.ok(html.includes('>'+text+'</div>'));assert.ok(!html.includes('data-layout-error='));
 }
 const node={id:'original-all-fields',text:'实际做到了什么？',detail:'这个方向值得关注',bullets:['仍需检查完整条件','不代表所有软件可复制']},s=make(node),before=structuredClone(s),host=new HookHost(),rect=visualContentRect(s,1920,1080),text=[node.text,node.detail,...node.bullets].join('\n');
 await host.settle(React.createElement(VisualPresetScene,{scene:s,elapsed:1000}));assert.deepEqual(measuredFit(host).lines,[node.text,node.detail,...node.bullets]);assertCompleteBounds(measuredFit(host),text,rect.width,rect.height-1080*.09);assert.deepEqual(s,before);
});

test('type-relay retains complete long paragraphs through natural wrapping and actual page selection in both aspect ratios',async()=>{
 const text='完整原句\n'+('不能为了大字省略限定条件，也不能把未验证说成已完成。'.repeat(25))+'\n仍需验证';
 for(const viewport of [{width:1920,height:1080,fps:30},{width:1080,height:1920,fps:30}]){
  const host=new HookHost();host.viewport=viewport;const s={...clearScene(text),visualPreset:{id:'type-relay',version:1,side:'left'}},before=structuredClone(s),rect=visualContentRect(s,viewport.width,viewport.height),height=rect.height-viewport.height*.09;
  const first=await host.settle(React.createElement(VisualPresetScene,{scene:s,elapsed:1000})),fit=measuredFit(host);assert.ok(fit.pages.length>1);assertCompleteBounds(fit,text,rect.width,height);assert.ok(!first.includes('data-layout-error='));assert.deepEqual(s,before);const count=host.measurements;
  for(let page=0;page<fit.pages.length;page++){const html=await host.settle(React.createElement(VisualPresetScene,{scene:s,elapsed:(page+.5)*90000/fit.pages.length}));assert.equal((html.match(/aria-hidden="false"/g)??[]).length,1);assert.ok(!html.includes('data-layout-error='));}
  assert.equal(host.measurements,count);
 }
});
