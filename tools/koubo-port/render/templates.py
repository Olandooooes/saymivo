"""Motion templates (generic, data-driven).

Every template is  fn(c, t, P, ctx)  drawing onto float frame c (HxWx3, 0..1).
  P   : the scene spec from scenes.json with all times already resolved to seconds
        (element times are the spoken onset of the word they illustrate, minus a small lead).
  ctx : dict(x0=left text anchor px, x1=right limit px, per=current person frame, start, end)
        x0/x1 come from the current shot: the text column is the half NOT occupied by the person.
OVERLAYS draw over the full-frame person; PAGE LAYERS draw on a page background while the person is a PiP.
Font sizes are design px @776 content height -> px() converts; keep them as in the reference.
"""
from common import *
from layers import *

TS = STYLE['type_scale_px']
def ds(v): return int(v * REF_H / H)   # 1080 px type-scale value -> design px (so px(ds(v)) == v)

def fit_px(text, base, limit, floor=22):
    size = int(base)
    while size > floor and font(size, 'Black').getlength(str(text)) > limit:
        size = int(size * 0.92)
    return max(floor, size)

def _out(P, t, dur=0.18):           # fade-out factor at the scene end
    return 1 - clamp((t - (P['end'] - dur)) / dur)

def _pop_left(c, L, t, t0, x_left, cy, o_mul=1.0, t_out=None, dur=None):
    sc, o = pop(t, t0, dur, t_out)
    if o > 0: put_left(c, L, x_left, cy, sc, o * o_mul)

# ======================================================================= OVERLAYS
def title_card(c, t, P, ctx):
    """Opening title (big white, letter-spaced, zoom-settle) + optional frosted glass question card with a
    progress bar, + animated dot-arrows pointing at the person. Trigger: first sentence / hook."""
    W_, q = W, _out(P, t, 0.15)
    if q <= 0: return
    ttl = P['title']
    def mk():
        f = font(px(150), 'Black'); sp = px(8); w, h, b = text_size(ttl['text'], f, sp)
        L = Image.new('RGBA', (w + 40, h + 40), (0, 0, 0, 0)); sh = Image.new('RGBA', L.size, (0, 0, 0, 0))
        draw_text(sh, (20 - b[0], 22 - b[1]), ttl['text'], f, (20, 10, 40, 120), sp)
        L = Image.alpha_composite(L, sh.filter(ImageFilter.GaussianBlur(8)))
        draw_text(L, (20 - b[0], 20 - b[1]), ttl['text'], f, (255, 255, 255, 235), sp); return L
    L = cached(('title', ttl['text']), mk)
    sc, o = pop(t, ttl['at'] - 0.05, 0.4)
    fit = min(1.1, (ctx['x1'] - ctx['x0']) / L.size[0]) if P.get('fit_column') else min(1.1, W * 0.92 / L.size[0])
    cx = (ctx['x0'] + ctx['x1']) / 2 if P.get('fit_column') else W / 2
    scaled_layer(L, fit * (1 + 0.15 * (1 - ease_out((t - ttl['at']) / 0.45))), cx, int(0.165 * H), o * q, c)
    g = P.get('glass')
    if g:
        sc, o = pop(t, g['at'] - 0.04)
        if o > 0:
            gx, gy, gw, gh = int(ctx['x0'] - 0.02 * W), int(0.32 * H), int(0.40 * W), int(0.22 * H)
            gl = Image.new('RGBA', (gw, gh), (0, 0, 0, 0)); d = ImageDraw.Draw(gl)
            d.rounded_rectangle([0, 0, gw - 1, gh - 1], px(18), fill=(255, 255, 255, 40), outline=(255, 255, 255, 90), width=2)
            gsize = fit_px(g['text'], px(50), gw - px(80), px(22))
            draw_text(gl, (px(36), px(40)), g['text'], font(gsize, 'Black'), (255, 255, 255, 255), px(4) if gsize > px(36) else 0)
            bw = int((gw - px(120)) * clamp((t - g['at']) / 1.2))
            d.rounded_rectangle([px(36), gh - px(34), px(36) + gw - px(120), gh - px(26)], 4, fill=(255, 255, 255, 50))
            d.rounded_rectangle([px(36), gh - px(34), px(36) + max(8, bw), gh - px(26)], 4, fill=(150, 226, 60, 255))
            reg = c[gy:gy + gh, gx:gx + gw]; bl = cv2.GaussianBlur(reg, (0, 0), 18) * 0.87 + 0.13       # frosted glass
            m = np.asarray(rrect_mask(gw, gh, px(18))).astype(np.float32)[..., None] / 255 * o * q
            c[gy:gy + gh, gx:gx + gw] = reg * (1 - m) + bl * m
            scaled_layer(gl, sc, gx + gw / 2, gy + gh / 2, o * q, c)
    a = P.get('arrows')
    if a and t >= a['at'] and q > 0.99:
        L = Image.new('RGBA', (px(230), px(130)), (0, 0, 0, 0)); d = ImageDraw.Draw(L)
        pat = ["1....", "11...", "111..", "1111.", "111..", "11...", "1...."]
        flip = a.get('point', 'right') == 'left'
        for k in range(3):
            ph_ = (t * 2.2 - k * 0.33) % 1.0; al = int(255 * (0.35 + 0.65 * (1 - ph_)))
            for r, row in enumerate(pat):
                for cc, v in enumerate(row):
                    if v == '1':
                        x = px(10 + k * 72 + cc * 12); x = L.size[0] - x if flip else x; y = px(12 + r * 16)
                        d.ellipse([x - px(4), y - px(4), x + px(4), y + px(4)], fill=(255, 255, 255, al))
        alpha_comp(c, L, int(a['x'] * W), int(a['y'] * H), clamp((t - a['at']) / 0.25))

