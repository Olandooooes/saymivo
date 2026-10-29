"""Local ASR + forced alignment, split only at measured low-energy gaps."""
import os
os.environ['HF_HUB_OFFLINE']='1'
os.environ['TRANSFORMERS_OFFLINE']='1'
import json, sys, time, wave
from pathlib import Path
import numpy as np
import torch
from qwen_asr import Qwen3ASRModel
from source_audio import extract_source_audio, read_clocked_pcm, sha256_file

root, source, destination=map(Path,sys.argv[1:4]);start,end=map(float,sys.argv[4:6])
destination.mkdir(parents=True,exist_ok=True);wav=destination/'source.wav'
try:
    pcm,clock=read_clocked_pcm(wav)
    if clock['sourceSha256']!=sha256_file(source):raise ValueError('Cached audio belongs to another source')
except (OSError,ValueError,KeyError,wave.Error):
    # An interrupted extraction can leave only one half of the pair. Preserve
    # that private evidence and rebuild, rather than failing every future job.
    damaged=[p for p in (wav,Path(str(wav)+'.clock.json')) if p.exists()]
    if damaged:
        quarantine=destination/('incomplete-audio-'+str(time.time_ns()))
        quarantine.mkdir()
        for old in damaged:old.rename(quarantine/old.name)
    extract_source_audio(source,wav)
    pcm,clock=read_clocked_pcm(wav)
audio=np.frombuffer(pcm,dtype='<i2').astype(np.float32)/32768
if not 0<=start<end<=len(audio)/16000:raise ValueError('Invalid range')
quiet=[]
for i in range(round(start*100),round(end*100)):
    block=audio[i*160:(i+1)*160]
    if len(block) and np.sqrt(np.mean(block**2))<.008:
        if quiet and abs(quiet[-1][1]-i/100)<.001:quiet[-1][1]=(i+1)/100
        else:quiet.append([i/100,(i+1)/100])
edges=[start]
while end-edges[-1]>19:
    candidates=[(a+b)/2 for a,b in quiet if b-a>=.15 and edges[-1]+8<=(a+b)/2<=edges[-1]+18]
    if not candidates:raise ValueError('No safe segmentation gap; refusing arbitrary speech split')
    edges.append(min(candidates,key=lambda x:abs(x-edges[-1]-14)))
edges.append(end)
torch.set_num_threads(4)
model=Qwen3ASRModel.from_pretrained(str(root/'.models/qwen3-asr-0.6b'),dtype=torch.float32,device_map='cpu',max_inference_batch_size=1,max_new_tokens=512,
    forced_aligner=str(root/'.models/qwen3-forced-aligner-0.6b'),forced_aligner_kwargs={'dtype':torch.float32,'device_map':'cpu'})
words=[];windows=[]
for a,b in zip(edges,edges[1:]):
    result=model.transcribe(audio=(audio[round(a*16000):round(b*16000)],16000),language='Chinese',return_time_stamps=True)[0]
    observed=[{'word':t.text,'startMs':round(a*1000+t.start_time*1000),'endMs':round(a*1000+t.end_time*1000)} for t in result.time_stamps]
    windows.append({'startSec':a,'endSec':b,'text':result.text,'words':observed});words.extend(observed)
    print('Qwen observed',a,b,result.text,flush=True)
    for i,w in enumerate(words):w['id']=i
    (destination/'observations.partial.json').write_text(json.dumps({'windows':windows},ensure_ascii=False,indent=2))
for i,w in enumerate(words):w['id']=i
(destination/'observations.json').write_text(json.dumps({'clock':clock,'range':[start,end],'words':words,'windows':windows,'quiet':quiet,
    'recognizer':'Qwen3-ASR-0.6B CPU float32 + local Qwen3-ForcedAligner-0.6B; ASR fidelity not guaranteed',
    'modelSha256':sha256_file(root/'.models/qwen3-asr-0.6b/model.safetensors'),'audioUploaded':False},ensure_ascii=False,indent=2))
