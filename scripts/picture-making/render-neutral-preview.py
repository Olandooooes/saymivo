#!/usr/bin/env python3
"""Rebuild the neutral fixture in a fresh temp directory and burn the example ASS.

The pictures are synthetic labels and window outlines. This is not a user
episode and not an aesthetic acceptance. The script does not play the file.
"""
from __future__ import annotations

import argparse
import hashlib
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
PACK = ROOT / "docs" / "picture-making"
FIXTURE = PACK / "fixture"
FONT = PACK / "style" / "fonts" / "NotoSansSC-Bold.otf"
ASS = PACK / "style" / "caption-style.example.ass"
REFERENCE = FIXTURE / "fixtures" / "preview-key-state.png"


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    h.update(path.read_bytes())
    return h.hexdigest()


def run(cmd: list[str], log_path: Path) -> subprocess.CompletedProcess[str]:
    proc = subprocess.run(cmd, check=False, capture_output=True, text=True)
    log_path.write_text(proc.stderr + "\n" + proc.stdout, encoding="utf-8")
    if proc.returncode != 0:
        raise RuntimeError(f"command failed ({proc.returncode}): {' '.join(cmd)}\n{proc.stderr[-2000:]}")
    return proc


def mean_abs(a: np.ndarray, b: np.ndarray, y0: int, y1: int) -> float:
    block_a = a[y0:y1].astype(np.int16)
    block_b = b[y0:y1].astype(np.int16)
    return float(np.abs(block_a - block_b).mean())


def burn(still: Path, ass: Path, fontsdir: Path, out_png: Path, log_path: Path, at: str) -> None:
    cmd = [
        "ffmpeg", "-y", "-hide_banner", "-loglevel", "verbose",
        "-loop", "1", "-i", str(still),
        "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000",
        "-t", "3",
        "-vf", f"ass={ass}:fontsdir={fontsdir}",
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac",
        "-shortest",
        str(out_png.with_suffix(".mp4")),
    ]
    run(cmd, log_path)
    run(
        [
            "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
            "-ss", at, "-i", str(out_png.with_suffix(".mp4")),
            "-frames:v", "1", "-update", "1", str(out_png),
        ],
        log_path.with_name(log_path.stem + "-frame.txt"),
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--artifact-dir",
        type=Path,
        default=None,
        help="Optional directory for the rebuilt still and the caption still",
    )
    args = parser.parse_args()
    if not FONT.is_file():
        print("FAIL font missing", FONT)
        return 1
    work = Path(tempfile.mkdtemp(prefix="saymivo-neutral-"))
    try:
        fixture = work / "fixture"
        shutil.copytree(FIXTURE, fixture)
        rebuilt_ref = fixture / "fixtures" / "preview-key-state.png"
        rebuilt_ref.unlink()
        proc = subprocess.run(
            [sys.executable, str(fixture / "build_preview.py")],
            check=False,
            capture_output=True,
            text=True,
        )
        print(proc.stdout.strip())
        if proc.returncode != 0:
            print(proc.stderr)
            print("FAIL build_preview")
            return 1
        ref = np.array(Image.open(REFERENCE).convert("RGB"))
        got = np.array(Image.open(rebuilt_ref).convert("RGB"))
        if ref.shape != got.shape:
            print(f"FAIL shape {got.shape} != {ref.shape}")
            return 1
        delta = np.abs(ref.astype(np.int16) - got.astype(np.int16))
        print(
            "rebuild",
            f"bytes_match={sha256(rebuilt_ref)==sha256(REFERENCE)}",
            f"max_abs={int(delta.max())}",
            f"mean_abs={float(delta.mean()):.4f}",
        )
        if int(delta.max()) != 0:
            print("FAIL rebuilt key state pixels differ from the committed fixture")
            return 1

        fonts_hit = work / "fonts-hit"
        fonts_miss = work / "fonts-miss"
        fonts_hit.mkdir()
        fonts_miss.mkdir()
        shutil.copy(FONT, fonts_hit / FONT.name)
        ass = work / "caption.ass"
        shutil.copy(ASS, ass)
        caption_png = work / "caption-frame.png"
        plain_png = work / "plain-frame.png"
        burn(rebuilt_ref, ass, fonts_hit, caption_png, work / "ffmpeg-hit.log", "00:00:01.200")
        burn(rebuilt_ref, ass, fonts_miss, plain_png, work / "ffmpeg-miss.log", "00:00:01.200")
        hit_log = (work / "ffmpeg-hit.log").read_text(encoding="utf-8", errors="replace")
        if str(fonts_hit / FONT.name) not in hit_log:
            print("FAIL libass log did not load NotoSansSC-Bold.otf")
            return 1
        cap = np.array(Image.open(caption_png).convert("RGB"))
        plain = np.array(Image.open(plain_png).convert("RGB"))
        upper = mean_abs(cap, plain, 0, 900)
        lower = mean_abs(cap, plain, 960, 1080)
        print(f"caption_vs_nofont upper_mean={upper:.3f} lower_mean={lower:.3f}")
        if lower < 4 or lower < upper * 3:
            print("FAIL caption band did not change when the project font was loaded")
            return 1
        highlight_png = work / "caption-highlight.png"
        run(
            [
                "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
                "-ss", "00:00:02.200", "-i", str(caption_png.with_suffix(".mp4")),
                "-frames:v", "1", "-update", "1", str(highlight_png),
            ],
            work / "ffmpeg-highlight.txt",
        )
        print("font_loaded=NotoSansSC-Bold.otf family=Noto Sans SC")
        print("temp_dir", work)
        print("watched_video=no listened=no aesthetic=not-claimed")
        print("RESULT technical=pass")
        if args.artifact_dir:
            args.artifact_dir.mkdir(parents=True, exist_ok=True)
            shutil.copy(rebuilt_ref, args.artifact_dir / "neutral-key-state.png")
            shutil.copy(caption_png, args.artifact_dir / "neutral-caption-frame.png")
            shutil.copy(highlight_png, args.artifact_dir / "neutral-caption-highlight.png")
            print("artifacts", args.artifact_dir)
        return 0
    except Exception:
        raise


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:
        print("FAIL", exc)
        sys.exit(1)
