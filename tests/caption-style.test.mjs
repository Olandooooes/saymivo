import test from 'node:test';import assert from 'node:assert/strict';import {sanitizeCaptionStyle,resolveCaptionStyle,captionStylePresets} from '../src/caption-style.mjs';
test('per-caption overrides inherit new global settings without modifying the saved preset',()=>{
 const preset=structuredClone(captionStylePresets[0].style),override={color:'#ff0000'};
 const result=resolveCaptionStyle({...preset,fontSize:66},override);
 assert.equal(result.fontSize,66);assert.equal(result.color,'#ff0000');assert.deepEqual(preset,captionStylePresets[0].style);
 assert.deepEqual(resolveCaptionStyle(JSON.parse(JSON.stringify(preset))),preset);
});
test('saved style input cannot inject fonts, CSS or nonfinite dimensions',()=>{
 const safe=sanitizeCaptionStyle({font:'url(remote)',fontSize:Infinity,color:'red;display:none',backgroundOpacity:9,strokeWidth:-2,topPct:200});
 assert.deepEqual(safe,{backgroundOpacity:.95,strokeWidth:0,topPct:92});
});
test('actual caption renderer uses shared style and local overrides while old projects retain their look',async()=>{
 const fs=await import('node:fs');const ts=await import('typescript');const React=await import('react');const {renderToStaticMarkup}=await import('react-dom/server');
 const url=code=>'data:text/javascript;base64,'+Buffer.from(code).toString('base64');
 const remotion=url(`export const useVideoConfig=()=>({fps:30,width:1920,height:1080});export const useCurrentFrame=()=>10;export const interpolate=()=>1;export const Sequence=({children})=>children;`);
 const file=new URL('../src/CaptionTrack.tsx',import.meta.url);
 const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText.replace(/from (["'])([^"']+)\1/g,(_,q,s)=>'from '+JSON.stringify(s==='remotion'?remotion:s.startsWith('.')?new URL(s,file).href:import.meta.resolve(s)));
 const {CaptionTrack}=await import(url(code));const cap={id:'test',startMs:0,endMs:2000,topPct:70,words:[{text:'Agent',startMs:0,endMs:1000,accent:false}]};
 const legacy=renderToStaticMarkup(React.createElement(CaptionTrack,{captions:[cap]}));assert.match(legacy,/top:70%/);assert.match(legacy,/font-size:62px/);
 const styled=renderToStaticMarkup(React.createElement(CaptionTrack,{captions:[{...cap,styleOverride:{color:'#ff0000'}}],globalStyle:{...captionStylePresets[0].style,fontSize:56,topPct:89}}));
 assert.match(styled,/top:89%/);assert.match(styled,/font-size:56px/);assert.match(styled,/color:#ff0000/);assert.match(styled,/Agent/);
 const punctuationOnly=renderToStaticMarkup(React.createElement(CaptionTrack,{captions:[{...cap,words:[{text:'。',startMs:0,endMs:1000,accent:false}]}],globalStyle:captionStylePresets[1].style}));assert.equal(punctuationOnly,'');
});
