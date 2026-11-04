"""Step 6: subtitle phrases in OUTPUT time (+ per-token times for motion cues).

Tokens removed by the cut are dropped; the rest are mapped source->output time.
A phrase ends at a pause or at sentence punctuation, never because a character
budget was reached. A gap under 0.12 s is not a boundary, so a clause is not
cut in half. A list marker or a dangling function word stays with the next
clause across a short breath. Explicit split_after indexes still split.
Display text comes from corrections and the lexicon. raw and tokens stay as
recognized.

usage: python 06_phrases.py workdir/ [corrections.json]
corrections.json example: {"replace": {"他到底": "它到底"}, "split_after": [12, 30]}
writes workdir/phrases.json = [{"text", "raw", "s", "e", "tokens": [[tok, t_out], ...]}]
"""
import json, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lexicon import apply_display, load

CONTINUOUS_GAP = 0.12
DANGLING_GAP = 0.85
_MARKER = re.compile(r'^(第[一二三四五六七八九十]+|首先|其次|最后)$')
_PUNCT = re.compile(r'[。！？!?；;]$')


def s2o(t, K):
    o = 0.0
    for a, b in K:
        if t < a: return None          # inside a removed span
        if t <= b: return o + (t - a)
        o += b - a
    return None


def _raw_text(tokens):
    return ''.join((' ' + x[0] + ' ') if x[0].isascii() and x[0].isalpha() else x[0] for x in tokens).strip().replace('  ', ' ')


def _plain(tokens):
    return re.sub(r'\s+', '', _raw_text(tokens))


def _boundary(cur, token, index, gap, pause, forced):
    """True when token starts a new phrase. Length is never a reason."""
    if index in forced:
        return True
    if gap < CONTINUOUS_GAP:
        return False
    if _PUNCT.search(cur[-1][0] or ''):
        return True
    plain = _plain(cur)
    if gap < DANGLING_GAP and (_MARKER.fullmatch(plain) or (len(plain) >= 2 and plain.endswith(('的', '地', '得', '把', '被', '从', '对', '向', '和', '与', '或', '而')))):
        return False
    return gap >= pause


def split_tokens(kept, gap=0.25, split_after=()):
    forced = set(split_after or ())
    groups = []
    cur = []
    for index, token in enumerate(kept):
        if cur and _boundary(cur, token, index, token[1] - cur[-1][2], gap, forced):
            groups.append(cur)
            cur = []
        cur.append(token)
    if cur:
        groups.append(cur)
    return groups


def main(wd, corr_path=None, max_chars=16, gap=0.25):
    del max_chars  # a character budget must not cut a clause in half
    K = json.load(open(os.path.join(wd, 'cutlist.json')))['keep']
    toks = json.load(open(os.path.join(wd, 'chars.json')))
    corr = json.load(open(corr_path)) if corr_path else {}
    kept = []
    for tk, s, e in toks:
        os_, oe = s2o(s, K), s2o(e, K)
        if os_ is None: continue
        kept.append([tk, round(os_, 3), round(oe if oe is not None else os_ + min(0.4, e - s), 3)])
    res = []
    for p in split_tokens(kept, gap=gap, split_after=corr.get('split_after', [])):
        raw = _raw_text(p)
        disp = raw
        for k, v in corr.get('replace', {}).items(): disp = disp.replace(k, v)
        disp = apply_display(disp, load(os.path.join(wd, 'lexicon.json')))
        res.append({'text': disp, 'raw': raw, 's': p[0][1], 'e': p[-1][2], 'tokens': [[x[0], x[1]] for x in p]})
    json.dump(res, open(os.path.join(wd, 'phrases.json'), 'w'), ensure_ascii=False, indent=1)
    print('phrases', len(res))

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None)
