import {bindDynamicMatteElement,dynamicMatteFrameAt} from '../src/dynamic-matte.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {dynamicMotionEnvironmentFromState,createSceneDynamicMotionDraft,sceneDynamicMotionDraftKey,createDynamicMotionRenderSession,assessSceneDynamicMotion,previewSceneDynamicMotion,validateSavedSceneDynamicMotion} from '../src/scene-dynamic-motion.mjs';
import {applyDynamicMotionToStore,clearDynamicMotionFromStore} from '../editor/apply-dynamic-motion.mjs';

const source={src:'clips/synthetic.mp4',sha256:'a'.repeat(64),kind:'video',width:1920,height:1080,durationSec:12};
const scene={id:'scene',src:source.src,clipId:'original',startMs:1000,endMs:7000,layout:'cards',title:'AI Agent',nodes:[{id:'phrase',text:'AI Agent'}],window:{x:.8,y:.3,size:.15},tags:[{id:'kept',text:'完整作者标签',atMs:0,endMs:1000,x:.1,y:.2}]};
const config={kind:'emphasis-phrase',items:[{nodeId:'phrase',rect:{x:.05,y:.1,width:.5,height:.2},atMs:0,endMs:6000,fromScale:1}]};
const clip={id:'original',src:source.src,inSec:0,outSec:10,speed:1,sourceDurationSec:12};
const state=(overrides={})=>({clips:[clip],presentation:{theme:'knowledge',format:'landscape',chapters:[],displayFont:'douyin',scenes:[scene]},accentColor:'#123456',meta:{fps:30,width:1920,height:1080,durationInFrames:300},...overrides});
const evidence={sourceIdentity:source,assets:[],font:{status:'ready'}};
const setup=(s=state(),raw=s.presentation.scenes[0],motion=config)=>{const env=dynamicMotionEnvironmentFromState(s,evidence),draft=createSceneDynamicMotionDraft(raw,motion,env);return {s,raw,env,draft};};

// Synthetic DOM geometry exercises the production observer without launching a
// browser or relying on private media. This is not UI/real-font acceptance.
const rect=(x=0,y=0,width=960,height=540)=>({left:x,top:y,right:x+width,bottom:y+height,width,height});
class Element {
 constructor(tag='div',attributes={},box=rect(),style={}){this.tagName=tag.toUpperCase();this.attributes={...attributes};this.box=box;this.style=style;this.children=[];this.parentElement=null;this.nodeType=1;this.hidden=false;this.isConnected=true;}
 append(child){child.parentElement=this;child.ownerDocument=this.ownerDocument;this.children.push(child);return child;}
 getAttribute(key){return this.attributes[key]??null;}
 getBoundingClientRect(){return this.box;}
 contains(item){return item===this||this.children.some(child=>child.nodeType===1&&child.contains(item));}
 matches(selector){return selector.split(',').some(part=>{const attr=part.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/);return attr?this.getAttribute(attr[1])!==null&&(attr[2]===undefined||this.getAttribute(attr[1])===attr[2]):this.tagName===part.toUpperCase();});}
 closest(selector){for(let p=this;p;p=p.parentElement)if(p.matches(selector))return p;return null;}
 querySelectorAll(selector){return this.children.flatMap(child=>child.nodeType===1?[...(child.matches(selector)?[child]:[]),...child.querySelectorAll(selector)]:[]);}
 querySelector(selector){return this.querySelectorAll(selector)[0]??null;}
}
function fixture(draft,id='scene:original',texts=['AI Agent']){
 const doc={fonts:{status:'loaded',check:()=>true,forEach:fn=>fn({family:'Koubo Douyin',status:'loaded'})},defaultView:{getComputedStyle:element=>{const inherited=key=>{for(let p=element;p;p=p.parentElement)if(p.style[key]!==undefined)return p.style[key];return undefined;};return {display:'block',visibility:'visible',opacity:'1',overflow:'visible',overflowX:'visible',overflowY:'visible',clipPath:'none',fontSize:inherited('fontSize')??'32px',fontFamily:inherited('fontFamily')??'"Koubo Douyin", sans-serif',fontWeight:inherited('fontWeight')??'400',...element.style};}},createTreeWalker:root=>{const nodes=[];const walk=e=>e.children.forEach(c=>c.nodeType===3?nodes.push(c):walk(c));walk(root);let i=0;return {nextNode:()=>nodes[i++]??null};},createRange:()=>{let target;return {selectNodeContents:n=>{target=n;},getClientRects:()=>[target.box],detach:()=>{}};}};
 const root=new Element('div',{'data-dynamic-draft-key':sceneDynamicMotionDraftKey(draft),'data-dynamic-projection-id':id,'data-dynamic-preview-status':'ready','data-dynamic-preview-kind':draft.config.kind,'data-dynamic-source-ms':'1000'});root.ownerDocument=doc;
 const person=root.append(new Element('div',{'data-dynamic-real-source':source.src},rect(770,160,140,140))),video=person.append(new Element('video',{},person.box));Object.assign(video,{readyState:2,error:null,videoWidth:1920,videoHeight:1080,currentTime:1,src:'http://localhost/'+source.src});
 const planes=texts.map((text,i)=>{const plane=root.append(new Element('div',{'data-measured-text':'true'},rect(50,60+i*50,600,45)));plane.append({nodeType:3,nodeValue:text,box:rect(50,60+i*50,Math.max(1,text.length*15),40)});return plane;});
 const readiness={status:'ready',nativeStatus:'ready',sourceStatus:'ready',assetStatus:'ready',projectionId:id,issues:[]};
 return {root,doc,video,planes,readiness,frame(ms){root.attributes['data-dynamic-source-ms']=String(ms);video.currentTime=ms/1000;return {root,readiness};}};
}
function recordLoop(session,draft,id='scene:original',options={}){
 const f=options.fixture??fixture(draft,id,options.texts),start=options.start??1000,end=options.end??6966.6667,step=options.step??100;
 for(let ms=start;ms<end;ms+=step){f.frame(ms);session.recordFrame(f.root,id,ms,f.readiness);}f.frame(end);session.recordFrame(f.root,id,end,f.readiness);return f;
}
const finish=(session,draft)=>session.finish({reviewed:true,personSafe:true,reviewedDraftKey:sceneDynamicMotionDraftKey(draft)});
function receiptFor(p){const session=createDynamicMotionRenderSession(p.draft,p.raw,p.env);recordLoop(session,p.draft);const done=finish(session,p.draft);assert.equal(done.ok,true,done.issues.join('\n'));return done.receipt;}

