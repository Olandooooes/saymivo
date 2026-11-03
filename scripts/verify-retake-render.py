"""Verify decoded retained audio, independently of the retake decision maker.

This is signal evidence, not listening, ASR fidelity, or editorial acceptance.
Usage: .venv-align/bin/python scripts/verify-retake-render.py BENCHMARK_DIR
       [--source SOURCE_VIDEO] [--output NEW_RESULT_JSON]
       [--candidate-audio AUDIT.wav | --render-lossless-audit NEW_AUDIT.wav]
"""
import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import re
import subprocess
import tempfile
import wave

import numpy as np

from source_audio import ROOT, media_tool, probe_clock, read_clocked_pcm, sha256_file

RATE = 16000
VERSION = 'retake-render-signal-v1'


def finite(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def derive_plan(report, units, sample_count):
    """Derive kept source runs, rejecting any cut through an observed kept word."""
    bounds = report.get('range')
    if (not isinstance(bounds, list) or len(bounds) != 2 or
            not all(finite(x) for x in bounds) or
            not 0 <= bounds[0] < bounds[1] <= sample_count / RATE or
            bounds[1] - bounds[0] > 90 or units.get('range') != bounds):
        raise ValueError('Invalid or different benchmark source range (maximum 90 seconds)')
    words = units.get('words')
    if not isinstance(words, list) or not words:
        raise ValueError('Missing observed words')
    for i, word in enumerate(words):
        a, b = word.get('startMs'), word.get('endMs')
        if (word.get('id') != i or not finite(a) or not finite(b) or
                not bounds[0] * 1000 <= a < b <= bounds[1] * 1000 or
                (i and a < words[i - 1]['endMs'])):
            raise ValueError('Invalid or overlapping observed word clocks')
    cuts = report.get('proposals')
    if not isinstance(cuts, list):
        raise ValueError('Missing applied proposals')
    cuts = sorted(cuts, key=lambda cut: cut.get('startSec', -1))
    deleted = set()
    cursor = bounds[0]
    runs = []
    for cut in cuts:
        a, b, first, last = (cut.get(k) for k in ['startSec', 'endSec', 'first', 'last'])
        if (not finite(a) or not finite(b) or not cursor <= a < b <= bounds[1] or
                not isinstance(first, int) or isinstance(first, bool) or
                not isinstance(last, int) or isinstance(last, bool) or
                not 0 <= first <= last < len(words)):
            raise ValueError('Invalid, overlapping, or out-of-range cut')
        ids = set(range(first, last + 1))
        if deleted.intersection(ids):
            raise ValueError('Overlapping deleted word IDs')
        if words[first]['startMs'] < a * 1000 - .01 or words[last]['endMs'] > b * 1000 + .01:
            raise ValueError('Proposed deletion does not contain its full selected words')
        deleted.update(ids)
        if a > cursor:
            runs.append({'sourceStartSec': cursor, 'sourceEndSec': a})
        cursor = b
    if cursor < bounds[1]:
        runs.append({'sourceStartSec': cursor, 'sourceEndSec': bounds[1]})
    if not runs:
        raise ValueError('No retained source audio')
    kept_words = [w for w in words if w['id'] not in deleted]
    for word in kept_words:
        if not any(r['sourceStartSec'] * 1000 <= word['startMs'] + .01 and
                   word['endMs'] <= r['sourceEndSec'] * 1000 + .01 for r in runs):
            raise ValueError('Cut clips or deletes observed retained word ID ' + str(word['id']))
    output_sample = 0
    for index, run in enumerate(runs):
        a, b = round(run['sourceStartSec'] * RATE), round(run['sourceEndSec'] * RATE)
        run.update({'id': index, 'sourceStartSample': a, 'sourceEndSample': b,
                    'expectedOutputStartSample': output_sample,
                    'words': [w for w in kept_words if a <= round(w['startMs'] * 16) and
                              round(w['endMs'] * 16) <= b]})
        output_sample += b - a
    return runs, output_sample


def rms(samples):
    return float(np.sqrt(np.mean(samples * samples))) if len(samples) else 0.


def best_alignment(reference, candidate, expected_start, max_shift):
    """Normalized FFT correlation over bounded shifts; never warps local windows."""
    a = max(0, expected_start - max_shift)
    b = min(len(candidate), expected_start + max_shift + len(reference))
    search = candidate[a:b]
    if len(search) < len(reference) or len(reference) < 64 or rms(reference) < .002:
        return None
    ref = reference - np.mean(reference)
    n, m = len(ref), len(search)
    fft_size = 1 << (n + m - 2).bit_length()
    dot = np.fft.irfft(np.fft.rfft(search, fft_size) *
                       np.fft.rfft(ref[::-1], fft_size), fft_size)[n - 1:m]
    sums = np.concatenate(([0.], np.cumsum(search)))
    powers = np.concatenate(([0.], np.cumsum(search * search)))
    variance = powers[n:] - powers[:-n] - (sums[n:] - sums[:-n]) ** 2 / n
    denominator = np.sqrt(np.maximum(variance, 1e-30) * np.sum(ref * ref))
    scores = dot / denominator
    index = int(np.argmax(scores))
    return {'shiftSamples': a + index - expected_start, 'correlation': float(scores[index])}


def compare_window(reference, candidate, output_start, min_rms=.002):
    if output_start < 0 or output_start + len(reference) > len(candidate):
        return {'status': 'failed', 'reason': 'retained-samples-outside-decoded-output'}
    actual = candidate[output_start:output_start + len(reference)]
    level = rms(reference)
    if level < min_rms:
        return {'status': 'unverified', 'reason': 'low-reference-energy', 'sourceRms': level}
    x, y = reference - np.mean(reference), actual - np.mean(actual)
    xx, yy = float(np.dot(x, x)), float(np.dot(y, y))
    correlation = float(np.dot(x, y) / math.sqrt(max(1e-30, xx * yy)))
    gain = float(np.dot(x, y) / max(1e-30, xx))
    error = rms(actual - reference * gain) / level
    # Fixed-offset short windows expose clipped onsets that full-signal scores hide.
    passed = correlation >= .94 and .65 <= gain <= 1.4 and error <= .36
    return {'status': 'passed' if passed else 'failed', 'sourceRms': level,
            'correlation': correlation, 'gain': gain, 'relativeResidualRms': error}


def fractional_samples(samples, fraction):
    """One constant sub-sample phase correction, not time stretching or local fitting."""
    if abs(fraction) < 1e-12:
        return samples
    offsets = np.arange(-24, 25)
    kernel = np.sinc(offsets - fraction) * np.hamming(len(offsets))
    kernel /= np.sum(kernel)
    return np.convolve(samples, kernel[::-1], mode='same')


def fractional_alignment(source, candidate, anchors, run_start, output_start, shift, size):
    # Source/candidate were independently resampled. A 48k concat boundary need not
    # land on a 16k sample; fit ONE sub-sample phase to the interior anchors.
    best_fraction, best_score = 0., -1.
    for fraction in np.arange(-.5, .5001, 1 / 48):
        scores = []
        for anchor in anchors:
            start = anchor['sourceStartSample']
            target = output_start + shift + start - run_start
            if target < 24 or target + size + 24 > len(candidate):
                continue
            actual = fractional_samples(candidate[target - 24:target + size + 24], fraction)[24:-24]
            reference = source[start:start + size]
            x, y = reference - np.mean(reference), actual - np.mean(actual)
            scores.append(float(np.dot(x, y) / math.sqrt(max(1e-30, np.dot(x, x) * np.dot(y, y)))))
        score = float(np.mean(scores)) if scores else -1.
        if score > best_score:
            best_fraction, best_score = float(fraction), score
    return best_fraction, best_score


def windows(a, b, width, hop):
    if b <= a:
        return []
    if b - a <= width:
        return [(a, b)]
    starts = list(range(a, b - width + 1, hop))
    if starts[-1] != b - width:
        starts.append(b - width)
    return [(start, start + width) for start in starts]


def validate_waveforms(source, candidate, runs, expected_samples, max_shift_ms=60):
    """Check every run, all energetic retained windows, and both retained word edges."""
    source = np.asarray(source, dtype=np.float64)
    candidate = np.asarray(candidate, dtype=np.float64)
    results, failures, unverified, critical_unverified = [], [], [], []
    maximum_shift = round(max_shift_ms * RATE / 1000)
    for run in runs:
        a, b, output = (run[k] for k in ['sourceStartSample', 'sourceEndSample', 'expectedOutputStartSample'])
        length = b - a
        anchor_size = min(round(.5 * RATE), max(64, length // 3))
        anchor_starts = sorted(set(a + round((length - anchor_size) * fraction)
                                   for fraction in [.2, .5, .8]))
        anchors = []
        for start in anchor_starts:
            aligned = best_alignment(source[start:start + anchor_size], candidate,
                                     output + start - a, maximum_shift)
            if aligned and aligned['correlation'] >= .94:
                anchors.append({**aligned, 'sourceStartSample': start})
        result = {k: v for k, v in run.items() if k != 'words'}
        result['anchors'] = anchors
        if not anchors:
            result.update({'status': 'unverified', 'reason': 'no-reliable-interior-alignment'})
            unverified.append({'runId': run['id'], 'reason': result['reason']})
            critical_unverified.append({'runId': run['id'], 'reason': result['reason']})
            results.append(result)
            continue
        shift = round(float(np.median([x['shiftSamples'] for x in anchors])))
        spread = max(abs(x['shiftSamples'] - shift) for x in anchors)
        fraction, fraction_score = fractional_alignment(source, candidate, anchors, a, output, shift, anchor_size)
        aligned_candidate = fractional_samples(candidate, fraction)
        result.update({'alignmentShiftSamples': shift + fraction,
                       'integerAlignmentShiftSamples': shift,
                       'sharedFractionalPhaseSamples': fraction,
                       'fractionalAnchorCorrelation': fraction_score,
                       'alignmentShiftMs': (shift + fraction) * 1000 / RATE,
                       'anchorSpreadSamples': spread, 'checks': []})
        if spread > 8:
            failures.append({'runId': run['id'], 'reason': 'inconsistent-interior-timing', 'spreadSamples': spread})
        def check(start, end, kind, word_id=None):
            comparison = compare_window(source[start:end], aligned_candidate, output + shift + start - a)
            row = {'kind': kind, 'sourceStartSec': start / RATE, 'sourceEndSec': end / RATE,
                   'outputStartSec': (output + shift + fraction + start - a) / RATE, **comparison}
            if word_id is not None:
                row['wordId'] = word_id
            result['checks'].append(row)
            item = {'runId': run['id'], **row}
            if row['status'] == 'failed':
                failures.append(item)
            elif row['status'] == 'unverified':
                unverified.append(item)
        # Overlapping 160ms windows cover the entire retained run; no per-window realignment.
        for start, end in windows(a, b, 2560, 1280):
            check(start, end, 'retained-run')
        # Check 80ms subwindows of the first/last observed kept word, including 40ms context.
        for side, word in [('first', run['words'][0] if run['words'] else None),
                           ('last', run['words'][-1] if run['words'] else None)]:
            if word is None:
                item = {'runId': run['id'], 'reason': 'no-observed-retained-' + side + '-word'}
                unverified.append(item)
                critical_unverified.append(item)
                continue
            start = max(a, round(word['startMs'] * 16) - 640)
            end = min(b, round(word['endMs'] * 16) + 640)
            check_begin = len(result['checks'])
            for lo, hi in windows(start, end, 1280, 640):
                check(lo, hi, side + '-retained-word-neighborhood', word['id'])
            if not any(c['status'] in ['passed', 'failed'] for c in result['checks'][check_begin:]):
                critical_unverified.append({'runId': run['id'], 'wordId': word['id'],
                                            'reason': 'no-energetic-' + side + '-word-neighborhood'})
        result['status'] = ('failed' if any(f.get('runId') == run['id'] for f in failures)
                            else 'passed-with-unverified-low-energy-windows' if
                            any(u.get('runId') == run['id'] for u in unverified) else 'passed')
        results.append(result)
    drift = (len(candidate) - expected_samples) * 1000 / RATE
    # At most 60ms total decoded padding/concat quantization; preserve the measured drift.
    if abs(drift) > 60:
        failures.append({'reason': 'decoded-duration-drift-exceeds-60ms', 'durationDriftMs': drift})
    return {'status': 'failed' if failures else 'unverified' if critical_unverified else
            'signal-preservation-verified-with-scope-limits',
            'sampleRate': RATE, 'expectedSampleCount': expected_samples,
            'decodedSampleCount': len(candidate), 'durationDriftMs': drift,
            'thresholds': {'maxAlignmentShiftMs': max_shift_ms, 'maxAnchorSpreadSamples': 8,
                           'minCorrelation': .94, 'minGain': .65, 'maxGain': 1.4,
                           'maxRelativeResidualRms': .36, 'lowEnergyRms': .002,
                           'maxDurationDriftMs': 60},
            'retainedRuns': results, 'failures': failures, 'unverifiedWindows': unverified,
            'criticalUnverifiedConditions': critical_unverified}


def decode_candidate(candidate):
    origin, _, clock = probe_clock(candidate)
    executable, env = media_tool('ffmpeg')
    bundled = ROOT / '.tools' / 'bin' / 'ffmpeg'
    if bundled.is_file():
        executable = str(bundled)
        directory = str(bundled.resolve().parent)
        for key in ['DYLD_LIBRARY_PATH', 'LD_LIBRARY_PATH']:
            env[key] = directory + (os.pathsep + env[key] if env.get(key) else '')
    with tempfile.TemporaryDirectory(prefix='retake-render-validation-') as temporary:
        destination = Path(temporary) / 'decoded.wav'
        audio_filter = ('asetpts=PTS-(' + str(origin.numerator) + '/' + str(origin.denominator)
                        + ')/TB,aresample=16000:first_pts=0')
        command = [executable, '-nostdin', '-v', 'error', '-copyts', '-i', str(candidate),
                   '-map', '0:a:0', '-vn', '-af', audio_filter, '-ac', '1', '-c:a',
                   'pcm_s16le', str(destination)]
        subprocess.run(command, check=True, capture_output=True, env=env, timeout=180)
        with wave.open(str(destination)) as wav:
            if (wav.getnchannels(), wav.getsampwidth(), wav.getframerate()) != (1, 2, RATE):
                raise ValueError('Candidate decode is not mono16k PCM16')
            pcm = wav.readframes(wav.getnframes())
    return np.frombuffer(pcm, dtype='<i2').astype(np.float64) / 32768, {
        **clock, 'filter': audio_filter, 'decodedPcmSha256': hashlib.sha256(pcm).hexdigest(),
        'decoder': str(Path(executable).resolve())}


def read_candidate_audio(candidate, directory, report_sha, units_sha, source_sha):
    with wave.open(str(candidate)) as wav:
        if (wav.getnchannels(), wav.getsampwidth(), wav.getframerate()) != (1, 2, RATE):
            raise ValueError('Audit candidate must be mono16k PCM16 WAV')
        pcm = wav.readframes(wav.getnframes())
    provenance = Path(str(candidate) + '.render-audit.json')
    details = {'decoder': 'PCM16-WAVE-reader', 'sampleRate': RATE,
               'decodedPcmSha256': hashlib.sha256(pcm).hexdigest(),
               'candidateAudioProvenanceVerified': False}
    if provenance.is_file():
        audit = json.loads(provenance.read_text(encoding='utf8'))
        expected = {'version': 'retake-lossless-audit-v1', 'sourceSha256': source_sha,
                    'reportSha256': report_sha, 'inputUnitsSha256': units_sha,
                    'audioSha256': sha256_file(candidate), 'sampleCount': len(pcm) // 2,
                    'graphSha256': sha256_file(directory / 'preview-filter.txt')}
        if any(audit.get(k) != value for k, value in expected.items()):
            raise ValueError('Lossless audio audit provenance does not match current source, graph, evidence, or WAV')
        details.update({'candidateAudioProvenanceVerified': True, 'auditReceipt': audit,
                        'auditReceiptSha256': sha256_file(provenance)})
    return np.frombuffer(pcm, dtype='<i2').astype(np.float64) / 32768, details


def verify_preview_filter_graph(graph, runs):
    """Accept only the known benchmark graph, with every trim equal to the EDL."""
    number = r'((?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)'
    parts = []
    for i in range(len(runs)):
        parts.append(re.escape('[0:v]trim=start=') + number + re.escape(':end=') + number +
                     re.escape(f',setpts=PTS-STARTPTS[v{i}];[0:a]atrim=start=') + number +
                     re.escape(':end=') + number + re.escape(f',asetpts=PTS-STARTPTS[a{i}]'))
    tail = ';' + ''.join(f'[v{i}][a{i}]' for i in range(len(runs))) + f'concat=n={len(runs)}:v=1:a=1[v][a]'
    matched = re.fullmatch(';'.join(parts) + re.escape(tail), graph.strip())
    if not matched:
        raise ValueError('Preview filter graph is not the expected trim/setpts/concat-only benchmark graph')
    values = [float(x) for x in matched.groups()]
    for index, run in enumerate(runs):
        expected = [run['sourceStartSec'], run['sourceEndSec']] * 2
        if any(abs(a - b) > .25 / RATE for a, b in zip(values[index * 4:index * 4 + 4], expected)):
            raise ValueError('Preview filter graph differs from report-derived retained source runs')


def render_lossless_audit(directory, destination, source_video=None):
    """Render the actual benchmark concat before AAC, without changing that MP4."""
    directory, destination = Path(directory), Path(destination)
    receipt_path = Path(str(destination) + '.render-audit.json')
    if destination.exists() or receipt_path.exists():
        raise ValueError('Refusing to overwrite existing lossless audio audit')
    _, receipt = read_clocked_pcm(directory / 'source.wav')
    report_path, units_path, graph_path = (directory / n for n in ['report.json', 'input-units.json', 'preview-filter.txt'])
    report = json.loads(report_path.read_text(encoding='utf8'))
    units = json.loads(units_path.read_text(encoding='utf8'))
    if report.get('sourceSha256') != receipt['sourceSha256'] or units.get('clock', {}).get('wavSha256') != receipt['wavSha256']:
        raise ValueError('Lossless audit source evidence differs from verified audio receipt')
    runs, _ = derive_plan(report, units, receipt['sampleCount'])
    verify_preview_filter_graph(graph_path.read_text(encoding='utf8'), runs)
    source = Path(source_video) if source_video else Path(receipt.get('sourcePath', ''))
    if not source.is_file() or sha256_file(source) != receipt['sourceSha256']:
        raise ValueError('Lossless audit needs the unchanged original source video')
    identity = {'sourceSha256': receipt['sourceSha256'], 'reportSha256': sha256_file(report_path),
                'inputUnitsSha256': sha256_file(units_path), 'graphSha256': sha256_file(graph_path)}
    executable, env = media_tool('ffmpeg')
    bundled = ROOT / '.tools' / 'bin' / 'ffmpeg'
    if bundled.is_file():
        executable = str(bundled)
    published = False
    destination.parent.mkdir(parents=True, exist_ok=True)
    try:
        with tempfile.TemporaryDirectory(prefix='.retake-lossless-', dir=destination.parent) as temporary:
            output = Path(temporary) / 'audit.wav'
            command = [executable, '-nostdin', '-v', 'error', '-i', str(source),
                       '-filter_complex_script', str(graph_path),
                       '-map', '[v]', '-an', '-f', 'null', '-',
                       '-map', '[a]', '-vn', '-ac', '1', '-ar', str(RATE), '-c:a', 'pcm_s16le', str(output)]
            subprocess.run(command, check=True, capture_output=True, env=env, timeout=180)
            with wave.open(str(output)) as wav:
                if (wav.getnchannels(), wav.getsampwidth(), wav.getframerate()) != (1, 2, RATE):
                    raise ValueError('Lossless audit output is not mono16k PCM16')
                samples = wav.getnframes()
            for file, key in [(source, 'sourceSha256'), (report_path, 'reportSha256'),
                              (units_path, 'inputUnitsSha256'), (graph_path, 'graphSha256')]:
                if sha256_file(file) != identity[key]:
                    raise ValueError('Source or benchmark evidence changed during lossless audit rendering')
            audit = {'version': 'retake-lossless-audit-v1', **identity,
                     'audioSha256': sha256_file(output), 'sampleRate': RATE, 'sampleCount': samples,
                     'videoSink': 'null', 'audioEncoding': 'pcm_s16le',
                     'scope': 'Same verified benchmark video/audio trim+concat graph, audio captured before AAC encoding',
                     'editorialAcceptance': False, 'listeningPerformed': False}
            os.link(output, destination)
            published = True
            with receipt_path.open('x', encoding='utf8') as file:
                json.dump(audit, file, ensure_ascii=False, indent=2)
        return destination
    except Exception:
        if published:
            destination.unlink(missing_ok=True)
        raise


def compare_no_edit_control(source, candidate, control, units, candidate_result):
    """Diagnose codec-path limits without weakening any preservation threshold.

    A matching failure in a supplied neutral transcode is evidence that this
    waveform threshold also fails without edits. It is NOT a formal allowance
    for deleting samples, and never promotes a failed candidate to passed.
    """
    runs, expected = derive_plan({'range': units['range'], 'proposals': []}, units, len(source))
    checked = validate_waveforms(source, control, runs, expected)
    control_run = checked['retainedRuns'][0]
    diagnostics = []
    if 'integerAlignmentShiftSamples' in control_run:
        control_signal = fractional_samples(control, control_run['sharedFractionalPhaseSamples'])
        base = runs[0]['sourceStartSample']
        candidate_signals = {}
        for failure in candidate_result['failures']:
            if 'sourceStartSec' not in failure:
                continue
            run = candidate_result['retainedRuns'][failure['runId']]
            if 'integerAlignmentShiftSamples' not in run:
                continue
            if run['id'] not in candidate_signals:
                candidate_signals[run['id']] = fractional_samples(candidate, run['sharedFractionalPhaseSamples'])
            a, b = round(failure['sourceStartSec'] * RATE), round(failure['sourceEndSec'] * RATE)
            control_start = control_run['integerAlignmentShiftSamples'] + a - base
            candidate_start = (run['expectedOutputStartSample'] + run['integerAlignmentShiftSamples']
                               + a - run['sourceStartSample'])
            neutral = compare_window(source[a:b], control_signal, control_start)
            relative = compare_window(control_signal[control_start:control_start + b - a],
                                      candidate_signals[run['id']], candidate_start)
            diagnostics.append({'runId': run['id'], 'kind': failure['kind'],
                                'sourceStartSec': a / RATE, 'sourceEndSec': b / RATE,
                                'sourceVsNoEditControl': neutral,
                                'candidateVsNoEditControl': relative,
                                'classification': 'same-source-window-also-fails-without-edits'
                                if neutral['status'] == 'failed' else 'not-explained-by-no-edit-control'})
    return {'scope': 'Supplied no-edit transcode is compared against the same source PCM over its full range; failed candidate windows are also compared with that control.',
            'changesCandidateAcceptance': False,
            'limitation': 'A shared no-edit mismatch diagnoses codec-path waveform limits; no deterministic encoder distortion bound is assumed and no deletion tolerance is derived from it.',
            'sourceComparison': checked, 'failedWindowDiagnostics': diagnostics}


def verify_directory(directory, source_video=None, candidate_audio=None):
    directory = Path(directory)
    report_file, units_file = directory / 'report.json', directory / 'input-units.json'
    report = json.loads(report_file.read_text(encoding='utf8'))
    units = json.loads(units_file.read_text(encoding='utf8'))
    pcm, receipt = read_clocked_pcm(directory / 'source.wav')
    if report.get('sourceSha256') != receipt['sourceSha256']:
        raise ValueError('Report does not match clocked source audio SHA')
    for key in ['sourceSha256', 'wavSha256', 'sampleCount', 'version', 'timestampBasis', 'sampleRate']:
        if units.get('clock', {}).get(key) != receipt.get(key):
            raise ValueError('Input word clock does not match source WAV receipt: ' + key)
    identity = {'sourceSha256': receipt['sourceSha256'], 'wavSha256': receipt['wavSha256'],
                'sourceReceiptSha256': sha256_file(directory / 'source.wav.clock.json'),
                'reportSha256': sha256_file(report_file), 'inputUnitsSha256': sha256_file(units_file),
                'sourceVideoRehashed': False}
    limitations = ['No listening was performed; naturalness and editorial correctness are unverified.',
                   'Word checks use supplied observed word times; omitted/misrecognized words are not independently verified.',
                   'Low-energy windows cannot prove word presence and are reported explicitly.',
                   'This validates decoded mono16k audio in the benchmark range, not video frames or the full source.']
    source_path = Path(source_video) if source_video else Path(receipt.get('sourcePath', ''))
    if source_path.is_file():
        if sha256_file(source_path) != receipt['sourceSha256']:
            raise ValueError('Original source video bytes changed')
        identity['sourceVideoRehashed'] = True
    elif source_video:
        raise ValueError('Explicit source video does not exist')
    else:
        limitations.append('Original source video unavailable; source SHA is bound through the verified extraction receipt only.')
    source = np.frombuffer(pcm, dtype='<i2').astype(np.float64) / 32768
    runs, expected = derive_plan(report, units, len(source))
    candidate = Path(candidate_audio) if candidate_audio else directory / 'codex-proposed.mp4'
    before = sha256_file(candidate)
    actual, decode = (read_candidate_audio(candidate, directory, identity['reportSha256'],
                                          identity['inputUnitsSha256'], receipt['sourceSha256'])
                      if candidate_audio else decode_candidate(candidate))
    if sha256_file(candidate) != before:
        raise ValueError('Candidate changed while decoding')
    result = validate_waveforms(source, actual, runs, expected)
    result.update({'version': VERSION, 'identity': {**identity, 'candidateSha256': before},
                   'decode': decode, 'sourceRangeSec': report['range'],
                   'scope': 'Every retained run and fixed-offset overlapping waveform windows; first/last observed retained word neighborhoods explicitly checked.',
                   'limitations': limitations, 'editorialAcceptance': False, 'listeningPerformed': False,
                   'automaticApplyEnabled': False,
                   'candidateKind': 'lossless-pcm-audio' if candidate_audio else 'encoded-video-audio'})
    if candidate_audio:
        result['limitations'].append('Lossless audit checks the chosen EDL before AAC; it does not resolve encoded MP4 waveform mismatches.')
    control_path = directory / 'original.mp4'
    if control_path.is_file() and not candidate_audio:
        control_sha = sha256_file(control_path)
        control, control_decode = decode_candidate(control_path)
        result['noEditControl'] = {**compare_no_edit_control(source, actual, control, units, result),
                                   'sha256': control_sha, 'decode': control_decode}
        if sha256_file(control_path) != control_sha:
            raise ValueError('No-edit control changed while validating')
    if sha256_file(report_file) != identity['reportSha256'] or sha256_file(units_file) != identity['inputUnitsSha256']:
        raise ValueError('Benchmark evidence changed while validating')
    if (sha256_file(directory / 'source.wav') != receipt['wavSha256'] or
            sha256_file(directory / 'source.wav.clock.json') != identity['sourceReceiptSha256']):
        raise ValueError('Clocked source WAV or receipt changed while validating')
    if identity['sourceVideoRehashed'] and sha256_file(source_path) != receipt['sourceSha256']:
        raise ValueError('Original source video changed while validating')
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directory', type=Path)
    parser.add_argument('--source', type=Path)
    parser.add_argument('--output', type=Path)
    candidates = parser.add_mutually_exclusive_group()
    candidates.add_argument('--candidate-audio', type=Path)
    candidates.add_argument('--render-lossless-audit', type=Path)
    args = parser.parse_args()
    output = args.output or args.directory / 'validation-result.json'
    if output.exists():
        parser.error('Refusing to overwrite existing validation evidence: ' + str(output))
    try:
        audio = (render_lossless_audit(args.directory, args.render_lossless_audit, args.source)
                 if args.render_lossless_audit else args.candidate_audio)
        result = verify_directory(args.directory, args.source, audio)
    except (ValueError, OSError, KeyError, TypeError, subprocess.SubprocessError) as error:
        result = {'version': VERSION, 'status': 'blocked', 'reason': str(error),
                  'editorialAcceptance': False, 'listeningPerformed': False, 'automaticApplyEnabled': False}
    with output.open('x', encoding='utf8') as file:
        json.dump(result, file, ensure_ascii=False, indent=2, allow_nan=False)
    print(json.dumps({'status': result['status'], 'output': str(output),
                      'failures': len(result.get('failures', [])),
                      'unverifiedWindows': len(result.get('unverifiedWindows', [])),
                      'durationDriftMs': result.get('durationDriftMs')}, ensure_ascii=False))
    return 1 if result['status'] in ['blocked', 'failed', 'unverified'] else 0


if __name__ == '__main__':
    raise SystemExit(main())
