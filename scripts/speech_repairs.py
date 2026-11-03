"""Detect ASR words stretched through silence; never infer character cut points."""

def repair_windows(words, speech, quiet, duration, *, max_span=18.0):
    # A long word crossing a real quiet interval can hide a second recording.
    suspects = [(w['startMs']/1000, w['endMs']/1000) for w in words
                if w['endMs']-w['startMs'] >= 700 and
                any(min(b,w['endMs']/1000)-max(a,w['startMs']/1000) >= .55 for a,b in quiet)]
    groups=[]
    for a,b in sorted(speech):
        if groups and a-groups[-1][1]<.65 and b-groups[-1][0]<=max_span-.8:
            groups[-1][1]=b
        else: groups.append([a,b])
    windows=[]
    for a,b in groups:
        if not any(y>a and x<b for x,y in suspects): continue
        start,end=max(0,a-.4),min(duration,b+.4)
        if not windows or start>=windows[-1][1]:windows.append([start,end])
        elif end-windows[-1][0]<=max_span:windows[-1][1]=end
        else:windows[-1][1]=min(windows[-1][1],a-.01);windows.append([a-.01,end])
    return windows


def replace_observations(words, passes, quiet=(), speech=()):
    """Replace only complete source words; retain boundary-straddling evidence."""
    verified=[]
    for item in passes:
        a,b=item['startSec']*1000,item['endSec']*1000
        observed=[w for w in item['words'] if a-1<=w['startMs']<=w['endMs']<=b+1]
        if observed:verified.append((a,b,observed))
    def covered(ranges,start,end):
        return sum(max(0,min(end,b)-max(start,a)) for a,b in ranges)
    def key(text):
        import unicodedata
        return ''.join(c.lower() for c in unicodedata.normalize('NFKC',text) if unicodedata.category(c)[0] in 'LN')
    out=[]
    for w in words:
        start=any(a-1<=w['startMs']<=b+1 for a,b,_ in verified)
        end=any(a-1<=w['endMs']<=b+1 for a,b,_ in verified)
        # Independent reads of both ends supersede a token that swallowed the
        # silence between takes. One observed end alone cannot erase a token.
        shadow=False
        for _,_,items in verified:
            for observed in items:
                if key(observed['word'])!=key(w['word']):continue
                old_a,old_b=w['startMs']/1000,w['endMs']/1000
                new_a,new_b=observed['startMs']/1000,observed['endMs']/1000
                extra=max(0,new_a-old_a)+max(0,old_b-new_b)
                quiet_extra=covered(quiet,old_a,min(new_a,old_b))+covered(quiet,max(new_b,old_a),old_b)
                voiced_extra=covered(speech,old_a,min(new_a,old_b))+covered(speech,max(new_b,old_a),old_b)
                if min(old_b,new_b)>max(old_a,new_a) and extra>=.55 and quiet_extra>=extra*.95 and voiced_extra<=.08:shadow=True
        a,b=w['startMs']/1000,w['endMs']/1000
        phantom=(b-a>=.7 and (start or end) and covered(quiet,a,b)>=(b-a)*.95 and covered(speech,a,b)<=.08)
        if not ((start and end) or shadow or phantom):out.append(w)
    out.extend(w for _,_,observed in verified for w in observed)
    unique=[]
    for w in sorted(out,key=lambda w:(w['startMs'],w['endMs'])):
        if not any(p['word']==w['word'] and min(p['endMs'],w['endMs'])-max(p['startMs'],w['startMs'])>
                   .5*max(1,min(p['endMs']-p['startMs'],w['endMs']-w['startMs'])) for p in unique[-8:]):unique.append(w)
    return unique