def side_panel(c, t, P, ctx):
    """White panel sliding in beside the person: heading / muted line / body line fade up one by one,
    an accent word pops big in orange, an optional orange tag pill. Trigger: a definition / concept intro."""
    k = ease_out((t - P['start'] - 0.05) / STYLE['motion']['panel_slide']['dur']); out = clamp((t - (P['end'] - 0.22)) / 0.22)
    pw, ph_ = int(0.43 * W), int(0.76 * H); px0 = ctx['x0'] - int(0.01 * W); py = int(0.10 * H)
    Lp = card(pw, ph_, px(22)).copy(); ox = oy = 40
    sty = {'h1': (px(58), 'Black', col('ink')), 'muted': (px(30), 'Bold', col('muted')), 'h2': (px(40), 'Black', col('ink')), 'small': (px(34), 'Bold', (110, 106, 100, 255))}
    y = px(50)
    for it in P['items']:
        sz, wt, fill = sty[it.get('style', 'h2')]
        sz = fit_px(it['text'], sz, pw - px(120), px(22))
        fu = fade_up(t, it['at'])
        if fu:
            dy, o = fu; tmp = Image.new('RGBA', Lp.size, (0, 0, 0, 0))
            draw_text(tmp, (ox + px(54), oy + y + dy), it['text'], font(sz, wt), fill[:3] + (int(255 * o),), px(2) if it.get('style') == 'muted' else 0)
            Lp.alpha_composite(tmp)
        y += int(sz * 1.45)
    ac = P.get('accent')
    if ac and t >= ac['at']:
        sz = px(150)
        while font(sz, 'Black').getlength(ac['text']) > pw - px(120): sz = int(sz * 0.92)     # fit the panel
        sc, o = pop(t, ac['at'], 0.36); A = text_layer(ac['text'], sz, 'Black', col('orange'), shadow=False)
        As = A.resize((max(1, int(A.size[0] * sc)), max(1, int(A.size[1] * sc))))
        tmp = Image.new('RGBA', Lp.size, (0, 0, 0, 0)); tmp.alpha_composite(As, (int(ox + px(24) + A.size[0] / 2 - As.size[0] / 2), int(oy + y - px(10) + A.size[1] / 2 - As.size[1] / 2)))
        tmp.putalpha(tmp.getchannel('A').point(lambda v: int(v * o))); Lp.alpha_composite(tmp); y += px(200)
    tg = P.get('tag')
    if tg and t >= tg['at']:
        sc, o = pop(t, tg['at'] - 0.03)
        Pz = pill(tg['text'], px(44), fill=col('orange'), border=col('orange'), bw=2, padx=px(30), pady=px(12))
        Ps = Pz.resize((max(1, int(Pz.size[0] * sc)), max(1, int(Pz.size[1] * sc))))
        tmp = Image.new('RGBA', Lp.size, (0, 0, 0, 0)); tmp.alpha_composite(Ps, (int(ox + px(54) + Pz.size[0] / 2 - Ps.size[0] / 2 - 20), int(oy + y + Pz.size[1] / 2 - Ps.size[1] / 2 - 20)))
        tmp.putalpha(tmp.getchannel('A').point(lambda v: int(v * o))); Lp.alpha_composite(tmp)
    sx = lerp(px(170), 0, k) + ease_out(out) * px(420) * (1 if ctx['x0'] > W / 2 else -1)
    scaled_layer(Lp, lerp(0.9, 1.0, k), px0 + pw / 2 + sx, py + ph_ / 2, clamp(k * 1.6) * (1 - out), c)

def headline_pill(c, t, P, ctx):
    """Chapter/question look: dark outlined pill (context) + 1-2 big yellow lines popping in with 0.1 s stagger.
    Trigger: a question or chapter-opening sentence."""
    q = _out(P, t, 0.25); x = ctx['x0']
    if P.get('pill'):
        _pop_left(c, pill(P['pill']['text'], px(40), fill=(16, 16, 20, 235), padx=px(30), pady=px(14)), t, P['pill']['at'], x, int(0.30 * H), q)
    for i, ln in enumerate(P['lines']):
        _pop_left(c, yellow(ln['text'], px(ln.get('size', 118))), t, ln['at'] - 0.04 + 0.1 * i, x, int((0.47 + 0.17 * i) * H), q, dur=0.34)

def contrast_arrow(c, t, P, ctx):
    """'from A -> to B': white header, outlined pill A gets dimmed + red strike-through, a yellow arrow grows,
    big yellow B pops. Trigger: a sentence that contrasts an old and a new behaviour."""
    q = _out(P, t, 0.12); x = ctx['x0']
    if P.get('header'):
        sc, o = pop(t, P['header']['at'] - 0.03)
        scaled_layer(text_layer(P['header']['text'], px(76), 'Black', stroke=6), sc, (ctx['x0'] + ctx['x1']) / 2, int(0.15 * H), o * q, c)
    A, B = P['from'], P['to']
    if t >= A['at'] - 0.05:
        sc, o = pop(t, A['at'] - 0.05); Lq = outline_pill(A['text'], px(44)); dim = clamp((t - B['at']) / 0.3)
        put_left(c, Lq, x + px(20), int(0.40 * H), sc * lerp(1, 0.85, dim), o * lerp(1, 0.65, dim) * q, pad=20)
        if dim > 0:
            Ls = Image.new('RGBA', (W, H), (0, 0, 0, 0))
            ImageDraw.Draw(Ls).line([(x + px(40), 0.40 * H), (x + px(40) + (Lq.size[0] * 0.85 - px(50)) * ease_out(dim), 0.40 * H)], fill=(255, 80, 60, 255), width=px(6))
            alpha_comp(c, Ls, 0, 0, q)
    if t >= B['at'] - 0.05:
        ka = ease_out((t - B['at']) / 0.4); La = Image.new('RGBA', (W, H), (0, 0, 0, 0)); da = ImageDraw.Draw(La)
        x0_, y0_ = x + 0.12 * W, 0.47 * H; x1_, y1_ = lerp(x0_, x0_ + 0.10 * W, ka), lerp(y0_, 0.60 * H, ka)
        da.line([(x0_, y0_), (x1_, y1_)], fill=col('yellow'), width=px(7))
        if ka > 0.9: da.polygon([(x1_ + px(14), y1_ + px(6)), (x1_ - px(14), y1_ + px(4)), (x1_, y1_ + px(22))], fill=col('yellow'))
        alpha_comp(c, La, 0, 0, q)
        sc, o = pop(t, B.get('pop_at', B['at']) - 0.05, 0.36)
        scaled_layer(yellow(B['text'], px(124)), sc, (ctx['x0'] + ctx['x1']) / 2, int(0.72 * H), o * q, c)

