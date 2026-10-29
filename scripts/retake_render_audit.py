"""Full automatic-retake audio audit, invoked by audit-retake-render.mjs.

No ASR, semantic model, manual EDL, source write, or naturalness acceptance.
The Node entry point must first replay the approved plan against actual clips.
"""
import hashlib
import html
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import wave

import numpy as np

from source_audio import extract_source_audio, read_clocked_pcm, media_tool, sha256_file
from retake_confirmation import normalize_confirmation_text

RATE = 16000
CLOCK_METADATA_FIELDS = ('id', 'provider', 'kind', 'role', 'passId', 'modelSha256', 'aliasOf',
                         'timingProvider', 'clockRefinement', 'independentRecognition', 'candidateId',
                         'evidenceIndex', 'alignmentIndex', 'alignmentSide', 'observationSourceRangeSec',
                         'alignmentSha256', 'scope')
SPEC = importlib.util.spec_from_file_location('retake_wave_verifier', Path(__file__).with_name('verify-retake-render.py'))
VERIFY = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(VERIFY)


def write_wave(path, audio):
    path = Path(path)
    if path.exists():
        raise ValueError('Refusing to overwrite audit audio: ' + path.name)
    pcm = np.clip(np.rint(np.asarray(audio) * 32768), -32768, 32767).astype('<i2').tobytes()
    with wave.open(str(path), 'wb') as wav:
        wav.setparams((1, 2, RATE, 0, 'NONE', 'not compressed'))
        wav.writeframes(pcm)
    return {'file': path.name, 'sha256': sha256_file(path), 'pcmSha256': hashlib.sha256(pcm).hexdigest(),
            'sampleCount': len(pcm) // 2, 'durationSec': len(pcm) / (2 * RATE)}


def read_wave(path):
    with wave.open(str(path)) as wav:
        if (wav.getnchannels(), wav.getsampwidth(), wav.getframerate()) != (1, 2, RATE):
            raise ValueError('Expected mono16k PCM16 audit audio')
        return np.frombuffer(wav.readframes(wav.getnframes()), dtype='<i2').astype(np.float64) / 32768


def speed_audio(audio, speed):
    if speed == 1:
        return audio
    factors, remaining = [], speed
    while remaining > 2:
        factors.append(2)
        remaining /= 2
    while remaining < .5:
        factors.append(.5)
        remaining /= .5
    factors.append(remaining)
    executable, env = media_tool('ffmpeg')
    with tempfile.TemporaryDirectory(prefix='retake-audit-tempo-') as temporary:
        source, output = Path(temporary) / 'input.wav', Path(temporary) / 'output.wav'
        write_wave(source, audio)
        subprocess.run([executable, '-nostdin', '-v', 'error', '-i', str(source), '-af',
                        ','.join('atempo=' + str(f) for f in factors), '-c:a', 'pcm_s16le', str(output)],
                       capture_output=True, check=True, env=env, timeout=180)
        return read_wave(output)


def render_sequence(clips, sources, fps=30):
    audio, segments, cursor = [], [], 0
    for clip in clips:
        source = sources[clip['src']]
        a, b = round(clip['inSec'] * RATE), round(clip['outSec'] * RATE)
        if not 0 <= a < b <= len(source['audio']):
            raise ValueError('Retained clip exceeds source-zero PCM')
        speed = clip.get('speed', 1)
        if not np.isfinite(speed) or not 0 < speed <= 8:
            raise ValueError('Invalid retained clip speed')
        block = speed_audio(source['audio'][a:b], speed)
        segment = {**clip, 'sourceStartSample': a, 'sourceEndSample': b,
                   'outputStartSample': cursor, 'outputEndSample': cursor + len(block),
                   'durationSec': len(block) / RATE,
                   'frameRoundedDurationSec': max(1, int(np.floor((b - a) / RATE / speed * fps + .5))) / fps}
        audio.append(block)
        segments.append(segment)
        cursor += len(block)
    if not audio:
        raise ValueError('No retained audio')
    return np.concatenate(audio), segments


def measured_quiet(audio, threshold=.008):
    count = len(audio) // 160
    values = np.sqrt(np.mean(audio[:count * 160].reshape(count, 160) ** 2, axis=1)) if count else np.array([])
    runs, first = [], None
    for index in range(count + 1):
        quiet = index < count and values[index] < threshold
        if quiet and first is None:
            first = index
        if not quiet and first is not None:
            runs.append((first * 160, index * 160))
            first = None
    return values, runs


def source_clocks(source):
    if 'observationClocks' in source:
        return source['observationClocks']
    return [{'id': 'primary', 'provider': 'primary-asr', 'kind': 'asr', 'words': source.get('words', []), 'unresolved': []},
            {'id': 'independent', 'provider': 'independent-boundary', 'kind': 'forced-alignment', 'words': source.get('independentWords', []), 'unresolved': []}]


def supplied_text_alignment(clock):
    return clock.get('kind') == 'forced-alignment' or clock.get('role') == 'supplied-text-timestamps'


def clock_metadata(clock):
    metadata = {key: clock[key] for key in CLOCK_METADATA_FIELDS if key in clock}
    if supplied_text_alignment(clock):
        metadata['independentRecognition'] = False
    return metadata


def valid_word(word):
    a, b = word.get('startMs'), word.get('endMs')
    return (isinstance(a, (int, float)) and isinstance(b, (int, float)) and
            np.isfinite(a) and np.isfinite(b) and 0 <= a <= b)


def unresolved_span(value):
    for first, last, scale in [('startMs', 'endMs', 1), ('startSec', 'endSec', 1000)]:
        if isinstance(value, dict) and isinstance(value.get(first), (int, float)) and isinstance(value.get(last), (int, float)):
            a, b = value[first] * scale, value[last] * scale
            if np.isfinite(a) and np.isfinite(b) and 0 <= a <= b:
                return a, b
    if isinstance(value, dict) and isinstance(value.get('word'), dict):
        return unresolved_span(value['word'])
    if isinstance(value, dict) and value.get('words'):
        spans = [unresolved_span(word) for word in value['words']]
        if all(span is not None for span in spans):
            return min(span[0] for span in spans), max(span[1] for span in spans)
    return None


def source_uncertainty(source):
    located, unlocated = [], []
    for clock in source_clocks(source):
        if clock.get('aliasOf'):
            continue
        for value in clock.get('unresolved', []):
            span = unresolved_span(value)
            row = {'clockId': clock['id'], 'provider': clock.get('provider'), 'kind': 'unresolved-observation'}
            if span is None:
                unlocated.append(row)
            else:
                located.append({**row, 'startMs': span[0], 'endMs': span[1]})
        for word in clock.get('words', []):
            if not valid_word(word):
                unlocated.append({'clockId': clock['id'], 'provider': clock.get('provider'), 'kind': 'invalid-word-clock'})
    return located, unlocated


def source_words(source):
    result = []
    for clock in source_clocks(source):
        if clock.get('aliasOf'):
            continue
        for index, word in enumerate(clock.get('words', [])):
            if valid_word(word):
                result.append({**word, 'id': clock['id'] + '-' + str(index), 'clock': clock['id'],
                               'clockId': clock['id'], 'provider': clock.get('provider'), 'observationKind': clock.get('kind')})
    return sorted(result, key=lambda word: (word['startMs'], word['endMs']))


def clock_range_reports(source, lo, hi, expected_text=None):
    words = source_words(source)
    uncertain, unlocated = source_uncertainty(source)
    output = []
    normal = normalize_confirmation_text
    for clock in source_clocks(source):
        observed = [w for w in words if w['clockId'] == clock['id'] and
                    (w['endMs'] > lo and w['startMs'] < hi or w['startMs'] == w['endMs'] and lo <= w['startMs'] < hi)]
        crossing = [w for w in observed if w['startMs'] < lo or w['endMs'] > hi]
        unresolved = [row for row in uncertain if row['clockId'] == clock['id'] and row['endMs'] >= lo and row['startMs'] <= hi]
        missing_clock = sum(row['clockId'] == clock['id'] for row in unlocated)
        unresolved_inside = [entry for entry in unresolved if lo <= entry['startMs'] <= entry['endMs'] <= hi]
        unresolved_crossing = [entry for entry in unresolved if entry['startMs'] < lo or entry['endMs'] > hi]
        alignment = supplied_text_alignment(clock)
        recognition = clock.get('kind') == 'asr' and not alignment
        row = clock_metadata(clock)
        row.update({'observedWordCount': len(observed), 'edgeCrossingObservations': crossing,
                    'unresolvedOverlaps': unresolved, 'unresolvedInsideRange': unresolved_inside,
                    'unresolvedCrossingRangeEdge': unresolved_crossing, 'unlocatedUnresolvedCount': missing_clock,
                    'firstObservation': observed[0] if observed else None, 'lastObservation': observed[-1] if observed else None,
                    'interpretation': ('Supplied-text alignment provides timestamps, not independent recognition; word and unresolved range conflicts remain review observations, not confirmed unintended deletions.' if alignment else
                                       'One model/pass can omit, hallucinate, or disagree in timing; these are review observations, not confirmed unintended deletions.')})
        if alignment:
            row['selectedTextMatches'] = None
            row['selectedTextComparison'] = 'not-applicable-supplied-text-alignment'
        if expected_text is not None:
            observed_text = ''.join(w.get('word', w.get('text', '')) for w in observed)
            row['expectedText'] = expected_text
            row['observedText'] = observed_text
            row['rawExpectedText'] = expected_text
            row['rawObservedText'] = observed_text
            if recognition:
                row['selectedTextMatches'] = bool(normal(expected_text)) and normal(expected_text) == normal(observed_text)
                row['selectedTextComparison'] = 'normalized-asr-text'
            row['rawSelectedTextMatches'] = row.get('selectedTextMatches')
        reasons = []
        if not clock.get('aliasOf'):
            if crossing:
                reasons.append('word-edge-crossing')
            if unresolved_inside:
                reasons.append('unresolved-inside-range')
            if unresolved_crossing:
                reasons.append('unresolved-crossing-range-edge')
            if missing_clock:
                reasons.append('unlocated-unresolved')
            if expected_text is not None and recognition and not row.get('selectedTextMatches'):
                reasons.append('independent-text-mismatch')
        row['reviewReasons'] = reasons
        row['status'] = ('alias-of-observation-pass' if clock.get('aliasOf') else
                         'needs-review' if reasons else
                         'observed-no-range-conflict' if observed else 'no-observation-in-range')
        output.append(row)
    return output


def _comparison_json_bytes(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':'), allow_nan=False).encode('utf8')


