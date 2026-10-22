// Batch local inspection ranges and the final movie against one frozen bundle.
// A changed renderer or asset invalidates reuse instead of silently exporting
// stale code. Props are separately frozen and hashed for every render, so data
// revisions do not require rebundling the exact same renderer and assets.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {bundle} from '@remotion/bundler';
import {selectComposition,renderMedia} from '@remotion/renderer';
const root=process.cwd(),plan=JSON.parse(fs.readFileSync(path.resolve(process.argv[2]),'utf8'));
const hash=value=>createHash('sha256').update(value).digest('hex');
const files=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(dir,e.name)):[path.join(dir,e.name)]).sort();
const inputFile=path.resolve(plan.project),inputBytes=fs.readFileSync(inputFile),inputProps=JSON.parse(inputBytes),publicDir=path.resolve(plan.publicDir);
const rendererFiles=[...files(path.join(root,'src')),path.join(root,'package-lock.json'),path.join(root,'remotion.config.ts')];
const fingerprint=hash(rendererFiles.map(f=>f+'\0'+hash(fs.readFileSync(f))).join('\n'));
const assetFingerprint=hash(files(publicDir).map(f=>path.relative(publicDir,f)+'\0'+hash(fs.readFileSync(f))).join('\n'));
const identity={renderer:fingerprint,assets:assetFingerprint,project:hash(inputBytes)},bundleDir=path.resolve(plan.bundleDir),identityFile=bundleDir+'.identity.json';
const bundleIdentity={renderer:fingerprint,assets:assetFingerprint};
const reportFile=path.resolve(plan.report),report={startedAt:new Date().toISOString(),identity,project:inputFile,bundleDir,publicDir,renders:[]};
const save=()=>{fs.mkdirSync(path.dirname(reportFile),{recursive:true});fs.writeFileSync(reportFile,JSON.stringify(report,null,2)+'\n');};
let reusable=false;
if(fs.existsSync(identityFile)&&fs.existsSync(path.join(bundleDir,'index.html'))){
 const known=JSON.parse(fs.readFileSync(identityFile,'utf8'));
 reusable=known.renderer===bundleIdentity.renderer&&known.assets===bundleIdentity.assets;
 if(!reusable)throw Error('Frozen bundle inputs changed; use a new bundle directory.');
}
if(!reusable){
 console.log('Bundle once for frozen batch');
 await bundle({entryPoint:path.join(root,'src/index.ts'),outDir:bundleDir,publicDir,onProgress:p=>{if(p===100)console.log('Bundle ready');}});
 fs.writeFileSync(identityFile,JSON.stringify(bundleIdentity,null,2)+'\n');
}
report.reusedBundle=reusable;save();
const browserRoot=path.join(os.homedir(),'.cache/puppeteer/chrome-headless-shell');
const browserExecutable=fs.readdirSync(browserRoot).filter(p=>p.startsWith('mac_arm-')).sort().reverse().map(p=>path.join(browserRoot,p,'chrome-headless-shell-mac-arm64/chrome-headless-shell')).find(f=>fs.existsSync(f));
if(!browserExecutable)throw Error('Existing local render browser not found');
const composition=await selectComposition({serveUrl:bundleDir,id:'MultiClip',inputProps,browserExecutable});
report.composition={width:composition.width,height:composition.height,fps:composition.fps,durationInFrames:composition.durationInFrames};save();
for(const render of plan.renders){
 const outputLocation=path.resolve(render.output);if(fs.existsSync(outputLocation))throw Error('Refusing to overwrite an existing batch output: '+outputLocation);
 fs.mkdirSync(path.dirname(outputLocation),{recursive:true});
 const entry={output:outputLocation,frameRange:render.frames??[0,composition.durationInFrames-1],scale:render.scale??1,startedAt:new Date().toISOString(),status:'running'};report.renders.push(entry);save();
 let last=-1;
 await renderMedia({composition,serveUrl:bundleDir,inputProps,outputLocation,codec:'h264',audioCodec:'aac',imageFormat:'jpeg',x264Preset:'veryfast',concurrency:2,browserExecutable,scale:entry.scale,frameRange:entry.frameRange,onProgress:p=>{const step=Math.floor(p.progress*10);if(step!==last){last=step;console.log(path.basename(outputLocation)+' '+step*10+'%');}}});
 entry.finishedAt=new Date().toISOString();entry.status='done';entry.sha256=hash(fs.readFileSync(outputLocation));save();
}
report.finishedAt=new Date().toISOString();report.status='done';save();console.log('Frozen batch complete: '+reportFile);
