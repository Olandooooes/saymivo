"""Step 5: cut the video with exactly the same frame-rounded keep list (silent, re-encoded).
usage: python 05_cut_video.py source.mp4 workdir/   -> workdir/cut_video.mp4
"""
import json, sys, os, subprocess

def main(src, wd):
    C = json.load(open(os.path.join(wd, 'cutlist.json'))); K = C['keep']
    sel = '+'.join(f'between(t,{a:.4f},{b - 0.5 / C["fps"]:.4f})' for a, b in K)
    vf = f"select='{sel}',setpts=N/FRAME_RATE/TB"
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', src, '-an', '-vf', vf, '-c:v', 'libx264', '-crf', '12', '-preset', 'medium',
                    '-pix_fmt', 'yuv420p', os.path.join(wd, 'cut_video.mp4')], check=True)
    n = subprocess.run(['ffprobe', '-v', 'error', '-count_frames', '-show_entries', 'stream=nb_read_frames', '-of', 'csv=p=0',
                        os.path.join(wd, 'cut_video.mp4')], capture_output=True, text=True).stdout.strip()
    exp = round(sum(b - a for a, b in K) * C['fps'])
    print('frames', n, 'expected', exp)

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
