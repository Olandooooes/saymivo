"""Offline short-window verbatim observations; never reads saved edit decisions."""
import json, sys
from pathlib import Path
import numpy as np
from faster_whisper import WhisperModel
from source_audio import extract_source_audio, read_clocked_pcm

root, source, destination = map(Path, sys.argv[1:4])
start, end = map(float, sys.argv[4:6])
destination.mkdir(parents=True, exist_ok=True)
wav = destination/'source.wav'
if not wav.exists():
    extract_source_audio(source, wav)
pcm, clock = read_clocked_pcm(wav)
audio = np.frombuffer(pcm, dtype='<i2').astype(np.float32)/32768
if not 0 <= start < end <= len(audio)/16000:
    raise ValueError('Invalid source range')
model = WhisperModel(str(root/'.models/whisper-medium'), device='cpu', compute_type='int8', cpu_threads=4, local_files_only=True)
words, windows = [], []
for center in np.arange(start, end, 10):
    a, b = max(start, center-2), min(end, center+12)
    segments, _ = model.transcribe(audio[round(a*16000):round(b*16000)], language='zh', word_timestamps=True,
        vad_filter=False, beam_size=5, condition_on_previous_text=False,
        initial_prompt='逐字记录原声，保留嗯、呃、重复、结巴、未完成起句，不整理不润色。REA，AI Agent')
    observed = [{'word':w.word, 'startMs':round(a*1000+w.start*1000), 'endMs':round(a*1000+w.end*1000), 'probability':w.probability}
        for segment in segments for w in segment.words or [] if w.word.strip()]
    windows.append({'startSec':a, 'endSec':b, 'words':observed})
    words.extend(w for w in observed if center*1000 <= (w['startMs']+w['endMs'])/2 < min(end,center+10)*1000)
    print('Observed',a,b,flush=True)
words.sort(key=lambda w:w['startMs'])
for i,w in enumerate(words): w['id']=i
# Source-clock low-energy intervals, measured independently of the transcript.
quiet=[]
for i in range(round(start*100), round(end*100)):
    block=audio[i*160:(i+1)*160]
    if len(block) and np.sqrt(np.mean(block**2)) < .008:
        if quiet and abs(quiet[-1][1]-i/100)<.001: quiet[-1][1]=(i+1)/100
        else: quiet.append([i/100,(i+1)/100])
(destination/'observations.json').write_text(json.dumps({'clock':clock,'range':[start,end],'words':words,'windows':windows,'quiet':quiet,
    'recognizer':'local whisper-medium / 10s cores + 2s context; verbatim prompt is not a fidelity guarantee','audioUploaded':False},ensure_ascii=False,indent=2))
