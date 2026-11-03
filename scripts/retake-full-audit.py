"""Independent source-clock Whisper observations, never editing decisions."""
import os
os.environ['HF_HUB_OFFLINE'] = '1'
os.environ['TRANSFORMERS_OFFLINE'] = '1'
os.environ['HF_HUB_DISABLE_TELEMETRY'] = '1'
import hashlib
import importlib.metadata
import json
import math
from pathlib import Path
import shutil
import sys
import uuid

VERSION = 'independent-full-speech-v1'


def digest(file):
    value = hashlib.sha256()
    with Path(file).open('rb') as source:
        for block in iter(lambda: source.read(1024 * 1024), b''):
            value.update(block)
    return value.hexdigest()


def atomic(file, value):
    file = Path(file); file.parent.mkdir(parents=True, exist_ok=True)
    temporary = file.with_name(file.name + '.' + str(uuid.uuid4()) + '.tmp')
    try:
        temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2))
        os.replace(temporary, file)
    finally:
        temporary.unlink(missing_ok=True)


def core_windows(bounds, quiet, core_sec=12, overlap_sec=2):
    a, b = bounds
    if not all(math.isfinite(x) for x in bounds) or not 0 <= a < b:
        raise ValueError('Invalid source-clock range')
    edges = [a]
    while b - edges[-1] > core_sec + 4:
        previous = edges[-1]
        gaps = [(x + y) / 2 for x, y in quiet if y - x >= .10 and previous + 6 <= (x + y) / 2 <= min(b, previous + 16)]
        edges.append(min(gaps, key=lambda x: abs(x - previous - core_sec)) if gaps else previous + core_sec)
    edges.append(b)
    return [{'startSec': max(a, x - overlap_sec), 'endSec': min(b, y + overlap_sec),
             'coreStartSec': x, 'coreEndSec': y, 'kind': 'core-overlap'} for x, y in zip(edges, edges[1:])]


def canonical_words(windows, bounds):
    """Keep observed clocks; ambiguous overlaps become explicit missing evidence."""
    candidates, unresolved = [], []
    for index, window in enumerate(windows):
        for original in window['words']:
            token = dict(original, windowIndex=index)
            start, end = token['startMs'], token['endMs']
            if not all(isinstance(x, (int, float)) and math.isfinite(x) for x in [start, end]) or end <= start:
                unresolved.append({'reason': 'non-positive-observed-word', 'word': token}); continue
            center = (start + end) / 2000
            if window['coreStartSec'] <= center < window['coreEndSec'] or abs(center - bounds[1]) < .0005:
                if start < bounds[0] * 1000 - 1 or end > bounds[1] * 1000 + 1:
                    unresolved.append({'reason': 'out-of-source-range', 'word': token}); continue
                candidates.append(token)
    candidates.sort(key=lambda w: (w['startMs'], w['endMs'], w['windowIndex']))
    groups = []
    for token in candidates:
        if groups and token['startMs'] < groups[-1]['endMs']:
            groups[-1]['words'].append(token); groups[-1]['endMs'] = max(groups[-1]['endMs'], token['endMs'])
        else:
            groups.append({'startMs': token['startMs'], 'endMs': token['endMs'], 'words': [token]})
    words = []
    for group in groups:
        alternatives = group['words']
        if len(alternatives) == 1:
            words.append(alternatives[0]); continue
        # Two windows can observe the same whole token. Select one actual clock,
        # never average boundaries or split its characters into invented times.
        if len({w['word'].strip() for w in alternatives}) == 1 and all(
                min(w['endMs'], alternatives[0]['endMs']) - max(w['startMs'], alternatives[0]['startMs']) > 0 for w in alternatives):
            chosen = max(alternatives, key=lambda w: w.get('probability', 0))
            words.append(dict(chosen, corroboratingWindowIndices=[w['windowIndex'] for w in alternatives])); continue
        unresolved.append({'reason': 'conflicting-overlapping-observations', **group})
    return [dict(w, id=index) for index, w in enumerate(words)], unresolved