def _valid_comparison_normalization(value, script_sha):
    def is_sha(text):
        return isinstance(text, str) and len(text) == 64 and all(c in '0123456789abcdef' for c in text.lower())

    def files(items):
        return (isinstance(items, list) and bool(items) and
                all(isinstance(item, dict) and isinstance(item.get('name'), str) and is_sha(item.get('sha256')) for item in items))

    return (isinstance(value, dict) and value.get('version') == 'opencc-t2s-comparison-v1' and
            value.get('scriptSha256') == script_sha and is_sha(value.get('configSha256')) and
            isinstance(value.get('packageVersion'), str) and files(value.get('dictionaries')) and files(value.get('implementation')) and
            value.get('rawRecognitionChanged') is False and value.get('expectedTextSupplied') is False)


def _run_comparison_converter(input_bytes):
    root = Path(__file__).resolve().parent.parent
    result = subprocess.run([str(root / '.venv/bin/python'), str(root / 'scripts/normalize-retake-comparison.py')],
                            input=input_bytes, capture_output=True, check=True, cwd=root, timeout=30)
    return result.stdout


def normalize_removal_text_comparisons(removals, converter=None):
    """Batch complete ASR text copies after recognition, preserving every raw risk.

    The optional converter takes exact UTF-8 request bytes and returns exact
    converter stdout bytes. It exists for synthetic tests; no recognizer runs.
    """
    rows = [row for removal in removals for row in removal['observationClocks']
            if row.get('kind') == 'asr' and not supplied_text_alignment(row) and not row.get('aliasOf') and
            isinstance(row.get('expectedText'), str) and isinstance(row.get('observedText'), str)]
    if not rows:
        return {'status': 'not-needed', 'warnings': [], 'receipt': None}
    texts = [text for row in rows for text in [row['expectedText'], row['observedText']]]
    input_bytes = _comparison_json_bytes({'texts': texts})
    script = Path(__file__).with_name('normalize-retake-comparison.py')
    receipt = {'version': 'retake-audit-comparison-copies-v1', 'converter': 'local-opencc-t2s',
               'inputSha256': hashlib.sha256(input_bytes).hexdigest(),
               'rowCount': len(rows), 'textCount': len(texts), 'rawRecognitionChanged': False,
               'scope': 'Complete expected/observed comparison copies after recognition; no new ASR or editing approval.'}
    try:
        script_sha = sha256_file(script)
        receipt['converterScriptSha256'] = script_sha
        if len(input_bytes) > 8 * 1024 * 1024:
            raise ValueError('Comparison copy input exceeds 8 MiB')
        output_bytes = (converter or _run_comparison_converter)(input_bytes)
        if not isinstance(output_bytes, bytes) or len(output_bytes) > 16 * 1024 * 1024:
            raise ValueError('Invalid comparison converter output bytes')
        receipt['outputSha256'] = hashlib.sha256(output_bytes).hexdigest()
        result = json.loads(output_bytes.decode('utf8'))
        converted = result.get('texts') if isinstance(result, dict) else None
        if not isinstance(converted, list) or len(converted) != len(texts) or any(not isinstance(text, str) for text in converted):
            raise ValueError('Comparison converter changed the text count or type')
        normalization = result.get('normalization')
        if sha256_file(script) != script_sha or not _valid_comparison_normalization(normalization, script_sha):
            raise ValueError('Comparison converter receipt or script identity is invalid')
        receipt.update({'normalization': normalization,
                        'normalizationSha256': hashlib.sha256(_comparison_json_bytes(normalization)).hexdigest()})
        receipt_sha = hashlib.sha256(_comparison_json_bytes(receipt)).hexdigest()
        updates = []
        for index, row in enumerate(rows):
            expected, observed = converted[index * 2:index * 2 + 2]
            a, b = normalize_confirmation_text(expected), normalize_confirmation_text(observed)
            match = bool(a) and a == b
            reasons = [reason for reason in row['reviewReasons'] if reason != 'independent-text-mismatch']
            if not match:
                reasons.append('independent-text-mismatch')
            copies = {'version': 'retake-audit-comparison-copies-v1', 'expectedText': expected, 'observedText': observed,
                      'normalizedExpected': a, 'normalizedObserved': b, 'inputTextIndices': [index * 2, index * 2 + 1],
                      'originalSha256': hashlib.sha256(_comparison_json_bytes({'expectedText': row['expectedText'], 'observedText': row['observedText']})).hexdigest(),
                      'receiptSha256': receipt_sha}
            updates.append((row, {'selectedTextMatches': match, 'selectedTextComparison': 'complete-opencc-t2s-asr-comparison-copies',
                                 'comparisonCopies': copies, 'reviewReasons': reasons,
                                 'status': 'needs-review' if reasons else 'observed-no-range-conflict' if row['observedWordCount'] else 'no-observation-in-range'}))
        # Validate the entire batch before changing any selected comparison.
        for row, update in updates:
            row.update(update)
        return {'status': 'completed', 'warnings': [], 'receipt': receipt}
    except Exception as error:
        return {'status': 'failed', 'warnings': [f'本地繁简审计比较副本未完成：{error}；保留原文字面差异及所有剪口风险。'],
                'receipt': {**receipt, 'failure': str(error)}}


