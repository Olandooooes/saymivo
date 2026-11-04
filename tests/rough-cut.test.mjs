import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {portPython, portRoot, toReviewCutlist} from '../scripts/rough-cut.mjs';

test('a port cut list becomes review rows without dropping the pause id', () => {
  const review = toReviewCutlist({
    fps: 30,
    keep: [[0.3, 4], [5, 9]],
    removed: [
      {id: 1, type: '语气词', s: 1.2, e: 1.5, text: '', reason: '无文字', confidence: 'medium'},
      {id: 2, type: '起句失败', s: 3, e: 3.4, text: '开头', reason: '重新说', confidence: 'high'},
      {id: 3, type: '重说', s: 8, e: 20.5, text: '后一遍', reason: '太长', confidence: 'review'},
    ],
    gaps: [{id: 0, s: 6, e: 6.4, orig: 1.1, target: 0.6}],
  }, {sourceSha256: 'abc', portKey: 'abc'});
  assert.equal(review.engine, 'koubo-port');
  assert.deepEqual(review.removes.map(row => [row.kind, row.status, row.portId ?? row.gapIndex]), [
    ['filler', 'proposed', 1],
    ['false-start', 'proposed', 2],
    ['retake', 'pending', 3],
    ['pause', 'proposed', 0],
  ]);
  assert.equal(review.removes[3].keepMs, 600);
  assert.equal(review.audioOffsetMs, 0);
});

test('synthetic speech hits a filler, a failed start, a retake and a long pause', () => {
  const python = portPython();
  if (!fs.existsSync(path.join(portRoot, '.venv/bin/python'))) {
    return;
  }
  const result = spawnSync(python, [path.join(portRoot, 'pipeline/test_autocut.py')], {encoding: 'utf8'});
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /ok/);
});