def blur_lines(c, t, P, ctx):
    """Chapter text that slides in from off-screen with velocity motion-blur and slides out the same way.
    Trigger: a turn / caveat sentence or a chapter change. lines: [{text, at, size}]"""
    side = -1 if ctx['x0'] < W / 2 else 1
    for i, ln in enumerate(P['lines']):
        L = yellow(ln['text'], px(ln.get('size', 104 if i == 0 else 170)))
        x_to = ctx['x0'] - 30
        blur_slide(c, L, t, ln['at'], x_to + side * px(700) if side > 0 else -L.size[0] - px(80), x_to, int((0.38 + 0.24 * i) * H),
                   t_out=P.get('out_at', P['end'] - 0.3) + 0.05 * i, out_to=(W + px(100)) if side > 0 else -L.size[0] - px(200))

def pill_lines(c, t, P, ctx):
    """Outlined context pill on top + stacked big yellow lines (claim / caveat). Trigger: a short punch line."""
    q = _out(P, t, 0.1); x = ctx['x0']
    if P.get('pill'): _pop_left(c, outline_pill(P['pill']['text'], px(44)), t, P['pill']['at'] - 0.05, x, int(0.20 * H), q)
    for i, ln in enumerate(P['lines']):
        _pop_left(c, yellow(ln['text'], px(ln.get('size', 110 if i == 0 else 96))), t, ln['at'] - 0.05, x, int((0.42 + 0.20 * i) * H), q, dur=0.34)

def error_stack(c, t, P, ctx):
    """List of failure modes with red ✗ icons: the item being spoken is yellow, earlier ones turn white & dim;
    then a red verdict pill pops with a decaying wobble. Trigger: an enumeration of risks / mistakes."""
    q = _out(P, t, 0.12); x = ctx['x0']; items = P['items']; tv = P['verdict']['at']
    for i, it in enumerate(items):
        t0 = it['at']
        if t < t0 - 0.06: continue
        k = ease_out((t - t0 + 0.06) / 0.35); o = clamp((t - t0 + 0.06) / 0.12)
        nxt = items[i + 1]['at'] if i + 1 < len(items) else tv; cur = t < nxt - 0.06
        L = yellow(it['text'], px(72)) if cur else text_layer(it['text'], px(72), 'Black', (255, 255, 255, 235), stroke=6)
        y = (0.20 + 0.17 * i) * H
        alpha_comp(c, np.asarray(icon('x', px(32), col('red'))), int(x - 6), int(y - px(42)), o * q)
        put_left(c, L, x + px(80) + lerp(-px(60), 0, k), y, lerp(0.8, 1, k) * (1 if cur else 0.92), o * q * (1 if cur else 0.78))
    if t >= tv - 0.05:
        sc, o = pop(t, tv - 0.05, 0.36); qq = t - tv; Wb = STYLE['motion']['wobble']
        Lr = pill(P['verdict']['text'], px(52), fill=tuple(col('red')[:3]) + (245,), padx=px(36), pady=px(16))
        ang = Wb['deg'] * math.sin(qq * Wb['freq']) * math.exp(-qq * Wb['decay']) if qq > 0 else 0
        Lr2 = Lr.rotate(ang, expand=True, resample=Image.BICUBIC) if abs(ang) > 0.2 else Lr
        put_left(c, Lr2, x, int(0.76 * H), sc, o * q, pad=20)

def headline_badges(c, t, P, ctx):
    """Outlined pill + big yellow headline + N numbered orange badges popping in a row (0.13 s stagger).
    Trigger: announcing N criteria / points."""
    q = _out(P, t, 0.25)
    if P.get('pill'): _pop_left(c, outline_pill(P['pill']['text'], px(42)), t, P['pill']['at'] - 0.05, ctx['x0'], int(0.18 * H), q)
    if P.get('headline'):
        sc, o = pop(t, P['headline']['at'] - 0.04, 0.36)
        scaled_layer(yellow(P['headline']['text'], px(132)), sc, (ctx['x0'] + ctx['x1']) / 2, int(0.72 * H), o * q, c)
    b = P.get('badges')
    if b:
        bx = b.get('x', 0.70 if ctx['x0'] < W / 2 else 0.05)
        for i in range(b['n']):
            sc, o = pop(t, b['at'] + 0.13 * i)
            scaled_layer(badge(i + 1, px(34)), sc, int((bx + 0.085 * i) * W) + px(40), int(0.18 * H), o * q, c)

