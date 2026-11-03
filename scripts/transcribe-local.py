"""Transcribe immutable, clocked source-zero WAVs without rebasing model times."""
import hashlib
import json
import os
from pathlib import Path
import sys
from source_audio import read_clocked_pcm


def main():
    output_dir = Path(sys.argv[1])
    output_dir.mkdir(parents=True, exist_ok=True)
    inputs = []
    for wav in sys.argv[2:]:
        key = Path(wav).stem.removesuffix('.16k')
        target = output_dir / (key + '.json')
        meta = output_dir / (key + '.meta.json')
        if target.exists() or meta.exists():
            raise FileExistsError('Refusing to overwrite recognition cache: ' + str(target))
        pcm, receipt = read_clocked_pcm(wav)
        inputs.append((pcm, receipt, target, meta))
    if not inputs:
        return
    # Validate all inputs BEFORE importing or loading a model.
    import numpy as np
    from faster_whisper import WhisperModel
    local_models = [Path(__file__).resolve().parent.parent / '.models' / ('whisper-' + size)
                    for size in ['medium', 'small']]
    model_name = os.environ.get('AUTOBROLL_MODEL') or next(
        (str(p) for p in local_models if (p / 'model.bin').exists()), 'small')
    model = WhisperModel(model_name, device='cpu', compute_type='int8', cpu_threads=2,
                         local_files_only=os.path.isdir(model_name))
    for pcm, receipt, target, meta in inputs:
        audio = np.frombuffer(pcm, dtype='<i2').astype(np.float32) / 32768.0
        segments, _ = model.transcribe(audio, language=os.environ.get('AUTOBROLL_LANGUAGE', 'zh'),
            word_timestamps=True, vad_filter=True, beam_size=5, condition_on_previous_text=False,
            initial_prompt=os.environ.get('AUTOBROLL_PROMPT', '普通话口播，准确识别中文和英文术语。'))
        words = [{'word': w.word.strip(), 'startMs': round(w.start * 1000),
                  'endMs': round(w.end * 1000), 'spaceBefore': bool(w.word[:1].isspace())} for segment in segments
                 for w in segment.words or [] if w.word.strip()]
        content = json.dumps(words, ensure_ascii=False)
        metadata = {'engine': 'faster-whisper', 'recognizerVersion': 'faster-whisper-v3',
            'model': model_name, 'wordTimestamps': True, 'conditionOnPreviousText': False,
            'beamSize': 5, 'audioUploaded': False, 'sourceSha256': receipt['sourceSha256'],
            'audioClock': receipt, 'recognitionSha256': hashlib.sha256(content.encode('utf8')).hexdigest()}
        # Exclusive creation preserves both legacy caches and concurrent results.
        with meta.open('x', encoding='utf8') as output:
            json.dump(metadata, output, ensure_ascii=False)
        with target.open('x', encoding='utf8') as output:
            output.write(content)


if __name__ == '__main__':
    main()
