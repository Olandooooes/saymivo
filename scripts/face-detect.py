#!/usr/bin/env python3
"""Write a normalized face box from several frames, or face null when detection is unavailable."""
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path


def write(path, payload):
    Path(path).write_text(json.dumps(payload, ensure_ascii=False), encoding='utf8')


def duration_of(source):
    probe = subprocess.run(
        ['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'json', source],
        capture_output=True, text=True, check=False,
    )
    try:
        return float(json.loads(probe.stdout)['format']['duration'])
    except (KeyError, TypeError, ValueError, json.JSONDecodeError):
        return 0


def sample_times(length):
    count = 10
    if length <= 0:
        return [0]
    start = min(0.5, length * 0.05)
    end = max(start, length * 0.95)
    if end <= start:
        return [start]
    return [start + (end - start) * index / (count - 1) for index in range(count)]


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
    finder = cv2.CascadeClassifier(str(Path(cv2.data.haarcascades) / 'haarcascade_frontalface_default.xml'))
    boxes = []
    width = height = 0
    with tempfile.TemporaryDirectory() as folder:
        for index, second in enumerate(sample_times(duration_of(source))):
            frame = Path(folder) / f'frame-{index}.jpg'
            subprocess.run(['ffmpeg', '-y', '-ss', f'{second:.3f}', '-i', source, '-frames:v', '1', str(frame)], check=False, capture_output=True)
            image = cv2.imread(str(frame))
            if image is None:
                continue
            height, width = image.shape[:2]
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
            found = finder.detectMultiScale(gray, 1.1, 4)
            if len(found):
                boxes.append(max(found, key=lambda box: box[2] * box[3]))
    if not boxes or not width:
        write(output, {'face': None, 'reason': 'none'})
        return 0
    left = min(box[0] for box in boxes) / width
    top = min(box[1] for box in boxes) / height
    right = max(box[0] + box[2] for box in boxes) / width
    bottom = max(box[1] + box[3] for box in boxes) / height
    margin = 0.04
    face = {
        'x': max(0, left - margin),
        'y': max(0, top - margin),
        'w': min(1, right + margin) - max(0, left - margin),
        'h': min(1, bottom + margin) - max(0, top - margin),
    }
    write(output, {'face': face, 'frames': len(boxes)})
    print(json.dumps({'face': face, 'frames': len(boxes)}, ensure_ascii=False))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