def flow_pills(c, t, P, ctx):
    """A —(flowing dotted arrow)→ B with a big yellow line underneath. Trigger: 'from X to Y' process sentence.
    A, B, and the line are optional: a missing phrase stays off screen instead of repeating another one."""
    q = _out(P, t, 0.2)
    if P.get('header'):
        sc, o = pop(t, P['header']['at'] - 0.03)
        scaled_layer(text_layer(P['header']['text'], px(64), 'Black', stroke=6), sc, W / 2, int(0.12 * H), o * q, c)
    A, B = P.get('a'), P.get('b'); yy = 0.30 * H
    if A:
        a_size = fit_px(A['text'], px(56), int(0.26 * W), px(24))
        sc, o = pop(t, A['at'] - 0.08); scaled_layer(outline_pill(A['text'], a_size), sc, 0.17 * W, yy, o * q, c)
    if A and B and t >= A['at'] + 0.17:
        ka = ease_out((t - A['at'] - 0.17) / 0.5); La = Image.new('RGBA', (W, px(120)), (0, 0, 0, 0)); da = ImageDraw.Draw(La)
        xa, xb = 0.27 * W, lerp(0.27 * W, 0.71 * W, ka); st = px(26); yc = px(60)
        for s_ in np.arange(xa, xb, st):
            ph_ = ((s_ - xa) / st - t * 8) % 4; a = int(255 * (0.35 + 0.65 * (ph_ < 1.2)))
            da.ellipse([s_ - px(6), yc - px(6), s_ + px(6), yc + px(6)], fill=col('yellow')[:3] + (a,))
        if ka > 0.95: da.polygon([(xb + 4, yc - px(20)), (xb + px(30), yc), (xb + 4, yc + px(20))], fill=col('yellow'))
        alpha_comp(c, La, 0, int(yy - yc), q)
    if B:
        b_size = fit_px(B['text'], px(56), int(0.26 * W), px(24))
        sc, o = pop(t, B['at'] - 0.08)
        scaled_layer(pill(B['text'], b_size, fg=col('ink'), fill=col('yellow'), padx=px(30), pady=px(14)), sc, 0.83 * W, yy, o * q, c)
    if P.get('bottom'):
        sc, o = pop(t, P['bottom']['at'] - 0.05, 0.36)
        scaled_layer(yellow(P['bottom']['text'], px(110)), sc, W / 2, int(0.72 * H), o * q, c)

# ======================================================================= PAGE LAYERS
def page_example(c, t, P, ctx):
    """'For example' page: orange kicker dot + letter-spaced kicker, two-tone title (accent part orange), muted
    caption, a white glow card with a skeleton framework (root node + empty children) and a serif yellow capsule
    summarising the point. Trigger: a concrete example / scenario."""
    ex = ease_io((t - P['exit_at']) / 0.35) if P.get('exit_at') is not None else 0; ex = min(ex, 1)
    L = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(L); x = int(0.063 * W)
    kk = P.get('kicker')
    if kk:
        fu = fade_up(t, kk['at'] - 0.05)
        if fu:
            dy, o = fu; d.ellipse([x + 2, px(92) + dy, x + px(14), px(104) + dy], fill=col('orange')[:3] + (int(255 * o),))
            draw_text(L, (x + px(24), px(84) + dy), kk['text'], font(px(24), 'Bold'), col('orange')[:3] + (int(255 * o),), px(4))
    if P.get('brand'): draw_text(L, (W - px(300), px(84)), P['brand'], font(px(22), 'Black'), (40, 40, 40, int(200 * clamp((t - P['start']) / 0.3))), px(5))
    tt = P.get('title')
    if tt:
        fu = fade_up(t, tt[0]['at'] - 0.05)
        if fu:
            size = fit_px(''.join(part['text'] for part in tt), px(64), int(0.86 * W - x), px(28))
            f = font(size, 'Black'); xx = x
            for part in tt:
                fu2 = fade_up(t, part['at'] - 0.06)
                if fu2:
                    dy2, o2 = fu2; draw_text(L, (xx, px(130) + dy2), part['text'], f, (col('orange') if part.get('accent') else col('ink'))[:3] + (int(255 * o2),))
                xx += f.getlength(part['text'])
            if P.get('caption'): draw_text(L, (x + 2, px(222) + fu[0]), P['caption'], font(px(24), 'Medium'), (130, 126, 120, int(230 * fu[1])))
    alpha_comp(c, L, 0, 0, 1 - ex)
    cd = P.get('card')
    lead = (cd or {}).get('lead') or ''
    big = (cd or {}).get('big') or ''
    node = (cd or {}).get('node') or ''
    if cd and t >= cd['at'] - 0.1 and (lead or big or node):
        k = ease_out((t - cd['at'] + 0.1) / 0.5); cw, chh = int(0.62 * W), int(0.36 * H)
        Cd = card(cw, chh, px(20), glow=(240, 120, 130)).copy(); d = ImageDraw.Draw(Cd); ox = oy = 40
        if lead:
            draw_text(Cd, (ox + px(44), oy + px(40)), lead, font(px(26), 'Bold'), col('muted'), px(3))
        if big:
            bsize = fit_px(big, px(44), cw - px(140), px(20))
            draw_text(Cd, (ox + px(44), oy + px(84)), big, font(bsize, 'Black'), col('ink'))
        if node:
            rx, ry = ox + int(cw * 0.48), oy + px(44); nw = px(250)
            d.rounded_rectangle([rx, ry, rx + nw, ry + px(64)], px(14), fill=col('orange'))
            nsize = fit_px(node, px(30), nw - px(28), px(14))
            f = font(nsize, 'Black'); d.text((rx + nw / 2 - f.getlength(node) / 2, ry + (px(64) - nsize) / 2), node, font=f, fill=(255, 255, 255, 255))
            for i in range(cd.get('children', 3)):
                a_ = clamp((t - cd['at'] - 0.5 - 0.12 * i) / 0.3)
                if a_ <= 0: continue
                cx = rx - int(cw * 0.11) + i * px(150); cy = oy + px(170)
                d.line([rx + nw / 2, ry + px(64), cx + px(60), cy], fill=(210, 205, 198, int(255 * a_)), width=3)
                d.rounded_rectangle([cx, cy, cx + px(120), cy + px(70)], px(12), outline=(200, 196, 190, int(255 * a_)), width=3)
                for j in range(2): d.rounded_rectangle([cx + px(18), cy + px(20 + j * 20), cx + px(100 - j * 30), cy + px(30 + j * 20)], 4, fill=(232, 229, 224, int(255 * a_)))
        if ex < 1: scaled_layer(Cd, lerp(0.86, 1, k) * (1 - 0.1 * ex), x + cw / 2, int(0.34 * H) + chh / 2 + lerp(px(40), 0, k) - px(60) * ex, clamp(k * 1.5) * (1 - ex), c)
    cp = P.get('capsule')
    if cp and ex < 1:
        sc, o = pop(t, cp['at'] - 0.05, 0.36)
        if o > 0:
            csize = fit_px(cp['text'], px(52), int(0.5 * W), px(24))
            scaled_layer(capsule(cp['text'], csize), sc, int(0.40 * W), int(0.81 * H), o * (1 - ex), c)

