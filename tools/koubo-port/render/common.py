"""Shared drawing / easing / compositing helpers (PIL + numpy + cv2).
All frames are float32 HxWx3 in 0..1. Layers are PIL RGBA images.
"""
import os, math, json
import numpy as np, cv2
from PIL import Image, ImageDraw, ImageFont, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
STYLE = json.load(open(os.path.join(HERE, '..', 'config', 'style.json')))
W, H = STYLE['canvas']['w'], STYLE['canvas']['h']
FPS = STYLE['canvas']['fps']
REF_H = 776.0                       # the motion was designed on a 776 px high content area
def px(v): return int(round(v * H / REF_H))   # port a design px value to the current canvas

FONT_DIR = os.environ.get('PORT_FONT_DIR', os.path.join(HERE, '..', 'fonts'))
FONT_SANS = os.path.join(FONT_DIR, 'NotoSansSC.ttf')     # variable font, named instances Medium/Bold/Black
FONT_SERIF = os.path.join(FONT_DIR, 'NotoSerifSC.ttf')
_fc = {}
def font(size, weight='Bold', serif=False):
    k = (size, weight, serif)
    if k not in _fc:
        f = ImageFont.truetype(FONT_SERIF if serif else FONT_SANS, size)
        try: f.set_variation_by_name(weight)
        except Exception: pass
        _fc[k] = f
    return _fc[k]

def col(name, a=255):
    c = STYLE['colors'][name]; return tuple(c[:3]) + ((c[3],) if len(c) > 3 else (a,))

# ---------------- easing (match style.json "motion")
def clamp(x, a=0.0, b=1.0): return max(a, min(b, x))
def lerp(a, b, t): return a + (b - a) * t
def ease_out(t): t = clamp(t); return 1 - (1 - t) ** 4                     # ~cubic-bezier(.25,1,.5,1)
def ease_io(t): t = clamp(t); return 4 * t ** 3 if t < .5 else 1 - (-2 * t + 2) ** 3 / 2
def back(t, s=STYLE['motion']['back_overshoot']):
    t = clamp(t) - 1; return t * t * ((s + 1) * t + s) + 1                     # peaks ~110 %

def pop(t, t0, dur=None, t_out=None, out_dur=None):
    """scale/opacity of a pop-in (0.3 -> ~1.1 -> 1.0) with optional fade-out"""
    M = STYLE['motion']['pop']; dur = dur or M['dur']; out_dur = out_dur or M['exit']
    if t0 is None or t < t0: return 0.0, 0.0
    k = (t - t0) / dur; s = M['from_scale'] + (1 - M['from_scale']) * back(k); o = clamp((t - t0) / M['opacity_in'])
    if t_out is not None and t > t_out:
        q = clamp((t - t_out) / out_dur); o *= 1 - q; s *= 1 - M['exit_shrink'] * q
    return s, o

def fade_up(t, t0, dur=None, dy=None):
    M = STYLE['motion']['fade_up']; dur = dur or M['dur']; dy = px(24) if dy is None else dy
    if t0 is None or t < t0: return None
    k = ease_out((t - t0) / dur); return dy * (1 - k), clamp((t - t0) / (dur * 0.7))

def out_factor(t, t_out, dur=0.15):
    return 1.0 if t_out is None else 1 - clamp((t - t_out) / dur)

# ---------------- text & shapes
def text_size(txt, f, spacing=0):
    b = f.getbbox(txt); return b[2] - b[0] + spacing * max(0, len(txt) - 1), b[3] - b[1], b

def draw_text(img, xy, txt, f, fill, spacing=0, stroke=0, stroke_fill=None):
    d = ImageDraw.Draw(img)
    if spacing == 0:
        d.text(xy, txt, font=f, fill=fill, stroke_width=stroke, stroke_fill=stroke_fill); return
    x, y = xy; base = y + f.getmetrics()[0]                 # baseline-anchored letter-spacing (no glyph jitter)
    for ch in txt:
        d.text((x, base), ch, font=f, fill=fill, stroke_width=stroke, stroke_fill=stroke_fill, anchor='ls')
        x += f.getlength(ch) + spacing

def rrect_mask(w, h, r, ss=2):
    m = Image.new('L', (w * ss, h * ss), 0); ImageDraw.Draw(m).rounded_rectangle([0, 0, w * ss - 1, h * ss - 1], r * ss, fill=255)
    return m.resize((w, h), Image.LANCZOS)

def alpha_comp(dst, src, x, y, opacity=1.0):
    if isinstance(src, Image.Image): src = np.asarray(src.convert('RGBA'))
    h, w = src.shape[:2]; Hd, Wd = dst.shape[:2]
    x, y = int(x), int(y)
    x0, y0 = max(0, x), max(0, y); x1, y1 = min(Wd, x + w), min(Hd, y + h)
    if x1 <= x0 or y1 <= y0 or opacity <= 0.003: return
    s = src[y0 - y:y1 - y, x0 - x:x1 - x].astype(np.float32) / 255
    a = s[..., 3:4] * opacity
    dst[y0:y1, x0:x1] = dst[y0:y1, x0:x1] * (1 - a) + s[..., :3] * a

def safe_box():
    """Text stays on the canvas: 4% inset, and above the chapter bar."""
    bar = 0
    chapter = STYLE.get('chapter_bar') or {}
    if chapter.get('enabled', True):
        bar = int(chapter.get('height') or 0)
    return (int(0.04 * W), int(0.04 * H), int(0.96 * W), int(H - max(bar, int(0.04 * H)) - 8))


def scaled_layer(layer, scale, cx, cy, opacity, dst, box=None):
    """Paste a layer around (cx, cy).

    A layer whose centre is already on the canvas is shifted and, if it still
    does not fit, shrunk so the whole layer stays in the safe box. A centre
    that is still off the canvas is an entrance or exit slide and is left
    alone, so that animation can travel in from outside the frame.
    """
    if scale <= 0.01 or opacity <= 0.003: return
    w, h = layer.size
    nw, nh = max(1, int(round(w * scale))), max(1, int(round(h * scale)))
    left, top = cx - nw / 2.0, cy - nh / 2.0
    x0, y0, x1, y1 = box or safe_box()
    if x0 <= cx <= x1 and y0 <= cy <= y1:
        fit = min(1.0, max(8.0, x1 - x0) / nw, max(8.0, y1 - y0) / nh)
        nw, nh = max(1, int(round(nw * fit))), max(1, int(round(nh * fit)))
        left, top = cx - nw / 2.0, cy - nh / 2.0
        if left < x0:
            left = x0
        if left + nw > x1:
            left = x1 - nw
        if top < y0:
            top = y0
        if top + nh > y1:
            top = y1 - nh
    L = layer.resize((nw, nh), Image.BICUBIC) if nw != w or nh != h else layer
    alpha_comp(dst, L, int(round(left)), int(round(top)), opacity)

def put_left(dst, L, x_left, cy, scale=1.0, opacity=1.0, pad=30):
    """paste a padded text layer so its visible left edge sits at x_left"""
    scaled_layer(L, scale, x_left + (L.size[0] / 2 - pad) * scale, cy, opacity, dst)

CACHE = {}
def cached(key, fn):
    if key not in CACHE: CACHE[key] = fn()
    return CACHE[key]
