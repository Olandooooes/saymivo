// Render a reviewed plan over the fine-cut master. Preview and export both use presentation().
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {presentation} from '../src/plan.mjs';

const [planFile, fineCut, outFile] = process.argv.slice(2);
const enhance = process.argv.includes('--enhance');
if (!planFile || !fineCut || !outFile) {
  console.error('用法: node scripts/render-plan.mjs plan.json fine-cut.mp4 out.mp4 [--enhance]');
  process.exit(1);
}
const saved = JSON.parse(fs.readFileSync(planFile, 'utf8'));
const plan = saved.projected ?? saved;
const props = path.join(path.dirname(outFile), 'plan-props.json');
fs.mkdirSync(path.dirname(outFile), {recursive: true});
fs.writeFileSync(props, JSON.stringify({plan, src: path.resolve(fineCut)}));
if (saved.source && saved.words) {
  const preview = presentation(saved);
  fs.writeFileSync(props, JSON.stringify({plan: preview.plan, src: path.resolve(fineCut)}));
}
const render = spawnSync('npx', ['remotion', 'render', 'src/index.ts', 'PlanCut', outFile, '--props', props], {stdio: 'inherit'});
if (enhance) console.log('可选人像增强在精剪底片上：node 渲染精剪时传 enhance:true（hqdn3d+unsharp），再把该底片交给这条命令。');
process.exit(render.status ?? 1);
