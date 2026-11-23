#!/usr/bin/env python3
"""Rebuild fixtures/preview-key-state.png from the neutral PNGs. No private media."""
from pathlib import Path
import numpy as np
from PIL import Image
from picture_compositor import over, camera_placeholder

HERE = Path(__file__).resolve().parent
FIX = HERE / "fixtures"

def load(name):
    return np.array(Image.open(FIX / name).convert("RGBA"))

def main():
    dst = load("00-bg.png")
    for name in ("03-illus-windows.png", "01-nav-示例主题.png", "02-explain-示例重点.png"):
        dst = over(dst, load(name))
    dst = over(dst, camera_placeholder(1920, 1080, 224.5, 854.5, 377, 14))
    out = FIX / "preview-key-state.png"
    Image.fromarray(dst, "RGBA").convert("RGB").save(out)
    print("wrote", out)

if __name__ == "__main__":
    main()
