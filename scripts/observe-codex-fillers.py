"""Free local recognition of bounded audio windows; no expected text is supplied.

Run with .venv-align/bin/python for qwen, .venv/bin/python for whisper-*.
Usage: observe-codex-fillers.py INPUT_JSON OUTPUT_JSON PROVIDER
"""
import os
os.environ['HF_HUB_OFFLINE'] = '1'
os.environ['TRANSFORMERS_OFFLINE'] = '1'
import json
import math
import sys
from pathlib import Path
import numpy as np
from source_audio import read_clocked_pcm, sha256_file


def main():
    request_file, output_file, provider = sys.argv[1:4]
    request = json.loads(Path(request_file).read_text())
    root = Path(request['root']).resolve(strict=True)
    if root != Path(__file__).resolve().parent.parent or provider not in ['qwen', 'whisper-medium', 'whisper-small']:
        raise ValueError('Invalid local model root or provider')
    destination = Path(output_file)
    if destination.exists():
        raise ValueError('Refusing to reuse existing recognition output')
    sources = {}
    for source in request['sources']:
        pcm, clock = read_clocked_pcm(source['wav'])
        if clock['sourceSha256'] != source['sourceSha256']:
            raise ValueError('Source clock/SHA mismatch')
        sources[source['src']] = {'clock': clock, 'audio': np.frombuffer(pcm, dtype='<i2').astype(np.float32) / 32768}
    windows = request['windows']
    if not isinstance(windows, list) or len(windows) > 240:
        raise ValueError('Invalid bounded recognition request')
    for window in windows:
        a, b = window['range']
        if (window['src'] not in sources or not all(isinstance(t, (int, float)) and math.isfinite(t) for t in [a, b])
                or not 0 <= a < b <= len(sources[window['src']]['audio']) / 16000 or b - a > 19):
            raise ValueError('Recognition window exceeds source clock or bounded duration')
    if provider == 'qwen':
        import torch
        from qwen_asr import Qwen3ASRModel
        torch.set_num_threads(2)
        model_path = root / '.models/qwen3-asr-0.6b'
        model = Qwen3ASRModel.from_pretrained(str(model_path), dtype=torch.float32, device_map='cpu',
            max_inference_batch_size=1, max_new_tokens=512,
            forced_aligner=str(root / '.models/qwen3-forced-aligner-0.6b'),
            forced_aligner_kwargs={'dtype': torch.float32, 'device_map': 'cpu'})
        fingerprint = sha256_file(model_path / 'model.safetensors')
    else:
        from faster_whisper import WhisperModel
        model_path = root / '.models' / provider
        model = WhisperModel(str(model_path), device='cpu', compute_type='int8', cpu_threads=2, local_files_only=True)
        fingerprint = sha256_file(model_path / 'model.bin')
    observations = []
    for window in windows:
        a, b = window['range']
        waveform = sources[window['src']]['audio'][round(a * 16000):round(b * 16000)]
        if provider == 'qwen':
            # Generated text is the recognizer's own output. Forced alignment
            # positions that output; it is never a second text confirmation.
            result = model.transcribe(audio=(waveform, 16000), language='Chinese', return_time_stamps=True)[0]
            text = result.text
            words = [{'word': t.text, 'startMs': round((a + t.start_time) * 1000), 'endMs': round((a + t.end_time) * 1000)} for t in result.time_stamps]
        else:
            segments, _ = model.transcribe(waveform, language='zh', word_timestamps=True, vad_filter=False,
                beam_size=5, condition_on_previous_text=False)
            segments = list(segments)
            text = ''.join(segment.text for segment in segments)
            words = [{'word': w.word, 'startMs': round((a + w.start) * 1000), 'endMs': round((a + w.end) * 1000),
                      'probability': w.probability} for segment in segments for w in segment.words or []]
        observations.append({'windowId': window['id'], 'src': window['src'], 'range': [a, b],
                             'provider': provider, 'text': text, 'words': words})
        print('FILLER_OBSERVED', provider, window['id'], flush=True)
    result = {'version': 1, 'provider': provider, 'modelSha256': fingerprint, 'audioUploaded': False,
              'expectedTextSupplied': False, 'observations': observations}
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = Path(str(destination) + '.partial')
    with temporary.open('x') as target:
        json.dump(result, target, ensure_ascii=False, indent=2)
    try:
        os.link(temporary, destination)
    finally:
        temporary.unlink(missing_ok=True)


if __name__ == '__main__':
    main()
