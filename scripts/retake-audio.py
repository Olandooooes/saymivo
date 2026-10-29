"""Local source-clock speech evidence for retake analysis. Never reads edit reviews.

Commands: retake-audio.py analyze REQUEST OUTPUT | confirm REQUEST OUTPUT
All files are private job assets. Cached raw recognition is byte/clock checked;
overlapping window ASR and candidate confirmation are independently run locally.
"""
import gc
import hashlib
import json
import math
import os
import shutil
from importlib.metadata import version as package_version
from pathlib import Path
import sys
import unicodedata

os.environ.setdefault('HF_HUB_OFFLINE', '1')
os.environ.setdefault('TRANSFORMERS_OFFLINE', '1')
os.environ.setdefault('HF_HUB_DISABLE_TELEMETRY', '1')

import numpy as np
from faster_whisper import WhisperModel
from faster_whisper.vad import VadOptions, get_speech_timestamps
from source_audio import CLOCK, extract_source_audio, read_clocked_pcm, sha256_file

VERSION = 'retake-local-audio-v1'


def payload_hash(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True,
                                   separators=(',', ':')).encode('utf8')).hexdigest()


def cache_profile(root, size, source_sha, analyzer_version):
    return {'sourceSha256': source_sha, 'modelSha256': sha256_file(root / '.models' / ('whisper-'+size) / 'model.bin'),
            'engine': 'faster-whisper', 'engineVersion': package_version('faster-whisper'),
            'audioClock': CLOCK, 'evidenceVersion': VERSION, 'analyzerVersion': analyzer_version}


def cache_read(file, profile):
    try:
        data=json.loads(file.read_text(encoding='utf8'))
        if data['profile'] != profile or data['payloadSha256'] != payload_hash(data['payload']):
            return None
        return data['payload']
    except (OSError, ValueError, KeyError, TypeError):
        return None


def cache_write(file, profile, payload):
    file.parent.mkdir(parents=True, exist_ok=True)
    temporary=file.with_suffix('.tmp')
    save(temporary, {'profile':profile,'payloadSha256':payload_hash(payload),'payload':payload})
    temporary.replace(file)


def publish_source_cache(root, profile, item):
    directory=root / '.auto-jobs' / 'retake-evidence-cache' / payload_hash(profile)
    directory.mkdir(parents=True, exist_ok=True)
    wav=directory / 'source.wav'
    if Path(item['wav']).resolve() != wav.resolve():
        shutil.copyfile(item['wav'], wav)
        shutil.copyfile(item['wav']+'.clock.json', str(wav)+'.clock.json')
    _,receipt=read_clocked_pcm(wav)
    if receipt['sourceSha256'] != profile['sourceSha256']:
        raise ValueError('Cannot cache evidence from a different source')
    item={**item,'wav':str(wav),'audioClock':receipt}
    cache_write(directory / 'evidence.json',profile,item)
    return item


def load_source_cache(root, profile):
    directory=root / '.auto-jobs' / 'retake-evidence-cache' / payload_hash(profile)
    item=cache_read(directory / 'evidence.json',profile)
    if item is None:
        return None
    try:
        if Path(item['wav']).resolve() != (directory / 'source.wav').resolve():
            return None
        _,receipt=read_clocked_pcm(item['wav'])
        if receipt != item['audioClock'] or receipt['sourceSha256'] != profile['sourceSha256']:
            return None
        if not all(isinstance(w.get('word'),str) and isinstance(w.get('startMs'),(int,float)) and
                   isinstance(w.get('endMs'),(int,float)) for w in item['words']):
            return None
        return item
    except (OSError, ValueError, KeyError, TypeError):
        return None


def save(file, value):
    Path(file).write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf8')


def progress(percent, text):
    print(f'PROGRESS:{percent}:{text}', flush=True)


def canonical(text):
    return ''.join(c.lower() for c in unicodedata.normalize('NFKC', str(text))
                   if unicodedata.category(c)[0] in 'LN')


def model(root, size):
    directory = root / '.models' / ('whisper-' + size)
    if not (directory / 'model.bin').is_file():
        raise ValueError(f'本地 {size} 语音模型未安装；不会自动下载或调用云端')
    return WhisperModel(str(directory), device='cpu', compute_type='int8',
                        cpu_threads=2, local_files_only=True)


