"""Conservative timestamp comparison; never invent sub-token boundaries."""
import math
import unicodedata

def clean(text):
    return ''.join(c for c in text if unicodedata.category(c)[0] in 'LN').lower()

def compare_words(words, tokens, source_start_sec, duration_sec):
    expected = ''.join(clean(w['text']) for w in words)
    actual = ''.join(clean(t['text']) for t in tokens)
    report = {'tokenTextMatches':expected == actual, 'comparisons':[], 'unresolved':[]}
    if not expected or expected != actual:
        report['unresolved'].append('Model token text does not match supplied caption exactly')
        return report
    positions=[]
    boundaries={0}
    previous_end=0
    invalid=set()
    for index,token in enumerate(tokens):
        a,b=token['start_time'],token['end_time']
        valid=all(isinstance(x,(int,float)) and math.isfinite(x) for x in [a,b])
        if not valid or a<0 or b<=a or b>duration_sec+.0300001 or a<previous_end-.001:
            invalid.add(index)
        if valid: previous_end=max(previous_end,b)
        positions.extend([(index,token)]*len(clean(token['text'])))
        boundaries.add(len(positions))
    cursor=0
    for word in words:
        size=len(clean(word['text']))
        if not size:continue
        next_cursor=cursor+size
        if cursor not in boundaries or next_cursor not in boundaries:
            report['unresolved'].append({'text':word['text'],'reason':'Caption boundary falls inside one model token; no estimated word time assigned'})
            cursor=next_cursor
            continue
        units=positions[cursor:next_cursor];cursor=next_cursor
        if any(index in invalid for index,token in units):
            report['unresolved'].append({'text':word['text'],'reason':'Invalid, zero-length, overlapping or out-of-audio model span'})
            continue
        a=source_start_sec*1000+units[0][1]['start_time']*1000
        b=source_start_sec*1000+units[-1][1]['end_time']*1000
        delta_start=a-word['startMs'];delta_end=b-word['endMs']
        report['comparisons'].append({'text':word['text'],'savedStartMs':word['startMs'],'savedEndMs':word['endMs'],
            'estimatedStartMs':round(a,3),'estimatedEndMs':round(b,3),
            'startDeltaMs':round(delta_start,3),'endDeltaMs':round(delta_end,3),
            'within150msOfModel':max(abs(delta_start),abs(delta_end))<=150})
    return report
