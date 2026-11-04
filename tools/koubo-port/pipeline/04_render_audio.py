"""Step 4: assemble the cut audio with equal-power crossfades, then loudness-normalise.

Every join: 30 ms sin/cos crossfade centred on the cut (never a hard join).
Head fade-in 40 ms, tail fade-out 300 ms. Target -16 LUFS integrated, true peak <= -1 dBTP.
usage: python 04_render_audio.py workdir/   (reads aligned48.wav + cutlist.json, writes cut_audio.wav)
"""
import json, sys, os, subprocess, re
import numpy as np, soundfile as sf

def measure_lufs(path):
    out = subprocess.run(['ffmpeg', '-hide_banner', '-i', path, '-af', 'ebur128=peak=true', '-f', 'null', '-'], capture_output=True, text=True).stderr
    I = float(re.findall(r'I:\s+(-?[\d.]+) LUFS', out)[-1]); tp = re.findall(r'Peak:\s+(-?[\d.]+) dBFS', out)
    return I, (float(tp[-1]) if tp else None)

def main(wd, rules_path=None):
    R = json.load(open(rules_path or os.path.join(os.path.dirname(__file__), '..', 'config', 'cut_rules.json')))
    K = json.load(open(os.path.join(wd, 'cutlist.json')))['keep']
    x, sr = sf.read(os.path.join(wd, 'aligned48.wav'), dtype='float64')
    if x.ndim == 1: x = x[:, None]
    hx = int(sr * R['crossfade_ms'] / 1000 / 2); n = 2 * hx
    ph = np.linspace(0, np.pi / 2, n)[:, None]; fin, fout = np.sin(ph), np.cos(ph)     # equal power
    total = sum(int(round(b * sr)) - int(round(a * sr)) for a, b in K)
    y = np.zeros((total + 2 * n, x.shape[1])); pos = 0
    for i, (a, b) in enumerate(K):
        A, B = int(round(a * sr)), int(round(b * sr))
        s = x[max(0, A - hx):min(len(x), B + hx)].copy()
        if i == 0: s = s[min(hx, A):]
        else: s[:n] *= fin
        if i < len(K) - 1: s[-n:] *= fout
        st = pos - hx if i > 0 else pos
        y[st:st + len(s)] += s; pos += B - A
    y = y[:total]
    fi, fo = int(R['fade_in_ms'] / 1000 * sr), int(R['fade_out_ms'] / 1000 * sr)
    y[:fi] *= np.linspace(0, 1, fi)[:, None]; y[-fo:] *= np.linspace(1, 0, fo)[:, None]
    tmp = os.path.join(wd, 'cut_audio_raw.wav'); sf.write(tmp, y, sr, subtype='PCM_24')
    I, tp = measure_lufs(tmp)
    gain = R['loudness']['target_lufs'] - I
    if tp is not None: gain = min(gain, R['loudness']['max_true_peak_dbtp'] - tp)   # never push peaks over the ceiling
    y *= 10 ** (gain / 20)
    out = os.path.join(wd, 'cut_audio.wav'); sf.write(out, y, sr, subtype='PCM_24')
    I2, tp2 = measure_lufs(out)
    print(f'duration {total / sr:.3f}s  loudness {I:.1f} -> {I2:.1f} LUFS  true peak {tp2} dBTP  gain {gain:+.2f} dB')

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None)