def recognize(recognizer, audio, start, end):
    if end <= start:
        return []
    segments, _ = recognizer.transcribe(audio[round(start*16000):round(end*16000)],
        language='zh', word_timestamps=True, vad_filter=False, beam_size=5,
        condition_on_previous_text=False)
    return [{'word': w.word.strip(), 'startMs': round((start+w.start)*1000),
             'endMs': round((start+w.end)*1000), 'probability': round(w.probability, 4)}
            for segment in segments for w in segment.words or [] if w.word.strip()]


def activity(audio):
    speech = get_speech_timestamps(audio, VadOptions(min_silence_duration_ms=400, speech_pad_ms=80))
    speech = [[r['start']/16000, r['end']/16000] for r in speech]
    size = 160
    padded = np.pad(audio, (0, (-len(audio)) % size))
    db = 20*np.log10(np.sqrt(np.mean(padded.reshape(-1, size)**2, axis=1))+1e-12)
    floor = float(np.percentile(db, 15))
    threshold = min(-38.0, floor+10)
    quiet = []
    first = None
    for i, value in enumerate(db):
        if value < threshold and first is None:
            first = i
        if first is not None and (value >= threshold or i == len(db)-1):
            stop = i if value >= threshold else i+1
            if stop-first >= 5:
                quiet.append([round(first*.01, 3), round(stop*.01, 3)])
            first = None
    return speech, quiet, {'binSec': .01, 'thresholdDb': threshold, 'noiseFloorDb': floor}


def raw_cache(source, receipt):
    file = Path(source.get('rawCache', ''))
    if not file.is_file():
        return None
    try:
        meta = json.loads(file.with_suffix('.meta.json').read_text())
        clock = meta['audioClock']
        if any(clock.get(k) != v for k, v in CLOCK.items()):
            return None
        if meta.get('sourceSha256') != receipt['sourceSha256'] or clock.get('sourceSha256') != receipt['sourceSha256']:
            return None
        if meta.get('recognitionSha256') != sha256_file(file):
            return None
        words = json.loads(file.read_text())
        if not isinstance(words, list) or not all(isinstance(w.get('word'), str) and
                isinstance(w.get('startMs'), (int, float)) and isinstance(w.get('endMs'), (int, float)) for w in words):
            return None
        return words
    except (OSError, ValueError, KeyError, TypeError):
        return None


