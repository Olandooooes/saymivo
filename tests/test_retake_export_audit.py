import importlib.util
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
import json

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'scripts'))
SPEC = importlib.util.spec_from_file_location('retake_export_audit', ROOT / 'scripts' / 'verify-retake-export.py')
EXPORT = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(EXPORT)
from source_audio import CLOCK, sha256_file
from retake_render_audit import write_wave


class ExportAudit(unittest.TestCase):
    def test_native_projection_uses_player_frames_without_a_hand_authored_edl(self):
        value = {'fps': 30, 'afterClips': [
            {'id': 'a', 'src': 'synthetic', 'inSec': .12, 'outSec': .73, 'speed': 1},
            {'id': 'b', 'src': 'synthetic', 'inSec': 1.11, 'outSec': 1.54, 'speed': 1}]}
        sources = {'synthetic': {'audio': np.zeros(32000), 'words': [{'word': '边缘', 'startMs': 125, 'endMs': 140}]}}
        _, runs, total, projection = EXPORT.native_reference(value, sources)
        self.assertEqual(projection[0]['trimBeforeFrame'], 4)
        self.assertEqual(projection[0]['durationInFrames'], 18)
        self.assertEqual(projection[1]['fromFrame'], 18)
        self.assertEqual(total, round(31 / 30 * 16000))
        self.assertEqual(runs[1]['expectedOutputStartSample'], 9600)
        self.assertEqual(len(projection[0]['frameRoundingObservationRisks']), 1)

    def test_baked_speed_or_mixed_audio_is_explicitly_unverified(self):
        with tempfile.TemporaryDirectory() as temporary:
            video = Path(temporary) / 'actual.mp4'
            video.write_bytes(b'synthetic bytes; no decoder should run')
            base = {'source': 'automatic-retake-result', 'analysisSha256': 'a' * 64, 'afterClips': [{'speed': 1}],
                    'exportAudioConditions': {'musicPresent': False}}
            self.assertEqual(EXPORT.verify_export(base, temporary, video, 1.25)['status'], 'unverified-unsupported-mix-or-speed')
            self.assertEqual(EXPORT.verify_export({**base, 'exportAudioConditions': {'musicPresent': True}}, temporary, video)['status'], 'unverified-unsupported-mix-or-speed')

    def test_actual_decoded_export_is_checked_against_frame_mapped_source_not_a_reference_file_name(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            original, actual, wav = directory / 'original.mp4', directory / 'actual.mp4', directory / 'source.wav'
            original.write_bytes(b'synthetic source identity')
            actual.write_bytes(b'synthetic export identity; decoder substituted in test')
            audio = np.random.default_rng(129).normal(0, .06, 32000)
            write_wave(wav, audio)
            receipt = {**CLOCK, 'sourceSha256': sha256_file(original), 'wavSha256': sha256_file(wav),
                       'sampleCount': len(audio), 'limitSec': None}
            Path(str(wav) + '.clock.json').write_text(json.dumps(receipt))
            value = {'source': 'automatic-retake-result', 'analysisSha256': 'a' * 64, 'fps': 10,
                     'afterClips': [{'id': 'a', 'src': 'synthetic', 'inSec': .1, 'outSec': 1.5, 'speed': 1}],
                     'exportAudioConditions': {'musicPresent': False, 'nonDefaultClipAudio': False, 'replacementAudio': False},
                     'sources': [{'src': 'synthetic', 'file': str(original), 'wav': str(wav), 'audioClock': receipt,
                                  'sourceSha256': receipt['sourceSha256'],
                                  'words': [{'word': '首词', 'startMs': 100, 'endMs': 300}, {'word': '尾词', 'startMs': 1300, 'endMs': 1480}]}]}
            pcm, _ = EXPORT.read_clocked_pcm(wav)
            candidate = np.frombuffer(pcm, dtype='<i2').astype(float)[1600:24000] / 32768
            with patch.object(EXPORT.VERIFY, 'decode_candidate', return_value=(candidate, {'decodedPcmSha256': 'test'})):
                result = EXPORT.verify_export(value, directory, actual)
                self.assertEqual(result['status'], 'signal-preservation-verified-with-scope-limits')
                self.assertFalse(result['listeningPerformed'])
            missing = candidate.copy()
            missing[:1280] = 0
            with patch.object(EXPORT.VERIFY, 'decode_candidate', return_value=(missing, {})):
                self.assertEqual(EXPORT.verify_export(value, directory, actual)['status'], 'failed')


if __name__ == '__main__':
    unittest.main()
