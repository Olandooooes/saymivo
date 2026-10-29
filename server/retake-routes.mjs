import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {validateRetakeRequest} from './retake-input.mjs';
import {prepareRetakeAuditInput} from '../scripts/audit-retake-render.mjs';

const terminal=new Set(['done','error','cancelled']);
const atomic=(file,value)=>{fs.writeFileSync(file+'.tmp',JSON.stringify(value,null,2));fs.renameSync(file+'.tmp',file);};
async function auditBody(req,fallback,limit=2*1024*1024){
  if(typeof req.on!=='function'||typeof req.resume!=='function')return fallback(req);
  if(Number(req.headers?.['content-length'])>limit){req.resume();throw Error('声音审计快照超过 2MiB。');}
  return new Promise((resolve,reject)=>{
    const chunks=[];let bytes=0,settled=false;
    const finish=error=>{if(settled)return;settled=true;req.off('data',data);req.off('end',end);req.off('aborted',aborted);
      if(error){req.resume();reject(error);}else resolve(Buffer.concat(chunks,bytes).toString('utf8'));};
    const data=chunk=>{const buffer=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);bytes+=buffer.length;
      if(bytes>limit)return finish(Error('声音审计快照超过 2MiB。'));chunks.push(buffer);};
    const end=()=>finish(),aborted=()=>finish(Error('声音审计请求中断。')),error=problem=>finish(problem);
    req.on('data',data);req.once('end',end);req.once('aborted',aborted);req.on('error',error);
    req.once('close',()=>{if(!settled)finish(Error('声音审计请求中断。'));req.off('error',error);});
  });
}

// Readiness is deliberately separate from installation. Local dependencies do
// not enable a feature whose real-audio boundary validation is still pending.
export function retakeCapabilities({ROOT,env=process.env}={}){
  const executable=file=>{try{fs.accessSync(file,fs.constants.X_OK);return fs.statSync(file).isFile();}catch{return false;}};
  const configured=env.SAYMIVO_CODEX_BIN??'codex';
  const codexPaths=path.isAbsolute(configured)||configured.includes(path.sep)?[path.resolve(ROOT,configured)]:String(env.PATH??'').split(path.delimiter).filter(Boolean).map(dir=>path.join(dir,configured));
  const missing=[];
  if(!executable(path.join(ROOT,'.venv-align','bin','python')))missing.push('本地 Qwen 识别环境');
  if(!executable(path.join(ROOT,'.tools','bin','ffmpeg')))missing.push('本地音频处理引擎');
  if(!fs.existsSync(path.join(ROOT,'.models','qwen3-asr-0.6b','model.safetensors')))missing.push('Qwen 语音识别模型');
  if(!fs.existsSync(path.join(ROOT,'.models','qwen3-forced-aligner-0.6b','model.safetensors')))missing.push('Qwen 词时间对齐模型');
  if(!executable(path.join(ROOT,'.venv','bin','python'))||!fs.existsSync(path.join(ROOT,'.models','whisper-medium','model.bin')))missing.push('独立原声复核环境');
  if(!codexPaths.some(executable))missing.push('Codex CLI');
  const enabled=env.SAYMIVO_CODEX_RETAKES_ENABLED==='1';
  return {local:{ready:true},codex:{ready:enabled&&missing.length===0,enabled,dependenciesReady:missing.length===0,
    reason:!enabled?'Codex 自动精剪尚未启用；须先完成本机验证。':missing.length?`缺少 ${missing.join('、')}，请完成本地配置。`:'本地识别与独立复核可用；Codex 使用当前登录状态，仅接收转写文字。'}};
}