def analyze(request, output):
    root, public = Path(request['root']).resolve(), Path(request['public']).resolve()
    directory = Path(output).parent
    small = None
    results = []
    for index, source in enumerate(request['sources']):
        file = (public / source['src']).resolve()
        if not file.is_relative_to((public / 'clips').resolve()) or not file.is_file():
            raise ValueError('源文件不在本地素材目录内')
        profile=cache_profile(root,'small',sha256_file(file),request.get('analyzerVersion'))
        cached=load_source_cache(root,profile)
        if cached is not None:
            results.append({**cached,'src':source['src'],'evidenceCacheReused':True})
            save(output,{'version':VERSION,'audioUploaded':False,'sources':results})
            progress(5+round(45*(index+1)/len(request['sources'])),f'已核验本地分段证据缓存 {index+1}/{len(request["sources"])}')
            continue
        if small is None:
            small=model(root,'small')
        wav = directory / f'source-{index}.wav'
        if not wav.exists():
            extract_source_audio(file, wav)
        pcm, receipt = read_clocked_pcm(wav)
        if receipt['sourceSha256'] != sha256_file(file):
            raise ValueError('分析期间源文件已变化')
        audio = np.frombuffer(pcm, dtype='<i2').astype(np.float32)/32768
        duration = len(audio)/16000
        if duration > 3600:
            raise ValueError('单个素材超过60分钟，请先分段')
        speech, quiet, energy = activity(audio)
        raw = raw_cache(source, receipt)
        reused = raw is not None
        # Full raw recognition is only a baseline. The new window pass below is
        # independent and exposes repeats a long-context recognizer can collapse.
        if raw is None:
            raw = recognize(small, audio, 0, duration)
        windows, words = [], []
        for number, start in enumerate(np.arange(0, duration, 18.0)):
            start = float(start); end = min(duration, start+20)
            if not any(b > start and a < end for a, b in speech):
                continue
            observed = recognize(small, audio, start, end)
            windows.append({'startSec': start, 'endSec': end, 'words': observed})
            left = start if start == 0 else start+1
            right = end if end == duration else end-1
            for word in observed:
                midpoint = (word['startMs']+word['endMs'])/2000
                voiced = any(word['endMs']/1000 > a and word['startMs']/1000 < b for a,b in speech)
                if left <= midpoint < right and voiced:
                    words.append(word)
            progress(5+round(45*(index+(end/duration))/len(request['sources'])),
                     f'本地分段识别 {index+1}/{len(request["sources"])} · {end:.0f}/{duration:.0f}秒')
        words.sort(key=lambda w:(w['startMs'], w['endMs']))
        # Speech islands omitted by both a broad sentence and its window are
        # re-read in isolation. This is voice evidence, never a saved edit list.
        missing = []
        for a,b in speech:
            covered = sum(max(0, min(b,w['endMs']/1000)-max(a,w['startMs']/1000)) for w in words)
            if b-a >= .65 and covered < min(.25, (b-a)*.2):
                isolated = recognize(small, audio, max(0,a-.15), min(duration,b+.15))
                missing.append({'startSec':a,'endSec':b,'words':isolated})
                words.extend(isolated)
        words.sort(key=lambda w:(w['startMs'],w['endMs']))
        clean = []
        for word in words:
            duplicate = next((w for w in clean[-5:] if canonical(w['word']) == canonical(word['word']) and
                min(w['endMs'],word['endMs'])-max(w['startMs'],word['startMs']) >
                .5*max(1,min(w['endMs']-w['startMs'],word['endMs']-word['startMs']))), None)
            if duplicate is None:
                clean.append(word)
        item = {'src':source['src'], 'sourceSha256':receipt['sourceSha256'], 'audioClock':receipt,
                'durationSec':duration,'rawCacheReused':reused,'rawWords':raw,'words':clean,
                'windows':windows,'uncoveredSpeechPasses':missing,'speech':speech,
                'quiet':quiet,'energy':energy,'wav':str(wav)}
        item=publish_source_cache(root,profile,item)
        results.append(item)
        save(output, {'version':VERSION,'audioUploaded':False,'sources':results})
    progress(52, '分段转写已完成，比较重录顺序')



def repair(request, output):
    from speech_repairs import repair_windows, replace_observations
    root=Path(request['root']).resolve();recognizer=None;results=[]
    for source in request['sources']:
        pcm,receipt=read_clocked_pcm(source['wav'])
        if receipt!=source['audioClock'] or receipt['sourceSha256']!=source['sourceSha256']:
            raise ValueError('独立修复证据与原片时钟不符')
        waveform=np.frombuffer(pcm,dtype='<i2').astype(np.float32)/32768
        duration=len(waveform)/16000
        windows=repair_windows(source['words'],source['speech'],source['quiet'],duration)
        profile={**cache_profile(root,'medium',source['sourceSha256'],request.get('analyzerVersion')),
                 'repairVersion':'stretched-word-islands-v1'}
        passes=[]
        for index,(start,end) in enumerate(windows):
            key=payload_hash({'profile':profile,'range':[start,end]})
            cache_file=root/'.auto-jobs'/'retake-evidence-cache'/'repairs'/(key+'.json')
            item=cache_read(cache_file,profile)
            if item is None:
                if recognizer is None:recognizer=model(root,'medium')
                item={'startSec':start,'endSec':end,'words':recognize(recognizer,waveform,start,end)}
                cache_write(cache_file,profile,item)
            passes.append(item)
            progress(52,f'独立复查跨停顿词时间 {index+1}/{len(windows)}')
        results.append({**source,'words':replace_observations(source['words'],passes,source['quiet'],source['speech']),
                        'repairPasses':passes,'repairVersion':profile['repairVersion'],'repairMergeVersion':'independent-quiet-union-v2'})
    save(output,{'version':VERSION,'sources':results,'audioUploaded':False})

def matching_words(words, text):
    value=''; tokens=[]
    for w in words:
        chars=canonical(w['word']);value+=chars;tokens.extend([w]*len(chars))
    start=value.find(canonical(text))
    return None if start<0 else (tokens[start],tokens[start+len(canonical(text))-1])


def cut_gap(quiet, target, direction):
    options=[]
    for a,b in quiet:
        left=max(a,target-.4);right=min(b,target+.1 if direction=='start' else target-.025)
        if right-left < .045:
            continue
        point=(left+right)/2 if direction=='start' else max(left+.02,min(target-.08,right-.05))
        options.append((abs(point-(target-.07)),point,[left,right]))
    return min(options) if options else None


