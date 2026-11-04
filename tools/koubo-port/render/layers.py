"""Reusable graphic layers (pills, capsules, yellow headline text, cards, icons)."""
from common import *

def text_layer(txt, size, weight='Black', fill=(255, 255, 255, 255), stroke=0, sfill=None, shadow=True, serif=False):
    sfill = sfill or col('stroke')
    def mk():
        f = font(size, weight, serif); w, h, b = text_size(txt, f); pad = 30 + stroke
        L = Image.new('RGBA', (w + 2 * pad, h + 2 * pad), (0, 0, 0, 0))
        if shadow:
            sh = Image.new('RGBA', L.size, (0, 0, 0, 0))
            ImageDraw.Draw(sh).text((pad - b[0] + 4, pad - b[1] + 6), txt, font=f, fill=(0, 0, 0, 170), stroke_width=stroke, stroke_fill=(0, 0, 0, 170))
            L = Image.alpha_composite(L, sh.filter(ImageFilter.GaussianBlur(7)))
        ImageDraw.Draw(L).text((pad - b[0], pad - b[1]), txt, font=f, fill=fill, stroke_width=stroke, stroke_fill=sfill)
        return L
    return cached(('T', txt, size, weight, fill, stroke, shadow, serif), mk)

def yellow(txt, size):
    """yellow Black headline with dark stroke + soft drop shadow (reference 'big word' look)"""
    def mk():
        f = font(size, 'Black'); w, h, b = text_size(txt, f); st = max(4, int(size * 0.06))
        L = Image.new('RGBA', (w + 60, h + 60), (0, 0, 0, 0))
        sh = Image.new('RGBA', L.size, (0, 0, 0, 0))
        ImageDraw.Draw(sh).text((30 - b[0] + 5, 30 - b[1] + 7), txt, font=f, fill=(0, 0, 0, 200), stroke_width=st + 2, stroke_fill=(0, 0, 0, 200))
        L = Image.alpha_composite(L, sh.filter(ImageFilter.GaussianBlur(6)))
        ImageDraw.Draw(L).text((30 - b[0], 30 - b[1]), txt, font=f, fill=col('yellow'), stroke_width=st, stroke_fill=col('stroke'))
        return L
    return cached(('Y', txt, size), mk)