def scattered_capsules(c, t, P, ctx):
    """Muted lead word, then dark pills scattered with slight rotations and dashed connectors growing between
    them; a serif yellow capsule verdict pops and the pills wobble once. Trigger: a list of manual steps."""
    x = int(0.063 * W)
    if P.get('lead'):
        fu = fade_up(t, P['lead']['at'] - 0.05)
        if fu:
            dy, o = fu; L = Image.new('RGBA', (px(700), px(60)), (0, 0, 0, 0)); draw_text(L, (0, 0), P['lead']['text'], font(px(34), 'Black'), col('muted'), px(3)); alpha_comp(c, L, x, int(0.34 * H + dy), o)
    slots = P.get('slots', [[0.08, 0.50, -4], [0.33, 0.43, 3], [0.56, 0.53, -2.5], [0.10, 0.64, 2]])
    tv = P['capsule']['at'] if P.get('capsule') else None; prev = None
    for i, it in enumerate(P['items']):
        sx, sy, ang = slots[i % len(slots)]
        sc, o = pop(t, it['at'] - 0.05, 0.34)
        if o <= 0: continue
        L = cached(('rot', it['text'], ang), lambda: dark_pill(it['text'], px(46)).rotate(ang, expand=True, resample=Image.BICUBIC))
        wob = 2.5 * math.sin((t - tv) * 18 + i) * math.exp(-(t - tv) * 3) if tv and t > tv else 0
        scaled_layer(L, sc, sx * W + L.size[0] / 2, sy * H + wob * 3, o, c)
        if prev is not None:
            kk = clamp((t - it['at'] + 0.1) / 0.3); Lc = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(Lc)
            xa, xb = prev, sx * W - 10; ya = 0.49 * H
            for s_ in np.arange(xa, lerp(xa, xb, kk), px(18)): d.line([(s_, ya), (s_ + px(9), ya)], fill=(190, 186, 180, 255), width=px(4))
            alpha_comp(c, Lc, 0, 0, 1)
        prev = sx * W + L.size[0] - px(30)
    if tv:
        sc, o = pop(t, tv - 0.04, 0.36)
        if o > 0: scaled_layer(capsule(P['capsule']['text'], px(56)), sc, int(0.40 * W), int(0.79 * H), o, c)

def _doc_layer():
    w, h = px(720), px(560); L = Image.new('RGBA', (w, h), (0, 0, 0, 0)); d = ImageDraw.Draw(L)
    d.rounded_rectangle([0, 0, w - 1, h - 1], px(22), fill=(250, 250, 252, 255), outline=(220, 222, 230, 255), width=2)
    d.rounded_rectangle([0, 0, w - 1, px(54)], px(22), fill=(236, 238, 244, 255)); d.rectangle([0, px(30), w - 1, px(54)], fill=(236, 238, 244, 255))
    for i, cc in enumerate([(240, 90, 80), (245, 190, 60), (90, 200, 110)]): d.ellipse([px(22 + i * 26), px(19), px(38 + i * 26), px(35)], fill=cc + (255,))
    rng = np.random.RandomState(3)
    for r in range(15):
        y = px(84 + r * 31); ww = int(rng.uniform(0.35, 0.92) * (w - px(90)))
        d.rounded_rectangle([px(46), y, px(46) + ww, y + px(12)], px(6), fill=(214, 218, 228, 255) if r % 5 else (160, 170, 196, 255))
    return L

