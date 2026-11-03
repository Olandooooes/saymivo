// Draft a sentence plan from words.json and an accepted cutlist. No network.
import fs from 'node:fs';
import {draftPlan, presentation} from '../src/plan.mjs';

const [wordsFile, cutlistFile, outFile, faceFile] = process.argv.slice(2);
if (!wordsFile || !cutlistFile || !outFile) {
  console.error('用法: node scripts/plan-draft.mjs words.json cutlist.json plan.json [face.json]');
  process.exit(1);
}
const wordsDoc = JSON.parse(fs.readFileSync(wordsFile, 'utf8'));
const cutlist = JSON.parse(fs.readFileSync(cutlistFile, 'utf8'));
const words = wordsDoc.words ?? wordsDoc;
const corrections = wordsDoc.corrections ?? [];
const removes = cutlist.removes ?? [];
const faceBox = faceFile ? JSON.parse(fs.readFileSync(faceFile, 'utf8')).face ?? JSON.parse(fs.readFileSync(faceFile, 'utf8')) : null;
const clip = {inSec: 0, outSec: (Math.max(...words.map(word => word.endMs), 1000) / 1000) + 1};
const source = draftPlan({words, removes, corrections});
const ready = presentation({plan: source, words, removes, faceBox, clip});
fs.writeFileSync(outFile, JSON.stringify({
  source, words, corrections, removes, faceBox, clip, style: ready.style, projected: ready.plan, issues: ready.issues,
}, null, 2));
console.log(JSON.stringify({sentences: ready.plan.sentences.length, issues: ready.issues.length, outFile}));