def cached(file, receipt_file, identity):
    try:
        receipt = json.loads(Path(receipt_file).read_text())
        if receipt['identity'] != identity or receipt['payloadSha256'] != digest(file):
            return None
        return json.loads(Path(file).read_text())
    except (OSError, ValueError, KeyError, TypeError):
        return None


def main():
    if len(sys.argv) != 3:
        raise ValueError('Usage: retake-full-audit.py INPUT_JSON OUTPUT_JSON')
    request = json.loads(Path(sys.argv[1]).read_text()); root = Path(request['root']).resolve()
    destination = Path(sys.argv[2]); threads = int(request.get('threads', 2))
    if not 1 <= threads <= 4 or not request.get('sources'):
        raise ValueError('Invalid independent observation request')
    import numpy as np
    from source_audio import read_clocked_pcm
    from faster_whisper import WhisperModel
    from faster_whisper.vad import get_speech_timestamps, VadOptions
    from faster_whisper.utils import get_assets_path
    model_dir = root / '.models/whisper-medium'
    if not (model_dir / 'model.bin').is_file():
        raise ValueError('Local Whisper medium is required; no download or cloud fallback')
    parameters = {'coreSec': 12, 'overlapSec': 2, 'threads': threads, 'beamSize': 5,
                  'conditionOnPreviousText': False, 'temperature': 0, 'vadThreshold': .35,
                  'vadMinSilenceMs': 250, 'vadMaxSpeechSec': 12, 'vadPadMs': 80}
    runtime = {}
    for package in ['faster-whisper', 'ctranslate2', 'numpy', 'onnxruntime']:
        try: runtime[package] = importlib.metadata.version(package)
        except importlib.metadata.PackageNotFoundError: runtime[package] = 'unavailable'
    fingerprints = {str(p.relative_to(root)): digest(p) for p in [Path(__file__).resolve(), root / 'scripts/source_audio.py', root / 'scripts/source-audio-clock.json']}
    model_files = {p.name: digest(p) for p in model_dir.iterdir() if p.is_file() and p.suffix in ['.bin', '.json', '.txt']}
    vad_files = {p.name: digest(p) for p in Path(get_assets_path()).glob('*.onnx')}
    model, outputs = None, []
    for source_index, source in enumerate(request['sources']):
        src = source['src']; actual = (root / 'public' / src).resolve(strict=True)
        library = (root / 'public/clips').resolve(strict=True)
        if not actual.is_relative_to(library) or actual.suffix.lower() != '.mp4':
            raise ValueError('Independent observations require a local library MP4')
        source_sha = digest(actual)
        if source_sha != source['sourceSha256']:
            raise ValueError('Changed source before independent recognition')
        pcm, clock = read_clocked_pcm(source['wav'])
        if clock['sourceSha256'] != source_sha or digest(clock['sourcePath']) != source_sha:
            raise ValueError('Source/WAV/clock identity mismatch')
        bounds = source['range']
        if len(bounds) != 2 or not 0 <= bounds[0] < bounds[1] <= clock['durationSec'] + .001:
            raise ValueError('Independent range exceeds full source clock')
        identity = {'version': VERSION, 'sourceSha256': source_sha, 'wavSha256': clock['wavSha256'], 'range': bounds,
                    'scripts': fingerprints, 'models': model_files, 'vadModels': vad_files, 'runtime': runtime, 'parameters': parameters}
        key = hashlib.sha256(json.dumps(identity, sort_keys=True).encode()).hexdigest()
        cache = root / '.auto-jobs/codex-independent-evidence' / key
        file, receipt_file = cache / 'observations.json', cache / 'receipt.json'
        observation = cached(file, receipt_file, identity)
        if observation is None:
            cache.mkdir(parents=True, exist_ok=True); lock = cache / '.lock'
            if lock.exists():
                try:
                    owner = json.loads((lock / 'owner.json').read_text()); os.kill(owner['pid'], 0)
                except ProcessLookupError: shutil.rmtree(lock)
                except (OSError, ValueError, KeyError): raise ValueError('Independent evidence cache lock cannot be verified')
                else: raise ValueError('Independent evidence cache is already being written')
            lock.mkdir(); atomic(lock / 'owner.json', {'pid': os.getpid()})
            try:
                audio = np.frombuffer(pcm, dtype='<i2').astype(np.float32) / 32768
                quiet = []
                for frame in range(round(bounds[0] * 100), round(bounds[1] * 100)):
                    block = audio[frame * 160:(frame + 1) * 160]
                    if len(block) and np.sqrt(np.mean(block ** 2)) < .008:
                        if quiet and abs(quiet[-1][1] - frame / 100) < .001: quiet[-1][1] = (frame + 1) / 100
                        else: quiet.append([frame / 100, (frame + 1) / 100])
                speech_samples = get_speech_timestamps(audio[round(bounds[0] * 16000):round(bounds[1] * 16000)],
                    VadOptions(threshold=.35, min_speech_duration_ms=0, min_silence_duration_ms=250, speech_pad_ms=80, max_speech_duration_s=12))
                speech = [[bounds[0] + s['start'] / 16000, min(bounds[1], bounds[0] + s['end'] / 16000)] for s in speech_samples]
                plans = {'core-overlap': core_windows(bounds, quiet), 'vad-isolated': [
                    {'startSec': max(bounds[0], a - .30), 'endSec': min(bounds[1], b + .30),
                     'coreStartSec': a, 'coreEndSec': b, 'kind': 'vad-isolated'} for a, b in speech]}
                if model is None:
                    model = WhisperModel(str(model_dir), device='cpu', compute_type='int8', cpu_threads=threads, local_files_only=True)
                passes = []
                total = sum(len(windows) for windows in plans.values()); completed = 0
                for pass_id, windows in plans.items():
                    for window in windows:
                        a, b = window['startSec'], window['endSec']
                        segments, _ = model.transcribe(audio[round(a * 16000):round(b * 16000)], language='zh', word_timestamps=True,
                            condition_on_previous_text=False, vad_filter=False, beam_size=5, temperature=0,
                            compression_ratio_threshold=None, log_prob_threshold=None, no_speech_threshold=None, suppress_blank=False)
                        observed, transcript = [], []
                        for segment in segments:
                            transcript.append(segment.text)
                            observed.extend({'word': w.word, 'startMs': round((a + w.start) * 1000), 'endMs': round((a + w.end) * 1000),
                                             'probability': w.probability} for w in segment.words or [])
                        window['text'] = ''.join(transcript); window['words'] = observed; completed += 1
                        print(f'PROGRESS:{5 + round(85 * completed / max(1, total))}:独立原声复查 {source_index + 1}/{len(request["sources"])} · {pass_id} {completed}/{total}', flush=True)
                    words, unresolved = canonical_words(windows, bounds)
                    passes.append({'id': pass_id, 'provider': 'whisper-medium', 'modelSha256': model_files['model.bin'], 'words': words,
                                   'unresolved': unresolved, 'windows': windows})
                if digest(actual) != source_sha or digest(source['wav']) != clock['wavSha256']:
                    raise ValueError('Source/WAV changed during independent recognition')
                observation = {'src': src, 'sourceSha256': source_sha, 'clock': clock, 'audioClock': clock, 'wav': str(Path(source['wav']).resolve()),
                    'range': bounds, 'quiet': quiet, 'speech': speech, 'provider': 'whisper-medium', 'version': VERSION,
                    'modelSha256': model_files['model.bin'], 'words': passes[0]['words'], 'unresolved': passes[0]['unresolved'],
                    'observationPasses': passes, 'audioUploaded': False, 'geminiCalled': False,
                    'limitations': ['Independent recognition can omit or hallucinate speech; observations are not editing approval']}
                atomic(file, observation); atomic(receipt_file, {'identity': identity, 'payloadSha256': digest(file)})
            finally:
                shutil.rmtree(lock, ignore_errors=True)
        if digest(actual) != source_sha:
            raise ValueError('Source changed after independent cache verification')
        outputs.append(dict(observation, src=src, wav=str(Path(source['wav']).resolve()), cache=str(cache)))
    atomic(destination, {'version': VERSION, 'audioUploaded': False, 'geminiCalled': False, 'sources': outputs})


if __name__ == '__main__':
    main()
