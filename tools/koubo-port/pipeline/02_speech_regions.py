"""Step 2: energy VAD -> speech regions (video time).

20 ms RMS frames, -34 dBFS threshold, merge gaps < 0.25 s, drop regions < 0.12 s.
Each speech frame also holds for hangover_ms (default 40). A decay that sits just
under the threshold would otherwise split a short untranscribed vocalization into
two pieces below min_region, and it would measure the following pause long.
Region ends are where energy really falls, so they include word tails that ASR
char-end times often cut short. Cuts are never placed inside a region.

usage: python 02_speech_regions.py workdir/ [cut_rules.json]
writes workdir/speech_regions.json = [[start, end], ...] and workdir/energy_db.npy (per 20 ms)
"""
import json, sys, os
import numpy as np, soundfile as sf

def speech_regions(db, rules):
    R = rules['energy_vad'] if 'energy_vad' in rules else rules
    dt = R['frame_ms'] / 1000
    sp = np.asarray(db) > R['threshold_db']
    hang = int(round(float(R.get('hangover_ms', 0)) / R['frame_ms']))
    if hang > 0 and sp.any():
        grown = sp.copy()
        for i in np.flatnonzero(sp):
            grown[i:i + 1 + hang] = True
        sp = grown
    n = len(sp); reg = []; i = 0
    while i < n:
        if sp[i]:
            j = i
            while j < n and sp[j]: j += 1
            reg.append([i * dt, j * dt]); i = j
        else: i += 1
    merged = []
    for a, b in reg:
        if merged and a - merged[-1][1] < R['merge_gap']: merged[-1][1] = b
        else: merged.append([a, b])
    return [[round(a, 3), round(b, 3)] for a, b in merged if b - a > R['min_region']]

def main(wd, rules_path=None):
    rules = json.load(open(rules_path or os.path.join(os.path.dirname(__file__), '..', 'config', 'cut_rules.json')))
    R = rules['energy_vad']
    x, sr = sf.read(os.path.join(wd, 'aligned16.wav'), dtype='float32')
    if x.ndim > 1: x = x.mean(1)
    h = int(sr * R['frame_ms'] / 1000)
    n = len(x) // h
    rms = np.sqrt((x[:n * h].reshape(n, h) ** 2).mean(1)); db = 20 * np.log10(rms + 1e-9)
    np.save(os.path.join(wd, 'energy_db.npy'), db)
    merged = speech_regions(db, rules)
    json.dump(merged, open(os.path.join(wd, 'speech_regions.json'), 'w'))
    print('regions', len(merged))

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None)
