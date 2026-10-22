// Shared per-clip transcription + assembly onto the trimmed/reordered timeline.
// Used by both the captions pipeline and the B-roll detector.
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {applyWordReviews} from './word-reviews.mjs';
import {reviewClockMatches} from '../src/source-review-clock.mjs';
import {transcriptionProfile,SOURCE_AUDIO_CLOCK} from './transcript-profile.mjs';
import {fileURLToPath} from 'node:url';
import {verifyDerivedClockCache} from './recognition-clock-migration.mjs';

const ROOT = process.cwd();
const PUBLIC = process.env.KOUBO_PUBLIC_DIR?path.resolve(process.env.KOUBO_PUBLIC_DIR):path.join(ROOT, 'public');
const TRANSCRIPTS = path.join(PUBLIC, 'clips', 'transcripts');
const TMP = path.join(ROOT, '.captions-tmp');
const AUDIO_EXTRACTOR=fileURLToPath(new URL('./source_audio.py',import.meta.url));

// load .env so AUTOBROLL_PROMPT works when scripts run standalone
const envFile = path.join(ROOT, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

// Whisper prompt bias: set AUTOBROLL_PROMPT in .env with YOUR domain words
// (topics, brands) to improve transcription accuracy on your videos.
const PROMPT_BIAS =
  process.env.AUTOBROLL_PROMPT ||
  '以下是一段普通话口播。请准确识别中文、英文术语和数字。';

// ---- device selection ----
// AUTOBROLL_DEVICE=cpu|cuda forces it; default "auto" asks torch once per process.
// GPU: float16. CPU: int8. One whisperx process per BATCH (the model load is most
// of the wall time, so 3 clips on the GPU take ~10 s instead of ~20 s on CPU).
let DEVICE = null;
function pickDevice() {
  if (DEVICE) return DEVICE;
  const forced = (process.env.AUTOBROLL_DEVICE || 'auto').toLowerCase();
  if (forced === 'cpu' || forced === 'cuda') return (DEVICE = forced);
  const probe = spawnSync('.venv/bin/python', ['-c', 'import torch;print(int(torch.cuda.is_available()))'], {cwd: ROOT});
  DEVICE = probe.status === 0 && probe.stdout.toString().trim() === '1' ? 'cuda' : 'cpu';
  return DEVICE;
}
const computeType = (device) => (device === 'cuda' ? 'float16' : 'int8');

function runWhisperx(wavs, outDir, device) {
  return spawnSync(
    '.venv/bin/whisperx',
    [
      // 'medium' (multilingual, already cached) is noticeably more accurate than
      // small.en on accented English. --language en keeps it English-only.
      ...wavs, '--model', 'medium', '--language', process.env.AUTOBROLL_LANGUAGE || 'zh', '--device', device, '--compute_type', computeType(device),
      '--output_format', 'json', '--output_dir', outDir, '--vad_onset', '0.2', '--vad_offset', '0.2',
      '--initial_prompt', PROMPT_BIAS,
    ],
    {cwd: ROOT},
  );
}

// Word times are relative to the SOURCE file, so the cache is keyed by source:
// autocut segments and re-arranged copies of the same take never re-transcribe.
const sourceKey = (clip) => path.basename(clip.src).replace(/\.[^.]+$/, '');
const localProfile=()=>{
 const profile=fs.existsSync(path.join(ROOT,'.venv','bin','faster-whisper-ready'))
 ?transcriptionProfile({root:ROOT,model:process.env.AUTOBROLL_MODEL})
 :transcriptionProfile({root:ROOT,engine:'whisperx',model:'medium'});
 return {...profile,cacheDir:path.join(PUBLIC,'clips','transcripts',path.basename(profile.cacheDir))};
};
export const transcriptCacheFile = clip => path.join(localProfile().cacheDir,`${sourceKey(clip)}.json`);
const cacheFile=transcriptCacheFile;
const digestMemo=new Map();
const sha256=file=>{
 const stat=fs.statSync(file),key=[stat.size,stat.mtimeMs,stat.ctimeMs].join(':');
 const prior=digestMemo.get(file);if(prior?.key===key)return prior.digest;
 const digest=createHash('sha256').update(fs.readFileSync(file)).digest('hex');digestMemo.set(file,{key,digest});return digest;
};
const metaFile=cache=>cache.replace(/\.json$/,'.meta.json');
function clockMatches(clock){return clock?.version===SOURCE_AUDIO_CLOCK.version&&clock?.timestampBasis===SOURCE_AUDIO_CLOCK.timestampBasis;}
function cacheMetadata(clip,cache){
 const meta=JSON.parse(fs.readFileSync(metaFile(cache),'utf8'));
 if(!clockMatches(meta.audioClock)||(meta.kind!=='recognition-clock-migration'&&meta.recognizerVersion!==localProfile().recognizerVersion))throw Error('识别缓存的音频时钟版本不匹配；旧缓存已保留，不能作为 source-zero 结果复用。');
 const digest=sha256(path.join(PUBLIC,clip.src));
 if(meta.sourceSha256!==digest||meta.audioClock.sourceSha256!==digest)throw Error('识别缓存与源文件 SHA 不匹配；缓存已保留，请使用独立的新来源缓存。');
 if(meta.recognitionSha256!==sha256(cache))throw Error('识别缓存内容与元数据 SHA 不匹配；原文件已保留。');
 if(meta.kind==='recognition-clock-migration')verifyDerivedClockCache(meta,{profile:localProfile(),sourceSha256:digest,words:JSON.parse(fs.readFileSync(cache,'utf8'))});
 return meta;
}
// Read only an existing, byte-verified recognition receipt; never infer a clock
// from a legacy project or invoke recognition while reading project metadata.
export function transcriptAudioClock(clip){return {...cacheMetadata(clip,cacheFile(clip)).audioClock};}

function parseWhisperxJson(file) {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const raw = data.segments.flatMap((s) => s.words ?? []);
  return raw
    .map((w, i) => {
      let start = w.start;
      let end = w.end;
      if (start == null) {
        const prev = raw.slice(0, i).reverse().find((x) => x.end != null);
        start = prev ? prev.end : 0;
      }
      if (end == null) {
        const next = raw.slice(i + 1).find((x) => x.start != null);
        end = next ? next.start : start + 0.3;
      }
      return {word: String(w.word).trim(), startMs: Math.round(start * 1000), endMs: Math.round(end * 1000)};
    })
    .filter((w) => w.word.length > 0);
}

// Transcribe every not-yet-cached source among `clips` in ONE whisperx run.
// onBatch(label) is called once before the run (for progress UI).
export function transcribeClips(clips, onBatch) {
  fs.mkdirSync(TRANSCRIPTS, {recursive: true});
  fs.mkdirSync(TMP, {recursive: true});
  const pending = new Map(); // key -> clip
  for (const c of clips) {
    if (!fs.existsSync(cacheFile(c))) {
      if(fs.existsSync(metaFile(cacheFile(c))))throw Error('识别缓存元数据已存在但原始结果缺失，已保留现场；请使用独立缓存恢复。');
      pending.set(sourceKey(c), c);
    }
    else cacheMetadata(c,cacheFile(c));
  }
  if (!pending.size) return;

  const profile=localProfile();fs.mkdirSync(profile.cacheDir,{recursive:true});
  const extractionDir=fs.mkdtempSync(path.join(TMP,'source-zero-'));
  const wavs = [];
  try{
  for (const [key, clip] of pending) {
    const wav = path.join(extractionDir, `${key}.16k.wav`);
    const ff = spawnSync('.venv/bin/python', [AUDIO_EXTRACTOR,path.join(PUBLIC, clip.src),wav], {cwd:ROOT,encoding:'utf8',maxBuffer:4*1024*1024});
    if (ff.status !== 0) throw Error(`source-zero 音频提取失败 (${key}): `+(ff.stderr||ff.error?.message||'').slice(-400));
    else wavs.push(wav);
  }
  if (!wavs.length) return;

  if (fs.existsSync(path.join(ROOT, '.venv', 'bin', 'faster-whisper-ready'))) {
    onBatch?.('正在将原声音频识别为带时间点的中文字幕…');
    const fw=spawnSync('.venv/bin/python', ['scripts/transcribe-local.py', profile.cacheDir, ...wavs], {cwd:ROOT,env:{...process.env,AUTOBROLL_MODEL:profile.model},encoding:'utf8',maxBuffer:16*1024*1024});
    if(fw.status!==0)throw new Error('本地中文识别失败：'+(fw.stderr||fw.error?.message||'').slice(-300));
    return;
  }
  if (!fs.existsSync(path.join(ROOT, '.venv', 'bin', 'whisperx'))) {
    throw new Error('WhisperX is not installed (.venv/bin/whisperx missing) — run `npm run setup`');
  }
  let device = pickDevice();
  onBatch?.(`Transcribing ${wavs.length} clip${wavs.length === 1 ? '' : 's'} (${device === 'cuda' ? 'GPU' : 'CPU'})`);
  const outDir = path.join(TMP, `batch-${Date.now()}`);
  fs.mkdirSync(outDir, {recursive: true});
  let wx = runWhisperx(wavs, outDir, device);
  if (wx.status !== 0 && device === 'cuda') {
    // e.g. CUDA out of memory / driver mismatch → fall back for this process
    console.error(`whisperx on cuda failed (${wx.stderr?.toString().trim().split('\n').pop()?.slice(0, 160)}); retrying on cpu`);
    DEVICE = device = 'cpu';
    onBatch?.(`Transcribing ${wavs.length} clip${wavs.length === 1 ? '' : 's'} (CPU fallback)`);
    wx = runWhisperx(wavs, outDir, device);
  }
  if (wx.error) throw new Error(`whisperx could not start: ${wx.error.message}`);
  if (wx.status !== 0) {
    const tail = (wx.stderr?.toString() || wx.stdout?.toString() || '').trim().split('\n').filter(Boolean).slice(-3).join(' | ');
    throw new Error(`whisperx failed (exit ${wx.status}): ${tail.slice(-300) || 'no output'}`);
  }

  for (const key of pending.keys()) {
    const out = path.join(outDir, `${key}.16k.json`);
    if (!fs.existsSync(out)) continue; // ffmpeg failed for this one → transcribeClip will throw
    const wav=path.join(extractionDir,`${key}.16k.wav`),audioClock=JSON.parse(fs.readFileSync(wav+'.clock.json','utf8'));
    const content=JSON.stringify(parseWhisperxJson(out),null,2),cache=path.join(profile.cacheDir,`${key}.json`);
    const metadata={engine:'whisperx',recognizerVersion:profile.recognizerVersion,model:profile.model,sourceSha256:audioClock.sourceSha256,audioClock,audioUploaded:false,recognitionSha256:createHash('sha256').update(content).digest('hex')};
    fs.writeFileSync(metaFile(cache),JSON.stringify(metadata,null,2),{flag:'wx'});
    fs.writeFileSync(cache,content,{flag:'wx'});
  }
  }finally{fs.rmSync(extractionDir,{recursive:true,force:true});}
}

// Words for one clip (source-relative times). Uses the cache; transcribes on miss.
const reviewResults=new Map();
export function transcribeClip(clip) {
  const cache = cacheFile(clip);
  if (!fs.existsSync(cache)) transcribeClips([clip]);
  if (!fs.existsSync(cache)) throw new Error(`transcription failed for ${clip.id}`);
  const recognition=cacheMetadata(clip,cache);
  const raw=JSON.parse(fs.readFileSync(cache,'utf8'));
  const reviewFile=path.join(PUBLIC,'clips','reviews',sourceKey(clip)+'.json');
  if(!fs.existsSync(reviewFile))return raw;
  const sourceStat=fs.statSync(path.join(PUBLIC,clip.src));
  const key=cache+':'+fs.statSync(cache).mtimeMs+':'+fs.statSync(metaFile(cache)).mtimeMs+':'+fs.statSync(reviewFile).mtimeMs+':'+sourceStat.size+':'+sourceStat.mtimeMs;
  let result=reviewResults.get(key);
  if(!result){
    try{
      const review=JSON.parse(fs.readFileSync(reviewFile,'utf8'));
      const digest=sha256(path.join(PUBLIC,clip.src));
      if(review.sourceSha256!==digest)result={words:raw,report:[{status:'skipped',reason:'source media hash differs'}]};
      else{
       const compatible=[],skipped=[];
       for(const patch of review.patches??[]){
        const clock=patch.audioClock??review.audioClock;
        if(reviewClockMatches(clock,recognition.audioClock)&&clock.sourceSha256===digest)compatible.push(patch);
        else skipped.push({id:patch.id,status:'skipped',reason:'review audio clock is legacy or unverified; source-zero recognition was preserved'});
       }
       result=applyWordReviews(raw,compatible);result.report.push(...skipped);
      }
      reviewResults.set(key,result);
    }catch{result={words:raw,report:[{status:'skipped',reason:'review unavailable'}]};}
  }
  fs.writeFileSync(path.join(process.env.KOUBO_OUTPUT_DIR||PUBLIC,sourceKey(clip)+'.review-applied.json'),JSON.stringify({source:clip.src,sourceCacheUnchanged:true,audioClock:recognition.audioClock,...result,words:undefined},null,2));
  return result.words.map(w=>({...w}));
}

// Assemble all clips' words onto the timeline, honoring trim (in/out) and order.
// onProgress(idx, total, clip) is called before each clip is transcribed.
export function assembleWords(clips, onProgress) {
  // one whisperx run for everything not cached yet
  transcribeClips(clips, (label) => onProgress?.(0, clips.length, {id: label, label, batch: true}));
  const out = [];
  let offsetMs = 0;
  clips.forEach((clip, idx) => {
    onProgress?.(idx, clips.length, clip);
    let words;
    try {
      words = transcribeClip(clip);
    } catch (e) {
      // one bad clip shouldn't kill the whole job — skip it, keep its slot
      console.error(`SKIP clip ${clip.id}: ${String(e).slice(0, 160)}`);
      offsetMs += (clip.outSec - clip.inSec) * 1000;
      return;
    }
    const inMs = clip.inSec * 1000;
    const outMs = clip.outSec * 1000;
    for (const w of words) {
      if (w.endMs <= inMs || w.startMs >= outMs) continue;
      const s = Math.max(w.startMs, inMs) - inMs + offsetMs;
      const e = Math.min(w.endMs, outMs) - inMs + offsetMs;
      out.push({
        word: w.word,
        startMs: Math.round(s), // absolute timeline (current cut)
        endMs: Math.round(e),
        clipId: clip.id, // anchor
        srcStartMs: w.startMs, // relative to the clip's own source start
        srcEndMs: w.endMs,
      });
    }
    offsetMs += (clip.outSec - clip.inSec) * 1000;
  });
  // Keep the original model cache intact; normalize only the display copies.
  if((process.env.AUTOBROLL_LANGUAGE||'zh').startsWith('zh')&&out.length){
    const converted=spawnSync('.venv/bin/python',['scripts/normalize-caption-script.py'],{cwd:ROOT,input:JSON.stringify(out.map(w=>w.word)),encoding:'utf8',maxBuffer:4*1024*1024});
    if(converted.status===0){
      try{
        const texts=JSON.parse(converted.stdout);
        if(Array.isArray(texts)&&texts.length===out.length&&texts.every(t=>typeof t==='string')){
          const changes=[];out.forEach((word,i)=>{if(word.word!==texts[i]){changes.push({clipId:word.clipId,startMs:word.srcStartMs,endMs:word.srcEndMs,before:word.word,after:texts[i]});word.word=texts[i];}});
          fs.writeFileSync(path.join(process.env.KOUBO_OUTPUT_DIR||PUBLIC,'caption-script-normalization.json'),JSON.stringify({method:'OpenCC t2s',changes,sourceCacheUnchanged:true},null,2));
        }
      }catch{console.warn('字形转换结果不可用，已保留原识别文字。');}
    }else console.warn('本地繁简转换未就绪，已保留原识别文字。');
  }
  // persist for reuse (e.g. B-roll detection without re-running)
  fs.writeFileSync(path.join(process.env.KOUBO_OUTPUT_DIR || PUBLIC, 'words.multi.json'), JSON.stringify(out, null, 2));
  return out;
}
