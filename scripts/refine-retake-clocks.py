"""Reposition complete, freely recognized window text on source-zero audio.

This is timing evidence, never a second recognition or permission to delete.
Raw recognition clocks remain available alongside every replacement clock.
The pure helpers intentionally load neither torch nor any model.
"""
import copy
import dataclasses
import hashlib
import importlib.metadata
import json
import math
import os
from pathlib import Path
import platform
import sys

from retake_boundary_check import aligned_evidence, clean

VERSION = 'independent-window-alignment-v1'
TIMING_PROVIDER = 'qwen-forced-aligner'
TIMING_REASONS = {
    'non-positive-observed-word', 'conflicting-overlapping-observations',
    'same-window-overlapping-repeated-observations',
    'non-positive-or-invalid-window-word', 'word-outside-observed-window',
    'conflicting-overlapping-window-words',
}


def finite(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def valid_range(value):
    return (isinstance(value, (list, tuple)) and len(value) == 2
            and all(finite(x) for x in value) and 0 <= value[0] < value[1])


def window_range(window, source_range):
    bounds = [window.get('startSec'), window.get('endSec')]
    core = [window.get('coreStartSec'), window.get('coreEndSec')]
    if (not valid_range(source_range) or not valid_range(bounds) or not valid_range(core)
            or bounds[0] < source_range[0] - .001 or bounds[1] > source_range[1] + .001
            or core[0] < bounds[0] - .001 or core[1] > bounds[1] + .001):
        raise ValueError('Recognition window does not belong to its source range')
    return bounds, core


def _original_slice(text, lo, hi):
    # Preserve punctuation, spaces, decimal points and question marks from the
    # freely recognized text. Times stay indivisible observed model spans.
    positions = []
    for index, char in enumerate(text):
        positions.extend([index] * len(clean(char)))
    if not 0 <= lo < hi <= len(positions):
        return None
    if ((lo and positions[lo] == positions[lo - 1])
            or (hi < len(positions) and positions[hi] == positions[hi - 1])):
        return None
    return text[0 if lo == 0 else positions[lo]:len(text) if hi == len(positions) else positions[hi]]


def _uncertain(window, reason, group=None, groups=None):
    # These are responsibility/context ranges, not invented word timestamps.
    a, b = window['startSec'], window['endSec']
    before = after = None
    if group and groups:
        positive = [g for g in groups if g['valid'] and g['charEnd'] > g['charStart']
                    and all(finite(t) for t in [g['startSec'], g['endSec']]) and g['endSec'] > g['startSec']]
        before = next((g for g in reversed(positive) if g['charEnd'] <= group['charStart']), None)
        after = next((g for g in positive if g['charStart'] >= group['charEnd']), None)
        a = max(a, before['endSec']) if before else a
        b = min(b, after['startSec']) if after else b
        if b <= a:
            a, b = window['startSec'], window['endSec']
    item = {'reason': reason, 'startMs': round(a * 1000, 3),
            'endMs': round(b * 1000, 3), 'contextRangeOnly': True,
            'sourceWindowRange': [window['startSec'], window['endSec']]}
    if group:
        item.update({'text': group.get('text'), 'observedCharRange': [group['charStart'], group['charEnd']],
                     'observedTokenIndices': group['tokenIndices'],
                     'rawObservedRangeSec': [group['startSec'], group['endSec']]})
        item['boundedByObservedGroups'] = {'before': before['tokenIndices'] if before else None,
                                          'after': after['tokenIndices'] if after else None}
    return item


def canonical_unresolved(item, window, index):
    value = {**copy.deepcopy(item), 'windowIndex': index}
    if item.get('contextRangeOnly') and item.get('sourceWindowRange'):
        a, b = max(item['startMs'], window['coreStartSec'] * 1000), min(item['endMs'], window['coreEndSec'] * 1000)
        if b <= a:
            return None
        value.update({'startMs': round(a, 3), 'endMs': round(b, 3),
                      'contextSourceRangeMs': [item['startMs'], item['endMs']]})
    return value


def refine_window(window, tokens, source_range):
    bounds, _ = window_range(window, source_range)
    if not isinstance(window.get('text'), str) or not isinstance(tokens, list):
        raise ValueError('Missing complete free-recognition text or raw alignment tokens')
    result = copy.deepcopy(window)
    result.update({'rawWords': copy.deepcopy(window.get('words', [])),
                   'rawUnresolved': copy.deepcopy(window.get('unresolved', [])),
                   'rawAlignmentTokens': copy.deepcopy(tokens), 'words': [], 'unresolved': [],
                   'timingProvider': TIMING_PROVIDER, 'timingRefined': True})
    result['unresolved'].extend(copy.deepcopy(item) for item in window.get('unresolved', [])
                                if item.get('reason') not in TIMING_REASONS)
    # Empty windows have no supplied lexical content to align. Their speech
    # coverage is checked independently; silence alone never proves no speech.
    if not clean(window['text']):
        result['alignment'] = {'tokenTextMatches': not any(clean(t.get('text', '')) for t in tokens),
                               'groups': [], 'sourceRange': bounds, 'unresolved': []}
        if tokens:
            result['unresolved'].append(_uncertain(window, 'alignment-text-mismatch'))
        return result
    evidence = aligned_evidence([{'id': 0, 'word': window['text']}], tokens, bounds)
    result['alignment'] = evidence
    if not evidence['tokenTextMatches']:
        result['unresolved'].append(_uncertain(window, 'alignment-text-mismatch'))
        return result
    for group in evidence['groups']:
        if group['charStart'] == group['charEnd']:
            continue  # Punctuation-only token carries no lexical boundary.
        text = _original_slice(window['text'], group['charStart'], group['charEnd'])
        a, b = group['startSec'], group['endSec']
        if (not group['valid'] or not text or not all(finite(t) for t in [a, b])
                or a < bounds[0] or b > bounds[1] + .001 or b <= a):
            result['unresolved'].append(_uncertain(window, 'invalid-or-unresolved-alignment-group', group, evidence['groups']))
            continue
        result['words'].append({'word': text, 'startMs': round(a * 1000, 3), 'endMs': round(b * 1000, 3),
                                'observedTokenIndices': group['tokenIndices'],
                                'observedCharRange': [group['charStart'], group['charEnd']]})
    # Unknown semantic/coverage markers survive. Only specifically classified
    # failed old timing observations can be superseded by this new observation.
    return result


def canonical_refined_windows(windows, source_range):
    if not valid_range(source_range):
        raise ValueError('Invalid source range')
    observations, unresolved = [], []
    for index, window in enumerate(windows):
        _, core = window_range(window, source_range)
        for item in window.get('unresolved', []):
            owned = canonical_unresolved(item, window, index)
            if owned:
                unresolved.append(owned)
        for word in window.get('words', []):
            a, b = word.get('startMs'), word.get('endMs')
            if (not all(finite(t) for t in [a, b]) or b <= a or not clean(word.get('word', ''))
                    or a < window['startSec'] * 1000 - .001 or b > window['endSec'] * 1000 + .001):
                unresolved.append({**_uncertain(window, 'invalid-refined-window-word'),
                                   'windowIndex': index, 'word': copy.deepcopy(word)})
                continue
            midpoint = (a + b) / 2000
            if core[0] <= midpoint < core[1] or (midpoint == core[1] == source_range[1]):
                observations.append({**copy.deepcopy(word), 'windowIndex': index})
    observations.sort(key=lambda w: (w['startMs'], w['endMs'], w['windowIndex']))
    words, group = [], []

    def flush():
        if not group:
            return
        exact = (len({w['windowIndex'] for w in group}) == len(group)
                 and len({(w['word'], w['startMs'], w['endMs']) for w in group}) == 1)
        if len(group) == 1 or exact:
            selected = copy.deepcopy(group[0])
            if exact and len(group) > 1:
                selected['corroboratingWindowIndices'] = [w['windowIndex'] for w in group]
            words.append(selected)
        else:
            unresolved.append({'reason': 'conflicting-refined-observed-spans',
                               'startMs': min(w['startMs'] for w in group),
                               'endMs': max(w['endMs'] for w in group), 'words': copy.deepcopy(group)})

    end = -1
    for word in observations:
        if group and word['startMs'] >= end:
            flush()
            group = []
            end = -1
        group.append(word)
        end = max(end, word['endMs'])
    flush()
    return {'words': [{**w, 'id': i} for i, w in enumerate(words)], 'unresolved': unresolved}


def _coverage_unresolved(source, words):
    covered = sorted([[w['startMs'] / 1000, w['endMs'] / 1000] for w in words]
                     + [list(r) for r in source.get('quiet', []) if valid_range(r)])
    missing = []
    for a, b in source.get('speech', []):
        if not valid_range([a, b]):
            raise ValueError('Invalid speech observation range')
        cursor = a
        for lo, hi in covered:
            if hi <= cursor or lo >= b:
                continue
            if min(lo, b) - cursor >= .18:
                missing.append({'reason': 'untranscribed-nonquiet-speech', 'startMs': round(cursor * 1000),
                                'endMs': round(min(lo, b) * 1000), 'provider': 'independent-vad-coverage'})
            cursor = max(cursor, min(hi, b))
            if cursor >= b:
                break
        if b - cursor >= .18:
            missing.append({'reason': 'untranscribed-nonquiet-speech', 'startMs': round(cursor * 1000),
                            'endMs': round(b * 1000), 'provider': 'independent-vad-coverage'})
    return missing


def refine_observation_source(source, align_window):
    if not source.get('observationPasses'):
        raise ValueError('Missing raw free-recognition observation windows')
    result = copy.deepcopy(source)
    result.update({'rawObservationPasses': copy.deepcopy(source['observationPasses']),
                   'rawWords': copy.deepcopy(source.get('words', [])),
                   'rawUnresolved': copy.deepcopy(source.get('unresolved', [])),
                   'timingProvider': TIMING_PROVIDER, 'observationPasses': []})
    for raw_pass in source['observationPasses']:
        windows = []
        for index, raw_window in enumerate(raw_pass.get('windows', [])):
            window = refine_window(raw_window, align_window(raw_window), source['range'])
            window['words'] = [{**w, 'windowIndex': index} for w in window['words']]
            windows.append(window)
        canonical = canonical_refined_windows(windows, source['range'])
        preserved = [copy.deepcopy(item) for item in raw_pass.get('unresolved', [])
                     if item.get('reason') not in TIMING_REASONS | {'untranscribed-nonquiet-speech'}]
        for item in source.get('unresolved', []):
            if item.get('reason') not in TIMING_REASONS | {'untranscribed-nonquiet-speech'} and item not in preserved:
                preserved.append(copy.deepcopy(item))
        canonical['unresolved'].extend(preserved)
        canonical['unresolved'].extend(_coverage_unresolved(source, canonical['words']))
        result['observationPasses'].append({**copy.deepcopy(raw_pass), **canonical, 'windows': windows,
            'rawWords': copy.deepcopy(raw_pass.get('words', [])),
            'rawUnresolved': copy.deepcopy(raw_pass.get('unresolved', [])), 'timingProvider': TIMING_PROVIDER})
    primary = next((p for p in result['observationPasses'] if p['id'] == 'core-overlap'), result['observationPasses'][0])
    result['words'] = copy.deepcopy(primary['words'])
    result['unresolved'] = copy.deepcopy(primary['unresolved'])
    # Source-only unknown markers are not necessarily represented in a pass.
    for item in source.get('unresolved', []):
        if (item.get('reason') not in TIMING_REASONS | {'untranscribed-nonquiet-speech'}
                and item not in result['unresolved']):
            result['unresolved'].append(copy.deepcopy(item))
    result['clockRefinement'] = {'version': VERSION, 'timingOnly': True,
        'scope': 'complete independent free-recognition window text; no new speech recognition or listening acceptance',
        'supersededTimingReasons': sorted(TIMING_REASONS), 'coverageRecomputed': True}
    return result


def fingerprint():
    packages = {}
    for name in ['qwen-asr', 'torch', 'transformers', 'numpy', 'tokenizers', 'soundfile', 'librosa']:
        try:
            packages[name] = importlib.metadata.version(name)
        except importlib.metadata.PackageNotFoundError:
            packages[name] = None
    return {'python': platform.python_version(), 'executable': str(Path(sys.executable).resolve()),
            'packages': packages, 'platform': platform.platform()}


def atomic_json(file, value):
    temporary = file.with_name(file.name + '.tmp-' + str(os.getpid()))
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False))
    temporary.replace(file)


