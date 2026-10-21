import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
const root=fileURLToPath(new URL('..',import.meta.url));
const url='http://127.0.0.1:5188/';
async function ready(){
 try {
  const r=await fetch('http://127.0.0.1:3348/api/health',{signal:AbortSignal.timeout(3000)});
  if(!r.ok||(await r.json()).app!=='koubo-studio')return false;
  const page=await fetch(url,{signal:AbortSignal.timeout(3000)});
  return page.ok&&(await page.text()).includes('/main.tsx');
 }catch{return false;}
}
function open(){spawn('open',[url],{stdio:'ignore',detached:true}).unref();console.log('工作台已就绪：'+url);}
if(await ready()){open();}else{
 if(!fs.existsSync(path.join(root,'node_modules/vite/bin/vite.js'))){console.error('首次使用请先运行 npm run setup，安装完成后再双击启动。');process.exit(1);}
 console.log('正在启动Saymivo，请保留此窗口。关闭浏览器不会停止剪辑。');
 const child=spawn(process.execPath,['scripts/dev.mjs'],{cwd:root,stdio:'inherit'});
 let checking=false,finished=false;
 const timer=setInterval(async()=>{if(checking||finished)return;checking=true;try{if(await ready()){finished=true;clearInterval(timer);clearTimeout(timeout);open();}}finally{checking=false;}},700);
 const timeout=setTimeout(()=>{finished=true;clearInterval(timer);console.error('启动超过 90 秒，请查看此窗口中的错误。可稍后手动打开 '+url);},90000);
 child.on('error',e=>{clearInterval(timer);clearTimeout(timeout);console.error('启动失败：'+e.message);process.exitCode=1;});
 child.on('exit',code=>{finished=true;clearInterval(timer);clearTimeout(timeout);process.exitCode=code??1;});
 for(const sig of ['SIGINT','SIGTERM'])process.on(sig,()=>{child.kill(sig);});
}
