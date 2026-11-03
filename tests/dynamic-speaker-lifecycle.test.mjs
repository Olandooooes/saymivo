import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {storyboardFrameRange} from '../src/storyboard.mjs';
import {dynamicSourceSlotReport,dynamicRenderedSourceSlotReport} from '../src/dynamic-source-slot.mjs';

// Execute the installed SDK effect and our actual source component. This small
// dependency-aware hook host replaces React scheduling and media/network I/O;
// it is not a browser, decoded-media or finished-video acceptance test.
function hookHost(){
 const cells=[];let cursor=0,pending=[];
 const same=(a,b)=>a&&b&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]));
 const useRef=value=>{const i=cursor++;return cells[i]??(cells[i]={current:value});};
 const useMemo=(fn,deps)=>{const i=cursor++,old=cells[i];if(!old||!same(old.deps,deps))cells[i]={deps,value:fn()};return cells[i].value;};
 const effect=(fn,deps)=>{const i=cursor++,old=cells[i];if(!old||!same(old.deps,deps)){cells[i]={deps,cleanup:old?.cleanup};pending.push(()=>{cells[i].cleanup?.();cells[i].cleanup=fn();});}};
 const useState=value=>{const i=cursor++;if(!(i in cells))cells[i]=typeof value==='function'?value():value;return [cells[i],v=>{cells[i]=typeof v==='function'?v(cells[i]):v;}];};
 return {useRef,useMemo,useState,useCallback:(fn,deps)=>useMemo(()=>fn,deps),useEffect:effect,useLayoutEffect:effect,
  render(fn,props){cursor=0;const result=fn(props);const work=pending;pending=[];work.forEach(f=>f());return result;}};
}
const element=(type,props,...children)=>({type,props:{...props,children}});
function sourceComponent(){
 const file=new URL('../src/DynamicMotionRenderer.tsx',import.meta.url),source=fs.readFileSync(file,'utf8'),ast=ts.createSourceFile(file.pathname,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),node=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='DynamicSpeakerVideo');
 assert.ok(node,'actual source component must remain testable');
 const code=ts.transpileModule(node.getText(ast),{compilerOptions:{target:ts.ScriptTarget.ESNext,jsx:ts.JsxEmit.React}}).outputText;
 const hooks=hookHost(),clock={frame:3,fps:30},tag={},context={...hooks,React:{createElement:element},useVideoConfig:()=>({fps:clock.fps}),useCurrentFrame:()=>clock.frame,getRemotionEnvironment:()=>({isRendering:true}),storyboardFrameRange,sampleTransform:()=>({x:0,y:0,scale:1}),dynamicSourceSlotReport,dynamicRenderedSourceSlotReport,observePreviewMedia:()=>()=>{},staticFile:s=>s,OffthreadVideo:tag,Video:{}};
 const Component=vm.runInNewContext(code+'\nDynamicSpeakerVideo',context);
 const find=tree=>tree?.type===tag?tree:tree?.props?.children?.map(find).find(Boolean);
 return {clock,render:props=>find(hooks.render(Component,props)).props};
}
function installedOffthreadLifecycle(){
 const sdk=fs.readFileSync(new URL('../node_modules/remotion/dist/esm/index.mjs',import.meta.url),'utf8'),start=sdk.indexOf('var OffthreadVideoForRendering = ('),end=sdk.indexOf('// src/video/VideoForPreview.tsx',start);
 assert.ok(start>=0&&end>start,'installed SDK component not found');
 const hooks=hookHost(),requests=[],revoked=[],delayed=new Set();let blobId=0;
 const delayRender=()=>{const n=delayed.size+1;delayed.add(n);return n;},continueRender=n=>delayed.delete(n),context={...hooks,useMemo28:hooks.useMemo,useState19:hooks.useState,useEffect18:hooks.useEffect,useLayoutEffect10:hooks.useLayoutEffect,useCallback15:hooks.useCallback,useTimelinePosition:()=>3,useCurrentFrame:()=>3,useFrameForVolumeProp:()=>3,useUnsafeVideoConfig:()=>({fps:30}),useContext33:()=>({cumulatedFrom:0,relativeFrom:0,durationInFrames:60,registerRenderAsset:()=>{},unregisterRenderAsset:()=>{}}),SequenceContext:{},RenderAssetManager:{},useMediaStartsAt:()=>0,random:()=>1,evaluateVolume:()=>0,warnAboutTooHighVolume:()=>{},getExpectedMediaFrameUncorrected:({frame})=>frame,getOffthreadVideoSource:({src,currentTime})=>src+'?time='+currentTime,getAbsoluteSrc:s=>s,useDelayRender:()=>({delayRender,continueRender}),window:{remotion_videoEnabled:true,remotion_audioEnabled:false},AbortController,URL:{createObjectURL:()=>`blob:synthetic-${++blobId}`,revokeObjectURL:u=>revoked.push(u)},fetch:(url,options)=>new Promise(resolve=>requests.push({url,options,resolve})),cancelRender:error=>{throw error;},OBJECTFIT_CONTAIN_CLASS_NAME:'object-fit-contain',truthy:Boolean,Img:'decoded-image',jsx29:(type,props)=>({type,props})};
 const Component=vm.runInNewContext(sdk.slice(start,end)+'\nOffthreadVideoForRendering',context);
 return {requests,revoked,render:props=>hooks.render(Component,{src:'synthetic.mp4',muted:true,volume:0,playbackRate:1,...props}),async resolve(index=0){requests[index].resolve({status:200,blob:async()=>({})});await new Promise(resolve=>setImmediate(resolve));}};
}
const identity={src:'clips/synthetic.mp4',kind:'video',sha256:'a'.repeat(64),width:1920,height:1080},scene={id:'synthetic',src:identity.src,clipId:'voice',startMs:0,endMs:2000,phaseStartMs:0,phaseEndMs:2000,speed:1},props={scene,rawScene:{...scene,startMs:95000,endMs:97000},clip:{id:'voice',src:identity.src,fit:'cover',transform:[]},identity,onStatus:()=>{}};