def clock_review_summary(metrics, removals):
    summary = {}
    for prefix, ranges in [('retained', metrics), ('removal', removals)]:
        rows = [row for item in ranges for row in item['observationClocks']]
        summary[prefix + 'ClockReviewObservations'] = sum(row['status'] == 'needs-review' for row in rows)
        for suffix, reason in [('WordEdgeCrossingObservations', 'word-edge-crossing'),
                               ('UnresolvedInsideRangeObservations', 'unresolved-inside-range'),
                               ('UnresolvedCrossingEdgeObservations', 'unresolved-crossing-range-edge'),
                               ('UnlocatedUnresolvedObservations', 'unlocated-unresolved'),
                               ('IndependentTextMismatchObservations', 'independent-text-mismatch')]:
            summary[prefix + suffix] = sum(reason in row['reviewReasons'] for row in rows)
    return summary


def segment_metrics(segment, source, audio):
    a, b = segment['outputStartSample'], segment['outputEndSample']
    block = audio[a:b]
    values, quiet = measured_quiet(block)
    words = source_words(source)
    lo, hi = segment['inSec'] * 1000, segment['outSec'] * 1000
    touching = [w for w in words if w['endMs'] > lo and w['startMs'] < hi or
                w['startMs'] == w['endMs'] and lo <= w['startMs'] < hi]
    contained = [w for w in touching if lo <= w['startMs'] <= w['endMs'] <= hi]
    clipped = [w for w in touching if w['startMs'] < lo or w['endMs'] > hi]
    quiet_fraction = float(np.mean(values < .008)) if len(values) else None
    leading = quiet[0][1] / RATE if quiet and quiet[0][0] == 0 else 0
    trailing = (len(block) - quiet[-1][0]) / RATE if quiet and quiet[-1][1] >= len(block) - 159 else 0
    return {'clipId': segment['id'], 'src': segment['src'], 'sourceRangeSec': [segment['inSec'], segment['outSec']],
            'outputRangeSec': [a / RATE, b / RATE], 'speed': segment.get('speed', 1),
            'durationMs': len(block) * 1000 / RATE, 'rms': VERIFY.rms(block),
            'quietFraction': quiet_fraction, 'leadingQuietMs': leading * 1000, 'trailingQuietMs': trailing * 1000,
            'longestQuietMs': max((y - x for x, y in quiet), default=0) * 1000 / RATE,
            'shortRetainedFragment': len(block) < .25 * RATE,
            'nearSilentShortFragment': len(block) < .5 * RATE and quiet_fraction is not None and quiet_fraction >= .98,
            'frameRoundingDriftMs': (segment['frameRoundedDurationSec'] - segment['durationSec']) * 1000,
            'knownWordEvidenceAvailable': bool(words),
            'firstRetainedWord': min(contained, key=lambda word: word['startMs']) if contained else None,
            'lastRetainedWord': max(contained, key=lambda word: word['endMs']) if contained else None,
            'observationClocks': clock_range_reports(source, lo, hi),
            'observedWordsCrossingClipEdge': clipped,
            'scope': 'Source observations and audio metrics; an edge-crossing observation or short silent fragment is a review flag, not proof of clipped speech.'}


