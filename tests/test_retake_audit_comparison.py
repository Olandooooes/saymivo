"""Synthetic post-recognition audit comparison copies; no ASR or private text."""
import copy
import hashlib
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'scripts'))
import retake_render_audit as AUDIT


def json_bytes(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':')).encode('utf8')


def normalization():
    return {'version': 'opencc-t2s-comparison-v1', 'packageVersion': 'synthetic',
            'scriptSha256': hashlib.sha256((ROOT / 'scripts/normalize-retake-comparison.py').read_bytes()).hexdigest(),
            'configSha256': 'c' * 64, 'dictionaries': [{'name': 'synthetic-dictionary', 'sha256': 'd' * 64}],
            'implementation': [{'name': 'synthetic-converter', 'sha256': 'e' * 64}],
            'rawRecognitionChanged': False, 'expectedTextSupplied': False}


def removal(expected, observed, *, crossing=False, unknown=False):
    source = {'observationClocks': [{'id': 'asr', 'kind': 'asr', 'provider': 'synthetic-asr',
              'words': [{'word': observed, 'startMs': 1950 if crossing else 2100, 'endMs': 2250}],
              'unresolved': [{'startMs': 2200, 'endMs': 2240}, {'startMs': 2290, 'endMs': 2350},
                             {'reason': 'unlocated observation'}] if unknown else []}]}
    return {'observationClocks': AUDIT.clock_range_reports(source, 2000, 2300, expected)}


