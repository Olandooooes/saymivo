"""One source-video clock for local ASR and VAD. No model is loaded here."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import wave
from fractions import Fraction

ROOT = Path(__file__).resolve().parent.parent
CLOCK = json.loads(Path(__file__).with_name('source-audio-clock.json').read_text())


def sha256_file(file):
    digest = hashlib.sha256()
    with open(file, 'rb') as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def media_tool(name):
    explicit = os.environ.get('KOUBO_' + name.upper())
    found = explicit or shutil.which(name)
    if not found and (ROOT / '.tools' / 'bin' / name).is_file():
        found = str(ROOT / '.tools' / 'bin' / name)
    if not found and name == 'ffprobe':
        candidates = list((ROOT / 'node_modules' / '@remotion').glob('compositor-*/ffprobe'))
        if len(candidates) == 1:
            found = str(candidates[0])
    if not found:
        raise FileNotFoundError(name + ' is required to preserve the source audio clock')
    env = os.environ.copy()
    directory = str(Path(found).resolve().parent)
    for key in ['DYLD_LIBRARY_PATH', 'LD_LIBRARY_PATH']:
        env[key] = directory + (os.pathsep + env[key] if env.get(key) else '')
    return found, env


def stream_start(stream):
    if stream.get('start_pts') is not None and stream.get('time_base'):
        return Fraction(str(stream['start_pts'])) * Fraction(stream['time_base'])
    if stream.get('start_time') not in [None, 'N/A']:
        return Fraction(stream['start_time'])
    raise ValueError('Source stream has no presentation timestamp origin')


def probe_clock(source):
    executable, env = media_tool('ffprobe')
    result = subprocess.run([executable, '-v', 'error', '-show_streams', '-show_format',
                             '-of', 'json', str(source)], capture_output=True, check=True,
                            text=True, env=env)
    data = json.loads(result.stdout)
    audio = next((s for s in data['streams'] if s['codec_type'] == 'audio'), None)
    video = next((s for s in data['streams'] if s['codec_type'] == 'video'), None)
    if not audio:
        raise ValueError('Source has no audio stream')
    # Video inSec/outSec are measured from its first video frame.
    origin = stream_start(video) if video else Fraction(data['format'].get('start_time', '0'))
    audio_start = stream_start(audio)
    return origin, audio_start, {
        'videoStreamIndex': video['index'] if video else None,
        'audioStreamIndex': audio['index'],
        'sourceOriginSec': float(origin),
        'sourceOriginBasis': 'first-video-pts' if video else 'container-start',
        'audioFirstPtsSec': float(audio_start),
        'audioOffsetFromVideoMs': float((audio_start - origin) * 1000),
    }


def extract_source_audio(source, output, limit_sec=None):
    source, output = Path(source).resolve(), Path(output).resolve()
    receipt_file = Path(str(output) + '.clock.json')
    if output.exists() or receipt_file.exists():
        raise FileExistsError('Refusing to overwrite an existing audio extraction: ' + str(output))
    if limit_sec is not None and limit_sec <= 0:
        raise ValueError('Audio extraction limit must be positive')
    origin, audio_start, observed = probe_clock(source)
    digest = sha256_file(source)
    output.parent.mkdir(parents=True, exist_ok=True)
    executable, env = media_tool('ffmpeg')
    # Preserve original PTS, subtract VIDEO origin once, then pad/trim at sample 0.
    # PTS-STARTPTS would discard precisely the audio delay we need to retain.
    audio_filter = ('asetpts=PTS-(' + str(origin.numerator) + '/' + str(origin.denominator)
                    + ')/TB,aresample=16000:first_pts=0')
    temporary = tempfile.NamedTemporaryFile(prefix='.source-zero-', suffix='.wav', dir=output.parent, delete=False)
    working = Path(temporary.name)
    temporary.close()
    args = [executable, '-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-copyts',
            '-i', str(source), '-map', '0:a:0', '-vn', '-af', audio_filter,
            '-ac', '1', '-c:a', 'pcm_s16le']
    if limit_sec is not None:
        args += ['-t', str(limit_sec)]
    published = False
    try:
        subprocess.run(args + [str(working)], capture_output=True, check=True, env=env)
        with wave.open(str(working), 'rb') as audio:
            frames = audio.getnframes()
            if (audio.getnchannels(), audio.getsampwidth(), audio.getframerate()) != (1, 2, 16000):
                raise ValueError('Expected mono 16 kHz PCM16 WAV')
        if sha256_file(source) != digest:
            raise ValueError('Source changed during audio extraction')
        receipt = {
            **CLOCK, 'sourcePath': str(source), 'sourceSha256': digest,
            'wavSha256': sha256_file(working), 'wavBytes': working.stat().st_size,
            'sampleCount': frames, 'durationSec': frames / 16000,
            'expectedLeadingPaddingSamples': max(0, round(float(audio_start - origin) * 16000)),
            'extractionFilter': audio_filter, 'limitSec': limit_sec, **observed,
        }
        # Publish only after a complete decode. link() is atomic and refuses an
        # existing target, including one published by another extraction process.
        os.link(working, output)
        published = True
        with receipt_file.open('x', encoding='utf8') as target:
            json.dump(receipt, target, ensure_ascii=False, indent=2)
        return receipt
    except Exception:
        if published:
            output.unlink(missing_ok=True)
        raise
    finally:
        working.unlink(missing_ok=True)


def read_clocked_pcm(wav):
    wav = Path(wav)
    receipt = json.loads(Path(str(wav) + '.clock.json').read_text(encoding='utf8'))
    if any(receipt.get(key) != value for key, value in CLOCK.items()):
        raise ValueError('Audio clock receipt does not match the source-zero extraction version')
    if receipt.get('wavSha256') != sha256_file(wav) or not receipt.get('sourceSha256'):
        raise ValueError('Audio clock receipt does not match the WAV/source bytes')
    if receipt.get('limitSec') is not None:
        raise ValueError('Recognition requires the complete source-zero audio extraction')
    with wave.open(str(wav), 'rb') as audio:
        if (audio.getnchannels(), audio.getsampwidth(), audio.getframerate()) != (1, 2, 16000):
            raise ValueError('Expected mono 16 kHz PCM16 WAV')
        if audio.getnframes() != receipt['sampleCount']:
            raise ValueError('Audio sample count does not match clock receipt')
        return audio.readframes(audio.getnframes()), receipt


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('source')
    parser.add_argument('output')
    parser.add_argument('--limit-sec', type=float)
    args = parser.parse_args()
    print(json.dumps(extract_source_audio(args.source, args.output, args.limit_sec)))
