"""Independent local full-window recognition; expected text is never prompted."""
import json
import os
from pathlib import Path
import subprocess
import sys

from retake_confirmation import CONFIRMATION_VERSION, compare_complete_window, confirm_candidate
from source_audio import read_clocked_pcm, sha256_file


def atomic_json(file, value):
    temporary = file.with_name(file.name + '.tmp-' + str(os.getpid()))
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False))
    temporary.replace(file)


def acoustic_clock(value):
    # Content-identical library aliases can have a different sourcePath.
    return {key: val for key, val in value.items() if key != 'sourcePath'}


def recognizer_family(provider):
    name = str(provider).lower()
    if 'whisper' in name:
        return 'whisper-medium'
    if 'qwen' in name:
        return 'qwen'
    return None


def main():
    os.environ['HF_HUB_OFFLINE'] = '1'
    os.environ['TRANSFORMERS_OFFLINE'] = '1'
    os.environ['OMP_NUM_THREADS'] = '4'
    import numpy as np
    input_file, output_file = map(Path, sys.argv[1:3])
    request = json.loads(input_file.read_text())
    root = Path(request['root']).resolve()
    public = Path(os.environ.get('KOUBO_PUBLIC_DIR', root / 'public')).resolve()
    provider = request.get('confirmationProvider', 'whisper-medium')
    if provider not in ['qwen', 'whisper-medium']:
        raise ValueError('Unsupported independent free recognizer')
    sources, receipts = {}, []
    for source in request['sources']:
        src = source['src']
        if src in sources:
            raise ValueError('Duplicate source identity')
        original = (public / src).resolve()
        if not original.is_relative_to((public / 'clips').resolve()) or sha256_file(original) != source['sourceSha256']:
            raise ValueError('Original video identity changed')
        pcm, clock = read_clocked_pcm(source['wav'])
        if (clock['sourceSha256'] != source['sourceSha256']
                or acoustic_clock(source.get('audioClock', source.get('clock', {}))) != acoustic_clock(clock)):
            raise ValueError('Changed source-zero audio clock')
        audio = np.frombuffer(pcm, dtype='<i2').astype(np.float32) / 32768
        sources[src] = {'source': source, 'audio': audio, 'original': original, 'clock': clock}
        receipts.append({'src': src, 'sourceSha256': source['sourceSha256'], 'wavSha256': clock['wavSha256'],
                         'wavClockSha256': sha256_file(source['wav'] + '.clock.json'), 'audioClock': clock,
                         'recognitionProvider': source.get('provider'), 'expectedTextSupplied': False})
    # One local free-ASR model for all candidates; shared audio windows are read
    # once. No transcript, hotwords or expected text enters either model call.
    if provider == 'qwen':
        import torch
        from qwen_asr import Qwen3ASRModel
        torch.set_num_threads(4)
        model = Qwen3ASRModel.from_pretrained(str(root / '.models/qwen3-asr-0.6b'), dtype=torch.float32,
            device_map='cpu', max_inference_batch_size=1, max_new_tokens=512, local_files_only=True)
        weights = root / '.models/qwen3-asr-0.6b/model.safetensors'
    else:
        from faster_whisper import WhisperModel
        model = WhisperModel(str(root / '.models/whisper-medium'), device='cpu', compute_type='int8',
                             cpu_threads=4, local_files_only=True)
        weights = root / '.models/whisper-medium/model.bin'
    model_sha256 = sha256_file(weights)
    results, cache = [], {}
    payload = {'version': CONFIRMATION_VERSION, 'status': 'running', 'provider': provider,
               'modelSha256': model_sha256, 'audioUploaded': False, 'geminiCalled': False,
               'expectedTextSupplied': False, 'comparison': 'complete actual source-window text equality',
               'sources': receipts, 'candidates': results}
    atomic_json(output_file, payload)
    for candidate in request['candidates']:
        record = sources.get(candidate.get('src'))
        if not record:
            result = {'id': candidate.get('id'), 'confirmed': False, 'reason': 'missing-source', 'expectedTextSupplied': False}
        elif recognizer_family(record['source'].get('provider')) in [None, provider]:
            result = {'id': candidate.get('id'), 'confirmed': False, 'reason': 'free-recognizer-not-independent', 'expectedTextSupplied': False}
        else:
            audio, source = record['audio'], record['source']

            def recognize(a, b):
                if a < 0 or b > len(audio) / 16000 + .001 or b <= a:
                    raise ValueError('Free recognition window exceeds complete source-zero WAV')
                window = audio[round(a * 16000):round(b * 16000)]
                if provider == 'qwen':
                    observed = model.transcribe(audio=(window, 16000), language='Chinese', return_time_stamps=False)[0]
                    return {'text': observed.text, 'words': [], 'provider': provider, 'modelSha256': model_sha256, 'expectedTextSupplied': False}
                segments, _ = model.transcribe(window, language='zh', word_timestamps=True, vad_filter=False,
                    beam_size=5, condition_on_previous_text=False, temperature=0)
                segments = list(segments)
                words = [{'word': word.word, 'startMs': round((a + word.start) * 1000, 3),
                          'endMs': round((a + word.end) * 1000, 3), 'probability': word.probability}
                         for segment in segments for word in segment.words or []]
                # Full free recognition may contain a filler absent from its
                # timed word array. Never erase that textual observation.
                return {'text': ''.join(segment.text for segment in segments), 'words': words, 'provider': provider,
                        'modelSha256': model_sha256, 'expectedTextSupplied': False}

            result = confirm_candidate(candidate, source, recognize, cache)
        result.update({'provider': provider, 'modelSha256': model_sha256, 'expectedTextSupplied': False})
        results.append(result)
        atomic_json(output_file, payload)
        print('OBSERVED', candidate.get('id'), flush=True)
    # The existing OpenCC install lives in .venv. Run one independent batch in
    # that interpreter; never import another environment through sys.path.
    comparison_rows = [(result, side, observation) for result in results
                       for side, observation in result.get('observations', {}).items()
                       if observation.get('ready') and isinstance(observation.get('text'), str)]
    if comparison_rows:
        texts = [text for _, _, observation in comparison_rows for text in [observation['expectedText'], observation['text']]]
        converted = subprocess.run([str(root / '.venv/bin/python'), str(root / 'scripts/normalize-retake-comparison.py')],
            input=json.dumps({'texts': texts}, ensure_ascii=False), capture_output=True, text=True, check=True, timeout=60)
        conversion = json.loads(converted.stdout)
        if (len(conversion.get('texts', [])) != len(texts)
                or conversion.get('normalization', {}).get('version') != 'opencc-t2s-comparison-v1'
                or conversion['normalization'].get('rawRecognitionChanged') is not False):
            raise ValueError('Incomplete comparison-only normalization receipt')
        for index, (result, side, observation) in enumerate(comparison_rows):
            copies = conversion['texts'][index * 2:index * 2 + 2]
            result['observations'][side] = {**observation, **compare_complete_window(
                observation['expectedText'], observation['text'], copies, conversion['normalization'])}
        payload['comparisonNormalization'] = conversion['normalization']
        for result in results:
            if result.get('observations'):
                result['confirmed'] = all(observation.get('confirmed') is True for observation in result['observations'].values())
                result['reason'] = 'both-complete-free-windows-confirmed' if result['confirmed'] else 'complete-free-window-not-confirmed'
    for record in sources.values():
        source = record['source']
        if (sha256_file(record['original']) != source['sourceSha256']
                or sha256_file(source['wav']) != record['clock']['wavSha256']
                or sha256_file(source['wav'] + '.clock.json') != next(r['wavClockSha256'] for r in receipts if r['src'] == source['src'])):
            raise ValueError('Source/video/WAV clock changed during independent recognition')
    payload['status'] = 'complete'
    atomic_json(output_file, payload)
    for result in results:
        print('CONFIRMED', result.get('id'), result['confirmed'], flush=True)


if __name__ == '__main__':
    main()
