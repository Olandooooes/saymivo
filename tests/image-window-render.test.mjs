import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import ts from 'typescript';import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';
import {imageWindowMedia} from '../src/image-window-plan.mjs';
const data=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
const host=data(`import React from ${JSON.stringify(import.meta.resolve('react'))};export const Img=p=>React.createElement('img',p);export const Video=()=>null;export const OffthreadVideo=Video;export const Freeze=({children})=>children;export const Sequence=Freeze;export const staticFile=s=>'/'+s;export const useVideoConfig=()=>({fps:30});export const getRemotionEnvironment=()=>({isRendering:false});`);
const file=new URL('../src/SceneMedia.tsx',import.meta.url),code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText.replace(/from (["'])([^"']+)\1/g,(_,q,s)=>'from '+JSON.stringify(s==='remotion'?host:s.startsWith('.')?new URL(s,file).href:import.meta.resolve(s)));
const {SceneMedia}=await import(data(code));const media=imageWindowMedia([{id:'a',src:'broll-assets/a.jpg',width:1000,height:700},{id:'b',src:'broll-assets/b.jpg',width:900,height:600}],10000,{switchTimes:[5000],transitionMs:400});
const render=elapsed=>renderToStaticMarkup(React.createElement(SceneMedia,{scene:{id:'scene',startMs:0,endMs:10000,media},elapsed,width:1600,height:850}));
test('real media component keeps one image before the cue and two during the handoff',()=>{
 assert.ok(render(2000).includes('data-window-image="a"'));assert.ok(!render(2000).includes('data-window-image="b"'));const cross=render(5200);assert.ok(cross.includes('data-window-image="a"')&&cross.includes('data-window-image="b"'));assert.ok(cross.includes('opacity:0.5'));assert.ok(render(6000).includes('data-window-image="b"')&&!render(6000).includes('data-window-image="a"'));
});
