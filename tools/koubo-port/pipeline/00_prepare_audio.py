"""Step 0: measure A/V offset and write aligned audio files.

Many phone/screen recordings start the audio stream later than the video stream
(we saw 0.213 s). If ignored, every cut lands ~200 ms off and word endings get
clipped. We delay the audio by that offset so ALL later times are video time.

usage: python 00_prepare_audio.py source.mp4 workdir/
writes: workdir/aligned48.wav (48 kHz stereo), workdir/aligned16.wav (16 kHz mono), workdir/probe.json
"""
import json, subprocess, sys, os

def stream_start(path, sel):
    out = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', sel, '-show_entries',
                          'stream=start_time', '-of', 'csv=p=0', path], capture_output=True, text=True).stdout.strip()
    try: return float(out.splitlines()[0])
    except Exception: return 0.0

def main(src, wd):
    os.makedirs(wd, exist_ok=True)
    v0 = stream_start(src, 'v:0'); a0 = stream_start(src, 'a:0')
    off = round(a0 - v0, 3)
    fps = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=r_frame_rate',
                          '-of', 'csv=p=0', src], capture_output=True, text=True).stdout.strip()
    n, d = (fps.split('/') + ['1'])[:2]; fps = float(n) / float(d)
    dly = int(round(max(0.0, off) * 1000))
    af = f'adelay={dly}|{dly},' if dly > 0 else ''
    # -copyts not used: we read audio from 0 and shift it by the measured offset
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', src, '-vn', '-af', af + 'aresample=48000', '-ac', '2', '-c:a', 'pcm_s24le',
                    os.path.join(wd, 'aligned48.wav')], check=True)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', os.path.join(wd, 'aligned48.wav'), '-ac', '1', '-ar', '16000',
                    os.path.join(wd, 'aligned16.wav')], check=True)
    json.dump({'audio_offset': off, 'fps': fps, 'source': os.path.basename(src)}, open(os.path.join(wd, 'probe.json'), 'w'), indent=1)
    print('audio offset', off, 'fps', fps)

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
