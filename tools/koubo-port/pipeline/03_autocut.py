"""Step 3: automatic rough cut -> cutlist.json + 剪辑表.md (for user review).

Detects (see 手剪经验与风格规范.md §1):
  * 语气词 / 非语言发声  - energy region with no ASR text, or a phrase made only of filler chars
  * 起句失败 (false start) - a short tail of phrase A that is restarted at the head of phrase B
  * 重说 (retake)          - the tail of phrase P_i (>= 4 tokens, up to the whole phrase) is said again at
                             the head of a later P_j within the look-ahead (similarity >= 0.68); everything
                             from that tail up to P_j is dropped -> the LAST complete take is kept. Using the
                             tail (not the whole phrase) catches takes glued to the previous sentence.
  * 长停顿 -> tiered compression, natural breaths kept
Then places every cut in silence / the quietest 20 ms frame, never inside a word,
keeps tail >= 0.22 s after the last kept word and >= 0.12 s before the next onset,
and rounds all keep boundaries to video frames.

usage: python 03_autocut.py workdir/ [--overrides overrides.json] [--rules cut_rules.json]
overrides.json (written after the user reviews 剪辑表.md):
  {"reject": [<removal id>...],                      # user says: keep this one
   "add":    [{"s":..,"e":..,"type":"重说","reason":".."}],  # manual extra removal (video time)
   "gap_targets": [{"at": 12.34, "target": 0.30}]}   # e.g. mid-sentence stall -> 0.30 s
All times are video time (audio already aligned by step 0).
"""
import json, sys, os, argparse, difflib
import numpy as np

def load(wd, name): return json.load(open(os.path.join(wd, name)))

class Ctx:
    def __init__(self, wd, rules):
        self.R = rules
        self.tok = load(wd, 'chars.json')                      # [[text, s, e]]
        self.reg = load(wd, 'speech_regions.json')             # [[s, e]]
        self.db = np.load(os.path.join(wd, 'energy_db.npy'))
        self.dt = rules['energy_vad']['frame_ms'] / 1000
        self.fps = load(wd, 'probe.json').get('fps', 30) if os.path.exists(os.path.join(wd, 'probe.json')) else 30
        self.tok_reg = [self.region_of((t[1] + t[2]) / 2) for t in self.tok]
    def region_of(self, t):
        best, bd = 0, 1e9
        for i, (a, b) in enumerate(self.reg):
            if a <= t <= b: return i
            d = min(abs(t - a), abs(t - b))
            if d < bd: best, bd = i, d
        return best
    def quietest(self, lo, hi):
        i0, i1 = int(max(0, lo) / self.dt), int(max(lo, hi) / self.dt) + 1
        seg = self.db[i0:i1]
        if len(seg) == 0: return (lo + hi) / 2
        return (i0 + int(np.argmin(seg)) + 0.5) * self.dt

def phrases(C):
    """split tokens at pauses >= phrase_split_gap -> list of (i0, i1) token ranges"""
    g = C.R['retake']['phrase_split_gap']; out = []; st = 0
    for i in range(1, len(C.tok)):
        if C.tok[i][1] - C.tok[i - 1][2] >= g or C.tok_reg[i] != C.tok_reg[i - 1] and C.tok[i][1] - C.tok[i - 1][2] > 0.15:
            out.append((st, i)); st = i
    if C.tok: out.append((st, len(C.tok)))
    return out

def txt(C, i0, i1): return [t[0] for t in C.tok[i0:i1]]

def sim(a, b): return difflib.SequenceMatcher(None, a, b, autojunk=False).ratio()

def lcs_ratio(a, b):
    m = difflib.SequenceMatcher(None, a, b, autojunk=False)
    return sum(bl.size for bl in m.get_matching_blocks()) / max(1, len(a))