def quiet_cleanup_candidates(segment, source):
    # These are inputs to another independent confirmation stage, never edits.
    a, b = segment['sourceStartSample'], segment['sourceEndSample']
    values, quiet = measured_quiet(source['audio'][a:b])
    words = source_words(source)
    uncertain, unlocated = source_uncertainty(source)
    output = []
    for x, y in quiet:
        if y - x < .55 * RATE:
            continue
        lo, hi = (a + x) / RATE + .12, (a + y) / RATE - .12
        guards = [w for w in words if w['endMs'] >= lo * 1000 - 30 and w['startMs'] <= hi * 1000 + 30]
        unresolved_guards = [row for row in uncertain if row['endMs'] >= lo * 1000 - 30 and row['startMs'] <= hi * 1000 + 30]
        output.append({'clipId': segment['id'], 'src': segment['src'], 'startSec': lo, 'endSec': hi,
                       'measuredQuietRangeSec': [(a + x) / RATE, (a + y) / RATE],
                       'marginMs': 120, 'protectedObservationCount': len(guards),
                       'protectedUnresolvedCount': len(unresolved_guards), 'unlocatedObservationCount': len(unlocated),
                       'protectedClockIds': sorted(set(row['clockId'] for row in [*guards, *unresolved_guards, *unlocated])),
                       'knownWordEvidenceAvailable': bool(words),
                       'eligibleForIndependentConfirmation': bool(words) and not guards and not unresolved_guards and not unlocated,
                       'automaticApplyEnabled': False,
                       'reason': 'retained-low-energy-gap; energy and absent known tokens alone do not establish absent speech'})
    return output


