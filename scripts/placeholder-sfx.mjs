// Original short tones for the whiteboard sfx slots. Not a recording of anyone.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const RATE = 22050;

function pcm({seconds, amp, sample}) {
  const count = Math.round(seconds * RATE);
  const out = new Int16Array(count);
  for (let i = 0; i < count; i += 1) {
    const t = i / RATE;
    const env = Math.sin((Math.PI * i) / count) ** 2;
    out[i] = Math.max(-32767, Math.min(32767, Math.round(amp * env * sample(t))));
  }
  return out;
}

function wav(samples) {
  const data = Buffer.alloc(44 + samples.length * 2);
  data.write('RIFF', 0);
  data.writeUInt32LE(36 + samples.length * 2, 4);
  data.write('WAVE', 8);
  data.write('fmt ', 12);
  data.writeUInt32LE(16, 16);
  data.writeUInt16LE(1, 20);
  data.writeUInt16LE(1, 22);
  data.writeUInt32LE(RATE, 24);
  data.writeUInt32LE(RATE * 2, 28);
  data.writeUInt16LE(2, 32);
  data.writeUInt16LE(16, 34);
  data.write('data', 36);
  data.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i += 1) data.writeInt16LE(samples[i], 44 + i * 2);
  return data;
}

const tones = {
  'bounce.wav': pcm({seconds: 0.16, amp: 9000, sample: (t) => Math.sin(2 * Math.PI * (240 + t * 1800) * t)}),
  'mark.wav': pcm({seconds: 0.05, amp: 7000, sample: (t) => Math.sin(2 * Math.PI * 1400 * t)}),
  'highlight.wav': pcm({seconds: 0.12, amp: 5000, sample: (t) => Math.sin(2 * Math.PI * 880 * t)}),
  'stamp.wav': pcm({seconds: 0.14, amp: 11000, sample: (t) => Math.sin(2 * Math.PI * 90 * t)}),
  'type.wav': pcm({seconds: 0.03, amp: 6000, sample: (t) => Math.sin(2 * Math.PI * 1800 * t)}),
  'chapter.wav': pcm({seconds: 0.2, amp: 8000, sample: (t) => Math.sin(2 * Math.PI * (t < 0.1 ? 520 : 780) * t)}),
};

export function writePlaceholderSfx(dir) {
  fs.mkdirSync(dir, {recursive: true});
  for (const [name, samples] of Object.entries(tones)) fs.writeFileSync(path.join(dir, name), wav(samples));
  return Object.keys(tones);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  writePlaceholderSfx(process.argv[2] || path.join(import.meta.dirname, '..', 'tests', 'fixtures', 'script-assets', 'sfx'));
}
