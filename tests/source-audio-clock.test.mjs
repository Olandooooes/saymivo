import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';

test('source-zero decoder, ASR receipt validation and VAD share the video clock without model inference',t=>{
 const python='.venv/bin/python';
 if(!fs.existsSync(python)){t.skip('local Python media runtime is not installed');return;}
 const result=spawnSync(python,['tests/source_audio_regression.py'],{encoding:'utf8',maxBuffer:8*1024*1024});
 assert.equal(result.status,0,(result.stderr||'')+(result.stdout||''));
});
