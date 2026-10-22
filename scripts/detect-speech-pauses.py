"""Source-zero local speech activity. Candidate gaps are not word validation."""
import json
import argparse
from pathlib import Path
import sys
import tempfile
from source_audio import extract_source_audio, read_clocked_pcm


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('source', nargs='?')
    parser.add_argument('--clocked-wav')
    args = parser.parse_args()
    if bool(args.source) == bool(args.clocked_wav):
        parser.error('Provide a source OR --clocked-wav with its clock receipt')
    with tempfile.TemporaryDirectory(prefix='koubo-source-zero-vad-') as temporary:
        wav = Path(args.clocked_wav) if args.clocked_wav else Path(temporary) / 'source.16k.wav'
        if not args.clocked_wav:
            extract_source_audio(args.source, wav)
        pcm, receipt = read_clocked_pcm(wav)
        import numpy as np
        from faster_whisper.vad import VadOptions, get_speech_timestamps
        audio = np.frombuffer(pcm, dtype='<i2').astype(np.float32) / 32768.0
        regions = get_speech_timestamps(audio, VadOptions(min_silence_duration_ms=650, speech_pad_ms=120))
        print(json.dumps({'durationSec': len(audio) / 16000,
            'speech': [[r['start'] / 16000, r['end'] / 16000] for r in regions],
            'audioClock': receipt, 'wavRetained': bool(args.clocked_wav)}))


if __name__ == '__main__':
    main()