def confirm(request, output):
    root=Path(request['root']).resolve();recognizer=None
    sources={s['src']:s for s in request['sources']};audio={}
    result={};boundaries={};profiles={}
    for index,candidate in enumerate(request['candidates']):
        source=sources[candidate['src']]
        if candidate['src'] not in profiles:
            profiles[candidate['src']]=cache_profile(root,'medium',source['sourceSha256'],request.get('analyzerVersion'))
        profile=profiles[candidate['src']]
        # Candidate identity is source-clock text/ranges, not a clip instance ID
        # or a saved editorial decision. A new UI job still recomputes its plan.
        observation={key:candidate[key] for key in ['earlier','retain']}
        key=payload_hash({'profile':profile,'observation':observation})
        cache_file=root / '.auto-jobs' / 'retake-evidence-cache' / 'confirmations' / (key+'.json')
        cached=cache_read(cache_file,profile)
        if cached is not None:
            result[candidate['id']]=cached['confirmation'];boundaries[candidate['id']]=cached['boundary']
            progress(55+round(35*(index+1)/max(1,len(request['candidates']))),f'已核验独立窄窗证据缓存 {index+1}/{len(request["candidates"])}')
            continue
        if recognizer is None:
            recognizer=model(root,'medium')
        if candidate['src'] not in audio:
            pcm,_=read_clocked_pcm(source['wav']);audio[candidate['src']]=np.frombuffer(pcm,dtype='<i2').astype(np.float32)/32768
        waveform=audio[candidate['src']];duration=len(waveform)/16000
        earlier=candidate['earlier'];later=candidate['retain']
        if max(earlier['endSec']-earlier['startSec'],later['endSec']-later['startSec']) > 18:
            continue
        e=recognize(recognizer,waveform,max(0,earlier['startSec']-.28),min(duration,earlier['endSec']+.2))
        l=recognize(recognizer,waveform,max(0,later['startSec']-.28),min(duration,later['endSec']+.2))
        result[candidate['id']]={'earlier':e,'later':l,'model':'local whisper-medium independent narrow windows'}
        em=matching_words(e,earlier['text']);lm=matching_words(l,later['text'])
        safe={'safe':False,'reason':'independent recognition did not locate both complete versions'}
        if em and lm:
            early=em[0]['startMs']/1000;late=lm[0]['startMs']/1000
            # A stretched first word can include seconds of silence. VAD
            # provides a separate observation of where that word's voice begins.
            islands=[(a,b)for a,b in source['speech'] if b>late and a<lm[0]['endMs']/1000+.1]
            if islands and lm[0]['endMs']/1000-late>.7:
                late=max(late,islands[0][0])
            a=cut_gap(source['quiet'],early,'start');b=cut_gap(source['quiet'],late,'end')
            if a and b and a[1]<b[1] and b[1]<lm[0]['endMs']/1000:
                # Any voiced bridge not explained by the earlier take blocks
                # automatic removal, even if the window ASR omitted its words.
                early_end=max(earlier['endSec'],em[1]['endMs']/1000)
                uncovered=sum(max(0,min(stop,b[1])-max(start,early_end+.15))
                              for start,stop in source['speech'])
                safe={'safe':uncovered<=.12,'uncoveredSpeechSec':round(uncovered,3),
                      'startSec':round(a[1],3),'endSec':round(b[1],3),
                      'startQuiet':a[2],'endQuiet':b[2],'energy':source['energy'],
                      'method':'verified word clock plus 10ms RMS low-energy gaps'}
        boundaries[candidate['id']]=safe
        cache_write(cache_file,profile,{'confirmation':result[candidate['id']],'boundary':safe})
        save(output,{'confirmations':result,'boundaries':boundaries,'audioUploaded':False})
        progress(55+round(35*(index+1)/max(1,len(request['candidates']))),
                 f'窄窗复核与声学剪口 {index+1}/{len(request["candidates"])}')
    save(output,{'confirmations':result,'boundaries':boundaries,'audioUploaded':False})


if __name__ == '__main__':
    operation,request_file,output=sys.argv[1:4]
    request=json.loads(Path(request_file).read_text(encoding='utf8'))
    {'analyze':analyze,'repair':repair,'confirm':confirm}[operation](request,output)
