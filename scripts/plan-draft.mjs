// Draft a sentence plan from words.json and an accepted cutlist.
import fs from 'node:fs';
import {draftPlan, presentation, readFaceBox} from '../src/plan.mjs';
import {draftWithLlm} from '../src/plan-llm.mjs';

const llm = process.argv.includes('--llm');
const [wordsFile, cutlistFile, outFile, faceFile] = process.argv.slice(2).filter(arg => arg !== '--llm');
if (!wordsFile || !cutlistFile || !outFile) {
  console.error('用法: node scripts/plan-draft.mjs [--llm] words.json cutlist.json plan.json [face.json]');
  process.exit(1);
}
const wordsDoc = JSON.parse(fs.readFileSync(wordsFile, 'utf8'));
const cutlist = JSON.parse(fs.readFileSync(cutlistFile, 'utf8'));
const words = wordsDoc.words ?? wordsDoc;
const corrections = wordsDoc.corrections ?? [];
const removes = cutlist.removes ?? [];
const faceBox = faceFile ? readFaceBox(JSON.parse(fs.readFileSync(faceFile, 'utf8'))) : null;
const clip = {inSec: 0, outSec: (Math.max(...words.map(word => word.endMs), 1000) / 1000) + 1};
const drafted = llm
  ? await draftWithLlm({words, removes, corrections, faceBox, clip})
  : {plan: draftPlan({words, removes, corrections}), warnings: [], source: 'rules'};
if (llm && drafted.source !== 'llm') console.error(drafted.warnings.map(item => item.message).join('；') || '未使用模型，改用规则底稿');
const ready = presentation({plan: drafted.plan, words, removes, faceBox, clip});
fs.writeFileSync(outFile, JSON.stringify({
  source: drafted.plan, words, corrections, removes, faceBox, clip, style: ready.style, projected: ready.plan, issues: ready.issues, warnings: drafted.warnings, draftSource: drafted.source,
}, null, 2));
console.log(JSON.stringify({sentences: ready.plan.sentences.length, issues: ready.issues.length, warnings: drafted.warnings.length, draftSource: drafted.source, outFile}));