class AuditComparisonCopies(unittest.TestCase):
    def test_raw_audit_normalizer_keeps_numeric_punctuation_signs_and_negation(self):
        for expected, observed in [('1.5', '15'), ('-2', '2'), ('2%', '2'), ('1/5', '15'),
                                   ('可以处理', '不可以处理'), ('完整合成句', '不同合成句')]:
            with self.subTest(expected=expected, observed=observed):
                row = removal(expected, observed)['observationClocks'][0]
                self.assertFalse(row['selectedTextMatches'])
                self.assertFalse(row['rawSelectedTextMatches'])
                self.assertIn('independent-text-mismatch', row['reviewReasons'])

    def test_complete_texts_are_batched_once_and_only_orthographic_mismatch_is_removed(self):
        removals = [removal('理发与发展', '理髮與發展'), removal('这个合成示例', '這個合成示例')]
        calls, outputs = [], []

        def converter(payload):
            calls.append(payload)
            texts = json.loads(payload)['texts']
            # Context-level phrase conversion; a per-word call cannot pass this.
            self.assertEqual(texts, ['理发与发展', '理髮與發展', '这个合成示例', '這個合成示例'])
            mapping = {'理髮與發展': '理发与发展', '這個合成示例': '这个合成示例'}
            output = json_bytes({'texts': [mapping.get(text, text) for text in texts], 'normalization': normalization()})
            outputs.append(output)
            return output

        before = copy.deepcopy(removals)
        result = AUDIT.normalize_removal_text_comparisons(removals, converter)
        self.assertEqual(result['status'], 'completed')
        self.assertEqual(len(calls), 1)
        self.assertEqual(result['receipt']['inputSha256'], hashlib.sha256(calls[0]).hexdigest())
        self.assertEqual(result['receipt']['outputSha256'], hashlib.sha256(outputs[0]).hexdigest())
        self.assertEqual(result['receipt']['normalization'], normalization())
        receipt_sha = hashlib.sha256(json_bytes(result['receipt'])).hexdigest()
        for old, current in zip(before, removals):
            raw, row = old['observationClocks'][0], current['observationClocks'][0]
            self.assertTrue(row['selectedTextMatches'])
            self.assertFalse(row['rawSelectedTextMatches'])
            self.assertEqual(row['rawExpectedText'], raw['expectedText'])
            self.assertEqual(row['rawObservedText'], raw['observedText'])
            self.assertEqual(row['expectedText'], raw['expectedText'])
            self.assertEqual(row['observedText'], raw['observedText'])
            self.assertEqual(row['reviewReasons'], [])
            self.assertEqual(row['status'], 'observed-no-range-conflict')
            self.assertEqual(row['comparisonCopies']['receiptSha256'], receipt_sha)
            self.assertEqual(row['comparisonCopies']['originalSha256'], hashlib.sha256(json_bytes({
                'expectedText': raw['expectedText'], 'observedText': raw['observedText']})).hexdigest())

    def test_orthographic_match_never_erases_word_or_unknown_risks(self):
        removals = [removal('这个', '這個', crossing=True, unknown=True)]
        row = removals[0]['observationClocks'][0]
        before = copy.deepcopy(row)
        AUDIT.normalize_removal_text_comparisons(removals, lambda payload: json_bytes({
            'texts': [text.replace('這', '这').replace('個', '个') for text in json.loads(payload)['texts']], 'normalization': normalization()}))
        self.assertTrue(row['selectedTextMatches'])
        self.assertFalse(row['rawSelectedTextMatches'])
        self.assertEqual(row['status'], 'needs-review')
        self.assertEqual(row['reviewReasons'], [reason for reason in before['reviewReasons'] if reason != 'independent-text-mismatch'])
        for key in ['edgeCrossingObservations', 'unresolvedInsideRange', 'unresolvedCrossingRangeEdge',
                    'unresolvedOverlaps', 'unlocatedUnresolvedCount', 'firstObservation', 'lastObservation',
                    'rawExpectedText', 'rawObservedText', 'expectedText', 'observedText']:
            self.assertEqual(row[key], before[key])

    def test_real_numeric_sign_percent_negation_and_text_differences_remain_review_after_conversion(self):
        pairs = [('1.5', '15'), ('-2', '2'), ('2%', '2'), ('可以处理', '不可以处理'),
                 ('合成版本甲', '合成版本乙')]
        removals = [removal(expected, observed) for expected, observed in pairs]
        result = AUDIT.normalize_removal_text_comparisons(removals, lambda payload: json_bytes({
            'texts': json.loads(payload)['texts'], 'normalization': normalization()}))
        self.assertEqual(result['status'], 'completed')
        for item in removals:
            row = item['observationClocks'][0]
            self.assertFalse(row['selectedTextMatches'])
            self.assertFalse(row['rawSelectedTextMatches'])
            self.assertEqual(row['status'], 'needs-review')
            self.assertEqual(row['reviewReasons'], ['independent-text-mismatch'])

    def test_given_text_alignments_and_asr_aliases_never_enter_conversion_batch(self):
        source = {'observationClocks': [
            {'id': 'actual', 'kind': 'asr', 'words': [{'word': '這個', 'startMs': 2100, 'endMs': 2250}]},
            {'id': 'alias', 'kind': 'asr', 'aliasOf': 'actual', 'words': []},
            {'id': 'forced', 'kind': 'forced-alignment', 'role': 'supplied-text-timestamps',
             'words': [{'word': '不同给定文字', 'startMs': 2100, 'endMs': 2250}]}]}
        removals = [{'observationClocks': AUDIT.clock_range_reports(source, 2000, 2300, '这个')}]
        old_alias, old_forced = copy.deepcopy(removals[0]['observationClocks'][1:])

        def converter(payload):
            self.assertEqual(json.loads(payload)['texts'], ['这个', '這個'])
            return json_bytes({'texts': ['这个', '这个'], 'normalization': normalization()})

        self.assertEqual(AUDIT.normalize_removal_text_comparisons(removals, converter)['status'], 'completed')
        self.assertEqual(removals[0]['observationClocks'][1:], [old_alias, old_forced])

    def test_converter_failure_or_invalid_receipt_preserves_all_original_reviews_atomically(self):
        def failed(_):
            raise RuntimeError('synthetic converter unavailable')

        def wrong_script(payload):
            receipt = normalization()
            receipt['scriptSha256'] = '0' * 64
            return json_bytes({'texts': ['这个'] * len(json.loads(payload)['texts']), 'normalization': receipt})

        def invalid_last_text(payload):
            texts = ['这个'] * len(json.loads(payload)['texts'])
            texts[-1] = None
            return json_bytes({'texts': texts, 'normalization': normalization()})

        for converter in [failed, wrong_script, invalid_last_text, lambda _: b'not json']:
            with self.subTest(converter=converter.__name__):
                removals = [removal('这个', '這個'), removal('完整句', '不同句', unknown=True)]
                before = copy.deepcopy(removals)
                result = AUDIT.normalize_removal_text_comparisons(removals, converter)
                self.assertEqual(result['status'], 'failed')
                self.assertTrue(result['warnings'])
                self.assertEqual(removals, before)

    def test_empty_removals_need_no_converter(self):
        result = AUDIT.normalize_removal_text_comparisons([], lambda _: self.fail('Unexpected converter'))
        self.assertEqual(result, {'status': 'not-needed', 'warnings': [], 'receipt': None})

    def test_missing_converter_script_preserves_raw_review_instead_of_aborting_audio_audit(self):
        removals = [removal('这个', '這個')]
        before = copy.deepcopy(removals)
        with patch.object(AUDIT, 'sha256_file', side_effect=FileNotFoundError('synthetic missing converter')):
            result = AUDIT.normalize_removal_text_comparisons(removals, lambda _: self.fail('Unexpected converter'))
        self.assertEqual(result['status'], 'failed')
        self.assertTrue(result['warnings'])
        self.assertEqual(removals, before)


if __name__ == '__main__':
    unittest.main()
