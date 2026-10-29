"""Independent offline boundary audit; supplied text is NOT verified as spoken.

Writes a new versioned audit by default, preserving original experiment evidence.
"""
import os
os.environ['HF_HUB_OFFLINE'] = '1'
os.environ['TRANSFORMERS_OFFLINE'] = '1'
import dataclasses
import json
import sys
from pathlib import Path
import numpy as np
import torch
from qwen_asr import Qwen3ForcedAligner
from source_audio import read_clocked_pcm
from forced_alignment_compare import compare_words
from retake_boundary_check import select_alignment_window, aligned_evidence, observed_span, check_planned_cut


def main():
    root, directory = map(Path, sys.argv[1:3])
    destination = Path(sys.argv[3]) if len(sys.argv) > 3 else directory / 'alignment-v2.json'
    if destination.exists():
        raise ValueError('Refusing to overwrite existing alignment evidence; select a new destination')
    obs = json.loads((directory / 'input-units.json').read_text())
    report = json.loads((directory / 'report.json').read_text())
    pcm, clock = read_clocked_pcm(directory / 'source.wav')
    if clock['sourceSha256'] != report['sourceSha256']:
        raise ValueError('Changed source')
    audio = np.frombuffer(pcm, dtype='<i2').astype(np.float32) / 32768
    torch.set_num_threads(4)
    aligner = Qwen3ForcedAligner.from_pretrained(
        str(root / '.models/qwen3-forced-aligner-0.6b'), dtype=torch.float32, device_map='cpu')
    results, checks, cache = [], [], {}
    payload = {'version': 2, 'status': 'running', 'expectedCutCount': len(report['proposals']),
               'model': 'local Qwen3-ForcedAligner-0.6B',
               'sourceSha256': report['sourceSha256'], 'audioUploaded': False,
               'scope': 'timestamp check of supplied text; not speech recognition, editorial approval or listening acceptance',
               'results': results, 'cutChecks': checks, 'humanListeningPassed': False,
               'readyForWorkbenchIntegration': False}
    for cut in report['proposals']:
        evidence = {}
        for label, first, last in [('remove', cut['first'], cut['last']),
                                   ('retain', cut['replacementFirst'], cut['replacementLast'])]:
            if first < 0:
                continue
            window = select_alignment_window(obs['words'], first, last, obs['quiet'], obs['range'])
            a, b = window['sourceRange']
            selected = window['words']
            key = (a, b, window['first'], window['last'])
            if key not in cache:
                text = ''.join(w['word'] for w in selected)
                tokens = [dataclasses.asdict(t) for t in aligner.align(
                    audio=(audio[round(a * 16000):round(b * 16000)], 16000),
                    text=text, language='Chinese')[0]]
                cache[key] = (tokens, aligned_evidence(selected, tokens, [a, b]))
            tokens, observed = cache[key]
            evidence[label] = observed
            target = observed_span(observed, obs['words'][first]['id'], obs['words'][last]['id'])
            comparison = compare_words([{**w, 'text': w['word']} for w in selected], tokens, a, b - a)
            results.append({'decisionFirst': cut['first'], 'side': label,
                            'sourceRange': [a, b], 'selectedWordIds': [w['id'] for w in selected],
                            'suppliedText': ''.join(w['word'] for w in selected),
                            'rawAlignmentTokens': tokens, 'observedGroups': observed['groups'],
                            'targetBoundary': target, 'wordComparison': comparison,
                            'leftAtEvidenceEdge': window['leftAtEvidenceEdge'],
                            'rightAtEvidenceEdge': window['rightAtEvidenceEdge']})
            print('Aligned', first, last, label, target['status'], flush=True)
            destination.write_text(json.dumps(payload, ensure_ascii=False, indent=2))
        check = check_planned_cut(cut, obs['words'], obs['quiet'], obs['range'],
                                  evidence['remove'], evidence.get('retain'))
        checks.append({'decisionFirst': cut['first'], 'plannedCut': [cut['startSec'], cut['endSec']], **check})
        payload['machineBoundaryChecksPassed'] = (len(checks) == len(report['proposals'])
                                                and all(x['status'] == 'machine-boundary-checked' for x in checks))
        payload['independentOuterBoundariesUnresolved'] = sum(
            x['targetBoundary']['status'] != 'observed' for x in results)
        destination.write_text(json.dumps(payload, ensure_ascii=False, indent=2))
        print('Checked cut', cut['first'], check['status'], check['reasons'], flush=True)
    payload['status'] = 'complete'
    destination.write_text(json.dumps(payload, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
