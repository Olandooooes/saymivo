import sys
import unittest
import importlib.util
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from retake_boundary_check import aligned_evidence, observed_span, select_alignment_window, check_planned_cut
adapter_spec = importlib.util.spec_from_file_location('retake_boundary_adapter', Path(__file__).resolve().parents[1] / 'scripts/check-codex-retake-boundaries.py')
adapter = importlib.util.module_from_spec(adapter_spec)
adapter_spec.loader.exec_module(adapter)


def word(i, text, a, b):
    return {'id': i, 'word': text, 'startMs': a * 1000, 'endMs': b * 1000}


def token(text, a, b):
    return {'text': text, 'start_time': a, 'end_time': b}


class BoundaryCheckTests(unittest.TestCase):
    def split_candidate(self):
        words = [word(i, t, a, b) for i, (t, a, b) in enumerate([
            ('前', .1, .3), ('废甲', .6, .8), ('废乙', 1.4, 1.6), ('后', 2, 2.2),
            ('替甲', 2.6, 2.8), ('替乙', 3.4, 3.6), ('尾', 4, 4.2)])]
        source = {'words': words, 'range': [0, 5], 'quiet': [[.35, .55], [.85, 1.35], [1.65, 1.95], [2.25, 2.55], [2.85, 3.35], [3.65, 3.95]]}
        def part(clip, first, last, start, end, a, b):
            return {'clipId': clip, 'src': 'source', 'first': first, 'last': last, 'startSec': start, 'endSec': end, 'clipInSec': a, 'clipOutSec': b}
        candidate = {'src': 'source', 'kind': 'retake', 'first': 1, 'last': 2, 'replacementFirst': 4, 'replacementLast': 5,
                     'startSec': .5, 'endSec': 1.8, 'retain': {'startSec': 2.6, 'endSec': 3.6},
                     'removeParts': [part('a', 1, 1, .5, .95, 0, .95), part('b', 2, 2, 1.25, 1.8, 1.25, 2.3)],
                     'retainParts': [part('c', 4, 4, 2.6, 2.8, 2.4, 3.1), part('d', 5, 5, 3.4, 3.6, 3.2, 4.4)]}
        tokens = [token(w['word'], w['startMs'] / 1000, w['endMs'] / 1000) for w in words]
        return source, candidate, tokens

    def test_internal_zero_can_group_without_inventing_subtoken_boundary(self):
        words = [word(0, '前', 0, .1), word(1, '我们好', .2, .5), word(2, '后', .6, .7)]
        evidence = aligned_evidence(words, [token('前', 0, .1), token('我', .2, .2),
                                           token('们', .2, .3), token('好', .3, .5), token('后', .6, .7)], [0, 1])
        span = observed_span(evidence, 1, 1)
        self.assertEqual(span['status'], 'observed')
        self.assertEqual((span['startSec'], span['endSec']), (.2, .5))
        self.assertEqual(span['groupedTokenIndices'], [[1, 2]])
        split = aligned_evidence([word(0, '我', .2, .21), word(1, '们', .21, .3)],
                                 [token('我', .2, .2), token('们', .2, .3)], [0, 1])
        self.assertEqual(observed_span(split, 0, 0)['status'], 'needs-review')

    def test_missing_text_outer_zero_and_overlap_remain_review(self):
        words = [word(0, '甲', .1, .2), word(1, '乙', .3, .4)]
        cases = [[token('甲', .1, .2)],
                 [token('甲', .1, .1), token('乙', .3, .4)],
                 [token('甲', .1, .3), token('乙', .2, .4)],
                 [token('甲乙', .1, .4)]]
        for tokens in cases:
            evidence = aligned_evidence(words, tokens, [0, 1])
            self.assertEqual(observed_span(evidence, 0, 0)['status'], 'needs-review')

    def test_quiet_window_includes_all_context_and_never_pads_text_with_unknown_speech(self):
        words = [word(i, c, 1 + i * .3, 1.2 + i * .3) for i, c in enumerate('甲乙丙丁戊己庚辛')]
        window = select_alignment_window(words, 3, 3, [[0, .9], [3.4, 4]], [0, 4], context_units=1)
        self.assertEqual(window['first'], 0)
        self.assertEqual(window['last'], 7)
        a, b = window['sourceRange']
        self.assertTrue(all(w['endMs'] / 1000 > a and w['startMs'] / 1000 < b for w in window['words']))
        overlapping = select_alignment_window(words, 3, 3, [[1.1, 1.18], [0, .9], [3.4, 4]], [0, 4], context_units=1)
        self.assertEqual(overlapping['sourceRange'], window['sourceRange'])

    def test_malformed_ranges_are_rejected(self):
        words = [word(0, '甲', .1, .2)]
        for bounds in [[1, 0], [0, float('nan')], [-1, 2]]:
            with self.assertRaises(ValueError):
                select_alignment_window(words, 0, 0, [], bounds)
        with self.assertRaises(ValueError):
            select_alignment_window(words, 0, 0, [[.8, .4]], [0, 1])

    def test_actual_cut_protects_union_of_both_clocks_and_neighbors(self):
        words = [word(0, '前', .1, .3), word(1, '废', .6, .8), word(2, '后', 1.1, 1.3), word(3, '替', 1.6, 1.8)]
        cut = {'first': 1, 'last': 1, 'replacementFirst': 3, 'replacementLast': 3,
               'kind': 'retake', 'startSec': .5, 'endSec': .9}
        tokens = [token('前', .1, .3), token('废', .6, .8), token('后', 1.1, 1.3), token('替', 1.6, 1.8)]
        evidence = aligned_evidence(words, tokens, [0, 2])
        quiet = [[.35, .55], [.85, 1.05]]
        self.assertEqual(check_planned_cut(cut, words, quiet, [0, 2], evidence, evidence)['status'], 'machine-boundary-checked')
        shifted = aligned_evidence(words, [token('前', .1, .52), *tokens[1:]], [0, 2])
        result = check_planned_cut(cut, words, quiet, [0, 2], shifted, evidence)
        self.assertIn('planned-cut-clips-retained-observation', result['reasons'])
        incomplete = aligned_evidence(words[1:], tokens[1:], [0, 2])
        result = check_planned_cut(cut, words, quiet, [0, 2], incomplete, evidence)
        self.assertIn('adjacent-retained-missing-word-coverage', result['reasons'])

    def test_planned_cut_must_cover_both_removed_clocks(self):
        words = [word(0, '前', .1, .3), word(1, '废', .6, .8), word(2, '后', 1.1, 1.3)]
        cut = {'first': 1, 'last': 1, 'kind': 'filler', 'startSec': .5, 'endSec': .9}
        evidence = aligned_evidence(words, [token('前', .1, .3), token('废', .6, .95), token('后', 1.1, 1.3)], [0, 2])
        result = check_planned_cut(cut, words, [[.35, .55], [.85, 1.05]], [0, 2], evidence)
        self.assertIn('planned-cut-does-not-cover-both-removed-observations', result['reasons'])

    def test_better_retained_take_can_precede_deleted_take(self):
        words = [word(0, '替', .1, .3), word(1, '前', .6, .8), word(2, '废', 1.1, 1.3), word(3, '后', 1.6, 1.8)]
        evidence = aligned_evidence(words, [token(w['word'], w['startMs'] / 1000, w['endMs'] / 1000) for w in words], [0, 2])
        cut = {'first': 2, 'last': 2, 'replacementFirst': 0, 'replacementLast': 0,
               'kind': 'retake', 'startSec': 1, 'endSec': 1.4}
        result = check_planned_cut(cut, words, [[.85, 1.05], [1.35, 1.55]], [0, 2], evidence, evidence)
        self.assertEqual(result['status'], 'machine-boundary-checked')
        cut['replacementLast'] = 2
        with self.assertRaises(ValueError):
            check_planned_cut(cut, words, [[.85, 1.05], [1.35, 1.55]], [0, 2], evidence, evidence)

    def test_adapter_checks_each_part_not_only_outer_hull(self):
        source, candidate, tokens = self.split_candidate()
        evidence = aligned_evidence(source['words'], tokens, source['range'])
        adapter.validate_parts(candidate, 'removeParts', len(source['words']))
        adapter.validate_parts(candidate, 'retainParts', len(source['words']))
        parts = adapter.check_candidate_parts(candidate, source, evidence, evidence)
        self.assertTrue(all(p['status'] == 'machine-boundary-checked' for p in parts['remove'] + parts['retain']))
        tokens[1]['end_time'] = 1.0
        shifted = aligned_evidence(source['words'], tokens, source['range'])
        overall = check_planned_cut(candidate, source['words'], source['quiet'], source['range'], shifted, evidence)
        self.assertEqual(overall['status'], 'machine-boundary-checked')
        parts = adapter.check_candidate_parts(candidate, source, shifted, evidence)
        self.assertEqual(parts['remove'][0]['status'], 'needs-review')
        self.assertIn('planned-cut-does-not-cover-both-removed-observations', parts['remove'][0]['reasons'])

    def test_adapter_protects_retained_clip_edges_and_rejects_missing_part_words(self):
        source, candidate, tokens = self.split_candidate()
        primary = aligned_evidence(source['words'], tokens, source['range'])
        tokens[4]['start_time'] = 2.35
        shifted = aligned_evidence(source['words'], tokens, source['range'])
        parts = adapter.check_candidate_parts(candidate, source, primary, shifted)
        self.assertIn('retained-observation-crosses-existing-clip-edge', parts['retain'][0]['reasons'])
        candidate['removeParts'][1]['first'] = 3
        with self.assertRaises(ValueError):
            adapter.validate_parts(candidate, 'removeParts', len(source['words']))

    def test_filler_has_no_replacement_but_requires_both_independent_neighbors_and_each_part(self):
        words = [word(0, '前', .1, .3), word(1, '呃', .6, .8), word(2, '后', 1.1, 1.3)]
        source = {'words': words, 'range': [0, 2], 'quiet': [[.35, .55], [.85, 1.05]]}
        evidence = aligned_evidence(words, [token('前', .1, .3), token('呃', .6, .8), token('后', 1.1, 1.3)], [0, 2])
        candidate = {'src': 'source', 'kind': 'filler', 'first': 1, 'last': 1, 'replacementFirst': -1, 'replacementLast': -1,
                     'startSec': .5, 'endSec': .9, 'retain': None, 'retainParts': [],
                     'removeParts': [{'clipId': 'one', 'src': 'source', 'first': 1, 'last': 1, 'startSec': .5, 'endSec': .9, 'clipInSec': 0, 'clipOutSec': 2}]}
        adapter.validate_parts(candidate, 'removeParts', len(words))
        check = check_planned_cut(candidate, words, source['quiet'], source['range'], evidence)
        self.assertEqual(check['status'], 'machine-boundary-checked')
        self.assertIsNone(check['replacementBoundary'])
        self.assertEqual(adapter.check_candidate_parts(candidate, source, evidence, None)['remove'][0]['status'], 'machine-boundary-checked')
        missing = aligned_evidence(words[:2], [token('前', .1, .3), token('呃', .6, .8)], [0, 2])
        check = check_planned_cut(candidate, words, source['quiet'], source['range'], missing)
        self.assertIn('adjacent-retained-missing-word-coverage', check['reasons'])


if __name__ == '__main__':
    unittest.main()
