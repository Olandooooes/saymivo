// Render a reviewed plan over the fine-cut master, then put the original audio back.
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {presentation} from '../src/plan.mjs';
import {publicVideoPath, remuxOriginalAudio} from './plan-files.mjs';
import {syncAtCuts} from './render-fine-cut.mjs';

const invoked = process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href || process.argv[1]?.endsWith('render-plan.mjs');
if (invoked && process.argv[1]?.endsWith('render-plan.mjs')) {
  const [planFile, fineCut, outFile] = process.argv.slice(2).filter(arg => !arg.startsWith('--'));
  if (!planFile || !fineCut || !outFile) {
    console.error('用法: node scripts/render-plan.mjs plan.json fine-cut.mp4 out.mp4');
    process.exit(1);
  }
  const saved = JSON.parse(fs.readFileSync(planFile, 'utf8'));
  const ready = presentation({
    plan: saved.source ?? saved,
    words: saved.words ?? [],
    removes: saved.removes ?? [],
    faceBox: saved.faceBox ?? null,
    clip: saved.clip ?? {inSec: 0, outSec: 1e9},
    style: saved.style,
  });
  const src = publicVideoPath(fineCut);
  const probed = JSON.parse(spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=nb_frames,width,height', '-of', 'json', fineCut], {encoding: 'utf8'}).stdout || '{}');
  const stream = probed.streams?.[0] ?? {};
  const propsPath = path.join(path.dirname(path.resolve(outFile)), 'plan-props.json');
  fs.mkdirSync(path.dirname(propsPath), {recursive: true});
  fs.writeFileSync(propsPath, JSON.stringify({plan: ready.plan, src, durationInFrames: Number(stream.nb_frames) || undefined, sourceWidth: stream.width, sourceHeight: stream.height}));
  const rendered = outFile.replace(/\.mp4$/i, '') + '.video.mp4';
  const render = spawnSync('npx', ['remotion', 'render', 'src/index.ts', 'PlanCut', rendered, '--props', propsPath, '--public-dir', 'public'], {stdio: 'inherit'});
  if (render.status !== 0) process.exit(render.status ?? 1);
  remuxOriginalAudio(rendered, fineCut, outFile);
  fs.rmSync(rendered, {force: true});
  const sync = syncAtCuts(outFile, [[0, Number(stream.nb_frames) / 30 || 1]], 30);
  console.log(JSON.stringify({output: outFile, withinOneFrame: sync.withinOneFrame, durationDeltaSec: sync.durationDeltaSec}));
  if (!sync.withinOneFrame) process.exit(1);
}
