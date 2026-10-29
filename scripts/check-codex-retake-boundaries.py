"""Gate proposed source-word cuts with independent local alignment observations.

Usage: .venv-align/bin/python scripts/check-codex-retake-boundaries.py INPUT_JSON OUTPUT_JSON
No source, project, decision or video is changed. Only OUTPUT_JSON is created.
"""
import os
os.environ['HF_HUB_OFFLINE'] = '1'
os.environ['TRANSFORMERS_OFFLINE'] = '1'
import dataclasses
import json
import math
import sys
from pathlib import Path

from source_audio import read_clocked_pcm, sha256_file
from retake_boundary_check import select_alignment_window, aligned_evidence, observed_span, check_planned_cut


def validate_parts(candidate, key, count):
    """Parts partition the selected source words while identifying exact clips."""
    if key not in candidate:
        return
    parts = candidate[key]
    if not isinstance(parts, list) or not parts or len(parts) > 64:
        raise ValueError('Invalid candidate part list')
    first, last = ((candidate['first'], candidate['last']) if key == 'removeParts'
                   else (candidate['replacementFirst'], candidate['replacementLast']))
    cursor, previous_end, previous_clip_end, ids = first, -1, -1, set()
    for part in parts:
        if (not isinstance(part, dict) or part.get('src') != candidate['src']
                or not isinstance(part.get('clipId'), str) or not part['clipId'] or part['clipId'] in ids
                or not isinstance(part.get('first'), int) or not isinstance(part.get('last'), int)
                or not 0 <= part['first'] <= part['last'] < count or part['first'] != cursor):
            raise ValueError('Parts must partition contiguous source word indices in exact clip instances')
        times = [part.get(field) for field in ['startSec', 'endSec', 'clipInSec', 'clipOutSec']]
        if (not all(isinstance(t, (int, float)) and not isinstance(t, bool) and math.isfinite(t) for t in times)
                or not 0 <= part['clipInSec'] <= part['startSec'] < part['endSec'] <= part['clipOutSec']
                or part['startSec'] < previous_end - .001 or part['clipInSec'] < previous_clip_end - .001):
            raise ValueError('Candidate parts have invalid, overlapping or rewound source ranges')
        cursor, previous_end, previous_clip_end = part['last'] + 1, part['endSec'], part['clipOutSec']
        ids.add(part['clipId'])
    if cursor != last + 1:
        raise ValueError('Candidate parts omit selected source words')
    hull = candidate if key == 'removeParts' else candidate.get('retain')
    if not isinstance(hull, dict) or abs(parts[0]['startSec'] - hull['startSec']) > .001 or abs(parts[-1]['endSec'] - hull['endSec']) > .001:
        raise ValueError('Candidate part hull does not match the overall source range')


def check_candidate_parts(candidate, source, remove_evidence, retain_evidence):
    """Check every actual new removal edge and each retained clip independently."""
    result = {'remove': [], 'retain': []}
    for part in candidate.get('removeParts', []):
        cut = {**candidate, 'first': part['first'], 'last': part['last'],
               'startSec': part['startSec'], 'endSec': part['endSec']}
        check = check_planned_cut(cut, source['words'], source['quiet'], source['range'], remove_evidence, retain_evidence)
        result['remove'].append({'clipId': part['clipId'], 'plannedCut': [part['startSec'], part['endSec']], **check})
    for part in candidate.get('retainParts', []):
        observed = observed_span(retain_evidence, part['first'], part['last'])
        reasons = []
        if observed['status'] != 'observed':
            reasons.append(observed['reason'])
        elif observed['startSec'] < part['clipInSec'] - .001 or observed['endSec'] > part['clipOutSec'] + .001:
            reasons.append('retained-observation-crosses-existing-clip-edge')
        primary = source['words'][part['first']:part['last'] + 1]
        if any(word['startMs'] < part['clipInSec'] * 1000 - 1 or word['endMs'] > part['clipOutSec'] * 1000 + 1 for word in primary):
            reasons.append('primary-retained-word-crosses-existing-clip-edge')
        result['retain'].append({'clipId': part['clipId'], 'status': 'needs-review' if reasons else 'machine-boundary-checked',
                                 'reasons': reasons, 'observedBoundary': observed,
                                 'clipRange': [part['clipInSec'], part['clipOutSec']]})
    return result


