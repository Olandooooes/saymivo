"""Synthetic complete-timeline audio audit tests; no model or private speech."""
import importlib.util
import hashlib
import json
from pathlib import Path
import sys
import subprocess
import tempfile
import unittest

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'scripts'))
SPEC = importlib.util.spec_from_file_location('retake_full_audio_audit', ROOT / 'scripts' / 'retake_render_audit.py')
AUDIT = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(AUDIT)
from source_audio import extract_source_audio, sha256_file, media_tool


def clip(identity, a, b):
    return {'id': identity, 'src': 'clips/synthetic.mp4', 'inSec': a, 'outSec': b, 'speed': 1, 'sourceDurationSec': 4}


class FullAudioAudit(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='retake-full-audit-test-')
        self.directory = Path(self.temporary.name)
        random = np.random.default_rng(56)
        self.audio = np.convolve(random.normal(0, 1, 4 * AUDIT.RATE), np.ones(5) / 5, mode='same') * .12
        self.audio[24000:25600] = 0  # an existing 100ms silent retained fragment
        self.audio[32000:44800] = 0  # a remaining 800ms pause
        self.words = [{'word': '合成', 'startMs': a, 'endMs': b} for a, b in
                      [(100, 400), (650, 750), (850, 1150), (1800, 1900), (3000, 3400), (3600, 3900)]]

    def tearDown(self):
        self.temporary.cleanup()

    def test_full_audio_preserves_existing_pause_cuts_and_flags_silent_fragment_as_rhythm_only(self):
        source_audio, source = self.directory / 'synthetic.wav', self.directory / 'synthetic.mkv'
        AUDIT.write_wave(source_audio, self.audio)
        executable, env = media_tool('ffmpeg')
        subprocess.run([executable, '-nostdin', '-v', 'error', '-f', 'lavfi', '-i',
                        'color=c=black:s=16x16:r=25:d=4', '-i', str(source_audio),
                        '-c:v', 'ffv1', '-c:a', 'pcm_s16le', str(source)],
                       capture_output=True, check=True, env=env, timeout=30)
        clocked = self.directory / 'clocked.wav'
        clock = extract_source_audio(source, clocked)
        before = [clip('first', 0, 1.2), clip('short', 1.5, 1.6), clip('last', 1.8, 4)]
        after = [clip('first', 0, .6), clip('first-retake1', .8, 1.2), *before[1:]]
        value = {'version': 1, 'source': 'automatic-retake-result', 'jobId': 'synthetic', 'fps': 30,
                 'analysisSha256': 'a' * 64, 'evidenceSha256': 'b' * 64, 'beforeClips': before, 'afterClips': after,
                 'retainedClipIds': {'first': ['first', 'first-retake1'], 'short': ['short'], 'last': ['last']},
                 'appliedCandidateIds': ['automatic'],
                 'automaticRemoveParts': [{'clipId': 'first', 'src': before[0]['src'], 'startSec': .6, 'endSec': .8, 'text': '合成测试'}],
                 'sources': [{'src': before[0]['src'], 'file': str(source),
                 'sourceSha256': sha256_file(source), 'wav': str(clocked), 'audioClock': clock,
                 'words': [{**word, 'word': '合成測試'} if index == 1 else word for index, word in enumerate(self.words)]}],
                 'warnings': []}
        output = self.directory / 'report'
        output.mkdir()
        comparison_calls = []

        def converter(payload):
            comparison_calls.append(payload)
            request = json.loads(payload)
            self.assertEqual(request['texts'], ['合成测试', '合成測試'])
            return json.dumps({'texts': ['合成测试', '合成测试'], 'normalization': {
                'version': 'opencc-t2s-comparison-v1', 'packageVersion': 'synthetic',
                'scriptSha256': hashlib.sha256((ROOT / 'scripts/normalize-retake-comparison.py').read_bytes()).hexdigest(),
                'configSha256': 'c' * 64, 'dictionaries': [{'name': 'synthetic', 'sha256': 'd' * 64}],
                'implementation': [{'name': 'synthetic', 'sha256': 'e' * 64}],
                'rawRecognitionChanged': False, 'expectedTextSupplied': False}}).encode('utf8')

        report = AUDIT.audit(value, output, comparison_converter=converter)
        original = AUDIT.read_wave(clocked)
        expected = np.concatenate([original[round(c['inSec'] * AUDIT.RATE):round(c['outSec'] * AUDIT.RATE)] for c in after])
        np.testing.assert_array_equal(AUDIT.read_wave(output / 'after-full.wav'), expected)
        self.assertEqual(report['summary']['newAutomaticJoins'], 1)
        self.assertEqual(len(comparison_calls), 1)
        self.assertEqual(report['removalTextComparison']['status'], 'completed')
        self.assertEqual(report['summary']['removalIndependentTextMismatchObservations'], 0)
        comparison_row = report['automaticRemovals'][0]['observationClocks'][0]
        self.assertFalse(comparison_row['rawSelectedTextMatches'])
        self.assertTrue(comparison_row['selectedTextMatches'])
        self.assertEqual(comparison_row['rawObservedText'], '合成測試')
        self.assertEqual(report['summary']['nearSilentShortFragments'], 1)
        self.assertEqual(report['segments'][2]['observedWordsCrossingClipEdge'], [])
        self.assertTrue(report['quietCleanupCandidates'])
        self.assertTrue(all(not candidate['automaticApplyEnabled'] for candidate in report['quietCleanupCandidates']))
        self.assertTrue(any(candidate['eligibleForIndependentConfirmation'] for candidate in report['quietCleanupCandidates']))
        self.assertFalse(report['listeningPerformed'])
        self.assertFalse(report['editorialAcceptance'])
        self.assertIn('clock-range-rows', report['clockObservationCountUnit'])
        self.assertEqual(report['summary']['retainedWordEdgeCrossingObservations'], 0)
        self.assertEqual(report['summary']['removalUnresolvedCrossingEdgeObservations'], 0)
        self.assertTrue((output / 'index.html').is_file())
        page = (output / 'index.html').read_text(encoding='utf8')
        self.assertIn('未知在范围内', page)
        self.assertIn('不是确认削字数', page)
        self.assertNotIn(self.words[0]['word'], page)
        self.assertEqual(len(list(output.glob('join-*-after.wav'))), 3)
        # A second run cannot silently replace prior evidence.
        with self.assertRaisesRegex(ValueError, 'overwrite'):
            AUDIT.audit(value, output)

    def test_quiet_candidate_overlapping_any_observed_word_is_not_eligible(self):
        source = {'audio': self.audio, 'words': self.words,
                  'independentWords': [{'word': '弱音', 'startMs': 2250, 'endMs': 2300}]}
        _, segments = AUDIT.render_sequence([clip('last', 1.8, 4)], {'clips/synthetic.mp4': source})
        candidates = AUDIT.quiet_cleanup_candidates(segments[0], source)
        self.assertEqual(len(candidates), 1)
        self.assertGreater(candidates[0]['protectedObservationCount'], 0)
        self.assertFalse(candidates[0]['eligibleForIndependentConfirmation'])

    def test_actual_word_crossing_source_edge_is_flagged_without_changing_its_time(self):
        source = {'audio': self.audio, 'words': [{'word': '完整词', 'startMs': 500, 'endMs': 700}]}
        audio, segments = AUDIT.render_sequence([clip('edge', .6, 1.2)], {'clips/synthetic.mp4': source})
        metric = AUDIT.segment_metrics(segments[0], source, audio)
        self.assertEqual(metric['observedWordsCrossingClipEdge'][0]['startMs'], 500)
        self.assertEqual(metric['observedWordsCrossingClipEdge'][0]['endMs'], 700)
        self.assertIn('not proof', metric['scope'])

    def test_outer_retained_word_bounds_use_each_clock_latest_end_not_latest_start(self):
        source = {'audio': self.audio, 'observationClocks': [
            {'id': 'later-start', 'kind': 'asr', 'words': [{'word': '较短观测', 'startMs': 750, 'endMs': 1000}]},
            {'id': 'earlier-start', 'kind': 'asr', 'words': [{'word': '较长观测', 'startMs': 650, 'endMs': 1100}]}]}
        audio, segments = AUDIT.render_sequence([clip('outer', .6, 1.2)], {'clips/synthetic.mp4': source})
        metric = AUDIT.segment_metrics(segments[0], source, audio)
        self.assertEqual(metric['firstRetainedWord']['startMs'], 650)
        self.assertEqual(metric['lastRetainedWord']['endMs'], 1100)
        self.assertEqual(metric['lastRetainedWord']['clockId'], 'earlier-start')
        self.assertEqual(metric['sourceRangeSec'][1] * 1000 - metric['lastRetainedWord']['endMs'], 100)
        self.assertEqual(metric['observedWordsCrossingClipEdge'], [])
        self.assertEqual(source['observationClocks'][0]['words'][0]['endMs'], 1000)

    def test_leading_and_trailing_removals_have_auditions_without_interior_join(self):
        sources = {'clips/synthetic.mp4': {'audio': self.audio}}
        before, old_segments = AUDIT.render_sequence([clip('one', 0, 4)], sources)
        after, new_segments = AUDIT.render_sequence([clip('one', .2, 3.8)], sources)
        output = self.directory / 'edges'
        output.mkdir()
        parts = [{'clipId': 'one', 'src': 'clips/synthetic.mp4', 'startSec': a, 'endSec': b} for a, b in [(0, .2), (3.8, 4)]]
        rows = AUDIT.removal_auditions(parts, new_segments, {'one': old_segments[0]}, {'one': 'one'}, before, after, output)
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0]['outputSec'], 0)
        self.assertAlmostEqual(rows[1]['outputSec'], len(after) / AUDIT.RATE)
        self.assertTrue(all(row['atStartOrEnd'] for row in rows))
        self.assertTrue(all((output / row['afterAudio']).is_file() for row in rows))

    def test_independent_clock_disagreement_is_reported_per_pass_not_as_confirmed_misdeletion(self):
        source = {'observationClocks': [
            {'id': 'qwen', 'provider': 'qwen', 'kind': 'asr', 'words': [{'word': '合成', 'startMs': 2100, 'endMs': 2250}], 'unresolved': []},
            {'id': 'whisper-core', 'provider': 'whisper', 'kind': 'asr', 'words': [{'word': '别的观测', 'startMs': 2080, 'endMs': 2290}], 'unresolved': []},
            {'id': 'whisper-vad', 'provider': 'whisper', 'kind': 'asr', 'words': [{'word': '合成', 'startMs': 2050, 'endMs': 2350}], 'unresolved': [{'startMs': 2300, 'endMs': 2450}]},
            {'id': 'whisper-main', 'provider': 'whisper', 'kind': 'asr', 'words': [{'word': '别的观测', 'startMs': 2080, 'endMs': 2290}], 'aliasOf': 'whisper-core'}]}
        reports = AUDIT.clock_range_reports(source, 2070, 2320, '合成')
        self.assertTrue(reports[0]['selectedTextMatches'])
        self.assertFalse(reports[1]['selectedTextMatches'])
        self.assertEqual(reports[1]['status'], 'needs-review')
        self.assertEqual(reports[1]['reviewReasons'], ['independent-text-mismatch'])
        self.assertIn('not confirmed', reports[1]['interpretation'])
        self.assertTrue(reports[2]['edgeCrossingObservations'])
        self.assertTrue(reports[2]['unresolvedOverlaps'])
        self.assertIn('word-edge-crossing', reports[2]['reviewReasons'])
        self.assertIn('unresolved-crossing-range-edge', reports[2]['reviewReasons'])
        self.assertEqual(reports[3]['status'], 'alias-of-observation-pass')
        self.assertEqual(reports[3]['reviewReasons'], [])
        self.assertEqual(len(AUDIT.source_words(source)), 3)

    def test_inside_unknown_and_crossing_unknown_have_distinct_row_counts(self):
        source = {'observationClocks': [
            {'id': 'inside', 'kind': 'asr', 'words': [],
             'unresolved': [{'startMs': 2100, 'endMs': 2150}, {'startMs': 2200, 'endMs': 2250}]},
            {'id': 'crossing', 'kind': 'asr', 'words': [],
             'unresolved': [{'startMs': 1900, 'endMs': 2050}, {'startMs': 2250, 'endMs': 2400}]},
            {'id': 'unlocated', 'kind': 'asr', 'words': [], 'unresolved': [{'reason': 'no reliable time'}]}]}
        reports = AUDIT.clock_range_reports(source, 2000, 2300)
        self.assertEqual(len(reports[0]['unresolvedInsideRange']), 2)
        self.assertEqual(reports[0]['unresolvedCrossingRangeEdge'], [])
        self.assertEqual(reports[0]['edgeCrossingObservations'], [])
        self.assertEqual(reports[0]['reviewReasons'], ['unresolved-inside-range'])
        self.assertEqual(len(reports[1]['unresolvedCrossingRangeEdge']), 2)
        self.assertEqual(reports[1]['unresolvedInsideRange'], [])
        self.assertEqual(reports[1]['reviewReasons'], ['unresolved-crossing-range-edge'])
        self.assertEqual(reports[2]['reviewReasons'], ['unlocated-unresolved'])
        self.assertEqual([len(row['unresolvedOverlaps']) for row in reports], [2, 2, 0])
        summary = AUDIT.clock_review_summary([{'observationClocks': reports}], [{'observationClocks': reports}])
        for prefix in ['retained', 'removal']:
            self.assertEqual(summary[prefix + 'ClockReviewObservations'], 3)
            self.assertEqual(summary[prefix + 'WordEdgeCrossingObservations'], 0)
            self.assertEqual(summary[prefix + 'UnresolvedInsideRangeObservations'], 1)
            self.assertEqual(summary[prefix + 'UnresolvedCrossingEdgeObservations'], 1)
            self.assertEqual(summary[prefix + 'UnlocatedUnresolvedObservations'], 1)
            self.assertEqual(summary[prefix + 'IndependentTextMismatchObservations'], 0)

    def test_overlapping_given_text_alignment_windows_stay_separate_without_text_false_failure(self):
        clocks = []
        for index, word in enumerate(['给定上下文甲', '给定上下文乙']):
            clocks.append({'id': f'source-boundary-v2:candidate-0:evidence-0:alignment-{index}',
                           'provider': 'qwen-forced-alignment', 'kind': 'forced-alignment',
                           'role': 'supplied-text-timestamps', 'independentRecognition': False,
                           'candidateId': 'synthetic', 'evidenceIndex': 0, 'alignmentIndex': index,
                           'alignmentSide': ['left', 'right'][index], 'observationSourceRangeSec': [1.9, 2.4],
                           'alignmentSha256': str(index) * 64, 'scope': 'supplied text, timestamps only',
                           'words': [{'word': word, 'startMs': 2100, 'endMs': 2250}], 'unresolved': []})
        clocks.append({**clocks[0], 'id': 'empty-window', 'words': []})
        reports = AUDIT.clock_range_reports({'observationClocks': clocks}, 2000, 2300, '另一段删除文字')
        self.assertEqual(len(reports), 3)
        self.assertEqual([row['observedWordCount'] for row in reports], [1, 1, 0])
        self.assertEqual([row['observedText'] for row in reports], ['给定上下文甲', '给定上下文乙', ''])
        for clock, row in zip(clocks, reports):
            self.assertIsNone(row['selectedTextMatches'])
            self.assertEqual(row['selectedTextComparison'], 'not-applicable-supplied-text-alignment')
            self.assertFalse(row['independentRecognition'])
            self.assertEqual(row['reviewReasons'], [])
            self.assertNotEqual(row['status'], 'needs-review')
            for key in ['candidateId', 'evidenceIndex', 'alignmentIndex', 'alignmentSide',
                        'observationSourceRangeSec', 'alignmentSha256', 'scope']:
                self.assertEqual(row[key], clock[key])
            self.assertIn('not independent recognition', row['interpretation'])

    def test_given_text_alignment_keeps_real_word_and_unknown_range_conflicts(self):
        source = {'observationClocks': [{
            'id': 'given-text', 'kind': 'forced-alignment', 'role': 'supplied-text-timestamps',
            'words': [{'word': '跨界词', 'startMs': 1950, 'endMs': 2100}],
            'unresolved': [{'startMs': 2200, 'endMs': 2250}, {'startMs': 2290, 'endMs': 2350},
                           {'reason': 'invalid alignment group'}]}]}
        row = AUDIT.clock_range_reports(source, 2000, 2300, '不同给定文字')[0]
        self.assertIsNone(row['selectedTextMatches'])
        self.assertEqual(row['status'], 'needs-review')
        self.assertEqual(row['reviewReasons'], ['word-edge-crossing', 'unresolved-inside-range',
                                               'unresolved-crossing-range-edge', 'unlocated-unresolved'])
        self.assertEqual(row['edgeCrossingObservations'][0]['startMs'], 1950)
        self.assertEqual(row['unlocatedUnresolvedCount'], 1)
        self.assertNotIn('independent-text-mismatch', row['reviewReasons'])

    def test_unresolved_independent_range_blocks_quiet_cleanup_without_inventing_words(self):
        source = {'audio': self.audio, 'observationClocks': [
            {'id': 'primary', 'kind': 'asr', 'words': self.words, 'unresolved': []},
            {'id': 'independent', 'kind': 'asr', 'words': [], 'unresolved': [{'startMs': 2250, 'endMs': 2300}]}]}
        _, segments = AUDIT.render_sequence([clip('last', 1.8, 4)], {'clips/synthetic.mp4': source})
        candidate = AUDIT.quiet_cleanup_candidates(segments[0], source)[0]
        self.assertEqual(candidate['protectedObservationCount'], 0)
        self.assertEqual(candidate['protectedUnresolvedCount'], 1)
        self.assertFalse(candidate['eligibleForIndependentConfirmation'])
        source['observationClocks'][1]['unresolved'] = [{'reason': 'unlocated clock'}]
        candidate = AUDIT.quiet_cleanup_candidates(segments[0], source)[0]
        self.assertGreater(candidate['unlocatedObservationCount'], 0)
        self.assertFalse(candidate['eligibleForIndependentConfirmation'])


if __name__ == '__main__':
    unittest.main()