def pill(txt, size, fg=(255, 255, 255, 255), fill=None, border=(255, 255, 255, 255), bw=None, padx=None, pady=None, serif=False):
    fill = fill or col('pill_dark'); bw = bw if bw is not None else max(2, px(4))
    padx = padx if padx is not None else int(size * 0.8); pady = pady if pady is not None else int(size * 0.38)
    def mk():
        f = font(size, 'Black', serif); w, h, b = text_size(txt, f)
        W_, H_ = w + 2 * padx, int(h + 2 * pady)
        L = Image.new('RGBA', (W_ + 40, H_ + 40), (0, 0, 0, 0))
        sh = Image.new('RGBA', L.size, (0, 0, 0, 0)); ImageDraw.Draw(sh).rounded_rectangle([20, 26, 20 + W_, 26 + H_], H_ // 2, fill=(0, 0, 0, 110))
        L = Image.alpha_composite(L, sh.filter(ImageFilter.GaussianBlur(10)))
        d = ImageDraw.Draw(L); d.rounded_rectangle([20, 20, 20 + W_, 20 + H_], H_ // 2, fill=fill, outline=border, width=bw)
        d.text((20 + padx - b[0], 20 + pady - b[1]), txt, font=f, fill=fg)
        return L
    return cached(('P', txt, size, fg, fill, border, bw, padx, pady, serif), mk)

def outline_pill(txt, size): return pill(txt, size, fill=col('pill_outline_fill'))
def dark_pill(txt, size): return pill(txt, size)
def capsule(txt, size): return pill(txt, size, fg=col('yellow'), fill=col('capsule_fill'), padx=int(size * 0.92), pady=int(size * 0.38), serif=True)

def card(w, h, r=None, glow=None):
    """white card with soft shadow; glow = rgb outline glow (e.g. pink/orange)"""
    r = r or px(20)
    def mk():
        L = Image.new('RGBA', (w + 80, h + 80), (0, 0, 0, 0))
        sh = Image.new('RGBA', L.size, (0, 0, 0, 0)); ImageDraw.Draw(sh).rounded_rectangle([40, 48, 40 + w, 48 + h], r, fill=(60, 40, 40, 70))
        L = Image.alpha_composite(L, sh.filter(ImageFilter.GaussianBlur(16)))
        if glow:
            g = Image.new('RGBA', L.size, (0, 0, 0, 0)); ImageDraw.Draw(g).rounded_rectangle([36, 36, 44 + w, 44 + h], r + 4, outline=tuple(glow) + (200,), width=6)
            L = Image.alpha_composite(L, g.filter(ImageFilter.GaussianBlur(5)))
        ImageDraw.Draw(L).rounded_rectangle([40, 40, 40 + w, 40 + h], r, fill=(255, 255, 255, 255), outline=(236, 233, 228, 255), width=2)
        return L
    return cached(('card', w, h, r, tuple(glow) if glow else None), mk)

def draw_check(d, cx, cy, r, c=(255, 255, 255, 255), w=5):
    d.line([(cx - r * 0.45, cy + r * 0.02), (cx - r * 0.1, cy + r * 0.38), (cx + r * 0.5, cy - r * 0.35)], fill=c, width=w, joint='curve')

def draw_x(d, cx, cy, r, c=(255, 255, 255, 255), w=6):
    a = r * 0.38; d.line([(cx - a, cy - a), (cx + a, cy + a)], fill=c, width=w); d.line([(cx - a, cy + a), (cx + a, cy - a)], fill=c, width=w)

def icon(kind, r, fill):
    def mk():
        L = Image.new('RGBA', (2 * r + 20, 2 * r + 20), (0, 0, 0, 0)); d = ImageDraw.Draw(L)
        d.ellipse([10, 14, 10 + 2 * r, 14 + 2 * r], fill=(0, 0, 0, 90)); L = L.filter(ImageFilter.GaussianBlur(4)); d = ImageDraw.Draw(L)
        d.ellipse([10, 10, 10 + 2 * r, 10 + 2 * r], fill=fill, outline=(255, 255, 255, 255), width=3)
        (draw_x if kind == 'x' else draw_check)(d, 10 + r, 10 + r, r)
        return L
    return cached(('ic', kind, r, fill), mk)

def badge(n, r):
    def mk():
        L = Image.new('RGBA', (2 * r + 20, 2 * r + 20), (0, 0, 0, 0)); d = ImageDraw.Draw(L)
        d.ellipse([10, 10, 10 + 2 * r, 10 + 2 * r], fill=col('orange'), outline=(255, 255, 255, 255), width=3)
        f = font(int(r * 1.15), 'Black'); w = f.getlength(str(n)); d.text((10 + r - w / 2, 10 + r), str(n), font=f, fill=(255, 255, 255, 255), anchor='lm')
        return L
    return cached(('bd', n, r), mk)

def blur_slide(dst, L, t, t0, x_from, x_to, cy, t_out=None, out_to=None):
    """horizontal slide with motion blur proportional to velocity (reference chapter text)"""
    M = STYLE['motion']['blur_slide']
    if t0 is None or t < t0: return
    k = ease_out((t - t0) / M['in']); x = lerp(x_from, x_to, k)
    v = abs(lerp(x_from, x_to, ease_out((t + 1 / FPS - t0) / M['in'])) - x); o = clamp((t - t0) / 0.12)
    if t_out is not None and t >= t_out:
        q = clamp((t - t_out) / M['out']); x = lerp(x_to, out_to, q * q); v = abs(out_to - x_to) * 0.25 * q; o *= 1 - clamp((q - 0.6) / 0.4)
    if o <= 0: return
    a = np.asarray(L).astype(np.float32); n = int(min(M['max_kernel_px'], v * M['kernel_per_px_velocity']))
    if n > 2:
        a[..., :3] *= a[..., 3:4] / 255                         # premultiply before blurring
        a = cv2.filter2D(a, -1, np.ones((1, n), np.float32) / n)
        a[..., :3] = np.where(a[..., 3:4] > 0, a[..., :3] * 255 / np.maximum(a[..., 3:4], 1e-3), 0)
    alpha_comp(dst, np.clip(a, 0, 255).astype(np.uint8), int(x), int(cy - L.size[1] / 2), o)

def glow_bg(t, base, glows):
    """dark page with slowly drifting radial glows (computed at 1/4 res)"""
    w, h = W // 4, H // 4; yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    img = np.ones((h, w, 3), np.float32) * np.array(base, np.float32) / 255
    for gx, gy, rad, c, amp in glows:
        gx = gx + 0.02 * math.sin(t * 0.5 + gx * 7); gy = gy + 0.02 * math.cos(t * 0.43 + gy * 5)
        g = np.exp(-(((xx / w - gx) ** 2) * (w / h) ** 2 + (yy / h - gy) ** 2) / rad ** 2) * amp
        img += g[..., None] * np.array(c, np.float32) / 255
    return cv2.resize(np.clip(img, 0, 1), (W, H), interpolation=cv2.INTER_LINEAR)
