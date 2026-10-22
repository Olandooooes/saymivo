"""Small deterministic media regressions. Whisper/Silero are stubbed, never loaded."""
import array
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
import wave

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'scripts'))
from source_audio import CLOCK, extract_source_audio, media_tool, read_clocked_pcm, sha256_file


class SourceClockTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='koubo-clock-regression-')
        self.directory = Path(self.temporary.name)

    def tearDown(self):
        self.temporary.cleanup()

    def fixture(self, name, delay=0.213, origin=0):
        source = self.directory / (name + '.mkv')
        ffmpeg, env = media_tool('ffmpeg')
        video = '[0:v]setpts=PTS+' + str(origin) + '/TB[v]'
        audio = '[1:a]asetpts=PTS+' + str(origin + delay) + '/TB[a]'
        subprocess.run([ffmpeg, '-nostdin', '-loglevel', 'error', '-n', '-copyts',
            '-f', 'lavfi', '-i', 'color=c=black:s=16x16:r=10:d=2',
            '-f', 'lavfi', '-i', 'aevalsrc=0.25:s=16000:d=1',
            '-filter_complex', video + ';' + audio, '-map', '[v]', '-map', '[a]',
            '-c:v', 'ffv1', '-c:a', 'pcm_s16le', '-avoid_negative_ts', 'disabled', str(source)],
            capture_output=True, check=True, env=env)
        return source

    def pcm(self, wav):
        with wave.open(str(wav), 'rb') as audio:
            samples = array.array('h', audio.readframes(audio.getnframes()))
            if sys.byteorder != 'little':
                samples.byteswap()
            return samples

    def clocked(self, name='delayed'):
        source = self.fixture(name)
        wav = self.directory / (name + '.16k.wav')
        receipt = extract_source_audio(source, wav)
        return source, wav, receipt

    def test_delayed_audio_is_padded_and_receipt_is_bound_to_bytes(self):
        source, wav, receipt = self.clocked()
        samples = self.pcm(wav)
        self.assertEqual(receipt['expectedLeadingPaddingSamples'], 3408)
        self.assertEqual(samples[:3408], array.array('h', [0] * 3408))
        self.assertTrue(all(value == 8192 for value in samples[3408:]))
        self.assertEqual(len(samples), 19408)
        self.assertEqual(receipt['sourceSha256'], sha256_file(source))
        self.assertEqual(receipt['wavSha256'], sha256_file(wav))
        self.assertEqual(read_clocked_pcm(wav)[1], receipt)
        before = wav.read_bytes()
        with self.assertRaises(FileExistsError):
            extract_source_audio(source, wav)
        self.assertEqual(wav.read_bytes(), before)

    def test_zero_start_is_not_shifted_and_nonzero_video_origin_is_subtracted_once(self):
        zero = self.directory / 'zero.16k.wav'
        receipt = extract_source_audio(self.fixture('zero', delay=0), zero)
        self.assertEqual(receipt['expectedLeadingPaddingSamples'], 0)
        self.assertEqual(self.pcm(zero), array.array('h', [8192] * 16000))
        shifted = self.directory / 'offset.16k.wav'
        receipt = extract_source_audio(self.fixture('offset', origin=5), shifted)
        self.assertEqual(receipt['sourceOriginSec'], 5)
        self.assertEqual(receipt['audioOffsetFromVideoMs'], 213)
        self.assertEqual(self.pcm(shifted), array.array('h', [0] * 3408 + [8192] * 16000))

    def stub_environment(self):
        package = self.directory / 'stubs' / 'faster_whisper'
        package.mkdir(parents=True)
        (package / '__init__.py').write_text('''from types import SimpleNamespace
class WhisperModel:
 def __init__(self,*args,**kwargs):pass
 def transcribe(self,audio,**kwargs):
  assert len(audio)==19408
  assert not audio[:3408].any()
  return [SimpleNamespace(words=[SimpleNamespace(word="测试",start=.213,end=.713)])],None
''')
        (package / 'vad.py').write_text('''class VadOptions:
 def __init__(self,**kwargs):pass
def get_speech_timestamps(audio,options):
 assert len(audio)==19408
 assert not audio[:3408].any()
 return [{"start":3408,"end":11408}]
''')
        return {**os.environ, 'PYTHONPATH': str(package.parent), 'AUTOBROLL_MODEL': 'fixture-no-model'}

    def test_recognizer_and_vad_use_same_clock_and_never_rebase_recognized_words(self):
        source, wav, receipt = self.clocked()
        env = self.stub_environment()
        output = self.directory / 'transcripts'
        result = subprocess.run([sys.executable, str(ROOT / 'scripts/transcribe-local.py'),
                                 str(output), str(wav)], capture_output=True, text=True, env=env)
        self.assertEqual(result.returncode, 0, result.stderr)
        raw = output / 'delayed.json'
        self.assertEqual(json.loads(raw.read_text()), [{'word': '测试', 'startMs': 213, 'endMs': 713}])
        metadata = json.loads((output / 'delayed.meta.json').read_text())
        self.assertEqual(metadata['audioClock'], receipt)
        self.assertEqual(metadata['sourceSha256'], sha256_file(source))
        self.assertEqual(metadata['recognitionSha256'], sha256_file(raw))
        before = raw.read_bytes()
        duplicate = subprocess.run([sys.executable, str(ROOT / 'scripts/transcribe-local.py'),
                                   str(output), str(wav)], capture_output=True, text=True, env=env)
        self.assertNotEqual(duplicate.returncode, 0)
        self.assertIn('Refusing to overwrite', duplicate.stderr)
        self.assertEqual(raw.read_bytes(), before)
        vad = subprocess.run([sys.executable, str(ROOT / 'scripts/detect-speech-pauses.py'),
                              str(source)], capture_output=True, text=True, env=env)
        self.assertEqual(vad.returncode, 0, vad.stderr)
        regions = json.loads(vad.stdout)
        self.assertEqual(regions['speech'], [[.213, .713]])
        self.assertEqual(regions['durationSec'], 19408 / 16000)
        self.assertEqual(regions['audioClock']['wavSha256'], receipt['wavSha256'])
        self.assertEqual(regions['audioClock']['version'], CLOCK['version'])
        clocked_vad = subprocess.run([sys.executable, str(ROOT / 'scripts/detect-speech-pauses.py'),
                                     '--clocked-wav', str(wav)], capture_output=True, text=True, env=env)
        self.assertEqual(clocked_vad.returncode, 0, clocked_vad.stderr)
        clocked_regions = json.loads(clocked_vad.stdout)
        self.assertEqual(clocked_regions['speech'], regions['speech'])
        self.assertEqual(clocked_regions['audioClock'], receipt)
        self.assertTrue(clocked_regions['wavRetained'])

    def test_unclocked_or_tampered_audio_fails_before_model_import(self):
        source, wav, receipt = self.clocked()
        package = self.directory / 'fail-import' / 'faster_whisper'
        package.mkdir(parents=True)
        (package / '__init__.py').write_text('raise RuntimeError("MODEL_IMPORT_MUST_NOT_HAPPEN")')
        env = {**os.environ, 'PYTHONPATH': str(package.parent)}
        receipt_path = Path(str(wav) + '.clock.json')
        for broken in [None, {**receipt, 'wavSha256': '0' * 64}, {**receipt, 'version': 'legacy'}]:
            if broken is None:
                receipt_path.unlink()
            else:
                receipt_path.write_text(json.dumps(broken))
            result = subprocess.run([sys.executable, str(ROOT / 'scripts/transcribe-local.py'),
                                     str(self.directory / 'out'), str(wav)],
                                     capture_output=True, text=True, env=env)
            self.assertNotEqual(result.returncode, 0)
            self.assertNotIn('MODEL_IMPORT_MUST_NOT_HAPPEN', result.stderr)


if __name__ == '__main__':
    unittest.main()