test('saved motion preserves content and identity and is valid after its own selection is attached',()=>{
 const p=setup(),saved=previewSceneDynamicMotion(p.draft),applied={...p.raw,dynamicMotion:saved};
 assert.deepEqual(saved.sourceIdentity,source);assert.deepEqual(saved.assetIdentities,[]);assert.equal(validateSavedSceneDynamicMotion(applied,p.env).ok,true);
 assert.equal(validateSavedSceneDynamicMotion({...applied,visualPreset:{id:'fine-process',version:1}},p.env).ok,false);
 const projected={...p.raw,sourceId:p.raw.id,phaseStartMs:0};assert.throws(()=>createSceneDynamicMotionDraft(projected,config,p.env),/投影片段/);
});
test('a complete real-DOM contract can apply; JSON flags, copied receipts, and foreign drafts cannot',()=>{
 const p=setup(),receipt=receiptFor(p);
 assert.equal(assessSceneDynamicMotion(p.draft,p.raw,p.env,receipt).canApply,true);
 for(const fake of [{draftKey:sceneDynamicMotionDraftKey(p.draft),displayedFields:['title','node:phrase:text'],reviewed:true},JSON.parse(JSON.stringify(receipt))])assert.equal(assessSceneDynamicMotion(p.draft,p.raw,p.env,fake).ok,false);
 const next=createSceneDynamicMotionDraft(p.raw,config,p.env);assert.notEqual(sceneDynamicMotionDraftKey(next),sceneDynamicMotionDraftKey(p.draft));assert.equal(assessSceneDynamicMotion(next,p.raw,p.env,receipt).ok,false);
});
test('hidden full pages and English words missing their space never prove complete rendered text',()=>{
 const p=setup(),session=createDynamicMotionRenderSession(p.draft,p.raw,p.env),f=fixture(p.draft,'scene:original',['AIAgent','AI Agent']);f.planes[1].attributes['aria-hidden']='true';
 recordLoop(session,p.draft,'scene:original',{fixture:f});assert.equal(finish(session,p.draft).ok,false);assert.ok(session.getProgress().projections[0].missingText.length);
 f.planes[1].attributes['aria-hidden']='false';recordLoop(session,p.draft,'scene:original',{fixture:f});assert.equal(finish(session,p.draft).ok,true);
});
test('all actual text pages can contribute and short words/spaces are not thrown away',()=>{
 const p=setup(),session=createDynamicMotionRenderSession(p.draft,p.raw,p.env),f=fixture(p.draft,'scene:original',['AI ']);
 recordLoop(session,p.draft,'scene:original',{fixture:f});assert.equal(finish(session,p.draft).ok,false);
 f.planes[0].children[0].nodeValue='Agent';recordLoop(session,p.draft,'scene:original',{fixture:f});assert.equal(finish(session,p.draft).ok,true);
});
test('wrong projection/clock, unloaded fonts/person and clipped text cannot be replaced by native ready flags',()=>{
 for(const change of [f=>{f.root.attributes['data-dynamic-projection-id']='different';},f=>{f.doc.fonts.check=()=>false;},f=>{f.doc.fonts.forEach=()=>{};},f=>{f.planes[0].style.fontFamily='Arial';},f=>{f.video.readyState=1;},f=>{f.video.style.opacity='0';},f=>{f.video.videoWidth=200;},f=>{f.planes[0].children[0].box=rect(50,490,200,40);},f=>{f.planes[0].style.clipPath='inset(0 90% 0 0)';}]){
  const p=setup(),session=createDynamicMotionRenderSession(p.draft,p.raw,p.env),f=fixture(p.draft);change(f);recordLoop(session,p.draft,'scene:original',{fixture:f});assert.equal(finish(session,p.draft).ok,false);
 }
 const p=setup(),session=createDynamicMotionRenderSession(p.draft,p.raw,p.env),f=fixture(p.draft);f.root.attributes['data-dynamic-source-ms']='2000';assert.equal(session.recordFrame(f.root,'scene:original',1000,f.readiness).ok,false);
});
test('coverage requires middle frames, not just source endpoints, and can continue after failed finish',()=>{
 const p=setup(),session=createDynamicMotionRenderSession(p.draft,p.raw,p.env),f=fixture(p.draft);
 for(const ms of [1000,6966]){f.frame(ms);session.recordFrame(f.root,'scene:original',ms,f.readiness);}assert.equal(finish(session,p.draft).ok,false);
 recordLoop(session,p.draft);assert.equal(finish(session,p.draft).ok,true);assert.equal(session.finish({reviewed:true,personSafe:false,reviewedDraftKey:sceneDynamicMotionDraftKey(p.draft)}).ok,false);
});
test('progress explains real accepted first/last and gaps without accepting rejected DOM samples or changing the receipt gate',()=>{
 const p=setup(),session=createDynamicMotionRenderSession(p.draft,p.raw,p.env),f=fixture(p.draft),id='scene:original';
 let progress=session.getProgress().projections[0];assert.equal(progress.timing.firstSourceMs,null);assert.equal(progress.timing.lastSourceMs,null);assert.equal(progress.timing.missingStart,true);assert.equal(progress.timing.missingEnd,true);
 for(const ms of [1100,1200,1600,6800]){f.frame(ms);assert.equal(session.recordFrame(f.root,id,ms,f.readiness).ok,true);}
 f.frame(1000);f.video.readyState=1;assert.equal(session.recordFrame(f.root,id,1000,f.readiness).ok,false);f.video.readyState=2;
 progress=session.getProgress().projections[0];assert.equal(progress.timing.firstSourceMs,1100);assert.equal(progress.timing.lastSourceMs,6800);assert.equal(progress.timing.largestGapMs,5200);assert.equal(progress.timing.gapLimitMs,250);assert.deepEqual(progress.timing.gaps,[{fromMs:1200,toMs:1600,gapMs:400},{fromMs:1600,toMs:6800,gapMs:5200}]);assert.equal(progress.timing.missingStart,true);assert.equal(progress.timing.missingEnd,true);assert.equal(progress.covered,false);assert.equal(finish(session,p.draft).ok,false);
 recordLoop(session,p.draft,id,{fixture:f});progress=session.getProgress().projections[0];assert.equal(progress.timing.missingStart,false);assert.equal(progress.timing.missingEnd,false);assert.deepEqual(progress.timing.gaps,[]);assert.equal(progress.covered,true);assert.equal(finish(session,p.draft).ok,true);
});
test('diagnostics keep duplicate same-source instances separate and do not invent samples from progress reads',()=>{
 const s=state({clips:[clip,{...clip,id:'duplicate'}]}),p=setup(s),session=createDynamicMotionRenderSession(p.draft,p.raw,p.env);recordLoop(session,p.draft);
 const a=session.getProgress(),b=session.getProgress();assert.deepEqual(a,b);const original=a.projections.find(p=>p.id==='scene:original'),duplicate=a.projections.find(p=>p.id==='scene:duplicate');assert.equal(original.covered,true);assert.equal(duplicate.timing.firstSourceMs,null);assert.equal(duplicate.samples,0);assert.equal(duplicate.covered,false);assert.equal(finish(session,p.draft).ok,false);
});
test('native waits and rejected DOM runs remain diagnostic, bounded, and cannot supply accepted coverage',()=>{
 const p=setup(),session=createDynamicMotionRenderSession(p.draft,p.raw,p.env),id='scene:original',f=fixture(p.draft);
 const waiting={...f.readiness,status:'waiting',nativeStatus:'waiting',issues:['actual-audio-clock-required']};
 session.recordUnavailable(id,1000,waiting);session.recordUnavailable(id,1033,waiting);
 let progress=session.getProgress().projections[0];assert.equal(progress.samples,0);assert.equal(progress.timing.firstSourceMs,null);assert.equal(progress.rejections.native,2);assert.deepEqual(progress.rejections.groups[0],{kind:'native',fromMs:1000,toMs:1033,samples:2,issues:['status:waiting','nativeStatus:waiting','actual-audio-clock-required']});assert.equal(finish(session,p.draft).ok,false);
 f.video.readyState=1;f.frame(1100);session.recordFrame(f.root,id,1100,f.readiness);progress=session.getProgress().projections[0];assert.equal(progress.rejections.dom,1);assert.equal(progress.samples,0);
 f.video.readyState=2;recordLoop(session,p.draft,id,{fixture:f});const before=session.getProgress().projections[0];assert.equal(finish(session,p.draft).ok,true);
 for(let i=0;i<300;i++)session.recordUnavailable(id,1000+i*10,{...waiting,issues:['reason-'+i]});
 progress=session.getProgress().projections[0];assert.equal(progress.rejections.groups.length,256);assert.equal(progress.samples,before.samples);assert.deepEqual(progress.timing,before.timing);assert.deepEqual(progress.missingText,before.missingText);assert.equal(finish(session,p.draft).ok,true);
 progress.rejections.groups[0].issues.push('caller edit');assert.ok(!JSON.stringify(session.getProgress()).includes('caller edit'));
});
test('same-source duplicate retained instances need independent time and full-text observations',()=>{
 const s=state({clips:[clip,{...clip,id:'duplicate'}]}),p=setup(s),session=createDynamicMotionRenderSession(p.draft,p.raw,p.env);recordLoop(session,p.draft);
 assert.equal(finish(session,p.draft).ok,false);assert.equal(session.getProgress().projections.find(p=>p.id==='scene:duplicate').covered,false);
 recordLoop(session,p.draft,'scene:duplicate');assert.equal(finish(session,p.draft).ok,true);
});
test('source dimensions, SHA, cut order/speed, original words, font, appearance and preset changes invalidate old proof',()=>{
 const p=setup(),receipt=receiptFor(p);
 const changes=[env=>({...env,sourceIdentity:{...source,sha256:'b'.repeat(64)}}),env=>({...env,sourceIdentity:{...source,width:1080}}),env=>({...env,clips:[{...clip,speed:2}]}),env=>({...env,clips:[{...clip,id:'new-instance'}]}),env=>({...env,font:{...env.font,key:'smiley'}}),env=>({...env,appearance:{changed:true}})];
 for(const change of changes)assert.equal(assessSceneDynamicMotion(p.draft,p.raw,change(p.env),receipt).ok,false);
 assert.equal(assessSceneDynamicMotion(p.draft,{...p.raw,title:'改写原文'},p.env,receipt).ok,false);
 assert.equal(assessSceneDynamicMotion(p.draft,{...p.raw,visualPreset:{id:'fine-process',version:1}},p.env,receipt).ok,false);
 const key=sceneDynamicMotionDraftKey(p.draft);p.draft.config.items[0].rect.x=.08;assert.notEqual(sceneDynamicMotionDraftKey(p.draft),key);assert.equal(assessSceneDynamicMotion(p.draft,p.raw,p.env,receipt).ok,false);
});
test('loading flags do not change saved signatures but actual asset identities do',()=>{
 const raw={...scene,media:{kind:'image',src:'broll-assets/synthetic.png',width:800,height:600}},asset={src:raw.media.src,sha256:'b'.repeat(64),kind:'image',width:800,height:600,status:'ready'},s=state({presentation:{...state().presentation,scenes:[raw]}}),env=dynamicMotionEnvironmentFromState(s,{...evidence,assets:[asset]}),draft=createSceneDynamicMotionDraft(raw,{kind:'evidence-handoff'},env),saved={...raw,dynamicMotion:previewSceneDynamicMotion(draft)};
 assert.equal(validateSavedSceneDynamicMotion(saved,{...env,font:{key:env.font.key,status:'loading'},assets:[{...asset,status:'loading'}]}).ok,true);
 assert.equal(validateSavedSceneDynamicMotion(saved,{...env,assets:[{...asset,sha256:'c'.repeat(64)}]}).ok,false);
 assert.throws(()=>createSceneDynamicMotionDraft(raw,config,{...env,assets:[]}),/资料素材身份/);
});