def detect(C):
    R = C.R; P = phrases(C); rem = []   # each: dict(i0,i1 token range) or (s,e) for no-text
    # --- fillers: regions without any token
    has_tok = set(C.tok_reg)
    for ri, (a, b) in enumerate(C.reg):
        if ri not in has_tok and b - a <= R['filler']['max_region'] and R['filler']['no_text_region_is_filler']:
            rem.append({'kind': 'region', 's': a, 'e': b, 'type': '语气词', 'reason': '无文字的非语言发声（嗯/气声）', 'confidence': 'medium'})
    # --- fillers: phrase made only of filler chars
    F = set(R['filler']['chars'])
    for i0, i1 in P:
        w = txt(C, i0, i1)
        if all(x in F for x in w):
            rem.append({'kind': 'tok', 'i0': i0, 'i1': i1, 'type': '语气词', 'reason': '整句只有语气词', 'confidence': 'high'})
    # --- retakes (keep last take). A tail of phrase A (>= min_chars, possibly the whole
    #     phrase) that is said again at the head of a later phrase B -> drop from that tail
    #     up to B. Using the tail handles takes glued to the previous sentence without a pause.
    RT = R['retake']; used = set()
    for a in range(len(P)):
        if a in used: continue
        i0, i1 = P[a]; A = txt(C, i0, i1)
        if len(A) < RT['min_chars']: continue
        hit = None
        for b in range(a + 1, len(P)):
            j0, j1 = P[b]
            if C.tok[j0][1] - C.tok[i1 - 1][2] > RT['look_ahead']: break
            Bt = txt(C, j0, j1)
            for k in range(len(A), RT['min_chars'] - 1, -1):
                S = A[-k:]; W = Bt[:k + 2]
                r = sim(S, W)
                if r >= RT['similarity'] and S[0] == W[0]:
                    hit = (b, k, r); break
            if hit: break
        if hit:
            b, k, r = hit; j0 = P[b][0]
            dur = C.tok[j0][1] - C.tok[i1 - k][1]
            rem.append({'kind': 'tok', 'i0': i1 - k, 'i1': j0, 'type': '重说', 'confidence': 'high' if dur <= RT['max_removed'] else 'review',
                        'reason': f'{k}字在后面第{b - a}个意群开头重说（相似度{r:.2f}），保留后一遍'})
            used.update(range(a, b))
    # --- false starts: tail of phrase A restarted at head of phrase B
    FS = R['false_start']
    for a in range(len(P) - 1):
        if a in used: continue
        i0, i1 = P[a]; j0, j1 = P[a + 1]
        if C.tok[j0][1] - C.tok[i1 - 1][2] > FS['max_gap_to_restart']: continue
        A = txt(C, i0, i1); Bw = txt(C, j0, j1)
        for k in range(min(len(A), FS['max_chars']), 1, -1):
            S = A[-k:]; W = Bw[:k + 4]
            contig = ''.join(S) in ''.join(W)
            if not (contig or (S[0] == W[0] and lcs_ratio(S, W) >= FS['min_overlap_ratio'])): continue
            rem.append({'kind': 'tok', 'i0': i1 - k, 'i1': j0, 'type': '起句失败', 'confidence': 'high' if k <= 4 else 'review',
                        'reason': f'后{k}字在下一句开头重新说了一遍'})
            break
    return rem, P

def cut_after_keep(C, k_tok, x_tok):
    """cut point between kept token k and removed token x (keep k's tail)"""
    M = C.R['margins']; rk, rx = C.tok_reg[k_tok], C.tok_reg[x_tok]
    if rk != rx:
        e = C.reg[rk][1]; sil = C.reg[rx][0] - e
        return e + min(0.27, max(M['removal_tail_min'], sil * 0.5))
    return C.quietest(C.tok[k_tok][2] - 0.03, C.tok[x_tok][1] + 0.03)

def cut_before_keep(C, x_tok, k_tok):
    M = C.R['margins']; rk, rx = C.tok_reg[k_tok], C.tok_reg[x_tok]
    if rk != rx:
        s = C.reg[rk][0]; sil = s - C.reg[rx][1]
        return s - min(0.18, max(M['removal_head_min'], sil * 0.5))
    return C.quietest(C.tok[x_tok][2] - 0.03, C.tok[k_tok][1] + 0.03)

def to_intervals(C, rem):
    out = []
    for r in rem:
        if r['kind'] == 'region':
            s, e = r['s'] - 0.02, r['e'] + 0.02
        else:
            i0, i1 = r['i0'], r['i1']
            s = cut_after_keep(C, i0 - 1, i0) if i0 > 0 else C.reg[C.tok_reg[i0]][0] - 0.05
            e = cut_before_keep(C, i1 - 1, i1) if i1 < len(C.tok) else C.reg[C.tok_reg[i1 - 1]][1] + 0.05
        r = dict(r); r['s'], r['e'] = round(s, 3), round(e, 3)
        r['text'] = ''.join(txt(C, r['i0'], r['i1'])) if r['kind'] == 'tok' else ''
        out.append(r)
    # merge overlaps (a false start inside a retake etc.)
    out.sort(key=lambda r: r['s']); merged = []
    for r in out:
        if merged and r['s'] <= merged[-1]['e'] + 0.05:
            m = merged[-1]; m['e'] = max(m['e'], r['e']); m['type'] = m['type'] if m['type'] == r['type'] else m['type'] + '+' + r['type']
            m['text'] = (m['text'] + ' / ' + r['text']).strip(' /'); m['reason'] += '；' + r['reason']
        else: merged.append(r)
    for i, r in enumerate(merged): r['id'] = i + 1
    return merged

