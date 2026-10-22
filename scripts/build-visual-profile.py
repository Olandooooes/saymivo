"""Read-only local source profile. No editor coordinates are changed by this tool."""
import argparse, hashlib, json, os, pathlib, shutil, subprocess, sys

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('source');parser.add_argument('output_directory');parser.add_argument('--times',required=True)
    args=parser.parse_args()
    source=pathlib.Path(args.source).resolve(strict=True);output=pathlib.Path(args.output_directory).resolve()
    times=[float(t) for t in args.times.split(',')]
    if not times or len(times)>60 or any(t<0 or not t<float('inf') for t in times):raise ValueError('Invalid sample times')
    if sys.platform!='darwin':raise RuntimeError('Local Apple Vision analysis requires macOS; keep manual layout available')
    output.mkdir(parents=True,exist_ok=True)
    digest=hashlib.sha256()
    with source.open('rb') as handle:
        for chunk in iter(lambda:handle.read(1024*1024),b''):digest.update(chunk)
    ffmpeg=str(pathlib.Path('.tools/bin/ffmpeg').resolve()) if pathlib.Path('.tools/bin/ffmpeg').is_file() else shutil.which('ffmpeg')
    if not ffmpeg:raise RuntimeError('FFmpeg unavailable for profile sampling')
    images=[]
    for i,second in enumerate(times):
        image=output/('sample-%03d.png'%i)
        subprocess.run([ffmpeg,'-nostdin','-hide_banner','-loglevel','error','-ss',str(second),'-i',str(source),'-frames:v','1','-vf','scale=640:-2','-y',str(image)],check=True)
        if not image.is_file():raise RuntimeError('No decoded frame at requested sample time')
        images.append(image)
    env={**os.environ,'CLANG_MODULE_CACHE_PATH':'/private/tmp/koubo-visual-profile-module-cache'}
    report=output/'profile.json'
    subprocess.run(['swift','scripts/inspect-visual-profile.swift',str(report),*[str(p) for p in images]],env=env,check=True)
    data=json.loads(report.read_text());data.update(source=str(source),sourceSha256=digest.hexdigest(),requestedSampleTimesSec=times,limitations=['Sparse source samples; not continuous tracking','Source coordinates require projection through each scene crop before placing text','Luminance is a sampled summary, not a guarantee of text contrast'])
    for frame,second in zip(data['frames'],times):frame['requestedAtSec']=second
    report.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
    print(report)

if __name__=='__main__':main()