// One detached process group makes cancel stop Node, local Whisper and ffmpeg.
// It never sends signals to an existing app or modifies source media.
export function runRetakeProcess({ROOT,PUBLIC,inputFile,outputFile,logFile,signal,onProgress,mode='local',timeoutMs=7200000,killGraceMs=1500,cleanupWaitMs=3000}){
  return new Promise((resolve,reject)=>{
    signal.throwIfAborted();
    const grouped=process.platform!=='win32';
    const script=mode==='audit'?'run-retake-audit.mjs':mode==='codex'?'analyze-codex-retakes.mjs':'analyze-retakes.mjs';
    const child=spawn(process.execPath,[path.join(ROOT,'scripts',script),inputFile,outputFile],
      {cwd:ROOT,detached:grouped,env:{...process.env,KOUBO_PUBLIC_DIR:PUBLIC,SAYMIVO_RETAKE_MANAGED_PROCESS_GROUP:grouped?'1':'0'},stdio:['ignore','pipe','pipe']});
    const log=fs.createWriteStream(logFile,{flags:'a'});let pending='',tail='',failure,closed=false,settled=false,exitCode;
    let killTimer,drainTimer,cleanupTimer;
    const groupAlive=()=>{if(!grouped)return !closed;if(!child.pid)return false;try{process.kill(-child.pid,0);return true;}catch(error){return error.code!=='ESRCH';}};
    const send=kind=>{try{if(grouped&&child.pid)process.kill(-child.pid,kind);else child.kill(kind);}catch{}};
    const finish=()=>{
      if(settled)return;settled=true;clearTimeout(timeout);clearTimeout(killTimer);clearTimeout(drainTimer);clearTimeout(cleanupTimer);
      signal.removeEventListener('abort',cancel);log.end();
      if(failure)return reject(failure);
      if(exitCode!==0)return reject(Error(tail.trim().split('\n').at(-1)?.slice(0,300)||`本地分析退出 (${exitCode})`));
      try{resolve(JSON.parse(fs.readFileSync(outputFile,'utf8')));}catch(error){reject(error);}
    };
    const drain=()=>{
      clearTimeout(drainTimer);
      if(settled||!closed)return;
      if(!groupAlive())return finish();
      drainTimer=setTimeout(drain,25);
    };
    const terminate=error=>{
      failure??=error;
      if(killTimer||cleanupTimer)return;
      send('SIGTERM');
      // A direct child can close before a TERM-resistant grandchild. Preserve
      // escalation until the entire owned group is gone, not merely its leader.
      killTimer=setTimeout(()=>{
        killTimer=null;send('SIGKILL');
        cleanupTimer=setTimeout(()=>{failure=Error(`${failure?.message??'分析已停止'}；子进程组未确认完全退出`);if(closed)finish();},cleanupWaitMs);
        if(closed)drain();
      },killGraceMs);
      if(closed)drain();
    };
    const cancel=()=>terminate(signal.reason??Error('分析已取消'));
    const timeout=setTimeout(()=>terminate(Error('口播精剪超时，已停止分析进程')),timeoutMs);
    signal.addEventListener('abort',cancel,{once:true});
    child.stdout.on('data',chunk=>{
      log.write(chunk);pending+=chunk.toString();const lines=pending.split('\n');pending=lines.pop();
      for(const line of lines){const m=line.match(/^PROGRESS:(\d+(?:\.\d+)?):(.*)$/);if(m)onProgress(Math.max(0,Math.min(1,Number(m[1])/100)),m[2]);}
    });
    child.stderr.on('data',chunk=>{log.write(chunk);tail=(tail+chunk).slice(-3000);});
    child.once('error',error=>{failure??=error;});
    child.once('close',code=>{
      closed=true;exitCode=code;
      if(grouped&&groupAlive())terminate(failure??Error('分析主进程退出后仍有子任务，已停止残留进程'));
      else finish();
    });
  });
}

// Installed by the HTTP entry point. Stop accepting requests, abort owned work,
// await its actual process close, then close remaining keep-alive connections.
export function installRetakeShutdown({server,analyzer,processRef=process,onError=error=>console.error(error)}){
  let completion,stopping=false;
  const shutdown=()=>{
    if(completion)return completion;
    const closed=new Promise(resolve=>server.close(resolve));server.closeIdleConnections?.();
    completion=(async()=>{await analyzer.shutdown();server.closeAllConnections?.();await closed;})();return completion;
  };
  const stop=()=>{if(stopping)return;stopping=true;void shutdown().then(()=>processRef.exit(0),error=>{onError(error);processRef.exit(1);});};
  const signals=['SIGTERM','SIGINT','SIGHUP'];for(const name of signals)processRef.on(name,stop);
  return {shutdown,dispose:()=>{for(const name of signals)processRef.removeListener(name,stop);}};
}

