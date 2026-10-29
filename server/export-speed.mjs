import {spawn} from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

export const EXPORT_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2];
export function exportRate(value = 1) {
  if (!EXPORT_RATES.includes(value)) throw new Error('不支持的导出倍速');
  return value;
}

// Apply to the finalized composition, so captions, motion and audio share one clock.
export async function applyExportSpeed({ROOT, EXPORTS, state, rate}) {
  exportRate(rate);
  if (state.status !== 'done' || rate === 1) return state;
  const input = path.join(EXPORTS, path.basename(state.file));
  const name = path.basename(input, '.mp4') + `-${rate}x.mp4`;
  const output = path.join(EXPORTS, name);
  const local = path.join(ROOT, '.tools/bin/ffmpeg');
  await new Promise((resolve, reject) => {
    const child = spawn(fs.existsSync(local) ? local : 'ffmpeg', [
      '-hide_banner', '-n', '-i', input,
      '-map', '0:v:0', '-map', '0:a:0?',
      '-vf', `setpts=(PTS-STARTPTS)/${rate}`,
      '-af', `atempo=${rate},asetpts=PTS-STARTPTS`,
      '-r', '30', '-c:v', 'libx264', '-preset', 'fast', '-crf', '18',
      '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k',
      '-movflags', '+faststart', output,
    ], {cwd: ROOT});
    let tail = '';
    child.stderr.on('data', d => {tail = (tail + d).slice(-2000);});
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve() : reject(new Error(`倍速导出失败：${tail.slice(-500)}`)));
  });
  return {status: 'done', progress: 100, file: `/exports/${name}`, exportRate: rate,
    sourceFile: state.file, sourceAudioFinalization: state.audioFinalization};
}
