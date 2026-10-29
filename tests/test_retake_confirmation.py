"""Complete-window independent confirmation with synthetic text and clocks only."""
import copy
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from retake_confirmation import (normalize_confirmation_text, compare_complete_window,
                                 plan_confirmation_window, confirm_candidate)


def fixture(internal_quiet=True):
    texts = ['开场', '先说明', '这次', '检查', '完整', '上下文', '前半段。',
             '接着', '我们', '重新', '解释', '关键', '步骤', '保留结尾。']
    words = [{'id': 100 - index * 3, 'word': text, 'startMs': 10200 + index * 500,
              'endMs': 10400 + index * 500} for index, text in enumerate(texts)]
    quiet = [[10, 10.15], [17, 18]]
    if internal_quiet:
        quiet[1:1] = [[(word['endMs'] + 20) / 1000, (next_word['startMs'] - 20) / 1000]
                      for word, next_word in zip(words, words[1:])]
    source = {'src': 'clips/synthetic.mp4', 'range': [10, 18], 'words': words, 'quiet': quiet}
    candidate = {'id': 'synthetic-confirmation', 'src': source['src'], 'kind': 'retake',
                 'first': 3, 'last': 3, 'replacementFirst': 10, 'replacementLast': 10,
                 'earlier': {'startSec': 11.7, 'endSec': 11.9, 'text': texts[3]},
                 'retain': {'startSec': 15.2, 'endSec': 15.4, 'text': texts[10]}}
    return source, candidate