def doc_stack(c, t, P, ctx):
    """Dark glow page: a tilted (perspective, breathing) document, karaoke header with accent words, a sub line,
    dashed slots that appear first and fill with pills one by one along a growing orange connector; the last
    item is a green pill + check icon. Trigger: explaining that steps can be chained into one flow."""
    D = cached('doc', _doc_layer); a = np.asarray(D); wd, hd = D.size
    th = 0.18 + 0.03 * math.sin((t - P['start']) * 0.6)
    x0, y0, ww, hh = 0.09 * W, 0.17 * H, 0.50 * W, 0.76 * H; sk = th * hh
    dst = np.float32([[x0, y0 + sk * 0.6], [x0 + ww, y0], [x0 + ww * 0.97, y0 + hh], [x0 + ww * 0.02, y0 + hh - sk * 0.25]])
    M = cv2.getPerspectiveTransform(np.float32([[0, 0], [wd, 0], [wd, hd], [0, hd]]), dst)
    k = ease_out((t - P['start'] - 0.1) / 0.6)
    if k > 0:
        M2 = np.float32([[1, 0, lerp(px(180), 0, k)], [0, 1, lerp(px(60), 0, k)], [0, 0, 1]]) @ M
        alpha_comp(c, cv2.warpPerspective(a, M2, (W, H), flags=cv2.INTER_LINEAR), 0, 0, clamp(k * 1.5) * 0.92)
    x = int(0.06 * W); f = font(px(40), 'Black'); L = Image.new('RGBA', (W, px(80)), (0, 0, 0, 0)); dd = ImageDraw.Draw(L)
    for w_ in P.get('header', []):                         # karaoke: each word appears at its onset
        if t >= w_['at'] - 0.05:
            o = clamp((t - w_['at'] + 0.05) / 0.15); cc = (255, 150, 70) if w_.get('accent') else (255, 255, 255)
            dd.text((x, int(px(8) + px(10) * (1 - o))), w_['text'], font=f, fill=cc + (int(255 * o),))
        x += f.getlength(w_['text'])
    alpha_comp(c, L, 0, int(0.035 * H))
    if P.get('sub'):
        fu = fade_up(t, P['sub']['at'])
        if fu: dy, o = fu; alpha_comp(c, text_layer(P['sub']['text'], px(30), 'Bold', (220, 222, 235, 255), shadow=False), int(0.06 * W) - 30, int(0.125 * H + dy) - 10, o)
    items = P['items']; n = len(items); cx = int(0.345 * W); ys = [0.33 + (0.44 / max(1, n - 1)) * i for i in range(n)]
    Lc = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(Lc); tslot = P.get('slots_at')
    for i in range(n):
        if tslot is None: break
        ks = clamp((t - tslot - 0.1 * i) / 0.25)
        if ks > 0 and t < items[i]['at'] + 0.2:
            wv = px(300 if i < n - 1 else 390); y = ys[i] * H
            d.rounded_rectangle([cx - wv / 2, y - px(38), cx + wv / 2, y + px(38)], px(38), outline=(255, 255, 255, int(150 * ks)), width=3)
    if t >= items[0]['at']:
        last = max(i for i in range(n) if t >= items[i]['at']); kk = ease_out((t - items[last]['at']) / 0.35)
        yend = lerp(ys[max(0, last - 1)] * H, ys[last] * H, kk) if last > 0 else ys[0] * H
        d.line([(cx, ys[0] * H), (cx, yend)], fill=(255, 170, 90, 255), width=px(5))
    alpha_comp(c, Lc, 0, 0)
    for i, it in enumerate(items):
        t0 = it['at']
        if t < t0 - 0.05: continue
        k = ease_out((t - t0 + 0.05) / 0.4); o = clamp((t - t0 + 0.05) / 0.15); final = i == n - 1 and P.get('final_green', True)
        Lp = pill(it['text'], px(42), fill=tuple(col('green')[:3]) + (240,)) if final else dark_pill(it['text'], px(40))
        bump = 1 + 0.06 * math.exp(-(t - t0) * 8) * math.sin((t - t0) * 20) if t > t0 else 1
        scaled_layer(Lp, lerp(0.85, 1, k) * bump, cx + lerp(-px(90), 0, k), ys[i] * H, o, c)
        if final and t > t0 + 0.2:
            sc, o2 = pop(t, t0 + 0.2); scaled_layer(icon('v', px(30), col('green')), sc, cx + Lp.size[0] / 2 + 10, ys[i] * H, o2, c)

def _carousel_card(cd, i, t):
    cw, chh = int(0.42 * W), int(0.60 * H)
    L = card(cw, chh, px(24)).copy(); d = ImageDraw.Draw(L); ox = oy = 40
    tg = font(px(24), 'Black'); d.rounded_rectangle([ox + px(40), oy + px(38), ox + px(40) + tg.getlength(cd['tag']) + px(36), oy + px(80)], px(10), fill=col('orange'))
    d.text((ox + px(58), oy + px(44)), cd['tag'], font=tg, fill=(255, 255, 255, 255))
    d.text((ox + cw - px(120), oy + px(44)), f'0{i + 1}', font=font(px(30), 'Black'), fill=(222, 218, 212, 255))
    f = font(px(50), 'Black'); yy = oy + px(120)
    for ln in cd['lines']:
        hl = ln.get('highlight')
        if hl and cd.get('highlight_at') is not None:
            k = clamp((t - cd['highlight_at']) / STYLE['motion']['highlighter_sweep']); xh = ox + px(40) + f.getlength(ln['text'][:ln['text'].index(hl)])
            if k > 0: d.rectangle([xh - 4, yy + px(40), xh - 4 + (f.getlength(hl) + 8) * ease_out(k), yy + px(64)], fill=col('highlighter'))
        d.text((ox + px(40), yy), ln['text'], font=f, fill=col('ink')); yy += px(72)
    fc = font(px(22), 'Bold'); xx = ox + px(40)
    for ch in cd.get('chips', []):
        wv = fc.getlength(ch) + px(30); d.rounded_rectangle([xx, oy + chh - px(80), xx + wv, oy + chh - px(42)], px(10), fill=(240, 238, 234, 255))
        d.text((xx + px(15), oy + chh - px(76)), ch, font=fc, fill=(120, 116, 110, 255)); xx += wv + px(12)
    return L

def card_carousel(c, t, P, ctx):
    """Grey page, header line + brand, N cards in a horizontal carousel; switching at each card's 'at'
    (0.6 s ease-in-out), active card full size + orange glow, others 86 % / 55 % opacity; highlighter sweeps
    the key phrase when it is spoken. Trigger: enumerated criteria (first / second / third)."""
    M = STYLE['motion']['carousel']
    if P.get('header'):
        Lh = Image.new('RGBA', (W, px(60)), (0, 0, 0, 0)); draw_text(Lh, (int(0.05 * W), px(10)), P['header'], font(px(24), 'Black'), (70, 70, 74, 255), px(2))
        if P.get('brand'): draw_text(Lh, (W - px(300), px(12)), P['brand'], font(px(22), 'Black'), (40, 40, 40, 200), px(5))
        alpha_comp(c, Lh, 0, int(0.04 * H), clamp((t - P['start']) / 0.3))
    cards = P['cards']; pos = sum(ease_io((t - cd['at']) / M['dur']) for cd in cards[1:])
    gap = M['gap'] * W; cx0 = 0.33 * W; cy = 0.52 * H
    for i, cd in enumerate(cards):
        rel = i - pos; ent = ease_out((t - P['start'] - 0.15 - 0.12 * i) / 0.6); x = cx0 + rel * gap + lerp(0.5 * W, 0, ent)
        if x < -0.3 * W or x > 1.35 * W: continue
        act = clamp(1 - abs(rel)); sc = lerp(M['inactive_scale'], 1.0, act); L = _carousel_card(cd, i, t)
        if act > 0.05:
            g = cached(('cglow', L.size), lambda: (lambda G: (ImageDraw.Draw(G).rounded_rectangle([34, 34, G.size[0] - 34, G.size[1] - 34], px(28), outline=(255, 140, 60, 255), width=px(8)), G.filter(ImageFilter.GaussianBlur(9)))[1])(Image.new('RGBA', L.size, (0, 0, 0, 0))))
            scaled_layer(g, sc, x, cy, act * 0.9 * clamp(ent * 1.5), c)
        scaled_layer(L, sc, x, cy, clamp(ent * 1.5) * lerp(M['inactive_opacity'], 1.0, act), c)

