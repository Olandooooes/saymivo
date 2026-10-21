import sys,json,os,wave
import numpy as np
from faster_whisper import WhisperModel
model=WhisperModel(os.environ.get('AUTOBROLL_MODEL','small'),device='cpu',compute_type='int8')
for wav in sys.argv[2:]:
    # The workbench already extracts mono 16 kHz PCM; read it directly.
    # This also avoids decoder API differences between PyAV versions.
    with wave.open(wav,'rb') as audio_file:
        if (audio_file.getnchannels(),audio_file.getsampwidth(),audio_file.getframerate()) != (1,2,16000):
            raise ValueError('Expected mono 16 kHz PCM16 WAV')
        audio=np.frombuffer(audio_file.readframes(audio_file.getnframes()),dtype='<i2').astype(np.float32)/32768.0
    segments,_=model.transcribe(audio,language=os.environ.get('AUTOBROLL_LANGUAGE','zh'),word_timestamps=True,vad_filter=True,initial_prompt=os.environ.get('AUTOBROLL_PROMPT','普通话口播，准确识别中文和英文术语。'))
    out=[]
    for s in segments:
        for w in s.words or []:
            if w.word.strip():out.append({'word':w.word.strip(),'startMs':round(w.start*1000),'endMs':round(w.end*1000)})
    from pathlib import Path
    key=Path(wav).stem.removesuffix('.16k')
    Path(sys.argv[1],key+'.json').write_text(json.dumps(out,ensure_ascii=False),encoding='utf8')