class RetakeConfirmationTests(unittest.TestCase):
    def test_normalization_preserves_numeric_meaning_while_ignoring_spacing_and_sentence_end(self):
        self.assertEqual(normalize_confirmation_text(' 数值 1.5。 '), normalize_confirmation_text('数值1.5'))
        for left, right in [('1.5', '15'), ('1,500', '1500'), ('15%', '15'),
                            ('-10', '10'), ('+10', '10')]:
            with self.subTest(left=left, right=right):
                self.assertNotEqual(normalize_confirmation_text(left), normalize_confirmation_text(right))
        self.assertIn('.', normalize_confirmation_text('1.5'))
        self.assertIn(',', normalize_confirmation_text('1,500'))
        self.assertIn('%', normalize_confirmation_text('15%'))

    def test_complete_window_confirmation_rejects_extra_negation_number_and_unique_suffix(self):
        expected = '前文这里需要10个完整步骤，最后保留独有结尾。'
        self.assertTrue(compare_complete_window(expected, '前文 这里需要10个完整步骤最后保留独有结尾')['confirmed'])
        for observed in ['前文这里不需要10个完整步骤，最后保留独有结尾。',
                         '前文这里需要110个完整步骤，最后保留独有结尾。',
                         '前文这里需要10个完整步骤。', expected + '还有额外表达']:
            with self.subTest(observed=observed):
                result = compare_complete_window(expected, observed)
                self.assertFalse(result['confirmed'])
                self.assertNotEqual(result['normalizedExpected'], result['normalizedObserved'])
        self.assertFalse(compare_complete_window('版本1.5', '版本15')['confirmed'])
        self.assertFalse(compare_complete_window('', '')['confirmed'])
        self.assertFalse(compare_complete_window('。 ', '。')['confirmed'])

    def test_script_conversion_compares_only_copies_and_keeps_original_text_and_receipt(self):
        traditional = '版本1.5，需要10個完整步驟，最後保留結尾。'
        simplified = '版本1.5，需要10个完整步骤，最后保留结尾。'
        receipt = {'version': 'opencc-t2s-comparison-v1', 'converter': 'synthetic-no-converter',
                   'configSha256': 'a' * 64, 'scope': 'comparison copies only'}
        original_receipt = copy.deepcopy(receipt)
        result = compare_complete_window(traditional, simplified,
            comparison_copies=[simplified, simplified], normalization_receipt=receipt)
        self.assertTrue(result['confirmed'])
        self.assertEqual(result['expectedText'], traditional)
        self.assertEqual(result['text'], simplified)
        self.assertEqual(result['comparisonExpectedText'], simplified)
        self.assertEqual(result['comparisonObservedText'], simplified)
        self.assertEqual(result['comparisonNormalization'], original_receipt)
        self.assertEqual(receipt, original_receipt)
        for changed in [simplified.replace('需要', '不需要'), simplified.replace('10个', '110个'),
                        simplified.replace('1.5', '15')]:
            with self.subTest(changed=changed):
                rejected = compare_complete_window(traditional, changed,
                    comparison_copies=[simplified, changed], normalization_receipt=receipt)
                self.assertFalse(rejected['confirmed'])
                self.assertEqual(rejected['expectedText'], traditional)
                self.assertEqual(rejected['text'], changed)
                self.assertEqual(rejected['comparisonNormalization'], original_receipt)

    def test_numeric_sign_fraction_and_percent_remain_meaningful_after_normalization(self):
        for left, right in [('-1.5', '1.5'), ('1/5', '15'), ('10%', '10')]:
            with self.subTest(left=left, right=right):
                self.assertNotEqual(normalize_confirmation_text(left), normalize_confirmation_text(right))
                self.assertFalse(compare_complete_window(left, right)['confirmed'])
        self.assertEqual(normalize_confirmation_text('−1.5'), normalize_confirmation_text('-1.5'))
        self.assertEqual(normalize_confirmation_text(' 比值 1/5。 '), normalize_confirmation_text('比值1/5'))

    def test_confirmation_window_uses_source_offset_and_every_word_intersecting_actual_audio(self):
        source, candidate = fixture()
        # Missing quiet directly beside the target adds actual neighboring
        # words to this window. They must all be compared, without adding the
        # separate recording farther away.
        source['quiet'] = [gap for gap in source['quiet']
                           if gap not in [[11.42, 11.68], [11.92, 12.18]]]
        original_source, original_candidate = copy.deepcopy(source), copy.deepcopy(candidate)
        plan = plan_confirmation_window(source, candidate, 'earlier')
        self.assertTrue(plan['ready'], plan)
        self.assertFalse(plan['expectedTextSupplied'])
        self.assertGreaterEqual(plan['range'][0], 10)
        self.assertLessEqual(plan['range'][1], 18)
        selected = [index for index, word in enumerate(source['words'])
                    if word['endMs'] > plan['range'][0] * 1000 and word['startMs'] < plan['range'][1] * 1000]
        self.assertEqual(selected, [2, 3, 4])
        self.assertEqual(plan['wordIds'], selected)
        self.assertEqual((plan['windowFirst'], plan['windowLast']), (selected[0], selected[-1]))
        self.assertEqual(plan['expectedText'], ''.join(source['words'][index]['word'] for index in selected))
        self.assertEqual(source, original_source)
        self.assertEqual(candidate, original_candidate)

    def test_invalid_candidate_is_reviewable_without_preventing_later_valid_work(self):
        source, candidate = fixture()
        cases = [(None, candidate, 'earlier'),
                 ({**source, 'range': [18, 10]}, candidate, 'earlier'),
                 ({**source, 'quiet': [[12, 11]]}, candidate, 'earlier'),
                 (source, {**candidate, 'first': -1}, 'earlier'),
                 (source, {**candidate, 'replacementLast': 999}, 'retain'),
                 (source, candidate, 'unknown')]
        for observed_source, observed_candidate, side in cases:
            with self.subTest(side=side, observed_candidate=observed_candidate):
                self.assertFalse(plan_confirmation_window(observed_source, observed_candidate, side)['ready'])
        self.assertTrue(plan_confirmation_window(source, candidate, 'earlier')['ready'])

    def test_complete_context_matches_are_confirmed_without_supplying_text_to_recognizer(self):
        source, candidate = fixture()
        source_before, candidate_before = copy.deepcopy(source), copy.deepcopy(candidate)
        plans = [plan_confirmation_window(source, candidate, side) for side in ['earlier', 'retain']]
        expected = {tuple(plan['range']): plan['expectedText'] for plan in plans}
        self.assertEqual(len(expected), 2)
        calls = []
        def recognize(*arguments):
            self.assertEqual(len(arguments), 2)
            self.assertTrue(all(isinstance(argument, (int, float)) for argument in arguments))
            calls.append(arguments)
            return {'text': expected[arguments], 'words': []}
        result = confirm_candidate(candidate, source, recognize)
        self.assertEqual(result['id'], candidate['id'])
        self.assertTrue(result['confirmed'], result)
        self.assertEqual(len(calls), 2)
        self.assertEqual(set(result['observations']), {'earlier', 'retain'})
        self.assertTrue(all(observation['confirmed'] for observation in result['observations'].values()))
        self.assertEqual(source, source_before)
        self.assertEqual(candidate, candidate_before)

    def test_separate_complete_window_recognition_is_cached_once_per_actual_window(self):
        source, candidate = fixture()
        source_before, calls, cache = copy.deepcopy(source), [], {}
        plans = [plan_confirmation_window(source, candidate, side) for side in ['earlier', 'retain']]
        expected = {tuple(plan['range']): plan['expectedText'] for plan in plans}
        def recognize(a, b):
            calls.append((a, b))
            return {'text': expected[a, b]}
        first = confirm_candidate(candidate, source, recognize, cache=cache)
        second = confirm_candidate({**candidate, 'id': 'next-candidate'}, source, recognize, cache=cache)
        self.assertTrue(first['confirmed'], first)
        self.assertTrue(second['confirmed'], second)
        self.assertEqual(len(calls), 2)
        self.assertEqual(source, source_before)

    def test_two_recordings_are_never_sent_together_to_a_free_recognizer(self):
        source, candidate = fixture()
        for side, other in [('earlier', 10), ('retain', 3)]:
            plan = plan_confirmation_window(source, candidate, side)
            self.assertTrue(plan['ready'], plan)
            self.assertNotIn(other, plan['wordIds'])
        source, candidate = fixture(internal_quiet=False)
        calls = []
        result = confirm_candidate(candidate, source, lambda *args: calls.append(args))
        self.assertFalse(result['confirmed'])
        self.assertEqual(calls, [], 'missing quiet cannot combine two takes and let ASR fold the repetition')

    def test_separate_windows_avoid_free_asr_collapsing_a_failed_start_into_the_complete_take(self):
        source, candidate = fixture()
        source['words'][3]['word'] = '我们先说明'
        source['words'][5]['word'] = '我们先说明完整步骤'
        candidate.update(replacementFirst=5, replacementLast=5)
        candidate['earlier']['text'] = source['words'][3]['word']
        candidate['retain']['text'] = source['words'][5]['word']
        observed_windows = []
        def recognize(a, b):
            indices = [i for i, word in enumerate(source['words'])
                       if word['endMs'] / 1000 > a and word['startMs'] / 1000 < b]
            observed_windows.append(indices)
            if 3 in indices and 5 in indices:
                return {'text': source['words'][5]['word']}  # free ASR folds repetition
            return {'text': ''.join(source['words'][i]['word'] for i in indices)}
        result = confirm_candidate(candidate, source, recognize)
        self.assertTrue(result['confirmed'], result)
        self.assertEqual(len(observed_windows), 2)
        self.assertTrue(all(not (3 in indices and 5 in indices) for indices in observed_windows))

    def test_unresolved_audio_in_a_free_window_is_not_omitted_from_expected_text(self):
        source, candidate = fixture()
        source['unresolved'] = [{'startMs': 11800, 'endMs': 11800, 'word': '未确认'}]
        self.assertFalse(plan_confirmation_window(source, candidate, 'earlier')['ready'])
        self.assertTrue(plan_confirmation_window(source, candidate, 'retain')['ready'])
        source['unresolved'] = [{'startMs': 12500, 'endMs': 12600}]
        self.assertTrue(plan_confirmation_window(source, candidate, 'earlier')['ready'])

    def test_either_take_failing_full_window_confirmation_keeps_candidate_unconfirmed(self):
        source, candidate = fixture()
        plans = {side: plan_confirmation_window(source, candidate, side) for side in ['earlier', 'retain']}
        for failing_side in ['earlier', 'retain']:
            calls = []
            def recognize(a, b):
                calls.append((a, b))
                side = next(side for side, plan in plans.items() if plan['range'] == [a, b])
                return {'text': plans[side]['expectedText'] + ('不' if side == failing_side else '')}
            with self.subTest(failing_side=failing_side):
                result = confirm_candidate(candidate, source, recognize)
                self.assertFalse(result['confirmed'])
                self.assertFalse(result['observations'][failing_side]['confirmed'])
                self.assertEqual(len(calls), 2)

    def test_oversized_context_is_reviewable_and_never_runs_recognition(self):
        source, candidate = fixture(internal_quiet=False)
        source['range'] = [10, 40]
        source['quiet'] = []
        calls = []
        plan = plan_confirmation_window(source, candidate, 'earlier')
        self.assertFalse(plan['ready'])
        result = confirm_candidate(candidate, source, lambda *args: calls.append(args))
        self.assertFalse(result['confirmed'])
        self.assertEqual(calls, [])


if __name__ == '__main__':
    unittest.main()