def compress_gaps(C, removed, gap_targets):
    R = C.R; M = R['margins']; cuts = []
    def inside_removal(t): return any(r['s'] - 0.05 <= t <= r['e'] + 0.05 for r in removed)
    for i in range(len(C.reg) - 1):
        pb, na = C.reg[i][1], C.reg[i + 1][0]; g = na - pb
        if inside_removal(pb) or inside_removal(na): continue
        tgt = None
        for o in gap_targets:
            if pb - 0.1 <= o['at'] <= na + 0.1: tgt = o['target']
        if tgt is None:
            for tier in R['pause_tiers']:
                if g > tier['min_gap']: tgt = tier['target']; break
        if tgt is None or g <= tgt + R['compress_only_if_saves']: continue
        tail = max(M['tail_min'], tgt * M['tail_ratio']); head = max(M['head_min'], tgt - tail)
        cuts.append({'s': round(pb + tail, 3), 'e': round(na - head, 3), 'orig': round(g, 3), 'target': tgt})
    return cuts

def build_keep(C, removed, gaps):
    R = C.R; start = max(0.0, C.reg[0][0] - R['head_lead_in']); end = C.reg[-1][1] + R['tail_hold']
    holes = sorted([(r['s'], r['e']) for r in removed] + [(g['s'], g['e']) for g in gaps])
    keep = []; cur = start
    for s, e in holes:
        if s > cur: keep.append([cur, s])
        cur = max(cur, e)
    if end > cur: keep.append([cur, end])
    if R['frame_round']:
        f = C.fps; keep = [[round(a * f) / f, round(b * f) / f] for a, b in keep]
    return [[round(a, 4), round(b, 4)] for a, b in keep if b - a > 1 / C.fps]

def write_table(path, removed, gaps, keep, src_dur):
    out_dur = sum(b - a for a, b in keep)
    L = ['# 剪辑表（自动粗剪，待用户审阅）', '',
         f'- 原片 {src_dur:.2f}s → 成片 {out_dur:.2f}s，{len(keep)} 段，{len(keep) - 1} 个拼接点（每点 30ms 等功率交叉淡化）', '',
         '## 一、内容剪辑', '', '| id | 类型 | 起 | 止 | 时长 | 剪掉的原话 | 依据 | 置信 |', '|---|---|---|---|---|---|---|---|']
    for r in removed:
        L.append(f"| {r['id']} | {r['type']} | {r['s']:.2f} | {r['e']:.2f} | {r['e'] - r['s']:.2f}s | {r['text'] or '（无文字）'} | {r['reason']} | {r['confidence']} |")
    L += ['', '## 二、停顿压缩', '', '| 起 | 止 | 原停顿 | 压到 |', '|---|---|---|---|']
    for g in gaps: L.append(f"| {g['s']:.2f} | {g['e']:.2f} | {g['orig']:.2f}s | {g['target']:.2f}s |")
    L += ['', '## 三、保留段', ''] + [f'{i + 1}. {a:.3f} – {b:.3f}' for i, (a, b) in enumerate(keep)]
    L += ['', '> 审阅方式：不同意的删除写进 overrides.json 的 reject；漏掉的写进 add；句中卡顿写 gap_targets（建议 0.30s）。']
    open(path, 'w').write('\n'.join(L) + '\n')

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('wd'); ap.add_argument('--overrides'); ap.add_argument('--rules')
    a = ap.parse_args()
    rules = json.load(open(a.rules or os.path.join(os.path.dirname(__file__), '..', 'config', 'cut_rules.json')))
    C = Ctx(a.wd, rules)
    ov = json.load(open(a.overrides)) if a.overrides else {}
    rem, _ = detect(C)
    removed = to_intervals(C, rem)
    removed = [r for r in removed if r['id'] not in set(ov.get('reject', []))]
    for x in ov.get('add', []):
        removed.append({'kind': 'manual', 's': x['s'], 'e': x['e'], 'type': x.get('type', '手动'), 'reason': x.get('reason', '用户指定'), 'confidence': 'user', 'text': x.get('text', ''), 'id': 100 + len(removed)})
    removed.sort(key=lambda r: r['s'])
    gaps = compress_gaps(C, removed, ov.get('gap_targets', []))
    for index, gap in enumerate(gaps):
        gap['id'] = index
    # Rejected pauses stay at their original length. Ids are the indexes from the unfiltered list.
    rejected_gaps = set(ov.get('reject_gaps', []))
    gaps = [gap for gap in gaps if gap['id'] not in rejected_gaps]
    keep = build_keep(C, removed, gaps)
    json.dump({'keep': keep, 'removed': removed, 'gaps': gaps, 'fps': C.fps}, open(os.path.join(a.wd, 'cutlist.json'), 'w'), ensure_ascii=False, indent=1)
    write_table(os.path.join(a.wd, '剪辑表.md'), removed, gaps, keep, len(C.db) * C.dt)
    print(f'removals {len(removed)}  gaps {len(gaps)}  segments {len(keep)}  out {sum(b - a for a, b in keep):.2f}s')

if __name__ == '__main__':
    main()
