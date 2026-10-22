// Reuse the production demo endpoint in-process; never read user media.
import {studioRoute} from '../server/studio-routes.mjs';
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const ROOT=fileURLToPath(new URL('..',import.meta.url));
for(const dir of ['.tools/bin','node_modules/@remotion/compositor-darwin-arm64']){const candidate=path.join(ROOT,dir);if(fs.existsSync(path.join(candidate,'ffmpeg')))process.env.PATH=candidate+path.delimiter+process.env.PATH;}
const PUBLIC=path.join(ROOT,'public'),PROJECTS_DIR=path.join(PUBLIC,'projects');
fs.mkdirSync(PROJECTS_DIR,{recursive:true});
const run=(bin,args)=>new Promise((resolve,reject)=>{const p=spawn(bin,args,{cwd:ROOT});let stderr='';p.stderr.on('data',b=>stderr+=b);p.on('error',reject);p.on('close',code=>resolve({code,stderr}));});
await studioRoute({req:{method:'POST'},res:{},url:new URL('http://localhost/api/demo'),ROOT,PUBLIC,PROJECTS_DIR,run,json:(_res,status,value)=>{if(status!==200)throw Error(value.error);const target=path.join(PUBLIC,'open-demo.json');fs.copyFileSync(path.join(PROJECTS_DIR,value.id+'.json'),target);console.log('Synthetic project: public/open-demo.json');}});