test('installed OffthreadVideo clears its loaded image when only onError identity changes',async()=>{
 const sdk=installedOffthreadLifecycle(),first=()=>{};
 assert.equal(sdk.render({onError:first}),null);await sdk.resolve();
 assert.equal(sdk.render({onError:first})?.type,'decoded-image');assert.equal(sdk.requests.length,1);
 sdk.render({onError:()=>{}});
 assert.equal(sdk.render({onError:()=>{}}),null,'actual SDK setImageSrc(null) after a callback-only change');
 assert.ok(sdk.requests.length>1);assert.ok(sdk.revoked.includes('blob:synthetic-1'));
});

test('actual dynamic speaker retains loaded export image through same-frame owner rerenders',async()=>{
 const source=sourceComponent(),a=source.render(props),sdk=installedOffthreadLifecycle();
 sdk.render(a);await sdk.resolve();assert.equal(sdk.render(a)?.type,'decoded-image');
 // Native/measurement readiness may rerender its parent with fresh callbacks.
 const b=source.render({...props,onStatus:()=>{},onSourceReport:()=>{}});
 sdk.render(b);assert.equal(sdk.render(b)?.type,'decoded-image','callback-only rerender must not clear the loaded source image');assert.equal(sdk.requests.length,1,'same frame must not refetch or erase an already decoded image');
 assert.equal(b.onError,a.onError);assert.equal(b.onVideoFrame,a.onVideoFrame);
 for(const k of ['src','trimBefore','trimAfter','playbackRate','muted','volume','style'])assert.deepEqual(b[k],a[k]);
});

test('stable export callbacks report the latest owner, source identity and source clock',()=>{
 const source=sourceComponent(),old=[],current=[],a=source.render({...props,onStatus:v=>old.push(v),onSourceReport:v=>old.push(v)});
 source.clock.frame=4;const nextIdentity={...identity,src:'clips/new-synthetic.mp4',sha256:'b'.repeat(64)},b=source.render({...props,identity:nextIdentity,onStatus:v=>current.push(v),onSourceReport:v=>current.push(v)});
 assert.equal(b.onError,a.onError);assert.equal(b.onVideoFrame,a.onVideoFrame);
 const before=old.length;a.onVideoFrame({naturalWidth:1920,naturalHeight:1080});
 assert.equal(old.length,before,'stable callback must not retain old report owner');
 const report=current.find(v=>typeof v==='object');assert.equal(report.src,nextIdentity.src);assert.equal(report.sha256,nextIdentity.sha256);assert.ok(Math.abs(report.sourceMs-(95000+4000/30))<1e-8);assert.equal(report.status,'ready');
 a.onError(new Error('synthetic decoder failure'));assert.equal(current.at(-1).status,'blocked');assert.equal(current.at(-1).src,nextIdentity.src);
});