def editor_mock(c, t, P, ctx):
    """Product mock (editor window): live thumbnail of the speaker 'imported', subtitle list typing in,
    3 timeline tracks filling, markers, a moving selection box over segments, and a checklist of steps popping
    on the right as each is named. Trigger: describing what a tool / product does, step by step."""
    k = ease_out((t - P['start']) / 0.6); ex, ey, ew, eh = int(0.035 * W), int(0.10 * H), int(0.70 * W), int(0.70 * H)
    E = card(ew, eh, px(22)).copy(); d = ImageDraw.Draw(E); ox = oy = 40
    ft = font(px(34), 'Black'); d.text((ox + px(34), oy + px(22)), P.get('title', ''), font=ft, fill=col('ink'))
    if P.get('subtitle'): d.text((ox + px(34) + ft.getlength(P['title']) + px(18), oy + px(34)), P['subtitle'], font=font(px(20), 'Bold'), fill=col('muted'))
    for i, cc in enumerate([(240, 90, 80), (245, 190, 60), (90, 200, 110)]): d.ellipse([ox + ew - px(110) + i * px(28), oy + px(32), ox + ew - px(94) + i * px(28), oy + px(48)], fill=cc + (255,))
    tx, ty, tw, th = ox + px(34), oy + px(86), px(400), px(225); ti = P.get('thumb_at', P['start'])
    kt = ease_out((t - ti) / 0.5); d.rounded_rectangle([tx, ty, tx + tw, ty + th], px(14), fill=(236, 233, 228, 255))
    if kt < 1 and P.get('thumb_label'):
        f = font(px(22), 'Bold'); d.text((tx + tw / 2 - f.getlength(P['thumb_label']) / 2, ty + th / 2 - px(14)), P['thumb_label'], font=f, fill=(170, 166, 160, int(255 * (1 - kt))))
    if kt > 0 and ctx.get('per') is not None:
        th_img = cv2.resize(ctx['per'], (tw, th), interpolation=cv2.INTER_AREA)
        thL = Image.fromarray((th_img * 255).astype(np.uint8)).convert('RGBA'); thL.putalpha(rrect_mask(tw, th, px(14)).point(lambda v: int(v * kt)))
        E.alpha_composite(thL, (tx, ty))
    lx = tx + tw + px(30); fl = font(px(22), 'Medium')
    for j, it in enumerate(P.get('list', [])):            # subtitle list types in
        if t < it['at']: continue
        n = int(len(it['text']) * clamp((t - it['at']) / 0.5)) or 1; y = ty + j * px(44)
        d.rounded_rectangle([lx, y, ox + ew - px(34), y + px(36)], px(8), fill=(246, 244, 240, 255)); d.text((lx + px(12), y + px(6)), it['text'][:n], font=fl, fill=(60, 60, 64, 255))
    trk_y = ty + th + px(40); segs = []; x_l, x_r = ox + px(34), ox + ew - px(34)
    for r, tr in enumerate(P.get('tracks', [])):
        y = trk_y + r * px(56); kk = clamp((t - tr['at']) / 0.8)
        d.text((x_l, y + px(8)), tr['label'], font=font(px(18), 'Bold'), fill=col('muted'))
        rng = np.random.RandomState(r + 7); xx = x_l + px(90)
        while xx < x_r and xx < x_l + px(90) + (x_r - x_l - px(90)) * kk:
            wv = int(rng.uniform(px(60), px(160))); cc = [(255, 196, 140), (170, 200, 255), (190, 230, 180)][r % 3]
            d.rounded_rectangle([xx, y, min(x_r, xx + wv), y + px(40)], px(8), fill=cc + (255,)); segs.append((xx, min(x_r, xx + wv), y)) if r == 0 else None; xx += wv + px(8)
    for mk in P.get('markers', []):
        if t >= mk['at']:
            mx = x_l + px(90) + (x_r - x_l - px(90)) * mk['x']; sc, o = pop(t, mk['at'])
            d.polygon([(mx, trk_y - px(18)), (mx - px(10) * sc, trk_y - px(34)), (mx + px(10) * sc, trk_y - px(34))], fill=col('orange')[:3] + (int(255 * o),))
    ph_x = x_l + px(90) + (x_r - x_l - px(90)) * clamp((t - P['start']) / max(1, P['end'] - P['start']))
    ts = P.get('select_at')
    if ts is not None and t >= ts and segs:
        j = min(len(segs) - 1, int((t - ts) / 0.32) + 1); a_, b_, y = segs[j]
        d.rounded_rectangle([a_ - 4, y, b_ + 4, y + px(40)], px(8), outline=(255, 140, 40, 255), width=px(4))
    d.line([(ph_x, trk_y - px(14)), (ph_x, trk_y + px(56) * max(1, len(P.get('tracks', []))) - px(12))], fill=(230, 80, 60, 255), width=3)
    scaled_layer(E, lerp(0.9, 1, k), ex + ew / 2, ey + eh / 2 + lerp(px(50), 0, k), clamp(k * 1.6), c)
    for j, s_ in enumerate(P.get('checklist', [])):
        sc, o = pop(t, s_['at'])
        if o <= 0: continue
        def mkc(txt=s_['text']):
            L = Image.new('RGBA', (px(340), px(110)), (0, 0, 0, 0)); d2 = ImageDraw.Draw(L)
            d2.rounded_rectangle([px(20), px(20), px(320), px(90)], px(18), fill=(255, 255, 255, 255), outline=(232, 229, 224, 255), width=2)
            d2.ellipse([px(38), px(35), px(78), px(75)], fill=col('green')); draw_check(d2, px(58), px(55), px(20), w=4)
            d2.text((px(96), px(34)), txt, font=font(px(32), 'Black'), fill=col('ink')); return L
        scaled_layer(cached(('chk', s_['text']), mkc), sc, 0.765 * W + px(170), 0.11 * H + px(55) + j * px(82), o, c)