def baseline_point(segment, source_sec, before_by_id, owner):
    baseline = before_by_id[owner[segment['id']]]
    return baseline['outputStartSample'] + round((source_sec - baseline['inSec']) / baseline.get('speed', 1) * RATE)


def join_metrics(left, right, left_metrics, right_metrics, audio, before, before_by_id, owner, output):
    join = right['outputStartSample']
    left_block = audio[max(left['outputStartSample'], join - 640):join]
    right_block = audio[join:min(right['outputEndSample'], join + 640)]
    jump = abs(float(audio[join] - audio[join - 1]))
    local_rms = max(VERIFY.rms(left_block), VERIFY.rms(right_block), .0001)
    previous_point = baseline_point(left, left['outSec'], before_by_id, owner)
    next_point = baseline_point(right, right['inSec'], before_by_id, owner)
    index = len(list(output.glob('join-*-after.wav')))
    before_start, before_end = max(0, previous_point - 12800), min(len(before), next_point + 12800)
    after_start, after_end = max(0, join - 12800), min(len(audio), join + 12800)
    # All baseline clips, including prior pause cuts, are already represented.
    before_file = output / f'join-{index:03d}-before.wav'
    after_file = output / f'join-{index:03d}-after.wav'
    write_wave(before_file, before[before_start:before_end])
    write_wave(after_file, audio[after_start:after_end])
    return {'id': index, 'leftClipId': left['id'], 'rightClipId': right['id'],
            'outputSec': join / RATE,
            'baselineRemovedDurationMs': max(0, next_point - previous_point) * 1000 / RATE,
            'newAutomaticJoin': next_point - previous_point > 1,
            'sourceGapRemovedMs': (right['inSec'] - left['outSec']) * 1000 if left['src'] == right['src'] else None,
            'leftTrailingQuietMs': left_metrics['trailingQuietMs'], 'rightLeadingQuietMs': right_metrics['leadingQuietMs'],
            'combinedQuietMs': left_metrics['trailingQuietMs'] + right_metrics['leadingQuietMs'],
            'sampleJumpAmplitude': jump, 'sampleJumpToLocalRms': jump / local_rms,
            'abruptJoinReviewFlag': jump > .04 and jump / local_rms > 3,
            'longPauseReviewFlag': left_metrics['trailingQuietMs'] + right_metrics['leadingQuietMs'] > 650,
            'beforeAudio': before_file.name, 'afterAudio': after_file.name,
            'beforeAuditionRangeSec': [before_start / RATE, before_end / RATE],
            'afterAuditionRangeSec': [after_start / RATE, after_end / RATE],
            'scope': 'Numerical review flags, not listening acceptance; the source gap may include already removed pauses.'}


