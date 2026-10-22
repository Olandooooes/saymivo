import fs from 'node:fs';
import {storyboardReviewMarkdown} from '../src/storyboard-review.mjs';
const [input,output,fps='30']=process.argv.slice(2);
if(!input||!output||!Number.isFinite(+fps)||+fps<=0)throw Error('Usage: node scripts/export-storyboard-review.mjs PROJECT.json OUTPUT.md [fps]');
fs.writeFileSync(output,storyboardReviewMarkdown(JSON.parse(fs.readFileSync(input,'utf8')),+fps));
console.log(output);