export function createRetakeAnalyzer({ROOT,PUBLIC,json,body,readEnvFile=()=>({}),isBusy=()=>false,runJob=runRetakeProcess,prepareAudit=prepareRetakeAuditInput,capabilities=()=>retakeCapabilities({ROOT,env:{...readEnvFile(),...process.env}})}){
  const base=path.join(ROOT,'.auto-jobs','retakes'),jobs=new Map(),controllers=new Map(),executions=new Map();let closing=false,shutdownPromise;
  fs.mkdirSync(base,{recursive:true});
  const statusFile=id=>path.join(base,id,'status.json');
  const auditDirectory=(id,auditId)=>path.join(base,id,'audits',auditId);
  const save=job=>{job.updatedAt=new Date().toISOString();atomic(statusFile(job.id),job);
    if(job.audit?.id&&fs.existsSync(auditDirectory(job.id,job.audit.id)))atomic(path.join(auditDirectory(job.id,job.audit.id),'audit-status.json'),job.audit);};
  for(const name of fs.readdirSync(base)){
    if(!/^[a-f0-9-]{36}$/i.test(name))continue;
    try{const job=JSON.parse(fs.readFileSync(statusFile(name),'utf8'));
      if(job.id!==name)continue;
      if(!terminal.has(job.status)){job.status='error';job.error='服务重启中断了本地分析，请重新分析。';job.label=job.error;save(job);}
      if(job.audit&&!terminal.has(job.audit.status)){job.audit.status='error';job.audit.error='服务重启中断了声音审计；已应用剪辑不会撤销。';job.audit.label=job.audit.error;save(job);}
      jobs.set(name,job);
    }catch{}
  }
  const busy=()=>controllers.size>0||[...jobs.values()].some(j=>!terminal.has(j.status)||j.audit&&!terminal.has(j.audit.status));
  const shutdown=()=>{
    if(shutdownPromise)return shutdownPromise;closing=true;
    for(const [id,controller]of controllers){const job=jobs.get(id);if(job?.audit&&!terminal.has(job.audit.status)){job.audit.status='cancelled';job.audit.label='服务关闭，声音审计停止；已应用剪辑未撤销';save(job);}else if(job&&!terminal.has(job.status)){job.status='cancelled';job.label='服务关闭，正在停止本地分析';save(job);}controller.abort(Error('服务关闭，已取消本地任务'));}
    shutdownPromise=Promise.allSettled([...executions.values()]).then(()=>{});return shutdownPromise;
  };
  async function route(req,res,url){
    if(!url.pathname.startsWith('/api/retakes/'))return false;
    if(req.method==='GET'&&url.pathname==='/api/retakes/capabilities'){
      json(res,200,capabilities());return true;
    }
    if(req.method==='POST'&&url.pathname==='/api/retakes/analyze'){
      if(closing){json(res,503,{error:'本地服务正在关闭，请重新启动后再分析。'});return true;}
      if(busy()||isBusy()){json(res,409,{error:'已有本地识别或导出任务，请完成后再精剪。'});return true;}
      let input;
      try{
        const raw=await body(req);if(raw.length>1024*1024)throw Error('分析快照过大。');
        input=validateRetakeRequest(JSON.parse(raw||'{}'),{PUBLIC});
        if(input.mode==='codex'){const capability=capabilities().codex;if(!capability.ready)throw Error(capability.reason);}
        if(input.mode==='gemini'&&!(process.env.GEMINI_API_KEY||readEnvFile().GEMINI_API_KEY))throw Error('未配置 Gemini API key；可直接选择本地精剪。');
      }catch(error){json(res,400,{error:error.message??'分析参数无效。'});return true;}
      // Recheck after the asynchronous request body so concurrent requests
      // cannot launch competing local model processes.
      if(closing){json(res,503,{error:'本地服务正在关闭，请重新启动后再分析。'});return true;}
      if(busy()||isBusy()){json(res,409,{error:'已有本地识别或导出任务，请完成后再精剪。'});return true;}
      const id=randomUUID(),directory=path.join(base,id);fs.mkdirSync(directory);
      const job={id,status:'running',progress:0,label:input.mode==='codex'?'准备本地识别与 Codex 取舍':'准备本地口播精剪',mode:input.mode,
        snapshot:{clips:input.clips},sources:[],candidates:[],warnings:[],createdAt:new Date().toISOString()};
      jobs.set(id,job);save(job);const controller=new AbortController();controllers.set(id,controller);
      const inputFile=path.join(directory,'input.json'),outputFile=path.join(directory,'result.json');atomic(inputFile,input);
      // No project path is accepted or written; the editor applies the returned
      // plan as one independently validated, undoable transaction.
      const execution=Promise.resolve().then(()=>runJob({ROOT,PUBLIC,inputFile,outputFile,logFile:path.join(directory,'analysis.log'),mode:input.mode,signal:controller.signal,
        onProgress:(value,label)=>{if(job.status==='running'){job.progress=Math.max(job.progress,Math.min(.995,value));job.label=String(label).slice(0,220);save(job);}}}))
        .then(result=>{if(controller.signal.aborted)return;Object.assign(job,result,{id,status:'done',progress:1,label:'口播取舍分析完成'});save(job);})
        .catch(error=>{if(controller.signal.aborted)return;job.status='error';job.error=String(error.message??error).slice(0,400);job.label=job.error;save(job);})
        .finally(()=>{controllers.delete(id);executions.delete(id);});
      executions.set(id,execution);
      json(res,202,{jobId:id});return true;
    }
    const auditStart=url.pathname.match(/^\/api\/retakes\/([a-f0-9-]{36})\/audit$/i);
    if(auditStart){
      if(req.method!=='POST'){json(res,405,{error:'不支持的请求方法。'});return true;}
      const job=jobs.get(auditStart[1]);if(!job){json(res,404,{error:'分析任务不存在。'});return true;}
      if(job.status!=='done'){json(res,409,{error:'仅能审计已完成的自动分析。'});return true;}
      if(closing){json(res,503,{error:'本地服务正在关闭。'});return true;}
      if(busy()||isBusy()){json(res,409,{error:'已有本地识别、声音审计或导出任务。'});return true;}
      let input;
      try{
        const raw=await auditBody(req,body);if(Buffer.byteLength(raw)>2*1024*1024)throw Error('声音审计快照超过 2MiB。');
        const value=JSON.parse(raw||'{}');
        if(!value||Object.keys(value).some(key=>!['projectBefore','projectAfter'].includes(key)))throw Error('审计只接受实际工程前后快照，不接受自带分析或剪辑表。');
        const analysis={...job};delete analysis.audit;
        input={analysis,projectBefore:value.projectBefore,projectAfter:value.projectAfter};
        await prepareAudit(input,{ROOT,PUBLIC,jobDirectory:path.join(base,job.id)});
      }catch(error){json(res,400,{error:String(error.message??'声音审计参数无效。').slice(0,400)});return true;}
      if(closing){json(res,503,{error:'本地服务正在关闭。'});return true;}
      if(busy()||isBusy()){json(res,409,{error:'已有本地识别、声音审计或导出任务。'});return true;}
      const auditId=randomUUID(),directory=auditDirectory(job.id,auditId);fs.mkdirSync(directory,{recursive:true});
      const inputFile=path.join(directory,'input.json'),outputFile=path.join(directory,'result.json');
      atomic(inputFile,{...input,jobDirectory:path.join(base,job.id),outputDirectory:path.join(directory,'artifacts')});
      job.audit={id:auditId,status:'running',progress:0,label:'准备整片无损音轨与剪口声音审计',createdAt:new Date().toISOString()};save(job);
      const controller=new AbortController();controllers.set(job.id,controller);
      const execution=Promise.resolve().then(()=>runJob({ROOT,PUBLIC,inputFile,outputFile,logFile:path.join(directory,'audit.log'),mode:'audit',signal:controller.signal,
        onProgress:(value,label)=>{if(job.audit.id===auditId&&job.audit.status==='running'){job.audit.progress=Math.max(job.audit.progress,Math.min(.995,value));job.audit.label=String(label).slice(0,220);save(job);}}}))
        .then(result=>{
          if(controller.signal.aborted||job.audit.id!==auditId)return;
          const prefix=`/api/retakes/${job.id}/audit/files/${auditId}/`;
          Object.assign(job.audit,{status:'done',progress:1,label:'声音审计资料已生成；未进行人耳听审',result,
            summary:result.summary,signalStatus:result.signalStatus,indexUrl:prefix+'index.html',reportUrl:prefix+'report.json',beforeAudioUrl:prefix+'before-full.wav',afterAudioUrl:prefix+'after-full.wav'});save(job);
        })
        .catch(error=>{if(controller.signal.aborted||job.audit.id!==auditId)return;job.audit.status='error';job.audit.error=String(error.message??error).slice(0,400);job.audit.label=job.audit.error;save(job);})
        .finally(()=>{controllers.delete(job.id);executions.delete(job.id);});
      executions.set(job.id,execution);json(res,202,{jobId:job.id,auditId});return true;
    }
    const auditFile=url.pathname.match(/^\/api\/retakes\/([a-f0-9-]{36})\/audit\/files\/([a-f0-9-]{36})\/([^/]+)$/i);
    if(auditFile){
      if(req.method!=='GET'){json(res,405,{error:'不支持的请求方法。'});return true;}
      const [,id,auditId,name]=auditFile;
      if(!jobs.has(id)||!(/^(?:index\.html|report\.json|(?:before-full|after-full|(?:join|remove)-\d{3,}-(?:before|after))\.wav)$/.test(name))){json(res,404,{error:'审计文件不可用。'});return true;}
      let descriptor;
      try{
        const realBase=fs.realpathSync(base),directory=path.join(realBase,id,'audits',auditId),artifacts=path.join(directory,'artifacts');
        if(fs.realpathSync(directory)!==directory||fs.realpathSync(artifacts)!==artifacts)throw Error('outside audit');
        const state=JSON.parse(fs.readFileSync(path.join(directory,'audit-status.json'),'utf8'));
        if(state.id!==auditId||state.status!=='done')throw Error('audit not complete');
        const file=path.join(artifacts,name),real=fs.realpathSync(file),stat=fs.lstatSync(file);
        if(real!==file||!stat.isFile()||stat.isSymbolicLink()||stat.size<=0)throw Error('outside audit');
        const contentType=name.endsWith('.wav')?'audio/wav':name.endsWith('.html')?'text/html; charset=utf-8':'application/json; charset=utf-8';
        const headers={'Content-Type':contentType,'X-Content-Type-Options':'nosniff','Cache-Control':'no-store','Accept-Ranges':'bytes'};
        if(name.endsWith('.html'))headers['Content-Security-Policy']="default-src 'none'; media-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'";
        let start=0,end=stat.size-1,status=200;
        if(req.headers?.range){
          const range=String(req.headers.range).match(/^bytes=(\d*)-(\d*)$/);
          if(!range||!range[1]&&!range[2])throw Error('invalid range');
          start=range[1]?Number(range[1]):Math.max(0,stat.size-Number(range[2]));end=range[1]&&range[2]?Number(range[2]):stat.size-1;
          if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>end||end>=stat.size){res.writeHead(416,{'Content-Range':`bytes */${stat.size}`});res.end();return true;}
          status=206;headers['Content-Range']=`bytes ${start}-${end}/${stat.size}`;
        }
        descriptor=fs.openSync(file,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW??0));const opened=fs.fstatSync(descriptor);
        if(!opened.isFile()||opened.dev!==stat.dev||opened.ino!==stat.ino||opened.size!==stat.size||fs.realpathSync(file)!==file)throw Error('audit changed');
        headers['Content-Length']=end-start+1;res.writeHead(status,headers);
        const stream=fs.createReadStream(file,{fd:descriptor,autoClose:true,start,end});descriptor=undefined;
        stream.on('error',()=>res.destroy()).pipe(res);return true;
      }catch{if(descriptor!==undefined)fs.closeSync(descriptor);json(res,404,{error:'审计文件不可用。'});return true;}
    }
    const match=url.pathname.match(/^\/api\/retakes\/([a-f0-9-]{36})(\/cancel)?$/i);
    if(!match){json(res,404,{error:'没有这个精剪接口。'});return true;}
    const job=jobs.get(match[1]);if(!job){json(res,404,{error:'分析任务不存在。'});return true;}
    if(req.method==='GET'&&!match[2]){json(res,200,job);return true;}
    if(req.method==='POST'&&match[2]){
      if(job.audit&&!terminal.has(job.audit.status)){
        job.audit.status='cancelled';job.audit.label='声音审计已取消；已应用剪辑未撤销';save(job);
        controllers.get(job.id)?.abort(Error('用户取消声音审计'));
      }else if(!terminal.has(job.status)){
        job.status='cancelled';job.label='分析已取消，时间线未改变';save(job);
        controllers.get(job.id)?.abort(Error('用户取消分析'));
      }
      json(res,200,{id:job.id,status:job.status,...(job.audit?{audit:job.audit}:{})});return true;
    }
    json(res,405,{error:'不支持的请求方法。'});return true;
  }
  return {route,busy,shutdown};
}
