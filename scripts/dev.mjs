// `npm start` — run the whole app with one command:
//   backend (port 3348) + editor frontend (vite, port 5188)
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
fs.mkdirSync(path.join(ROOT, 'public'), {recursive: true});
// Reuse Remotion's bundled FFmpeg on this Mac; no global installation required.
const candidates = [path.join(ROOT, 'node_modules/@remotion/compositor-darwin-arm64')];
const bin = candidates.find(p => fs.existsSync(path.join(p, 'ffmpeg')));
if (bin) { process.env.PATH = bin + path.delimiter + process.env.PATH; process.env.DYLD_LIBRARY_PATH = bin; }
if (fs.existsSync(path.join(ROOT,'.tools/bin/ffmpeg'))) process.env.PATH = path.join(ROOT,'.tools/bin')+path.delimiter+process.env.PATH;
 // vite needs it on a fresh clone

const procs = [
  spawn(process.execPath, ['server/index.mjs'], {cwd: ROOT, stdio: 'inherit'}),
  spawn(process.execPath, ['node_modules/vite/bin/vite.js'], {cwd: ROOT, stdio: 'inherit'}),
];

const killAll = () => procs.forEach((p) => { try { p.kill('SIGTERM'); } catch {} });
process.on('SIGINT', () => { killAll(); process.exit(0); });
process.on('SIGTERM', () => { killAll(); process.exit(0); });
// if either process dies, stop the other one too
procs.forEach((p) => p.on('exit', (code) => { killAll(); process.exit(code ?? 0); }));