def validate_input(value):
    if not isinstance(value, dict) or not isinstance(value.get('sources'), list) or not isinstance(value.get('candidates'), list):
        raise ValueError('Expected sources and candidates arrays')
    root = Path(value['root']).resolve(strict=True)
    if root != Path(__file__).resolve().parent.parent:
        raise ValueError('Model root must be the current workbench repository')
    if len(value['sources']) > 64 or len(value['candidates']) > 240:
        raise ValueError('Boundary audit input exceeds job limits')
    sources = {}
    for source in value['sources']:
        if (not isinstance(source, dict) or not isinstance(source.get('src'), str)
                or not source['src'] or source['src'] in sources
                or not isinstance(source.get('words'), list) or len(source['words']) > 100000
                or not isinstance(source.get('quiet'), list)):
            raise ValueError('Invalid or duplicate source evidence')
        words = []
        for index, word in enumerate(source['words']):
            if not isinstance(word, dict):
                raise ValueError('Invalid source word')
            words.append({**word, 'sourceWordId': word.get('id'), 'id': index})
        sources[source['src']] = {**source, 'words': words}
    ids = set()
    for candidate in value['candidates']:
        if (not isinstance(candidate, dict) or not isinstance(candidate.get('id'), (str, int))
                or isinstance(candidate['id'], bool) or candidate['id'] in ids
                or candidate.get('src') not in sources or candidate.get('kind') not in ['retake', 'false-start', 'filler']):
            raise ValueError('Invalid candidate identity, source or kind')
        ids.add(candidate['id'])
        for field in ['first', 'last', 'replacementFirst', 'replacementLast']:
            if not isinstance(candidate.get(field), int) or isinstance(candidate[field], bool):
                raise ValueError('Candidate word references must be source.words array indices')
        count = len(sources[candidate['src']]['words'])
        first, last = candidate['first'], candidate['last']
        rf, rl = candidate['replacementFirst'], candidate['replacementLast']
        if not 0 <= first <= last < count:
            raise ValueError('Invalid removed source word indices')
        if candidate['kind'] == 'filler':
            if (rf, rl) != (-1, -1):
                raise ValueError('Filler must not claim a retained replacement')
        elif not 0 <= rf <= rl < count or not (rl < first or rf > last):
            raise ValueError('Replacement must be a disjoint retained source word range')
        validate_parts(candidate, 'removeParts', count)
        if candidate['kind'] != 'filler':
            validate_parts(candidate, 'retainParts', count)
    # Never approve a retained replacement that another proposed cut removes.
    for candidate in value['candidates']:
        if candidate['kind'] == 'filler':
            continue
        for other in value['candidates']:
            if candidate['src'] == other['src'] and max(candidate['replacementFirst'], other['first']) <= min(candidate['replacementLast'], other['last']):
                raise ValueError('Retained replacement is removed by another candidate')
    return root, sources, value['candidates']


