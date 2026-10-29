"""Synthetic independent-recognition clock refinement; no model or private speech."""
import copy
import importlib.util
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
SPEC = importlib.util.spec_from_file_location('refine_retake_clocks', ROOT / 'scripts/refine-retake-clocks.py')
REFINE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(REFINE)


def word(text, start_ms, end_ms, **extra):
    return {'word': text, 'startMs': start_ms, 'endMs': end_ms, **extra}


def token(text, start_sec, end_sec):
    return {'text': text, 'start_time': start_sec, 'end_time': end_sec}


def window(words=None, text='前嗯后', start=10, end=12, **extra):
    return {'startSec': start, 'endSec': end, 'coreStartSec': start, 'coreEndSec': end,
            'kind': 'core-overlap', 'text': text,
            'words': words if words is not None else [word('前', 10100, 10300), word('后', 10900, 11200)],
            **extra}


class RefineRetakeClocksTests(unittest.TestCase):
    def test_complete_free_recognition_text_keeps_filler_missing_from_old_word_clock(self):
        observed = window(provider='independent-local-model', custom={'receipt': 'keep'})
        tokens = [token('前', .1, .3), token('嗯', .5, .7), token('后', .9, 1.2)]
        original, original_tokens = copy.deepcopy(observed), copy.deepcopy(tokens)
        refined = REFINE.refine_window(observed, tokens, [10, 12])
        self.assertEqual(''.join(w['word'] for w in refined['words']), '前嗯后')
        self.assertEqual([(w['startMs'], w['endMs']) for w in refined['words']],
                         [(10100, 10300), (10500, 10700), (10900, 11200)])
        self.assertEqual(refined['rawWords'], original['words'])
        self.assertEqual(refined['rawAlignmentTokens'], original_tokens)
        for field in ['startSec', 'endSec', 'coreStartSec', 'coreEndSec', 'text', 'provider', 'custom']:
            self.assertEqual(refined[field], original[field])
        self.assertEqual(observed, original)
        self.assertEqual(tokens, original_tokens)
        refined['rawWords'][0]['word'] = 'changed copy'
        refined['rawAlignmentTokens'][0]['text'] = 'changed copy'
        self.assertEqual(observed, original)
        self.assertEqual(tokens, original_tokens)

    def test_partial_or_hallucinated_alignment_does_not_certify_complete_spoken_text(self):
        observed = window()
        for tokens in [[token('前', .1, .3), token('后', .9, 1.2)],
                       [token('前', .1, .3), token('啊', .5, .7), token('后', .9, 1.2)]]:
            with self.subTest(tokens=tokens):
                refined = REFINE.refine_window(observed, tokens, [10, 12])
                self.assertTrue(refined['unresolved'])
                self.assertFalse(refined['words'])
                self.assertEqual(refined['rawWords'], observed['words'])
                self.assertEqual(refined['rawAlignmentTokens'], tokens)

    def test_zero_duration_tokens_form_only_indivisible_observed_groups(self):
        observed = window(text='前我们后')
        refined = REFINE.refine_window(observed, [token('前', .1, .3), token('我', .5, .5),
            token('们', .5, .8), token('后', .9, 1.2)], [10, 12])
        self.assertEqual([w['word'] for w in refined['words']], ['前', '我们', '后'])
        self.assertEqual([(w['startMs'], w['endMs']) for w in refined['words']],
                         [(10100, 10300), (10500, 10800), (10900, 11200)])
        self.assertTrue(all(w['endMs'] > w['startMs'] for w in refined['words']))
        orphan = REFINE.refine_window(window(), [token('前', .1, .3), token('嗯', .5, .5),
            token('后', .9, 1.2)], [10, 12])
        self.assertNotIn('嗯', [w['word'] for w in orphan['words']])
        self.assertTrue(orphan['unresolved'])

    def test_overlapping_outside_and_nonfinite_model_times_remain_unresolved(self):
        cases = [[token('前', .1, .6), token('嗯', .5, .7), token('后', .9, 1.2)],
                 [token('前', -.1, .3), token('嗯', .5, .7), token('后', .9, 1.2)],
                 [token('前', .1, .3), token('嗯', .5, .7), token('后', .9, 2.2)],
                 [token('前', .1, .3), token('嗯', float('nan'), .7), token('后', .9, 1.2)]]
        for tokens in cases:
            with self.subTest(tokens=tokens):
                refined = REFINE.refine_window(window(), tokens, [10, 12])
                self.assertTrue(refined['unresolved'])
                self.assertTrue(all(10000 <= w['startMs'] < w['endMs'] <= 12000 for w in refined['words']))
        overlapping = REFINE.refine_window(window(), cases[0], [10, 12])
        self.assertFalse(any(w['word'] in ['前', '嗯'] for w in overlapping['words']))

    def test_canonical_words_deduplicates_only_exact_cross_window_observations(self):
        first = window([word('嗯', 10500, 10700)], text='嗯')
        second = copy.deepcopy(first)
        canonical = REFINE.canonical_refined_windows([first, second], [10, 12])
        self.assertEqual([(w['word'], w['startMs'], w['endMs']) for w in canonical['words']], [('嗯', 10500, 10700)])
        self.assertFalse(canonical['unresolved'])
        for conflicting in [window([word('嗯', 10600, 10800)], text='嗯'),
                            window([word('啊', 10500, 10700)], text='啊')]:
            with self.subTest(conflicting=conflicting):
                result = REFINE.canonical_refined_windows([first, conflicting], [10, 12])
                self.assertFalse(result['words'])
                self.assertTrue(result['unresolved'])
        repeated = window([word('嗯', 10500, 10700), word('嗯', 10500, 10700)], text='嗯嗯')
        same_window = REFINE.canonical_refined_windows([repeated], [10, 12])
        self.assertFalse(same_window['words'])
        self.assertTrue(same_window['unresolved'])

    def test_canonical_core_ownership_keeps_real_disjoint_repetitions(self):
        first = window([word('嗯', 10100, 10300), word('嗯', 11100, 11300)],
                       text='嗯嗯', start=10, end=12, coreEndSec=11)
        second = window([word('嗯', 11100, 11300), word('后', 11500, 11700)],
                        text='嗯后', start=10.5, end=12, coreStartSec=11)
        result = REFINE.canonical_refined_windows([first, second], [10, 12])
        self.assertEqual([(w['word'], w['startMs'], w['endMs']) for w in result['words']],
                         [('嗯', 10100, 10300), ('嗯', 11100, 11300), ('后', 11500, 11700)])
        self.assertFalse(result['unresolved'])

    def test_same_clock_numbers_with_different_original_text_are_conflicts_not_corroboration(self):
        windows = [window([word('1.5', 10500, 10700)], text='1.5'),
                   window([word('15', 10500, 10700)], text='15')]
        result = REFINE.canonical_refined_windows(windows, [10, 12])
        self.assertFalse(result['words'])
        self.assertEqual([(u['startMs'], u['endMs']) for u in result['unresolved']], [(10500, 10700)])
        self.assertEqual([w['word'] for w in result['unresolved'][0]['words']], ['1.5', '15'])

    def test_source_refinement_preserves_raw_passes_and_does_not_relabel_recognizer(self):
        original_window = window()
        unknown = {'reason': 'unlocated raw observation'}
        source = {'src': 'clips/synthetic.mp4', 'sourceSha256': 'a' * 64,
            'provider': 'independent-local-model', 'range': [10, 12], 'words': copy.deepcopy(original_window['words']),
            'unresolved': [unknown], 'clock': {'sourceSha256': 'a' * 64}, 'quiet': [[10.3, 10.5]],
            'observationPasses': [
                {'id': 'core-overlap', 'provider': 'independent-local-model', 'windows': [original_window],
                 'words': copy.deepcopy(original_window['words']), 'unresolved': [unknown]},
                {'id': 'vad-isolated', 'provider': 'independent-local-model', 'windows': [copy.deepcopy(original_window)],
                 'words': copy.deepcopy(original_window['words']), 'unresolved': []}]}
        raw, calls = copy.deepcopy(source), []
        def align(supplied_window):
            calls.append(copy.deepcopy(supplied_window))
            return [token('前', .1, .3), token('嗯', .5, .7), token('后', .9, 1.2)]
        refined = REFINE.refine_observation_source(source, align)
        self.assertTrue(calls)
        self.assertTrue(all(supplied['text'] == '前嗯后' for supplied in calls))
        self.assertEqual(source, raw)
        self.assertEqual(refined['rawObservationPasses'], raw['observationPasses'])
        self.assertEqual(refined['rawWords'], raw['words'])
        self.assertEqual(refined['rawUnresolved'], raw['unresolved'])
        self.assertEqual(refined['provider'], raw['provider'])
        self.assertEqual(refined['sourceSha256'], raw['sourceSha256'])
        self.assertEqual(refined['clock'], raw['clock'])
        self.assertEqual(refined['range'], raw['range'])
        self.assertEqual(len(refined['observationPasses']), 2)
        for result_pass, raw_pass in zip(refined['observationPasses'], raw['observationPasses']):
            self.assertEqual(result_pass['provider'], raw_pass['provider'])
            self.assertEqual(''.join(w['word'] for w in result_pass['words']), '前嗯后')
            self.assertIn(unknown, result_pass['unresolved'])
        refined['rawObservationPasses'][0]['windows'][0]['words'][0]['word'] = 'changed copy'
        self.assertEqual(source, raw)

    def test_decimal_and_question_punctuation_stays_in_complete_original_recognition_text(self):
        observed = window(text='版本1.5，可以吗？')
        tokens = [token('版本', .1, .3), token('15', .5, .7), token('可以', .9, 1.1), token('吗', 1.1, 1.2)]
        refined = REFINE.refine_window(observed, tokens, [10, 12])
        self.assertEqual(''.join(w['word'] for w in refined['words']), observed['text'])
        self.assertIn('1.5，', [w['word'] for w in refined['words']])
        self.assertEqual(refined['rawAlignmentTokens'][1]['text'], '15')
        self.assertFalse(refined['unresolved'])

    def test_unknown_window_evidence_survives_empty_and_mismatching_alignment(self):
        unknown = {'reason': 'unlocated-semantic-observation', 'detail': 'must remain context protection'}
        cases = [(window(words=[], text='', unresolved=[unknown]), []),
                 (window(unresolved=[unknown]), [token('前', .1, .3), token('后', .9, 1.2)])]
        for observed, tokens in cases:
            with self.subTest(text=observed['text']):
                refined = REFINE.refine_window(observed, tokens, [10, 12])
                self.assertIn(unknown, refined['unresolved'])
                self.assertEqual(refined['rawUnresolved'], [unknown])

    def test_orphan_suffix_keeps_neighbor_bounded_window_envelope_and_clips_to_core(self):
        observed = window(text='前后嗯', start=10, end=14, coreEndSec=12)
        tokens = [token('前', .1, .3), token('后', 1, 1.2), token('嗯', 3.5, 3.5)]
        refined = REFINE.refine_window(observed, tokens, [10, 14])
        self.assertEqual([w['word'] for w in refined['words']], ['前', '后'])
        self.assertEqual([(u['startMs'], u['endMs']) for u in refined['unresolved']], [(11200, 14000)])
        self.assertTrue(refined['unresolved'][0]['contextRangeOnly'])
        self.assertEqual(refined['rawAlignmentTokens'], tokens)
        canonical = REFINE.canonical_refined_windows([refined], [10, 14])
        self.assertEqual([(u['startMs'], u['endMs']) for u in canonical['unresolved']], [(11200, 12000)])
        self.assertEqual([w['word'] for w in canonical['words']], ['前', '后'])

    def test_orphan_envelope_outside_core_stays_only_in_window_evidence(self):
        observed = window(text='前后嗯', start=10, end=14, coreEndSec=12)
        refined = REFINE.refine_window(observed, [token('前', .1, .3), token('后', 2.1, 2.3),
            token('嗯', 3.5, 3.5)], [10, 14])
        self.assertEqual([(u['startMs'], u['endMs']) for u in refined['unresolved']], [(12300, 14000)])
        canonical = REFINE.canonical_refined_windows([refined], [10, 14])
        self.assertFalse(canonical['unresolved'])
        self.assertEqual([w['word'] for w in canonical['words']], ['前'])
        self.assertNotIn('嗯', [w['word'] for w in refined['words']])

    def test_interior_orphan_uses_both_reliable_neighbors_as_context_not_word_time(self):
        observed = window(text='前嗯后', start=10, end=14, coreEndSec=12)
        refined = REFINE.refine_window(observed, [token('前', .1, .3), token('嗯', 1, 1),
            token('后', 1.5, 1.7)], [10, 14])
        self.assertEqual([(w['word'], w['startMs'], w['endMs']) for w in refined['words']],
                         [('前', 10100, 10300), ('后', 11500, 11700)])
        self.assertEqual([(u['startMs'], u['endMs']) for u in refined['unresolved']], [(10300, 11500)])
        self.assertTrue(refined['unresolved'][0]['contextRangeOnly'])
        canonical = REFINE.canonical_refined_windows([refined], [10, 14])
        self.assertEqual([(u['startMs'], u['endMs']) for u in canonical['unresolved']], [(10300, 11500)])
        self.assertNotIn('嗯', [w['word'] for w in canonical['words']])


if __name__ == '__main__':
    unittest.main()