def neon_end(c, t, P, ctx):
    """Closing page on a dark glow background: neon arcs rotating around the big END circle (person),
    white lead line, a flickering neon word, and a yellow closing line. Ends with the global fade-out."""
    r0 = ctx['end_circle']; cx, cy, rad = r0
    L = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(L); k = ease_out((t - P['start'] - 0.3) / 0.8)
    if k > 0:
        r1, r2 = rad + px(26), rad + px(46); a0 = (t - P['start']) * 60
        for off in (0, 180): d.arc([cx - r1, cy - r1, cx + r1, cy + r1], a0 + off, a0 + off + 110 * k, fill=(255, 150, 60, 255), width=px(6))
        d.arc([cx - r2, cy - r2, cx + r2, cy + r2], -a0 * 0.7, -a0 * 0.7 + 70 * k, fill=(110, 150, 255, 255), width=px(4))
        d.arc([cx - r2, cy - r2, cx + r2, cy + r2], -a0 * 0.7 + 180, -a0 * 0.7 + 250 * k, fill=(110, 150, 255, 255), width=px(4))
        alpha_comp(c, L.filter(ImageFilter.GaussianBlur(8)), 0, 0, clamp(k)); alpha_comp(c, L, 0, 0, clamp(k))
    x = int(0.07 * W)
    if P.get('lead'):
        fu = fade_up(t, P['lead']['at'] + 0.05)
        if fu: dy, o = fu; alpha_comp(c, text_layer(P['lead']['text'], px(46), 'Black'), x - 30, int(0.17 * H + dy) - 30, o)
    wd = P.get('word')
    if wd and t >= wd['at'] - 0.05:
        q = t - wd['at'] + 0.05; flick = 1.0 if q > 0.35 else (0.25 if int(q * 30) % 3 == 1 else 1.0) * clamp(q / 0.1)
        sz = px(170)
        while font(sz, 'Black').getlength(wd['text']) > (cx - rad - px(60)) - x: sz = int(sz * 0.92)   # keep clear of the circle
        f = font(sz, 'Black'); w_ = int(f.getlength(wd['text'])) + px(80)
        Ng = cached(('neonG', wd['text'], sz), lambda: (lambda L: (ImageDraw.Draw(L).text((px(40), px(20)), wd['text'], font=f, fill=(255, 140, 50, 255)), L.filter(ImageFilter.GaussianBlur(14)))[1])(Image.new('RGBA', (w_, px(230)), (0, 0, 0, 0))))
        Nt = cached(('neonT', wd['text'], sz), lambda: (lambda L: (ImageDraw.Draw(L).text((px(40), px(20)), wd['text'], font=f, fill=(255, 236, 214, 255), stroke_width=3, stroke_fill=(255, 150, 60, 255)), L)[1])(Image.new('RGBA', (w_, px(230)), (0, 0, 0, 0))))
        for a_ in (1, 0.7): alpha_comp(c, Ng, x - px(40), int(0.27 * H), flick * a_)
        alpha_comp(c, Nt, x - px(40), int(0.27 * H), flick)
    if P.get('line'):
        sc, o = pop(t, P['line']['at'] - 0.05, 0.36)
        lsize = fit_px(P['line']['text'], px(70), int(0.62 * W), px(28))
        Lz = yellow(P['line']['text'], lsize)
        if o > 0: scaled_layer(Lz, sc, x - 30 + Lz.size[0] / 2, int(0.66 * H), o, c)

OVERLAYS = dict(title_card=title_card, side_panel=side_panel, headline_pill=headline_pill, contrast_arrow=contrast_arrow,
                blur_lines=blur_lines, pill_lines=pill_lines, error_stack=error_stack, headline_badges=headline_badges, flow_pills=flow_pills)
PAGE_LAYERS = dict(page_example=page_example, scattered_capsules=scattered_capsules, doc_stack=doc_stack,
                   card_carousel=card_carousel, editor_mock=editor_mock, neon_end=neon_end)
PAGE_BG = {'offwhite': lambda t: np.ones((H, W, 3), np.float32) * np.array(col('page_offwhite')[:3], np.float32) / 255,
           'grey': lambda t: np.ones((H, W, 3), np.float32) * np.array(col('page_grey')[:3], np.float32) / 255,
           'dark_glow': lambda t: glow_bg(t, col('page_dark')[:3], [(0.10, 0.95, 0.55, col('glow_orange')[:3], 0.85), (0.95, 0.10, 0.45, col('glow_blue')[:3], 0.55), (0.55, 0.55, 0.35, col('glow_violet')[:3], 0.25)]),
           'dark_end': lambda t: glow_bg(t, (8, 10, 24), [(0.05, 0.15, 0.45, (40, 80, 220), 0.7), (1.0, 1.0, 0.50, (255, 110, 30), 0.9), (0.70, 0.45, 0.30, (140, 70, 200), 0.35)])}
