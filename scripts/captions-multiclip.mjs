// In-browser caption generation for the assembled multi-clip timeline.
//
// Input : a JSON file (argv[2]) = {clips:[{id,src,inSec,outSec,...}]} — the
//         editor's CURRENT cut (trim + order).
// Steps : 1) transcribe each source clip with WhisperX (cached per clip),
//         2) map words onto the assembled/trimmed timeline,
//         3) Gemini accent detection,
//         4) build Caption[] → public/captions.multi.json
// Output: PROGRESS:<pct>:<label> lines on stdout for the server to relay.
import fs from 'node:fs';
import path from 'node:path';
import {gemini} from './gemini.mjs';
import {spawnSync} from 'node:child_process';
import {assembleWords,transcriptAudioClock} from './lib-transcribe.mjs';

const DEFAULT_TOP = 80;
const ROOT = process.cwd();
const PUBLIC = process.env.KOUBO_PUBLIC_DIR ? path.resolve(process.env.KOUBO_PUBLIC_DIR) : path.join(ROOT, 'public');

const progress = (pct, label) => console.log(`PROGRESS:${pct}:${label}`);

const clipsFile = process.argv[2];
const {clips} = JSON.parse(fs.readFileSync(clipsFile, 'utf8'));
if (!clips?.length) {
  console.error('no clips');
  process.exit(1);
}

// --- accents (Gemini) ---
async function detectAccents(words) {
  if (process.env.KOUBO_LOCAL_ONLY==='1') return [];
  const indexed = words.map((w, i) => `${i}:${w.word}`).join(' ');
  const PROMPT = `You are a senior short-form video editor. Below is a transcript of a talking-head video, each word prefixed with its index.

Pick which words deserve an ACCENT (gold highlight) — like a human editor.
- Be VERY sparing: 5-12% of words max. Restraint looks human-made.
- Accent only MEANING words: bold claims, numbers, key features, emotional peaks, the punchline, CTAs, brand/product names.
- NEVER accent: articles, prepositions, fillers, pronouns, auxiliaries.
- Prefer 1 per sentence, max 2 for long ones. Some sentences get zero.

Transcript:
${indexed}

Return accents as JSON.`;
  const schema = {
    type: 'OBJECT',
    properties: {
      accents: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {index: {type: 'INTEGER'}, word: {type: 'STRING'}},
          required: ['index', 'word'],
        },
      },
    },
    required: ['accents'],
  };
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9%$\u3400-\u9fff]/gi, '');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // retry transient 503/429 (Gemini "high demand") with backoff
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const result = await gemini([{text: PROMPT}], schema);
      return result.accents.filter((a) => words[a.index] && norm(words[a.index].word) === norm(a.word)).map((a) => a.index);
    } catch (e) {
      const msg = String(e);
      const transient = /\b(503|429|500|UNAVAILABLE|high demand)\b/i.test(msg);
      if (transient && attempt < 3) {
        const wait = 2000 * (attempt + 1);
        console.error(`accent attempt ${attempt + 1} failed (${msg.slice(0, 60)}…), retrying in ${wait}ms`);
        await sleep(wait);
        continue;
      }
      console.error('accent detection failed, continuing without accents:', msg.slice(0, 200));
      return [];
    }
  }
  return [];
}

// --- face-aware placement (Gemini vision on one frame per source clip) ---
// Captions default to 58% down the frame, which on a talking head lands on the
// mouth. Ask Gemini where the face is and put the block just under the chin,
// or above the head when the face sits low. Cached per source file.
// Disable with AUTOBROLL_FACE_AWARE=0 in .env.
const FACES_DIR = path.join(PUBLIC, 'clips', 'faces');
const TMP = path.join(ROOT, '.captions-tmp');
const BLOCK_PCT = 9; // ≈ two caption lines at 62px on a 1920px frame
const MIN_TOP = 8;
const MAX_TOP = 72; // block bottom ≤ ~81%: stays clear of the Reels/TikTok UI strip
const sourceKey = (clip) => path.basename(clip.src).replace(/\.[^.]+$/, '');

function faceToTop(face) {
  if (!face?.found) return DEFAULT_TOP;
  const top = face.top * 100;
  const bottom = face.bottom * 100;
  const below = bottom + 5; // a little under the chin (Gemini's box tends to end at the lip line)
  if (below <= MAX_TOP) return Math.round(Math.max(MIN_TOP, below));
  const above = top - 4 - BLOCK_PCT; // face sits low → go above the head
  return Math.round(Math.min(MAX_TOP, Math.max(MIN_TOP, above)));
}