def removal_auditions(parts, after_segments, before_by_id, owner, before, after, output):
    """Include leading/trailing removals, which need not create an interior join."""
    rows = []
    for index, part in enumerate(parts):
        baseline = before_by_id[part['clipId']]
        if baseline['src'] != part['src']:
            raise ValueError('Automatic removal changed source ownership')
        start = baseline['outputStartSample'] + round((part['startSec'] - baseline['inSec']) / baseline.get('speed', 1) * RATE)
        end = baseline['outputStartSample'] + round((part['endSec'] - baseline['inSec']) / baseline.get('speed', 1) * RATE)
        point = len(after)
        for segment in after_segments:
            old_start = baseline_point(segment, segment['inSec'], before_by_id, owner)
            old_end = baseline_point(segment, segment['outSec'], before_by_id, owner)
            if end <= old_start:
                point = segment['outputStartSample']
                break
            if old_start <= end <= old_end:
                point = min(segment['outputEndSample'], segment['outputStartSample'] + end - old_start)
                break
        a, b = max(0, start - 12800), min(len(before), end + 12800)
        x, y = max(0, point - 12800), min(len(after), point + 12800)
        first, second = f'remove-{index:03d}-before.wav', f'remove-{index:03d}-after.wav'
        write_wave(output / first, before[a:b])
        write_wave(output / second, after[x:y])
        rows.append({'id': index, 'clipId': part['clipId'], 'src': part['src'],
                     'removedSourceRangeSec': [part['startSec'], part['endSec']],
                     'outputSec': point / RATE, 'atStartOrEnd': point in [0, len(after)],
                     'beforeAudio': first, 'afterAudio': second,
                     'beforeAuditionRangeSec': [a / RATE, b / RATE], 'afterAuditionRangeSec': [x / RATE, y / RATE]})
    return rows


def write_page(output, report):
    escape = html.escape
    rows = []
    for join in report['joins']:
        flags = '；'.join(label for key, label in [('abruptJoinReviewFlag', '突变待听'), ('longPauseReviewFlag', '停顿较长')] if join[key]) or '未触发数值提示，仍需听审'
        rows.append(f'<tr><td>{join["id"] + 1}</td><td>{join["outputSec"]:.2f}s<br>{"新自动剪口" if join["newAutomaticJoin"] else "既有剪口"}</td><td>{escape(flags)}<br>合计静音 {join["combinedQuietMs"]:.0f}ms</td><td><audio controls preload="none" src="{escape(join["beforeAudio"])}"></audio></td><td><audio controls preload="none" src="{escape(join["afterAudio"])}"></audio></td></tr>')
    warning_text = ''.join('<li>' + escape(w) + '</li>' for w in report['warnings'])
    summary = report['summary']
    clock_counts = []
    for prefix, label in [('retained', '保留范围'), ('removal', '删除范围')]:
        clock_counts.append(f'<p>{label}：词跨界 {summary[prefix + "WordEdgeCrossingObservations"]}；未知在范围内 {summary[prefix + "UnresolvedInsideRangeObservations"]}；未知跨范围边界 {summary[prefix + "UnresolvedCrossingEdgeObservations"]}；未知位置 {summary[prefix + "UnlocatedUnresolvedObservations"]}；自由识别文字不符 {summary[prefix + "IndependentTextMismatchObservations"]}。</p>')
    comparison_status = report.get('removalTextComparison', {}).get('status', 'not-recorded')
    clock_section = '<section><h2>范围观测提示</h2>' + ''.join(clock_counts) + '<p>按每个识别或对齐窗口的范围观测条目计数，同类每条一次；可重复观察同一个词，不是确认削字数。范围内的未知不等于跨剪口。给定文本对齐仅提供时间，不计作独立识别，也不比较删除文字是否匹配；其词跨界及未知范围仍保留提示。</p>' + f'<p>删除文字比较副本：{escape(comparison_status)}。繁简转换仅作用于完整文字副本；原文、原始匹配及转换收据保存在报告中。数字标点、符号、否定与真实文字差异继续比较，转换失败保留原文字面差异；转换不解除词跨界或未知声音风险。</p></section>'
    removal_rows = ''.join(f'<tr><td>{row["id"] + 1}</td><td>{row["outputSec"]:.2f}s{" · 片首/片尾" if row["atStartOrEnd"] else ""}</td><td><audio controls preload="none" src="{escape(row["beforeAudio"])}"></audio></td><td><audio controls preload="none" src="{escape(row["afterAudio"])}"></audio></td></tr>' for row in report['automaticRemovals'])
    page = f'''<!doctype html><html lang="zh"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>自动口播精剪声音审计</title><style>body{{font:16px system-ui;background:#f7f7f3;color:#15202c;margin:32px;max-width:1300px}}audio{{max-width:300px;width:100%}}table{{border-collapse:collapse;width:100%}}td,th{{border:1px solid #c9d0d5;padding:10px;text-align:left}}section{{background:white;padding:18px;margin:18px 0}}.warning{{background:#fff4db}}</style><h1>自动口播精剪声音审计</h1><section class="warning">这是声音对照资料，不是另一套工作台。没有进行人耳听审；低能量、突变和短片段指标不能证明剪口自然，也不证明没有漏删。<ul>{warning_text}</ul></section><section><h2>整片对照</h2><p>剪前：本次分析快照，保留此前停顿剪辑</p><audio controls preload="none" src="before-full.wav"></audio><p>剪后：仅重放本次自动批准结果</p><audio controls preload="none" src="after-full.wav"></audio><p><a href="before-full.wav" download>下载剪前无损音轨</a> · <a href="after-full.wav" download>下载剪后无损音轨</a> · <a href="report.json">完整指标与凭证</a></p></section><section><h2>逐剪口对照</h2><p>剪后试听取实际生成的完整无损音轨；剪前取本次快照音轨，未恢复之前已经剪掉的停顿。音轨按源采样裁切；工作台视频帧舍入和最终AAC编码另需验收。</p><table><thead><tr><th>编号</th><th>剪后位置</th><th>数值提示</th><th>剪前</th><th>剪后</th></tr></thead><tbody>{''.join(rows)}</tbody></table></section></html>'''
    section = f'<section><h2>本次每处自动删除</h2><p>包括不形成内部拼接口的片首、片尾删除；前后均来自同一基线及实际生成的完整音轨。</p><table><tr><th>编号</th><th>剪后位置</th><th>剪前</th><th>剪后</th></tr>{removal_rows}</table></section>'
    page = page.replace('<section><h2>逐剪口对照</h2>', clock_section + section + '<section><h2>逐剪口对照</h2>')
    (output / 'index.html').write_text(page, encoding='utf8')


