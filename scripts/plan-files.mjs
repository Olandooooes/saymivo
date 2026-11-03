// Paths and audio remux shared by the plan renderer. No side effects on import.
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

export function publicVideoPath(fineCut, publicDir = 'public') {
  const root = path.resolve(publicDir);
  const abs = path.resolve(fineCut);
  const inside = abs === root || abs.startsWith(root + path.sep);
  const dest = inside ? abs : path.join(root, 'plan-src', path.basename(abs));
  if (!inside) {
    fs.mkdirSync(path.dirname(dest), {recursive: true});
    fs.copyFileSync(abs, dest);
  }
  return path.relative(root, dest).split(path.sep).join('/');
}

export function remuxOriginalAudio(rendered, audioSource, output) {
  fs.mkdirSync(path.dirname(output), {recursive: true});
  const result = spawnSync('ffmpeg', [
    '-y', '-i', rendered, '-i', audioSource,
    '-map', '0:v:0', '-map', '1:a:0', '-c', 'copy', '-shortest', output,
  ], {encoding: 'utf8'});
  if (result.status !== 0) throw Error((result.stderr || '音轨封装失败').slice(-500));
  return output;
}