const moduleUrl=source=>'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64');
const timelineUrl=moduleUrl(fs.readFileSync(new URL('../src/timeline.ts',import.meta.url),'utf8'));
const storeUrl=new URL('../editor/store.ts',import.meta.url),storeSource=ts.transpileModule(fs.readFileSync(storeUrl,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText.replace(/from (["'])([^"']+)\1/g,(_,q,s)=>`from ${JSON.stringify(s.endsWith('/timeline')?timelineUrl:s.startsWith('.')?new URL(s,storeUrl).href:import.meta.resolve(s))}`);
const {useEditor}=await import('data:text/javascript;base64,'+Buffer.from(storeSource).toString('base64'));
function initStore(){const s=state(),captions=[{id:'cap',clipId:clip.id,startMs:1000,endMs:3000,words:[{text:'真人原声',startMs:1000,endMs:3000}]}];useEditor.getState().init(s.meta,captions,s.accentColor,s.clips,null,[],[],s.presentation);return {captions,s};}
test('the real store applies one scene with one undo, preserving all source text/times/person layout/audio and captions',()=>{
 const {captions}=initStore(),before=useEditor.getState(),raw=before.presentation.scenes[0],p=setup(before,raw),receipt=receiptFor(p);
 assert.equal(applyDynamicMotionToStore(useEditor,p.draft,p.env,receipt).ok,true);
 const after=useEditor.getState();assert.equal(after.past.length,1);assert.equal(after.clips,before.clips);assert.equal(after.captions,captions);assert.equal(after.music,before.music);
 const {dynamicMotion,...rest}=after.presentation.scenes[0];assert.deepEqual(rest,raw);assert.equal(rest.nodes,raw.nodes);assert.equal(rest.window,raw.window);assert.equal(validateSavedSceneDynamicMotion(after.presentation.scenes[0],dynamicMotionEnvironmentFromState(after,evidence)).ok,true);
 useEditor.getState().undo();assert.deepEqual(useEditor.getState().presentation,before.presentation);assert.equal(useEditor.getState().clips,before.clips);
});
test('store helper rejects stale live cuts/settings even when the caller supplies its old environment',()=>{
 initStore();const p=setup(useEditor.getState()),receipt=receiptFor(p);useEditor.setState({clips:[{...clip,speed:2}]});const before=useEditor.getState();
 assert.equal(applyDynamicMotionToStore(useEditor,p.draft,p.env,receipt).ok,false);assert.equal(useEditor.getState().past.length,before.past.length);assert.equal(useEditor.getState().presentation,before.presentation);
});
test('mutual exclusion removes only visualPreset; clearing is one undo and repeated clear is a no-op',()=>{
 initStore();const initial=useEditor.getState(),raw={...scene,visualPreset:{id:'fine-process',version:1}};useEditor.setState({presentation:{...initial.presentation,scenes:[raw]}});const p=setup(useEditor.getState(),raw),receipt=receiptFor(p);
 assert.equal(applyDynamicMotionToStore(useEditor,p.draft,p.env,receipt).ok,true);assert.equal(useEditor.getState().presentation.scenes[0].visualPreset,undefined);
 assert.equal(clearDynamicMotionFromStore(useEditor,scene.id).changed,true);assert.equal(useEditor.getState().past.length,2);assert.equal(clearDynamicMotionFromStore(useEditor,scene.id).changed,false);assert.equal(useEditor.getState().past.length,2);
 useEditor.getState().undo();assert.ok(useEditor.getState().presentation.scenes[0].dynamicMotion);useEditor.getState().undo();assert.deepEqual(useEditor.getState().presentation.scenes[0],raw);
});

 test('text-only motion cannot hide existing media; ROI cannot hide a second unused node asset',()=>{
 const media={src:'broll-assets/evidence.png',kind:'image',width:800,height:600},asset={...media,sha256:'b'.repeat(64)},raw={...scene,media},env=dynamicMotionEnvironmentFromState(state(),{...evidence,assets:[asset]});
 for(const kind of ['emphasis-phrase','flip-board','number-counter','glass-capsules','bar-group-variant','bilingual-board-transition','closed-loop-runner','quantified-funnel-flow','quantitative-chart','progressive-ui','task-tracks']){
  const draft=createSceneDynamicMotionDraft(raw,{...config,kind},env),result=validateSavedSceneDynamicMotion({...raw,dynamicMotion:previewSceneDynamicMotion(draft)},env);assert.equal(result.ok,false);assert.ok(result.issues.some(issue=>issue.includes('不显示本场已有资料')),kind);
 }
 const extra={src:'broll-assets/other.png',kind:'image',width:800,height:600,sha256:'c'.repeat(64)},withNode={...raw,nodes:[{...raw.nodes[0],assetSrc:extra.src}]},withAssets={...env,assets:[asset,extra]},roi={kind:'screenshot-region-focus',sourceKind:'screenshot',provenance:'synthetic',sourceWidth:800,sourceHeight:600,focusRegion:{x:0,y:0,width:100,height:100},maskScope:'asset-only',regionUnits:'source-pixels',atMs:1000,expandMs:500,holdMs:1000,returnMs:500,focusRect:{x:.1,y:.1,width:.4,height:.4},dimOpacity:.5},draft=createSceneDynamicMotionDraft(withNode,roi,withAssets);
 assert.ok(validateSavedSceneDynamicMotion({...withNode,dynamicMotion:previewSceneDynamicMotion(draft)},withAssets).issues.some(issue=>issue.includes(extra.src)));
});
 test('loaded media identity alone is insufficient: the actual evidence must appear in each retained instance',()=>{
 const media={src:'broll-assets/evidence.png',kind:'image',width:800,height:600},asset={...media,sha256:'b'.repeat(64)},raw={...scene,media},env=dynamicMotionEnvironmentFromState(state(),{...evidence,assets:[asset]}),draft=createSceneDynamicMotionDraft(raw,{kind:'evidence-handoff'},env),session=createDynamicMotionRenderSession(draft,raw,env),f=fixture(draft);
 recordLoop(session,draft,'scene:original',{fixture:f});assert.equal(finish(session,draft).ok,false);assert.deepEqual(session.getProgress().projections[0].missingAssets,[media.src]);
 const image=f.root.append(new Element('img',{},rect(50,200,300,200)));Object.assign(image,{src:'http://localhost/'+media.src,complete:true,naturalWidth:800,naturalHeight:600});recordLoop(session,draft,'scene:original',{fixture:f});assert.equal(finish(session,draft).ok,true);
});
 test('the real store context overwrites a stale supplied caption/music snapshot before applying',()=>{
 initStore();const p=setup(useEditor.getState()),receipt=receiptFor(p);useEditor.setState({captions:[{id:'new',clipId:clip.id,startMs:0,endMs:1000,words:[]}]});assert.equal(applyDynamicMotionToStore(useEditor,p.draft,p.env,receipt).ok,false);
});

test('saved parameter edits require a fresh draft and actual preview instead of reusing an old key',()=>{
 const p=setup(),saved=previewSceneDynamicMotion(p.draft);saved.config.items[0].rect.x=.07;assert.equal(validateSavedSceneDynamicMotion({...p.raw,dynamicMotion:saved},p.env).ok,false);saved.configSignature=JSON.stringify(saved.config);assert.equal(validateSavedSceneDynamicMotion({...p.raw,dynamicMotion:saved},p.env).ok,false);
});

test('invisible glyph color cannot pass rendered full-copy proof, but visible fill or real stroke can',()=>{
 for(const color of ['transparent','rgba(255, 255, 255, 0)','#ffffff00','rgb(255 255 255 / 0%)','color(display-p3 1 1 1 / 0)']){
  const p=setup(),session=createDynamicMotionRenderSession(p.draft,p.raw,p.env),f=fixture(p.draft);f.planes[0].style.color=color;recordLoop(session,p.draft,'scene:original',{fixture:f});assert.equal(finish(session,p.draft).ok,false,color);
 }
 for(const style of [{color:'rgba(255,255,255,0.8)'},{color:'#fff',webkitTextFillColor:'transparent',webkitTextStrokeColor:'#fff',webkitTextStrokeWidth:'2px'}]){
  const p=setup(),session=createDynamicMotionRenderSession(p.draft,p.raw,p.env),f=fixture(p.draft);Object.assign(f.planes[0].style,style);recordLoop(session,p.draft,'scene:original',{fixture:f});assert.equal(finish(session,p.draft).ok,true);
 }
 const p=setup(),session=createDynamicMotionRenderSession(p.draft,p.raw,p.env),f=fixture(p.draft);Object.assign(f.planes[0].style,{color:'#fff',webkitTextFillColor:'transparent'});recordLoop(session,p.draft,'scene:original',{fixture:f});assert.equal(finish(session,p.draft).ok,false);
});

test('native-style DOMRect prototype getters preserve safe-stage bounds and complete visible text proof',()=>{
 class PrototypeRect {
  #box;
  constructor(box){this.#box=box;}
  get left(){return this.#box.left;}
  get top(){return this.#box.top;}
  get right(){return this.#box.right;}
  get bottom(){return this.#box.bottom;}
  get width(){return this.#box.width;}
  get height(){return this.#box.height;}
 }
 const p=setup(),session=createDynamicMotionRenderSession(p.draft,p.raw,p.env),f=fixture(p.draft);
 const nativeBoxes=element=>{element.box=new PrototypeRect(element.box);for(const child of element.children??[])nativeBoxes(child);};
 nativeBoxes(f.root);
 assert.deepEqual(Object.keys(f.root.getBoundingClientRect()),[]);
 assert.equal({...f.root.getBoundingClientRect()}.left,undefined);
 assert.equal(f.root.getBoundingClientRect().right,960);
 recordLoop(session,p.draft,'scene:original',{fixture:f});
 const progress=session.getProgress().projections[0];
 assert.equal(progress.covered,true);assert.deepEqual(progress.missingText,[]);
 const result=finish(session,p.draft);assert.equal(result.ok,true,result.issues.join('\n'));
});

test('veil and full-frame native copy planes retain selected-font and visible-text proof requirements',()=>{
 for(const marker of ['data-veil-complete-text','data-full-frame-copy']){
  const p=setup(),session=createDynamicMotionRenderSession(p.draft,p.raw,p.env),f=fixture(p.draft);
  f.planes[0].attributes={[marker]:'synthetic-native-copy'};f.planes[0].style.fontFamily='Arial';
  f.frame(1000);assert.equal(session.recordFrame(f.root,'scene:original',1000,f.readiness).ok,false,'a new native plane cannot evade the selected real font check');
  f.planes[0].style.fontFamily='"Koubo Douyin", sans-serif';recordLoop(session,p.draft,'scene:original',{fixture:f});assert.equal(finish(session,p.draft).ok,true);
  const hidden=createDynamicMotionRenderSession(p.draft,p.raw,p.env);f.planes[0].attributes['aria-hidden']='true';recordLoop(hidden,p.draft,'scene:original',{fixture:f});assert.equal(finish(hidden,p.draft).ok,false);
 }
});

test('repeated real draft/DOM-receipt/store applies keep selection history bounded without mutating old saved keys',()=>{
 initStore();const lengths=[];
 for(let round=0;round<24;round++){
  const current=useEditor.getState(),raw=current.presentation.scenes[0],beforeKey=raw.dynamicMotion?.draftKey,p=setup(current,raw),selected=JSON.parse(p.draft.selectionSignature);
  if(beforeKey){const oldCurrent=JSON.parse(beforeKey),bound=JSON.parse(selected.dynamicMotion.draftKey);assert.equal(Object.hasOwn(bound,'selectionSignature'),false);assert.equal(bound.nonce,oldCurrent.nonce);assert.equal(bound.baseSignature,oldCurrent.baseSignature);assert.deepEqual(bound.config,oldCurrent.config);assert.equal(raw.dynamicMotion.draftKey,beforeKey,'selection projection never rewrites the stored source key');}
  const receipt=receiptFor(p);assert.equal(assessSceneDynamicMotion(p.draft,raw,p.env,receipt).canApply,true);assert.equal(applyDynamicMotionToStore(useEditor,p.draft,p.env,receipt).ok,true);
  const after=useEditor.getState(),saved=after.presentation.scenes[0];lengths.push(saved.dynamicMotion.draftKey.length);assert.equal(validateSavedSceneDynamicMotion(saved,dynamicMotionEnvironmentFromState(after,evidence)).ok,true);assert.equal(assessSceneDynamicMotion(p.draft,saved,p.env,receipt).canApply,false,'the just-replaced live selection still invalidates the old apply receipt');
  if(round>=2)assert.ok(lengths[round]<=lengths[1]+256,'new generation cannot accumulate/escape another complete historical selection');
 }
 assert.equal(useEditor.getState().past.length,24);assert.ok(Math.max(...lengths.slice(2))-Math.min(...lengths.slice(2))<256);
});

test('bounded selection still binds every current saved identity field and current key nonce/base/config',()=>{
 const seed=setup(),saved=previewSceneDynamicMotion(seed.draft),raw={...scene,dynamicMotion:saved},p=setup(state({presentation:{...state().presentation,scenes:[raw]}}),raw),receipt=receiptFor(p);
 assert.equal(assessSceneDynamicMotion(p.draft,raw,p.env,receipt).canApply,true);
 const mutateKey=(s,update)=>{const key=JSON.parse(s.dynamicMotion.draftKey);update(key);s.dynamicMotion.draftKey=JSON.stringify(key);};
 const changes=[
  s=>s.dynamicMotion.config.items[0].rect.x=.08,
  s=>s.dynamicMotion.binding.sha256='b'.repeat(64),
  s=>s.dynamicMotion.sourceIdentity.sha256='b'.repeat(64),
  s=>s.dynamicMotion.assetIdentities.push({src:'broll-assets/real.png',kind:'image',width:100,height:100,sha256:'c'.repeat(64)}),
  s=>s.dynamicMotion.contextSnapshot={captions:[{text:'changed current context'}]},
  s=>s.dynamicMotion.configSignature='current config changed',
  s=>s.dynamicMotion.clock='changed-current-clock',
  s=>s.dynamicMotion.version=2,
  s=>s.dynamicMotion.currentAdditionalField={proof:'current data is preserved'},
  s=>s.dynamicMotion.audioEvidence=[{takeId:'A',analysisSha256:'current audio facts stay bound'}],
  s=>mutateKey(s,k=>k.nonce='another-current-nonce'),
  s=>mutateKey(s,k=>k.baseSignature='another-current-base'),
  s=>mutateKey(s,k=>k.config.items[0].rect.x=.09),
  s=>mutateKey(s,k=>k.currentExtra='current key facts remain bound'),
  s=>mutateKey(s,k=>k.config.selectionSignature='same-named config data is not historical'),
 ];
 for(const change of changes){const changed=structuredClone(raw);change(changed);assert.equal(assessSceneDynamicMotion(p.draft,changed,p.env,receipt).canApply,false);}
 const reminted={...raw,dynamicMotion:previewSceneDynamicMotion(createSceneDynamicMotionDraft(scene,config,seed.env))};assert.equal(assessSceneDynamicMotion(p.draft,reminted,p.env,receipt).canApply,false,'same actual parameters with a genuinely new current nonce are a changed selection');
 const historicalOnly=structuredClone(raw);mutateKey(historicalOnly,k=>k.selectionSignature='old-history-only-\ufffd');assert.equal(assessSceneDynamicMotion(p.draft,historicalOnly,p.env,receipt).canApply,true,'only the superseded selection history is inert');
 for(const environment of [{...p.env,font:{...p.env.font,key:'smiley'}},{...p.env,contextSnapshot:{captions:[{id:'different-current-caption'}]}},{...p.env,sourceIdentity:{...source,sha256:'e'.repeat(64)}}])assert.equal(assessSceneDynamicMotion(p.draft,raw,environment,receipt).canApply,false);
});

test('invalid current keys remain exact stale-detectable strings; old saved key formats stay readable',()=>{
 const seed=setup(),base=previewSceneDynamicMotion(seed.draft);
 for(const invalid of ['{bad current key','["not-a-key-object"]','null','"literal-key"']){
  const raw={...scene,dynamicMotion:{...base,draftKey:invalid}},p=setup(state({presentation:{...state().presentation,scenes:[raw]}}),raw),selection=JSON.parse(p.draft.selectionSignature);assert.equal(selection.dynamicMotion.draftKey,invalid);const receipt=receiptFor(p);assert.equal(assessSceneDynamicMotion(p.draft,raw,p.env,receipt).canApply,true,'a real new preview may replace an invalid old selection');assert.equal(assessSceneDynamicMotion(p.draft,{...raw,dynamicMotion:{...raw.dynamicMotion,draftKey:invalid+' changed'}},p.env,receipt).canApply,false);
 }
 const legacy=structuredClone(base),key=JSON.parse(legacy.draftKey);key.selectionSignature=JSON.stringify({dynamicMotion:{draftKey:JSON.stringify({nonce:'legacy',selectionSignature:'old replaced history\ufffd'})},visualPreset:null});legacy.draftKey=JSON.stringify(key);
 assert.equal(validateSavedSceneDynamicMotion({...scene,dynamicMotion:legacy},seed.env).ok,true,'saved validation keeps the legacy nonce/base/config binding and does not demand a new format');const raw={...scene,dynamicMotion:legacy},next=setup(state({presentation:{...state().presentation,scenes:[raw]}}),raw);assert.equal(next.draft.selectionSignature.includes('\ufffd'),false,'the next generation omits only the obsolete key history');assert.deepEqual(raw.dynamicMotion,legacy,'no automatic mutation/repair of the old saved selection');
});


test('a visible current trusted RGBA image can acquire a real DOM-session receipt without counting hidden video, and still applies with one undo',()=>{
 // Media bytes/fonts/geometry are explicit synthetic fixtures. This executes the
 // production DOM observer and real store; it is not browser/pixel acceptance.
 const raw={...scene,tags:[],nodes:[{id:'i',text:'AI Agent'},{id:'h',text:'不是实测'},{id:'o',text:'完整条件'}]},matte={prefix:'broll-assets/person-matte-synthetic/frame-',src:source.src,sourceSha256:source.sha256,width:1920,height:1080,sourceStartMs:1000,fps:30,count:180,timesMs:Array.from({length:180},(_,i)=>1000+i*1000/30),endMs:7000};raw.personMatte=matte;
 const full={x:0,y:0,width:1,height:1},motion={kind:'hub-branch-flow',hubNodeId:'h',inputNodeIds:['i'],outputNodeIds:['o'],branchesAtMs:2500,branchDrawMs:300,nodeStaggerMs:100,flowAtMs:3000,flowMs:500,particleCount:2,matchToDiagram:{atMs:1600,durationMs:900,from:full,to:{x:.8,y:.3,width:.15,height:.266}},sourceCopyWindow:{atMs:0,endMs:1200,rect:{x:.04,y:.04,width:.6,height:.6},speakerRect:{x:.8,y:.3,width:.15,height:.266}}},matteEvidence={version:1,kind:'same-source-rgba-sequence',sourceIdentity:source,matte,manifestIdentity:{src:'broll-assets/person-matte-synthetic/manifest.json',sha256:'b'.repeat(64)},sequenceSha256:'c'.repeat(64),frames:matte.timesMs.map((sourceMs,index)=>({index,src:matte.prefix+String(index).padStart(5,'0')+'.png',sha256:'d'.repeat(64),sourceMs,width:1920,height:1080,alphaBounds:{x:.3,y:.15,width:.4,height:.7}}))};
 const st=state({captions:[],brolls:[],music:null,presentation:{...state().presentation,scenes:[raw]}}),env=dynamicMotionEnvironmentFromState(st,{...evidence,matteEvidence}),draft=createSceneDynamicMotionDraft(raw,motion,env),f=fixture(draft,'scene:original',['AI Agent','不是实测','完整条件']);f.video.style.opacity='0';
 const wrapper=f.root.append(new Element('div',{'data-dynamic-real-matte':'true'},rect(770,160,140,140))),image=wrapper.append(new Element('img',{},wrapper.box,{objectFit:'cover',objectPosition:'50% 50%'}));Object.assign(image,{complete:true,naturalWidth:1920,naturalHeight:1080,src:'blob:checked-synthetic',currentSrc:'blob:checked-synthetic'});
 let session=createDynamicMotionRenderSession(draft,raw,env);recordLoop(session,draft,'scene:original',{fixture:f});assert.equal(finish(session,draft).ok,false,'data attributes and hidden same-source Video do not establish a cutout');
 const key=sceneDynamicMotionDraftKey(draft);session=createDynamicMotionRenderSession(draft,raw,env);for(let ms=1000;ms<=6966.7;ms=Math.min(6966.7,ms+100)){f.frame(ms);const frame=dynamicMatteFrameAt(matteEvidence,ms);bindDynamicMatteElement(image,{draftKey:key,sequenceSha256:matteEvidence.sequenceSha256,frameSha256:frame.sha256,frameIndex:frame.index,sourceMs:frame.sourceMs,blobUrl:image.src,checkedBytes:true});session.recordFrame(f.root,'scene:original',ms,f.readiness);if(ms===6966.7)break;}
 const result=finish(session,draft);assert.equal(result.ok,true,result.issues.join(';'));assert.equal(assessSceneDynamicMotion(draft,raw,env,result.receipt).canApply,true);
 useEditor.getState().init(st.meta,[],st.accentColor,st.clips,null,[],[],st.presentation);const before=useEditor.getState();assert.equal(applyDynamicMotionToStore(useEditor,draft,env,result.receipt).ok,true);assert.equal(useEditor.getState().past.length,1);assert.equal(useEditor.getState().clips,before.clips);useEditor.getState().undo();assert.deepEqual(useEditor.getState().presentation,before.presentation);
});