def main():
    if len(sys.argv) != 3:
        raise ValueError('Usage: check-codex-retake-boundaries.py INPUT_JSON OUTPUT_JSON')
    input_file, destination = map(Path, sys.argv[1:3])
    if destination.exists():
        raise ValueError('Refusing to overwrite existing boundary evidence')
    root, sources, candidates = validate_input(json.loads(input_file.read_text()))
    used = {candidate['src'] for candidate in candidates}
    import numpy as np
    # Validate every used source before loading a model or accepting any cut.
    for src in used:
        source = sources[src]
        wav = Path(source['wav']).resolve(strict=True)
        pcm, clock = read_clocked_pcm(wav)
        if clock['sourceSha256'] != source.get('sourceSha256'):
            raise ValueError('Source SHA does not match source-zero clock receipt')
        original = Path(clock['sourcePath']).resolve(strict=True)
        if sha256_file(original) != source['sourceSha256']:
            raise ValueError('Actual source bytes changed after audio extraction')
        source['audio'] = np.frombuffer(pcm, dtype='<i2').astype(np.float32) / 32768
        source['clock'] = clock
        bounds = source.get('range')
        if not isinstance(bounds, list) or len(bounds) != 2 or bounds[1] > clock['durationSec'] + .001:
            raise ValueError('Source evidence range exceeds the complete source-zero audio clock')
        # The reusable window validator also checks all observed word times,
        # quiet intervals and the complete source range before model inference.
        first = next(candidate['first'] for candidate in candidates if candidate['src'] == src)
        select_alignment_window(source['words'], first, first, source['quiet'], bounds)
    model = root / '.models/qwen3-forced-aligner-0.6b'
    weights, config = model / 'model.safetensors', model / 'config.json'
    if not weights.is_file() or not config.is_file():
        raise ValueError('Required local forced-alignment model is missing; no download or cloud fallback')
    receipt = {'name': 'local Qwen3-ForcedAligner-0.6B', 'weightsSha256': sha256_file(weights),
               'configSha256': sha256_file(config)}
    aligner = None
    if candidates:
        import torch
        from qwen_asr import Qwen3ForcedAligner
        torch.set_num_threads(4)
        aligner = Qwen3ForcedAligner.from_pretrained(str(model), dtype=torch.float32, device_map='cpu')
    results, cache = [], {}
    for candidate in candidates:
        source = sources[candidate['src']]
        rows, evidence = [], {}
        for side, first, last in [('remove', candidate['first'], candidate['last']),
                                  ('retain', candidate['replacementFirst'], candidate['replacementLast'])]:
            if first < 0:
                continue
            window = select_alignment_window(source['words'], first, last, source['quiet'], source['range'])
            a, b = window['sourceRange']
            key = (candidate['src'], a, b, window['first'], window['last'])
            if key not in cache:
                supplied = ''.join(w['word'] for w in window['words'])
                tokens = [dataclasses.asdict(token) for token in aligner.align(
                    audio=(source['audio'][round(a * 16000):round(b * 16000)], 16000),
                    text=supplied, language='Chinese')[0]]
                cache[key] = (tokens, aligned_evidence(window['words'], tokens, [a, b]))
            tokens, observed = cache[key]
            evidence[side] = observed
            rows.append({'side': side, 'sourceRange': [a, b],
                         'selectedSourceWordIndices': [w['id'] for w in window['words']],
                         'suppliedText': ''.join(w['word'] for w in window['words']),
                         'rawAlignmentTokens': tokens, 'observedGroups': observed['groups'],
                         'targetBoundary': observed_span(observed, first, last),
                         'leftAtEvidenceEdge': window['leftAtEvidenceEdge'],
                         'rightAtEvidenceEdge': window['rightAtEvidenceEdge']})
        check = check_planned_cut(candidate, source['words'], source['quiet'], source['range'],
                                  evidence['remove'], evidence.get('retain'))
        parts = check_candidate_parts(candidate, source, evidence['remove'], evidence.get('retain'))
        part_results = parts['remove'] + parts['retain']
        safe = check['status'] == 'machine-boundary-checked' and all(part['status'] == 'machine-boundary-checked' for part in part_results)
        reasons = check['reasons'] + [part['clipId'] + ':' + reason for part in part_results for reason in part['reasons']]
        results.append({'id': candidate['id'], 'src': candidate['src'], 'safe': safe,
                        'reason': 'both observed clocks, every clip part and retained neighbors passed' if safe else '; '.join(reasons),
                        'evidence': {'sourceSha256': source['sourceSha256'], 'wavSha256': source['clock']['wavSha256'],
                                     'sourceRange': source['range'], 'plannedCut': [candidate['startSec'], candidate['endSec']],
                                     'alignments': rows, 'cutCheck': check, 'partChecks': parts}})
        print('Boundary candidate', candidate['id'], 'safe' if safe else 'review', flush=True)
    output = {'version': 1, 'provider': 'local-qwen-independent-boundary-check', 'model': receipt,
              'audioUploaded': False, 'geminiCalled': False,
              'scope': 'timestamp gate for supplied text; not speech recognition, editorial or listening acceptance',
              'candidates': results}
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = Path(str(destination) + '.partial')
    with temporary.open('x') as target:
        json.dump(output, target, ensure_ascii=False, indent=2)
    try:
        os.link(temporary, destination)
    finally:
        temporary.unlink(missing_ok=True)


if __name__ == '__main__':
    main()
