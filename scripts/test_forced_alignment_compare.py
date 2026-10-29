import unittest
from forced_alignment_compare import compare_words

class AlignmentComparisonTests(unittest.TestCase):
    def test_chinese_characters_map_to_saved_word_without_rewriting(self):
        words=[{'text':'任务，','startMs':1000,'endMs':1600}]
        tokens=[{'text':'任','start_time':.05,'end_time':.3},{'text':'务','start_time':.3,'end_time':.65}]
        result=compare_words(words,tokens,1,1)
        self.assertEqual(result['comparisons'][0]['startDeltaMs'],50)
        self.assertEqual(result['comparisons'][0]['endDeltaMs'],50)
        self.assertTrue(result['comparisons'][0]['within150msOfModel'])
        self.assertEqual(words[0]['endMs'],1600)

    def test_latin_words_inside_shared_model_token_are_unresolved(self):
        words=[{'text':'AI','startMs':0,'endMs':300},{'text':'Agent','startMs':300,'endMs':600}]
        result=compare_words(words,[{'text':'AIAgent','start_time':0,'end_time':.6}],0,1)
        self.assertEqual(result['comparisons'],[])
        self.assertEqual(len(result['unresolved']),2)

    def test_mismatching_or_invalid_spans_cannot_pass(self):
        words=[{'text':'好','startMs':0,'endMs':100}]
        for token in [{'text':'坏','start_time':0,'end_time':.1},{'text':'好','start_time':float('nan'),'end_time':.1},{'text':'好','start_time':0,'end_time':0},{'text':'好','start_time':0,'end_time':2}]:
            result=compare_words(words,[token],0,1)
            self.assertEqual(result['comparisons'],[])
            self.assertTrue(result['unresolved'])

    def test_bad_token_does_not_invalidate_a_separate_valid_word(self):
        words=[{'text':'任务','startMs':0,'endMs':200},{'text':'好','startMs':200,'endMs':300}]
        tokens=[{'text':'任','start_time':0,'end_time':.1},{'text':'务','start_time':.1,'end_time':.2},{'text':'好','start_time':.2,'end_time':.2}]
        result=compare_words(words,tokens,0,1)
        self.assertEqual([r['text'] for r in result['comparisons']],['任务'])
        self.assertEqual(result['unresolved'][0]['text'],'好')

if __name__ == '__main__':
    unittest.main()
