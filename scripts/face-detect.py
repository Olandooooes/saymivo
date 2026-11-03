#!/usr/bin/env python3
"""Write a normalized face box, or face null when detection is unavailable."""
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path


def write(path, payload):
    Path(path).write_text(json.dumps(payload, ensure_ascii=False), encoding='utf8')


def main():
    if len(sys.argv) < 3:
        print('用法: python3 scripts/face-detect.py 视频 face.json', file=sys.stderr)
        return 1
    source, output = sys.argv[1], sys.argv[2]
    try:
        import cv2
    except ImportError:
        write(output, {'face': None, 'reason': 'opencv-missing'})
        print(json.dumps({'face': None, 'reason': 'opencv-missing'}, ensure_ascii=False))
        return 0
    if not shutil.which('ffmpeg'):
        write(output, {'face': None, 'reason': 'ffmpeg-missing'})
        return 0
    cascade = Path(cv2.data.haarcascades) / 'haarcascade_frontalface_default.xml'
    finder = cv2.CascadeClassifier(str(cascade))
    with tempfile.TemporaryDirectory() as folder:
        frame = Path(folder) / 'frame.jpg'
        subprocess.run(['ffmpeg', '-y', '-ss', '1', '-i', source, '-frames:v', '1', str(frame)], check=False, capture_output=True)
        image = cv2.imread(str(frame))
        if image is None:
            write(output, {'face': None, 'reason': 'no-frame'})
            return 0
        height, width = image.shape[:2]
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        boxes = finder.detectMultiScale(gray, 1.1, 4)
    if len(boxes) == 0:
        write(output, {'face': None, 'reason': 'none'})
        return 0
    x, y, w, h = max(boxes, key=lambda box: box[2] * box[3])
    face = {'x': x / width, 'y': y / height, 'w': w / width, 'h': h / height}
    write(output, {'face': face})
    print(json.dumps({'face': face}, ensure_ascii=False))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
