import fs from 'node:fs';
import path from 'node:path';

// Only an immutable snapshot of existing local clip instances enters analysis.
// Project JSON, saved source-edit decisions and reviewed captions are not input.
export function validateRetakeRequest(value,{PUBLIC,checkFiles=true}={}) {
  if(!value || typeof value!=='object' || Array.isArray(value))throw Error('分析参数无效。');
  const mode=value.mode??'local';
  if(!['local','codex','gemini'].includes(mode))throw Error('不支持的分析模式。');
  if(mode!=='local' && value.allowCloudText!==true)throw Error('语义精剪需要明确同意发送转写文字。');
  if(value.policy!==undefined && value.policy!=='conservative')throw Error('只支持保守取舍策略。');
  if(!Array.isArray(value.clips)||!value.clips.length||value.clips.length>250)throw Error('请提供 1–250 个原片片段。');
  const ids=new Set(),sources=new Set();
  const clips=value.clips.map(c=>{
    if(!c || typeof c!=='object'||typeof c.id!=='string'||!c.id||c.id.length>200||ids.has(c.id))throw Error('原片片段编号无效或重复。');
    if(typeof c.src!=='string'||!/^clips\/[\w.-]+\.mp4$/i.test(c.src)||c.src.includes('..'))throw Error('只支持素材库中的本地 MP4 原片。');
    const speed=c.speed??1;
    if(![c.inSec,c.outSec,c.sourceDurationSec,speed].every(Number.isFinite)||c.inSec<0||c.outSec<=c.inSec||
      c.sourceDurationSec<=0||c.sourceDurationSec>3600||c.outSec>c.sourceDurationSec+.001||speed<=0||speed>8)throw Error('原片时间范围或速度无效；单个素材最多 60 分钟。');
    if(checkFiles){
      if(!PUBLIC)throw Error('缺少素材目录。');
      const directory=fs.realpathSync(path.join(PUBLIC,'clips'));
      let file;try{file=fs.realpathSync(path.join(PUBLIC,c.src));}catch{throw Error('原片文件不存在。');}
      if(!file.startsWith(directory+path.sep)||!fs.statSync(file).isFile())throw Error('原片不在素材库内。');
    }
    ids.add(c.id);sources.add(c.src);
    return {id:c.id,src:c.src,inSec:c.inSec,outSec:c.outSec,speed,sourceDurationSec:c.sourceDurationSec};
  });
  if(sources.size>12)throw Error('每次最多分析 12 个不同原片。');
  return {clips,mode,policy:'conservative',...(mode!=='local'?{allowCloudText:true}:{})};
}
