# Synthetic animation, deliberately no person or voice sample.
import av, numpy as np, sys, math
out=av.open(sys.argv[1],'w');stream=out.add_stream('libx264',rate=30);stream.width=540;stream.height=960;stream.pix_fmt='yuv420p';stream.options={'preset':'ultrafast','crf':'24'}
y,x=np.mgrid[:960,:540]
for i in range(540):
    a=np.zeros((960,540,3),dtype=np.uint8);a[:]=[21,31,18]
    shade=((x/540+y/960)*8).astype(np.uint8)
    a+=shade[:,:,None]
    for yy in range(80,960,80):a[yy:yy+1]=[34,48,28]
    for xx in range(30,540,80):a[:,xx:xx+1]=[34,48,28]
    a[90:95,60:480]=[197,227,153];a[825:830,60:480]=[197,227,153]
    # Floating frame and abstract voice waveform.
    top=360+int(math.sin(i/40)*10);a[top:top+300,100:440]=[48,68,37];a[top+4:top+296,104:436]=[27,42,22]
    for j in range(17):
        h=int(20+55*abs(math.sin(i/15+j*.55)));xx=140+j*16;a[top+150-h:top+150+h,xx:xx+7]=[202,239,151]
    frame=av.VideoFrame.from_ndarray(a,format='rgb24')
    for p in stream.encode(frame):out.mux(p)
for p in stream.encode():out.mux(p)
out.close()
