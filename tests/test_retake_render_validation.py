"""Synthetic signal regressions; no private media, ASR, or model invocation."""
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
import wave

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'scripts'))
SPEC = importlib.util.spec_from_file_location('retake_render_validation', ROOT / 'scripts' / 'verify-retake-render.py')
VERIFY = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(VERIFY)
from source_audio import CLOCK, sha256_file


class RenderValidation(unittest.TestCase):
    def setUp(self):
        rng = np.random.default_rng(801)
        # Distinct, band-limited speech-like signal with energetic word onsets.
        noise = rng.normal(0, 1, 8 * VERIFY.RATE)
        self.source = np.convolve(noise, np.ones(5) / 5, mode='same') * .15
        self.report = {'range': [0., 8.], 'proposals': [
            {'first': 2, 'last': 2, 'startSec': 2., 'endSec': 3.}]}
        self.units = {'range': [0., 8.], 'words': [
            {'id': 0, 'startMs': 0, 'endMs': 160},
            {'id': 1, 'startMs': 1600, 'endMs': 1800},
            {'id': 2, 'startMs': 2100, 'endMs': 2800},
            {'id': 3, 'startMs': 3000, 'endMs': 3400},
            {'id': 4, 'startMs': 7600, 'endMs': 7900}]}
        self.runs, self.expected = VERIFY.derive_plan(self.report, self.units, len(self.source))
        self.good = np.concatenate([self.source[:32000], self.source[48000:]])

    def test_preserved_runs_and_small_codec_padding_pass(self):
        padded = np.concatenate([np.zeros(160), self.good, np.zeros(160)])
        result = VERIFY.validate_waveforms(self.source, padded, self.runs, self.expected)
        self.assertEqual(result['failures'], [])
        self.assertEqual(len(result['retainedRuns']), 2)
        for run in result['retainedRuns']:
            self.assertAlmostEqual(run['alignmentShiftSamples'], 160)
            self.assertTrue(any(c['kind'] == 'first-retained-word-neighborhood' for c in run['checks']))
            self.assertTrue(any(c['kind'] == 'last-retained-word-neighborhood' for c in run['checks']))

    def test_missing_80ms_onset_is_caught_despite_high_global_correlation(self):
        clipped = self.good.copy()
        clipped[32000:33280] = 0  # first 80ms of retained word in second run
        self.assertGreater(np.corrcoef(self.good, clipped)[0, 1], .99)
        result = VERIFY.validate_waveforms(self.source, clipped, self.runs, self.expected)
        self.assertEqual(result['status'], 'failed')
        self.assertTrue(any(f.get('kind') == 'first-retained-word-neighborhood' and
                            f.get('wordId') == 3 for f in result['failures']))

    def test_wrong_internal_deletion_is_caught(self):
        wrong = self.good.copy()
        # Same duration and boundary words preserved; wrong internal content must fail.
        wrong[64000:67200] = self.source[34000:37200]
        result = VERIFY.validate_waveforms(self.source, wrong, self.runs, self.expected)
        self.assertEqual(result['status'], 'failed')
        self.assertTrue(any(f.get('kind') == 'retained-run' for f in result['failures']))

    def test_shared_subsample_codec_phase_is_not_misread_as_deletion(self):
        shifted = VERIFY.fractional_samples(np.pad(self.good, (160, 160)), -1 / 3)
        result = VERIFY.validate_waveforms(self.source, shifted, self.runs, self.expected)
        self.assertEqual(result['failures'], [])
        for run in result['retainedRuns']:
            self.assertAlmostEqual(run['alignmentShiftSamples'], 160 + 1 / 3, places=3)

    def test_observed_word_clipped_by_plan_is_rejected_before_decode(self):
        self.report['proposals'][0]['endSec'] = 3.08
        with self.assertRaisesRegex(ValueError, 'retained word ID 3'):
            VERIFY.derive_plan(self.report, self.units, len(self.source))

    def test_silence_is_explicitly_unverified(self):
        silent = np.zeros_like(self.source)
        result = VERIFY.validate_waveforms(silent, np.zeros_like(self.good), self.runs, self.expected)
        self.assertTrue(result['unverifiedWindows'])
        self.assertTrue(all(r['status'] == 'unverified' for r in result['retainedRuns']))
        # A lack of evidence must not turn into a preservation pass.
        self.assertEqual(result['status'], 'unverified')

    def test_duration_loss_is_reported(self):
        result = VERIFY.validate_waveforms(self.source, self.good[:-1600], self.runs, self.expected)
        self.assertTrue(any(f.get('reason') == 'decoded-duration-drift-exceeds-60ms' for f in result['failures']))

    def test_shared_no_edit_distortion_does_not_excuse_clipped_onset(self):
        clipped = self.good.copy()
        clipped[32000:33280] = 0
        result = VERIFY.validate_waveforms(self.source, clipped, self.runs, self.expected)
        control = self.source.copy()
        # Even a corrupted supplied no-edit control cannot approve clipped audio.
        control[48000:49280] = 0
        diagnosis = VERIFY.compare_no_edit_control(self.source, clipped, control, self.units, result)
        self.assertFalse(diagnosis['changesCandidateAcceptance'])
        self.assertEqual(result['status'], 'failed')
        self.assertTrue(any(d['classification'] == 'same-source-window-also-fails-without-edits'
                            for d in diagnosis['failedWindowDiagnostics']))

    def test_audit_graph_must_match_report_and_allow_no_extra_filters(self):
        graph = ('[0:v]trim=start=0:end=2,setpts=PTS-STARTPTS[v0];'
                 '[0:a]atrim=start=0:end=2,asetpts=PTS-STARTPTS[a0];'
                 '[0:v]trim=start=3:end=8,setpts=PTS-STARTPTS[v1];'
                 '[0:a]atrim=start=3:end=8,asetpts=PTS-STARTPTS[a1];'
                 '[v0][a0][v1][a1]concat=n=2:v=1:a=1[v][a]')
        VERIFY.verify_preview_filter_graph(graph, self.runs)
        with self.assertRaisesRegex(ValueError, 'differs from report'):
            VERIFY.verify_preview_filter_graph(graph.replace('start=3', 'start=3.08'), self.runs)
        with self.assertRaisesRegex(ValueError, 'expected trim'):
            VERIFY.verify_preview_filter_graph(graph + ';anullsrc', self.runs)

    def test_different_source_receipt_blocks_before_candidate_decode(self):
        with tempfile.TemporaryDirectory(prefix='retake-validation-fixture-') as temporary:
            directory = Path(temporary)
            wav_path = directory / 'source.wav'
            with wave.open(str(wav_path), 'wb') as wav:
                wav.setparams((1, 2, VERIFY.RATE, 0, 'NONE', 'not compressed'))
                wav.writeframes((self.source * 32768).astype('<i2').tobytes())
            receipt = {**CLOCK, 'sourceSha256': '0' * 64, 'wavSha256': sha256_file(wav_path),
                       'sampleCount': len(self.source), 'limitSec': None}
            Path(str(wav_path) + '.clock.json').write_text(json.dumps(receipt))
            (directory / 'input-units.json').write_text(json.dumps({**self.units, 'clock': receipt}))
            (directory / 'report.json').write_text(json.dumps({**self.report, 'sourceSha256': '1' * 64}))
            with patch.object(VERIFY, 'decode_candidate') as decode:
                with self.assertRaisesRegex(ValueError, 'source audio SHA'):
                    VERIFY.verify_directory(directory)
                decode.assert_not_called()


if __name__ == '__main__':
    unittest.main()
