import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('independent_full_audit', Path(__file__).resolve().parents[1] / 'scripts/retake-full-audit.py')
module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)


class IndependentFullAuditTests(unittest.TestCase):
    def test_overlapping_windows_cover_every_core_once(self):
        windows = module.core_windows([1.49, 51.5], [[13, 13.5], [26, 26.4], [38, 38.5]])
        self.assertEqual(windows[0]['coreStartSec'], 1.49)
        self.assertEqual(windows[-1]['coreEndSec'], 51.5)
        for previous, following in zip(windows, windows[1:]):
            self.assertEqual(previous['coreEndSec'], following['coreStartSec'])
            self.assertGreater(previous['endSec'], following['startSec'])
        self.assertTrue(all(window['startSec'] <= window['coreStartSec'] < window['coreEndSec'] <= window['endSec'] for window in windows))

    def test_duplicate_observations_select_an_actual_whole_word_clock(self):
        windows = [
            {'coreStartSec': 0, 'coreEndSec': 12, 'words': [{'word': '完整词', 'startMs': 11800, 'endMs': 12100, 'probability': .8}]},
            {'coreStartSec': 12, 'coreEndSec': 24, 'words': [{'word': '完整词', 'startMs': 11900, 'endMs': 12200, 'probability': .9}]}]
        words, unresolved = module.canonical_words(windows, [0, 24])
        self.assertEqual(unresolved, []); self.assertEqual(len(words), 1)
        self.assertEqual((words[0]['startMs'], words[0]['endMs']), (11900, 12200))

    def test_conflicting_and_zero_duration_clocks_never_become_pseudo_words(self):
        windows = [{'coreStartSec': 0, 'coreEndSec': 20, 'words': [
            {'word': '稳定', 'startMs': 1000, 'endMs': 1500}, {'word': '没有', 'startMs': 2000, 'endMs': 2500},
            {'word': '有', 'startMs': 2200, 'endMs': 2600}, {'word': '嗯', 'startMs': 3000, 'endMs': 3000},
            {'word': '后句', 'startMs': 3500, 'endMs': 4000}]}]
        words, unresolved = module.canonical_words(windows, [0, 20])
        self.assertEqual([word['word'] for word in words], ['稳定', '后句'])
        self.assertEqual({item['reason'] for item in unresolved}, {'non-positive-observed-word', 'conflicting-overlapping-observations'})
        self.assertEqual([word['id'] for word in words], [0, 1])

    def test_damaged_or_stale_cache_receipts_are_misses(self):
        with tempfile.TemporaryDirectory() as directory:
            file, receipt = Path(directory) / 'observations.json', Path(directory) / 'receipt.json'
            file.write_text(json.dumps({'words': []})); receipt.write_text('{broken')
            self.assertIsNone(module.cached(file, receipt, {'version': 1}))
            receipt.write_text(json.dumps({'identity': {'version': 1}, 'payloadSha256': module.digest(file)}))
            self.assertEqual(module.cached(file, receipt, {'version': 1}), {'words': []})
            file.write_text('changed'); self.assertIsNone(module.cached(file, receipt, {'version': 1}))


if __name__ == '__main__':
    unittest.main()