async function detectFaces(clips) {
  if ((process.env.AUTOBROLL_FACE_AWARE ?? '1') === '0') return {};
  fs.mkdirSync(FACES_DIR, {recursive: true});
  fs.mkdirSync(TMP, {recursive: true});
  const bySource = new Map();
  for (const c of clips) if (!bySource.has(sourceKey(c))) bySource.set(sourceKey(c), c);
  const result = {};
  const pending = [];
  for (const [key, clip] of bySource) {
    const cache = path.join(FACES_DIR, `${key}.json`);
    if (fs.existsSync(cache)) { result[key] = JSON.parse(fs.readFileSync(cache, 'utf8')); continue; }
    // a frame from the middle of the clip's current trim window
    const mid = clip.inSec + Math.max(0, (clip.outSec - clip.inSec) / 2);
    const jpg = path.join(TMP, `${key}.face.jpg`);
    const ff = spawnSync('ffmpeg', ['-y', '-ss', String(mid), '-i', path.join(PUBLIC, clip.src), '-frames:v', '1', '-vf', 'scale=540:-2', '-q:v', '4', jpg], {cwd: ROOT});
    if (ff.status === 0 && fs.existsSync(jpg)) pending.push({key, jpg});
  }
  if (!pending.length) return result;

  const parts = [{text: `You are given ${pending.length} video frame(s) from talking-head clips, in order, labelled F1..F${pending.length}.
For each frame report whether a human face is clearly visible and, if so, its bounding box as fractions of the frame height/width
(top = forehead/hairline, bottom = chin), so a caption can be placed where it will NOT cover the face.
If several faces, use the largest. Return one entry per frame, same order.`}];
  pending.forEach((p, i) => { parts.push({text: `F${i + 1}:`}); parts.push({imagePath: p.jpg}); });
  const schema = {
    type: 'OBJECT',
    properties: {
      frames: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            frame: {type: 'STRING'},
            found: {type: 'BOOLEAN'},
            top: {type: 'NUMBER'}, bottom: {type: 'NUMBER'}, left: {type: 'NUMBER'}, right: {type: 'NUMBER'},
          },
          required: ['frame', 'found'],
        },
      },
    },
    required: ['frames'],
  };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const out = await gemini(parts, schema);
      const frames = Array.isArray(out.frames) ? out.frames : [];
      pending.forEach((p, i) => {
        const f = frames.find((x) => String(x.frame).toUpperCase().replace(/\s/g, '') === `F${i + 1}`) ?? frames[i];
        const sane = f?.found && f.top >= 0 && f.bottom <= 1 && f.bottom > f.top;
        const face = sane ? {found: true, top: f.top, bottom: f.bottom, left: f.left, right: f.right} : {found: false};
        result[p.key] = face;
        fs.writeFileSync(path.join(FACES_DIR, `${p.key}.json`), JSON.stringify(face));
      });
      return result;
    } catch (e) {
      const msg = String(e);
      if (/\b(503|429|500|UNAVAILABLE)\b/i.test(msg) && attempt < 2) { await sleep(2000 * (attempt + 1)); continue; }
      console.error('face detection failed, using default caption position:', msg.slice(0, 160));
      return result; // uncached sources fall back to DEFAULT_TOP (not cached, so next run retries)
    }
  }
  return result;
}

// Shared segmentation is also used by regression and offline regeneration.
import {buildCaptionPages} from '../src/build-caption-pages.mjs';
const buildCaptions=buildCaptionPages;

// --- run ---
progress(2, 'Starting');
const words = assembleWords(clips, (idx, total, clip) =>
  progress(5 + Math.round((idx / total) * 75), clip.batch ? clip.label : `Transcribing ${clip.label ?? clip.id} (${idx + 1}/${total})`),
);
progress(80, 'Finding faces');
const faces = await detectFaces(clips);
const topByClip = Object.fromEntries(clips.map((c) => [c.id, faceToTop(faces[sourceKey(c)])]));
progress(84, 'Detecting accents');
const accents = await detectAccents(words);
const clockBySource=new Map(),clockByClip=new Map();
for(const clip of clips){if(!clockBySource.has(clip.src))clockBySource.set(clip.src,transcriptAudioClock(clip));clockByClip.set(clip.id,clockBySource.get(clip.src));}
const {readProofreadSettings:readSettings,parseGlossary}=await import('../server/proofread.mjs');
const protectedPhrases=parseGlossary(readSettings(ROOT).glossary??'').map(t=>t.term);
let captions = buildCaptions(words, accents, topByClip,{protectedPhrases}).map(caption=>({...caption,audioClock:clockByClip.get(caption.clipId)}));
const outputDir=process.env.KOUBO_OUTPUT_DIR || PUBLIC;
fs.writeFileSync(path.join(outputDir,'captions.raw.json'),JSON.stringify(captions,null,2));
if(process.env.KOUBO_SKIP_PROOFREAD!=='1'){
 progress(90,'本地原声复核字幕疑点');
 const {proofreadSourceCaptions}=await import('../server/proofread-source.mjs');
 const {readProofreadSettings}=await import('../server/proofread.mjs');
 const report=await proofreadSourceCaptions(captions,{root:ROOT,clips,outputDir,glossary:readProofreadSettings(ROOT).glossary??''});
 captions=report.captions;
}
fs.writeFileSync(path.join(process.env.KOUBO_OUTPUT_DIR || PUBLIC, 'captions.multi.json'), JSON.stringify(captions, null, 2));
progress(100, `Done — ${captions.length} captions, ${accents.length} accents`);
