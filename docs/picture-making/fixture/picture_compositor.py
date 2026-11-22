#!/usr/bin/env python3
"""Neutral picture compositor helpers (no project dialogue, no private paths)."""
from __future__ import annotations
import numpy as np
from PIL import Image, ImageDraw


def fade(t, start, dur=0.35, hold_until=None, fadeout=0.35):
    if t < start:
        return 0.0
    u = (t - start) / dur if dur > 0 else 1.0
    u = max(0.0, min(1.0, u))
    u = u * u * (3 - 2 * u)
    a = u
    if hold_until is not None and t > hold_until:
        v = (t - hold_until) / fadeout if fadeout > 0 else 1.0
        v = max(0.0, min(1.0, v))
        v = v * v * (3 - 2 * v)
        a = a * (1 - v)
    return a


def mul_alpha(arr, a):
    if a <= 0:
        return None
    if a >= 0.999:
        return arr
    out = arr.copy()
    out[:, :, 3] = (out[:, :, 3].astype(np.float32) * a).astype(np.uint8)
    return out


def over(dst, src):
    if src is None:
        return dst
    src_a = src[:, :, 3].astype(np.float32) / 255.0
    if src_a.max() <= 0:
        return dst
    inv = 1.0 - src_a
    out = dst.astype(np.float32)
    s = src.astype(np.float32)
    for c in range(3):
        out[:, :, c] = s[:, :, c] * src_a + out[:, :, c] * inv
    out[:, :, 3] = np.clip(s[:, :, 3] + dst[:, :, 3].astype(np.float32) * inv, 0, 255)
    return out.astype(np.uint8)


def scale_about(arr, scale, ax, ay):
    im = Image.fromarray(arr, "RGBA")
    w, h = im.size
    c = ax * (1.0 - 1.0 / scale)
    f = ay * (1.0 - 1.0 / scale)
    return np.array(
        im.transform(
            (w, h),
            Image.Transform.AFFINE,
            (1.0 / scale, 0, c, 0, 1.0 / scale, f),
            resample=Image.Resampling.BICUBIC,
        )
    )


def camera_placeholder(w, h, cx, cy, outer, ring, fill=(90, 90, 95, 255), label="PIP"):
    """Geometric stand-in for a circular camera well. Not a generated likeness."""
    yy, xx = np.ogrid[:h, :w]
    dist = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2)
    r_out = outer / 2
    r_in = r_out - ring
    layer = np.zeros((h, w, 4), dtype=np.uint8)
    inner = dist <= r_in
    ring_m = (dist <= r_out) & (dist >= r_in)
    layer[inner] = fill
    layer[ring_m] = (255, 255, 255, 255)
    im = Image.fromarray(layer, "RGBA")
    dr = ImageDraw.Draw(im)
    dr.text((cx - 18, cy - 10), label, fill=(230, 230, 230, 255))
    return np.array(im)


