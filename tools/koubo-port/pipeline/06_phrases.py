"""Step 6: subtitle phrases in OUTPUT time (+ per-token times for motion cues).

Tokens removed by the cut are dropped; the rest are mapped source->output time.
Phrases split at pauses >= 0.25 s or at max_chars; ASR typos are fixed only through
an explicit corrections map (display text must stay the speaker's own words).
usage: python 06_phrases.py workdir/ [corrections.json]
corrections.json example: {"replace": {"他到底": "它到底", "agent": "Agent"}, "split_after": [12, 30]}
writes workdir/phrases.json = [{"text", "s", "e", "tokens": [[tok, t_out], ...]}]
"""
import json, sys, os

def s2o(t, K):
    o = 0.0
    for a, b in K:
        if t < a: return None          # inside a removed span
        if t <= b: return o + (t - a)
        o += b - a
    return None

def main(wd, corr_path=None, max_chars=16, gap=0.25):
    K = json.load(open(os.path.join(wd, 'cutlist.json')))['keep']
    toks = json.load(open(os.path.join(wd, 'chars.json')))
    corr = json.load(open(corr_path)) if corr_path else {}
    kept = []
    for tk, s, e in toks:
        os_, oe = s2o(s, K), s2o(e, K)
        if os_ is None: continue
        kept.append([tk, round(os_, 3), round(oe if oe is not None else os_ + min(0.4, e - s), 3)])
    out = []; cur = []
    for i, t in enumerate(kept):
        if cur and (t[1] - cur[-1][2] >= gap or len(cur) >= max_chars or i in set(corr.get('split_after', []))):
            out.append(cur); cur = []
        cur.append(t)
    if cur: out.append(cur)
    res = []
    for p in out:
        raw = ''.join((' ' + x[0] + ' ') if x[0].isascii() and x[0].isalpha() else x[0] for x in p).strip().replace('  ', ' ')
        disp = raw
        for k, v in corr.get('replace', {}).items(): disp = disp.replace(k, v)
        res.append({'text': disp, 'raw': raw, 's': p[0][1], 'e': p[-1][2], 'tokens': [[x[0], x[1]] for x in p]})
    json.dump(res, open(os.path.join(wd, 'phrases.json'), 'w'), ensure_ascii=False, indent=1)
    print('phrases', len(res))

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None)
