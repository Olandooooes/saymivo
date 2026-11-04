"""Step 1: per-character timestamps with FunASR Paraformer-zh (local, free).

Why Paraformer: on Chinese talking-head audio faster-whisper large-v3 (int8, CPU)
hallucinated English and drifted word times; Paraformer gave clean per-char
timestamps that were accurate enough to place cuts (±40 ms) — combine with the
energy VAD (02) for the true end of a word (plosive tails like the final "t").

usage: python 01_transcribe_paraformer.py workdir/
reads workdir/aligned16.wav ; writes workdir/chars.json = [[char, start, end], ...] (video time)
English words come back as one token (e.g. "agent"); keep them as one token.
"""
import json, sys, os, re

def main(wd):
    from funasr import AutoModel
    m = AutoModel(model='paraformer-zh', model_revision='v2.0.4', vad_model='fsmn-vad', punc_model=None, disable_update=True)
    res = m.generate(input=os.path.join(wd, 'aligned16.wav'), batch_size_s=60, sentence_timestamp=True)
    chars = []
    for r in res:
        toks = r['text'].split()          # paraformer returns space separated tokens (CJK chars / latin words)
        ts = r.get('timestamp') or []
        if len(toks) != len(ts):          # fall back: strip spaces, align by index
            toks = [t for t in re.findall(r'[A-Za-z]+|\S', r['text'].replace(' ', ''))][:len(ts)]
        for tok, (a, b) in zip(toks, ts):
            chars.append([tok, round(a / 1000, 3), round(b / 1000, 3)])
    json.dump(chars, open(os.path.join(wd, 'chars.json'), 'w'), ensure_ascii=False)
    print('tokens', len(chars))

if __name__ == '__main__':
    main(sys.argv[1])
