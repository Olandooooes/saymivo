"""Local narrow-window observations. Input text is never used as an ASR prompt."""
import hashlib,json,sys,tempfile,subprocess
from pathlib import Path
import numpy as np
from faster_whisper import WhisperModel
from source_audio import read_clocked_pcm,sha256_file
request=json.loads(Path(sys.argv[1]).read_text());root=Path(request['root']);output=Path(sys.argv[2])
size=request.get('modelSize','medium')
if size not in ('small','medium'):raise ValueError('Unsupported local model')
model_dir=root/'.models'/('whisper-'+size)
if not (model_dir/'model.bin').is_file():raise ValueError('Local medium model missing; no downloads or cloud fallback')
model=None
model_sha=sha256_file(model_dir/'model.bin')
script_sha=sha256_file(Path(__file__))
cache=root/'.auto-jobs/proofread-audio-evidence';cache.mkdir(parents=True,exist_ok=True)
results=[]
for source in request['sources']:
 src=root/'public'/source['src']
 if sha256_file(src)!=source['sourceSha256']:raise ValueError('Source changed before audio proofread')
 with tempfile.TemporaryDirectory(prefix='proofread-audio-',dir=root/'.captions-tmp') as temp:
  wav=Path(temp)/'source.wav'
  subprocess.run([sys.executable,str(root/'scripts/source_audio.py'),str(src),str(wav)],check=True,capture_output=True)
  pcm,clock=read_clocked_pcm(wav);audio=np.frombuffer(pcm,dtype='<i2').astype(np.float32)/32768
  for window in source['windows']:
   a,b=window['startMs'],window['endMs']
   for language in (['zh','en'] if window.get('english') else ['zh']):
    identity={'sourceSha256':source['sourceSha256'],'modelSha256':model_sha,'scriptSha256':script_sha,'startMs':a,'endMs':b,'language':language,'clockVersion':clock['version']}
    cache_file=cache/(hashlib.sha256(json.dumps(identity,sort_keys=True).encode()).hexdigest()+'.json')
    if cache_file.is_file():
     saved=json.loads(cache_file.read_text())
     if saved.get('identity')==identity:
      observation=saved['observation'];observation['clipId']=source['clipId'];results.append(observation);continue
    if model is None:model=WhisperModel(str(model_dir),device='cpu',compute_type='int8',cpu_threads=2,local_files_only=True)
    segments,_=model.transcribe(audio[round(a*16):round(b*16)],language=language,word_timestamps=True,vad_filter=False,beam_size=5,condition_on_previous_text=False)
    words=[{'word':w.word.strip(),'spaceBefore':bool(w.word[:1].isspace()),'startMs':round(a+w.start*1000),'endMs':round(a+w.end*1000)}for seg in segments for w in (seg.words or []) if w.word.strip()]
    text=''.join((' ' if w['spaceBefore'] else '')+w['word'] for w in words).strip()
    results.append({'clipId':source['clipId'],'sourceSha256':clock['sourceSha256'],'startMs':a,'endMs':b,'text':text,'words':words,'model':'local-'+size+'-window-'+language,'verified':True,'modelSha256':model_sha})
    cache_file.write_text(json.dumps({'identity':identity,'observation':results[-1]},ensure_ascii=False))
   output.write_text(json.dumps({'observations':results,'audioUploaded':False},ensure_ascii=False))
   print('WINDOW',a,b,flush=True)