def audit(value, output, *, comparison_converter=None):
    output = Path(output)
    if value.get('source') != 'automatic-retake-result' or value.get('version') != 1:
        raise ValueError('Expected Node-validated automatic retake audit input')
    if (output / 'report.json').exists():
        raise ValueError('Refusing to overwrite existing audit report')
    sources, identities = {}, []
    for index, source in enumerate(value['sources']):
        original = Path(source['file'])
        if sha256_file(original) != source['sourceSha256']:
            raise ValueError('Original source changed before audit')
        wav = Path(source['wav']) if source.get('wav') else output / f'source-{index}.wav'
        if not source.get('wav'):
            extract_source_audio(original, wav)
        pcm, receipt = read_clocked_pcm(wav)
        if receipt['sourceSha256'] != source['sourceSha256']:
            raise ValueError('Source-zero WAV belongs to another video')
        if source.get('wav') and source.get('audioClock', {}).get('wavSha256') != receipt['wavSha256']:
            raise ValueError('Source-zero WAV differs from the formal analysis audio clock')
        sources[source['src']] = {**source, 'audio': np.frombuffer(pcm, dtype='<i2').astype(np.float64) / 32768}
        identities.append({'src': source['src'], 'sourceSha256': source['sourceSha256'],
                           'wavSha256': receipt['wavSha256'], 'sampleCount': receipt['sampleCount']})
        print('AUDIT:已校验原片时钟和声音来源 ' + str(index + 1), flush=True)
    before, before_segments = render_sequence(value['beforeClips'], sources, value['fps'])
    after, after_segments = render_sequence(value['afterClips'], sources, value['fps'])
    files = {'before': write_wave(output / 'before-full.wav', before), 'after': write_wave(output / 'after-full.wav', after)}
    actual = read_wave(output / 'after-full.wav')
    print('AUDIT:整片剪前及剪后无损音轨已生成，开始保留声音验证', flush=True)
    metrics = [segment_metrics(segment, sources[segment['src']], actual) for segment in after_segments]
    offsets, offset = {}, 0
    for src, source in sources.items():
        offsets[src] = offset
        offset += len(source['audio'])
    reference = np.concatenate([source['audio'] for source in sources.values()])
    runs = []
    for index, segment in enumerate(after_segments):
        origin = offsets[segment['src']]
        words = [w for w in source_words(sources[segment['src']]) if segment['inSec'] * 1000 <= w['startMs'] <= w['endMs'] <= segment['outSec'] * 1000]
        runs.append({'id': index, 'clipId': segment['id'], 'src': segment['src'],
                     'sourceStartSample': origin + segment['sourceStartSample'], 'sourceEndSample': origin + segment['sourceEndSample'],
                     'sourceStartSec': (origin + segment['sourceStartSample']) / RATE,
                     'sourceEndSec': (origin + segment['sourceEndSample']) / RATE,
                     'expectedOutputStartSample': segment['outputStartSample'],
                     'words': [{**w, 'startMs': w['startMs'] + origin / 16, 'endMs': w['endMs'] + origin / 16} for w in words]})
    if all(segment.get('speed', 1) == 1 for segment in after_segments):
        waveform = VERIFY.validate_waveforms(reference, actual, runs, sum(r['sourceEndSample'] - r['sourceStartSample'] for r in runs))
    else:
        waveform = {'status': 'unverified-speed-processing', 'scope': 'Pitch-preserving atempo changes waveform; no original-sample correlation acceptance is claimed for mixed-speed output.'}
    print('AUDIT:保留声音验证完成，生成逐剪口试听和节奏指标', flush=True)
    before_by_id = {segment['id']: segment for segment in before_segments}
    owner = {descendant: original for original, descendants in value['retainedClipIds'].items() for descendant in descendants}
    joins = [join_metrics(left, right, metrics[index], metrics[index + 1], actual, before, before_by_id, owner, output)
             for index, (left, right) in enumerate(zip(after_segments, after_segments[1:]))]
    removals = removal_auditions(value.get('automaticRemoveParts', []), after_segments, before_by_id, owner, before, actual, output)
    for removal, part in zip(removals, value.get('automaticRemoveParts', [])):
        removal['observationClocks'] = clock_range_reports(sources[part['src']], part['startSec'] * 1000, part['endSec'] * 1000, part.get('text', ''))
    text_comparison = normalize_removal_text_comparisons(removals, comparison_converter)
    cleanup = [candidate for segment in after_segments for candidate in quiet_cleanup_candidates(segment, sources[segment['src']])]
    warnings = list(value.get('warnings', [])) + text_comparison['warnings'] + [
        '未进行人耳听审：自然气口、误删意图及完整漏删仍未验收',
        '音轨使用mono16k源采样裁切，不包含配乐、音量包络、视频帧舍入或最终AAC编码',
        '低能量短片段是节奏复核提示；不能直接判为削字，也不自动删除',
        '停顿收尾候选仅供独立识别及边界复核，不能凭低能量或缺少已知词直接应用',
        '旧识别时钟被重新观察替代时，原失败另存supersededObservationSources诊断，不作为当前剪口已削字或已安全的证明',
        '各ASR/窗口pass及给定文字对齐分别记录；单一模型的文字或时钟分歧不是确凿误删，同模型多个pass也不是多个独立模型投票']
    if any(not metric['knownWordEvidenceAvailable'] for metric in metrics):
        warnings.append('部分原片缺少逐词观测，仍生成音轨，但对应保留词边界不能认证')
    report = {'version': 'retake-full-audio-audit-v1', 'status': 'failed' if waveform['status'] == 'failed' else 'review-materials-ready',
              'jobId': value['jobId'], 'analysisSha256': value['analysisSha256'], 'evidenceSha256': value.get('evidenceSha256'),
              'automaticOnly': True, 'appliedCandidateIds': value['appliedCandidateIds'],
              'identities': identities, 'files': files, 'segments': metrics, 'joins': joins, 'automaticRemovals': removals,
              'observationSources': [{'src': src, 'clocks': [clock_metadata(clock) for clock in source_clocks(source)]} for src, source in sources.items()],
              'supersededObservationSources': [{'src': src, 'clocks': source.get('supersededClocks', [])} for src, source in sources.items() if source.get('supersededClocks')],
              'clockObservationCountUnit': 'clock-range-rows; each reason counted at most once per row, not confirmed clipping events',
              'removalTextComparison': text_comparison,
              'waveformValidation': waveform, 'quietCleanupCandidates': cleanup, 'warnings': warnings,
              'summary': {'beforeDurationSec': len(before) / RATE, 'afterDurationSec': len(after) / RATE,
                          'retainedClips': len(after_segments), 'joins': len(joins),
                          'newAutomaticJoins': sum(join['newAutomaticJoin'] for join in joins),
                          'automaticRemovalParts': len(removals),
                          **clock_review_summary(metrics, removals),
                          'nearSilentShortFragments': sum(metric['nearSilentShortFragment'] for metric in metrics),
                          'abruptJoinReviewFlags': sum(join['abruptJoinReviewFlag'] for join in joins),
                          'longPauseReviewFlags': sum(join['longPauseReviewFlag'] for join in joins),
                          'quietCleanupCandidates': len(cleanup)},
              'listeningPerformed': False, 'editorialAcceptance': False, 'automaticApplyEnabled': False}
    for source in value['sources']:
        if sha256_file(source['file']) != source['sourceSha256']:
            raise ValueError('Original source changed during audit')
    (output / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2, allow_nan=False), encoding='utf8')
    write_page(output, report)
    return report


def main():
    input_file, output = map(Path, sys.argv[1:3])
    report = audit(json.loads(input_file.read_text(encoding='utf8')), output)
    print('AUDIT:' + json.dumps(report['summary'], ensure_ascii=False), flush=True)


if __name__ == '__main__':
    main()
