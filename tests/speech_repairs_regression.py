"""Pure synthetic evidence tests: no media or speech models required."""
import sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from speech_repairs import repair_windows,replace_observations

def word(text,a,b):return {'word':text,'startMs':a*1000,'endMs':b*1000}
class Repairs(unittest.TestCase):
 def test_long_word_crossing_two_takes_is_reread_in_separate_windows(self):
  windows=repair_windows([word('似',2,8)],[[1,3],[7,10]],[[3,7]],12)
  self.assertEqual(windows,[[.6,3.4],[6.6,10.4]])
  passes=[{'startSec':a,'endSec':b,'words':[word('同一开头',a+.4,b-.4)]} for a,b in windows]
  out=replace_observations([word('似',2,8)],passes)
  self.assertEqual([w['word'] for w in out],['同一开头','同一开头'])
 def test_short_words_and_quiet_without_stretched_word_do_not_trigger(self):
  self.assertEqual(repair_windows([word('轻声',1,1.2)],[[1,1.3]],[[2,4]],5),[])
 def test_one_read_cannot_erase_a_word_crossing_its_boundary(self):
  original=word('边界词',1,4)
  out=replace_observations([original],[{'startSec':2,'endSec':5,'words':[word('其他',3,4)]}])
  self.assertIn(original,out)
 def test_empty_recognition_does_not_delete_original_speech(self):
  w=word('保留原声',1,2)
  self.assertEqual(replace_observations([w],[{'startSec':0,'endSec':3,'words':[]}]),[w])
 def test_fractional_window_rounding_keeps_first_syllable(self):
  w=word('首音',6.6,6.9)
  self.assertEqual(replace_observations([],[{'startSec':6.600000000000001,'endSec':7,'words':[w]}]),[w])
 def test_same_word_with_independently_quiet_lead_replaces_old_stretched_anchor(self):
  old=word('复',2,4.2);new=word('复',3.8,4.2)
  out=replace_observations([old],[{'startSec':3.6,'endSec':5,'words':[new]}],[[1.9,3.9]],[[4,4.5]])
  self.assertEqual(out,[new])
 def test_silent_hallucinated_tail_requires_both_quiet_and_no_voice(self):
  old=word('幻觉尾词',8,10);read={'startSec':7,'endSec':8.5,'words':[word('真词',7.2,7.8)]}
  self.assertNotIn(old,replace_observations([old],[read],[[8,10]],[[7.2,7.8]]))
  self.assertIn(old,replace_observations([old],[read],[[8,10]],[[8.1,8.6]]))
 def test_observed_times_are_not_rescaled_or_fabricated(self):
  w=word('具体功能',1.13,1.87)
  self.assertEqual(replace_observations([],[{'startSec':1,'endSec':2,'words':[w]}]),[w])
if __name__=='__main__':unittest.main()
