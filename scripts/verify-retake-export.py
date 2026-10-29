"""Verify an actual native-rate workbench export against an automatic audit input.

Usage: .venv-align/bin/python scripts/verify-retake-export.py AUDIT_INPUT.json
       ACTUAL_VIDEO NEW_REPORT.json [--export-rate 1]
Read-only; reconstructs frame-rounded source windows, never a hand-authored EDL.
Mixed audio, clip speed or baked export speed are explicitly unverified here.
"""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np

from retake_render_audit import RATE, VERIFY, source_words, clock_range_reports
from source_audio import read_clocked_pcm, sha256_file


def native_reference(value, sources):
    fps = value['fps']
    offsets, offset = {}, 0
    for src, source in sources.items():
        offsets[src] = offset
        offset += len(source['audio'])
    reference = np.concatenate([source['audio'] for source in sources.values()])
    runs, projection, frame = [], [], 0
    for index, clip in enumerate(value['afterClips']):
        if clip.get('speed', 1) != 1:
            raise ValueError('Clip playback speed is outside native-rate source waveform validation')
        frames = max(1, int(np.floor((clip['outSec'] - clip['inSec']) * fps + .5)))
        trim_before = int(np.floor(clip['inSec'] * fps + .5))
        a, b = round(trim_before / fps * RATE), round((trim_before + frames) / fps * RATE)
        source, origin = sources[clip['src']], offsets[clip['src']]
        if not 0 <= a < b <= len(source['audio']):
            raise ValueError('Frame-rounded source audio window exceeds the verified source PCM')
        kept = [w for w in source_words(source) if a / 16 <= w['startMs'] <= w['endMs'] <= b / 16]
        original_kept = [w for w in source_words(source) if clip['inSec'] * 1000 <= w['startMs'] <= w['endMs'] <= clip['outSec'] * 1000]
        risks = [w for w in original_kept if w['startMs'] < a / 16 or w['endMs'] > b / 16]
        runs.append({'id': index, 'clipId': clip['id'], 'src': clip['src'],
                     'sourceStartSample': origin + a, 'sourceEndSample': origin + b,
                     'sourceStartSec': (origin + a) / RATE, 'sourceEndSec': (origin + b) / RATE,
                     'expectedOutputStartSample': round(frame / fps * RATE),
                     'words': [{**w, 'startMs': w['startMs'] + origin / 16, 'endMs': w['endMs'] + origin / 16} for w in kept]})
        projection.append({'clipId': clip['id'], 'src': clip['src'], 'fromFrame': frame, 'durationInFrames': frames,
                           'trimBeforeFrame': trim_before, 'trimAfterFrame': trim_before + frames,
                           'plannedSourceRangeSec': [clip['inSec'], clip['outSec']],
                           'frameSourceRangeSec': [trim_before / fps, (trim_before + frames) / fps],
                           'frameRoundingObservationRisks': risks,
                           'observationClocks': clock_range_reports(source, a / 16, b / 16),
                           'scope': 'Source word-clock differences after frame rounding are review observations, not confirmed clipping.'})
        frame += frames
    return reference, runs, round(frame / fps * RATE), projection


def verify_export(value, audit_directory, actual_video, export_rate=1):
    if value.get('source') != 'automatic-retake-result':
        raise ValueError('Expected an existing server-prepared automatic audit input')
    digest = sha256_file(actual_video)
    result = {'version': 'retake-actual-export-signal-v1', 'actualVideoSha256': digest,
              'analysisSha256': value['analysisSha256'], 'exportRate': export_rate,
              'editorialAcceptance': False, 'listeningPerformed': False, 'sourceModified': False,
              'limitations': ['Actual decoded mono16k audio is checked; visual rendering and naturalness are not accepted.',
                              'AAC may fail strict short-window waveform fidelity without a deletion. Failures remain unresolved, not reclassified as exact matches.',
                              'Different ASR clocks and frame-rounding risks are review observations, not confirmed semantic errors.']}
    conditions = value.get('exportAudioConditions')
    if conditions is None or any(conditions.values()) or export_rate != 1 or any(clip.get('speed', 1) != 1 for clip in value['afterClips']):
        result.update({'status': 'unverified-unsupported-mix-or-speed', 'conditions': conditions,
                       'reason': 'Source waveform validation currently requires confirmed unmixed, unmuted native-rate audio and export rate 1.'})
        return result
    sources, identities, wav_identities = {}, [], []
    for index, source in enumerate(value['sources']):
        if sha256_file(source['file']) != source['sourceSha256']:
            raise ValueError('Original source changed since automatic analysis')
        wav = Path(source['wav']) if source.get('wav') else Path(audit_directory) / f'source-{index}.wav'
        pcm, receipt = read_clocked_pcm(wav)
        if receipt['sourceSha256'] != source['sourceSha256'] or source.get('wav') and receipt['wavSha256'] != source['audioClock']['wavSha256']:
            raise ValueError('Source-zero audio receipt does not match the automatic analysis')
        sources[source['src']] = {**source, 'audio': np.frombuffer(pcm, dtype='<i2').astype(np.float64) / 32768}
        identities.append({'src': source['src'], 'sourceSha256': source['sourceSha256'], 'wavSha256': receipt['wavSha256']})
        wav_identities.append((wav, receipt['wavSha256']))
    reference, runs, expected, projection = native_reference(value, sources)
    audio, decode = VERIFY.decode_candidate(actual_video)
    signal = VERIFY.validate_waveforms(reference, audio, runs, expected)
    if sha256_file(actual_video) != digest:
        raise ValueError('Actual export changed during validation')
    for source in value['sources']:
        if sha256_file(source['file']) != source['sourceSha256']:
            raise ValueError('Original source changed during validation')
    for wav, expected_sha in wav_identities:
        if sha256_file(wav) != expected_sha:
            raise ValueError('Clocked source audio changed during export validation')
    result.update({'status': signal['status'], 'identities': identities, 'signalValidation': signal,
                   'frameProjection': projection,
                   'decode': {key: value for key, value in decode.items() if key != 'decoder'},
                   'projectionBasis': 'MultiClipVideo trimBefore/trimAfter and placeClips frame rounding, native clip and export rate 1'})
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('audit_input', type=Path)
    parser.add_argument('actual_video', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--export-rate', type=float, default=1)
    args = parser.parse_args()
    if args.output.exists():
        parser.error('Refusing to overwrite existing export evidence')
    try:
        input_bytes = args.audit_input.read_bytes()
        value = json.loads(input_bytes.decode('utf8'))
        result = verify_export(value, args.audit_input.parent, args.actual_video, args.export_rate)
        if args.audit_input.read_bytes() != input_bytes:
            raise ValueError('Automatic audit input changed during export validation')
        result['auditInputSha256'] = hashlib.sha256(input_bytes).hexdigest()
    except Exception as error:
        result = {'version': 'retake-actual-export-signal-v1', 'status': 'blocked', 'reason': str(error),
                  'editorialAcceptance': False, 'listeningPerformed': False}
    with args.output.open('x', encoding='utf8') as file:
        json.dump(result, file, ensure_ascii=False, indent=2, allow_nan=False)
    print(json.dumps({'status': result['status'], 'report': str(args.output)}))
    return 0 if result['status'] == 'signal-preservation-verified-with-scope-limits' else 1


if __name__ == '__main__':
    raise SystemExit(main())