def main():
    if len(sys.argv) == 2 and sys.argv[1] == '--fingerprint':
        print(json.dumps(fingerprint()))
        return
    from source_audio import read_clocked_pcm, sha256_file
    input_file, output_file = map(Path, sys.argv[1:3])
    request = json.loads(input_file.read_text())
    root, sources = Path(request['root']).resolve(), request['sources']
    if not sources or not request.get('rawEvidenceSha256') or request.get('threads') != 4:
        raise ValueError('Invalid independent clock refinement request')
    # No imports or downloads from the network. One local model for all windows.
    os.environ['HF_HUB_OFFLINE'] = '1'
    os.environ['TRANSFORMERS_OFFLINE'] = '1'
    os.environ['OMP_NUM_THREADS'] = '4'
    os.environ['MKL_NUM_THREADS'] = '4'
    import numpy as np
    import torch
    from qwen_asr import Qwen3ForcedAligner
    torch.set_num_threads(4)
    torch.set_num_interop_threads(1)
    aligner = None
    total = sum(len(p.get('windows', [])) for s in sources for p in s['observationPasses'])
    done, refined = 0, []
    checkpoint = Path(request['checkpointDirectory'])
    checkpoint.mkdir(parents=True, exist_ok=True)
    for source in sources:
        actual = (root / 'public' / source['src']).resolve()
        if not actual.is_relative_to((root / 'public' / 'clips').resolve()) or sha256_file(actual) != source['sourceSha256']:
            raise ValueError('Changed or invalid original media')
        pcm, clock = read_clocked_pcm(source['wav'])
        same_clock = lambda value: {k: v for k, v in value.items() if k != 'sourcePath'} == {k: v for k, v in clock.items() if k != 'sourcePath'}
        if (not same_clock(source.get('clock', source.get('audioClock', {})))
                or clock['sourceSha256'] != source['sourceSha256']
                or not same_clock(source.get('audioClock', clock))):
            raise ValueError('Independent source clock does not match complete source-zero WAV')
        audio = np.frombuffer(pcm, dtype='<i2').astype(np.float32) / 32768

        def align_window(window):
            nonlocal done, aligner
            bounds, _ = window_range(window, source['range'])
            if bounds[1] > len(audio) / 16000 + .001:
                raise ValueError('Recognition window exceeds WAV')
            key = hashlib.sha256(json.dumps({'identity': request['cacheIdentity'], 'source': source['sourceSha256'],
                                            'window': window}, ensure_ascii=False, sort_keys=True).encode()).hexdigest()
            saved = checkpoint / (key + '.json')
            tokens = None
            try:
                cached = json.loads(saved.read_text())
                data = json.dumps(cached['tokens'], ensure_ascii=False, sort_keys=True, allow_nan=False).encode()
                if cached.get('identity') == key and hashlib.sha256(data).hexdigest() == cached.get('tokensSha256'):
                    tokens = cached['tokens']
            except (OSError, ValueError, KeyError, TypeError):
                pass
            if tokens is None:
                if not clean(window['text']):
                    tokens = []
                else:
                    if aligner is None:
                        aligner = Qwen3ForcedAligner.from_pretrained(str(root / '.models/qwen3-forced-aligner-0.6b'),
                                                                   dtype=torch.float32, device_map='cpu', local_files_only=True)
                    a, b = bounds
                    tokens = [dataclasses.asdict(t) for t in aligner.align(
                        audio=(audio[round(a * 16000):round(b * 16000)], 16000),
                        text=window['text'], language='Chinese')[0]]
                data = json.dumps(tokens, ensure_ascii=False, sort_keys=True, allow_nan=False).encode()
                atomic_json(saved, {'identity': key, 'tokensSha256': hashlib.sha256(data).hexdigest(), 'tokens': tokens})
            done += 1
            print('PROGRESS:' + str(round(done * 100 / total)) + ':重新定位独立识别词时钟 ' + str(done) + '/' + str(total), flush=True)
            return tokens

        item = refine_observation_source(source, align_window)
        item['clockRefinement'].update({'rawEvidenceSha256': request['rawEvidenceSha256'],
                                       'cacheIdentity': request['cacheIdentity']})
        refined.append(item)
        if sha256_file(actual) != source['sourceSha256']:
            raise ValueError('Original media changed during clock refinement')
    atomic_json(output_file, {'version': VERSION, 'sources': refined, 'audioUploaded': False,
                             'geminiCalled': False, 'timingOnly': True,
                             'rawEvidenceSha256': request['rawEvidenceSha256'],
                             'cacheIdentity': request['cacheIdentity']})


if __name__ == '__main__':
    main()
