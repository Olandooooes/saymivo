"""Data-driven renderer: scenes.json + phrases.json + cut video/audio -> 1920x1080 mp4.

usage:
  python render.py --scenes S.json --phrases P.json --video cut_video.mp4 --audio cut_audio.wav \
                   --cutlist cutlist.json --out out.mp4 [--t0 0 --t1 20] [--stills 3.2,8.5]
  python render.py --demo --out demo.mp4 [--t1 12]     # synthetic speaker + examples/ specs, no private media

Time values in scenes.json may be numbers (output seconds) or phrase references:
  "@p3"  start of phrase 3      "@p3.e"  end of phrase 3      "@p3#4"  onset of token 4 in phrase 3
  "@p3~X" onset of the first token X in phrase 3                any of them + "+0.2" / "-0.05"
Visual order per frame: person (shots) | page (PiP) -> overlays -> subtitle -> chapter bar -> end fade.
"""
import sys, os, re, json, time, argparse, subprocess
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *
from templates import OVERLAYS, PAGE_LAYERS, PAGE_BG
from person import Person, detect_face_anchor, text_column, SHOTS, fill_sharpness

REF = re.compile(r'^@p(\d+)(?:\.(e)|#(\d+)|~(.+?))?([+-][\d.]+)?$')
TIME_KEYS = {'at', 'start', 'end', 'exit_at', 'out_at', 'slots_at', 'thumb_at', 'select_at', 'highlight_at', 'pop_at'}

def resolve(obj, PH):
    if isinstance(obj, dict): return {k: (rt(v, PH) if k in TIME_KEYS else resolve(v, PH)) for k, v in obj.items()}
    if isinstance(obj, list): return [resolve(v, PH) for v in obj]
    return obj

def rt(v, PH):
    if not isinstance(v, str): return v
    m = REF.match(v)
    if not m: raise ValueError(f'bad time ref {v}')
    p = PH[int(m.group(1))]
    if m.group(2): t = p['e']
    elif m.group(3): t = p['tokens'][int(m.group(3))][1]
    elif m.group(4): t = next(tt for tk, tt in p['tokens'] if tk.lower() == m.group(4).lower())
    else: t = p['s']
    return t + (float(m.group(5)) if m.group(5) else 0.0)

# ------------------------------------------------------------------ subtitles & chapter bar
def sub_layer(txt):
    S = STYLE['subtitle']
    def mk():
        f = font(S['font_px'], S['weight']); w, h, b = text_size(txt, f); hh = S['font_px'] + 2 * S['pad_y'] + 4
        L = Image.new('RGBA', (w + 2 * S['pad_x'], hh), (0, 0, 0, 0)); d = ImageDraw.Draw(L)
        d.rounded_rectangle([0, 0, L.size[0] - 1, hh - 1], S['radius'], fill=tuple(S['box_rgba']))
        d.text((S['pad_x'] - b[0], (hh - h) // 2 - b[1]), txt, font=f, fill=(255, 255, 255, 255)); return L
    return cached(('sub', txt), mk)

def draw_sub(c, t, PH):
    S = STYLE['subtitle']; cur = [p for p in PH if p['s'] - S['lead'] <= t < p['e'] + S['hold_after']]
    if cur:
        L = sub_layer(cur[-1]['text']); alpha_comp(c, L, W // 2 - L.size[0] // 2, int(S['center_y'] * H - L.size[1] / 2))

def chapter_bar(chaps, total, t):
    """Chapter names appear when that chapter starts, and stay on the bar after that.
    A later chapter is not painted early, so its sentence is not already on screen."""
    B = STYLE['chapter_bar']
    shown = tuple(i for i, ch in enumerate(chaps) if ch.get('at', 0) <= t + 1e-6 and (ch.get('title') or '').strip())
    def mk():
        L = Image.new('RGBA', (W, B['height']), tuple(B['bg_rgba'])); d = ImageDraw.Draw(L)
        bounds = [ch['at'] for ch in chaps] + [total]
        for i, ch in enumerate(chaps):
            x0, x1 = int(ch['at'] / total * W), int(bounds[i + 1] / total * W)
            if i > 0: d.rectangle([x0 - 1, 9, x0 + 1, B['height'] - 9], fill=tuple(B['divider_rgba']))
            title = ch['title'] if i in shown else ''
            if not title:
                continue
            size = B['font_px']
            f = font(size, B['weight'])
            span = max(48, (x1 - x0) - 28)
            while size > 14 and f.getlength(title) > span:
                size -= 1
                f = font(size, B['weight'])
            w = f.getlength(title); xc = (x0 + x1) / 2 if i > 0 else x0 + 16 + w / 2
            d.text((xc - w / 2, (B['height'] - size) // 2 - 3), title, font=f, fill=(255, 255, 255, 240))
        return L
    return cached(('bar', total, shown), mk)

# ------------------------------------------------------------------ frame
class Renderer:
    def __init__(self, scenes, PH, src_size, face, joins, total):
        self.S = resolve(scenes, PH); self.PH = PH; self.total = total
        self.person = Person(src_size[0], src_size[1], face, self.S['shots'], joins)
        self.pages = sorted(self.S.get('pages', []), key=lambda p: p['start'])
        E = SHOTS['END']; self.end_circle = (E['center'][0] * W, E['center'][1] * H, E['circle_d'] * W / 2)

    def draw_page(self, pg, t, per):
        c = PAGE_BG[pg.get('bg', 'offwhite')](t)
        ctx = dict(x0=int(0.05 * W), x1=int(0.95 * W), per=per, end_circle=self.end_circle)
        for L in pg['layers']:
            L = dict(L); L.setdefault('start', pg['start']); L.setdefault('end', pg['end'])
            if L['start'] - 0.5 <= t: PAGE_LAYERS[L['template']](c, t, L, ctx)
        return c

    def page_at(self, t, per):
        cur = [p for p in self.pages if p['start'] <= t] or self.pages[:1]
        pg = cur[-1]; i = self.pages.index(pg)
        dur = STYLE['motion']['page_slide']['dur']
        if pg.get('enter') == 'slide' and i > 0 and t < pg['start'] + dur:       # push the previous page out to the left
            k = ease_io((t - pg['start']) / dur); off = int(k * W)
            A = self.draw_page(self.pages[i - 1], t, per); B = self.draw_page(pg, t, per); out = np.empty_like(A)
            out[:, :W - off] = A[:, off:]; out[:, W - off:] = B[:, :off]; return out
        return self.draw_page(pg, t, per)

    def frame(self, t, src):
        pose = self.person.pose(t); x0, x1 = text_column(pose[1])
        def overlays(c, t):
            ctx = dict(x0=x0, x1=x1, per=src)
            for o in self.S.get('overlays', []):
                if o['start'] - 0.5 <= t <= o['end']: OVERLAYS[o['template']](c, t, o, ctx)
        c, kp, _ = self.person.composite(t, src, lambda tt: self.page_at(tt, src), overlays)
        draw_sub(c, t, self.PH)
        B = STYLE['chapter_bar']
        if B['enabled'] and self.S.get('chapters'):
            alpha_comp(c, chapter_bar(self.S['chapters'], self.total, t), 0, H - B['height'])
            c[H - B['progress_px']:, :max(2, int(t / self.total * W))] = np.array(B['progress_rgb']) / 255
        q = clamp((t - (self.total - STYLE['motion']['end_fade'] - 0.05)) / STYLE['motion']['end_fade'])
        if self.S.get('end_fade', True) and q > 0: c = c * (1 - q)
        return (np.clip(c, 0, 1) * 255).astype(np.uint8)

# ------------------------------------------------------------------ synthetic demo source (no private media)
def demo_frame(t, w=1280, h=720):
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    img = np.stack([0.20 + 0.25 * xx / w, 0.18 + 0.12 * yy / h, 0.30 + 0.10 * (1 - xx / w)], -1)       # 'room'
    img[int(0.15 * h):int(0.55 * h), int(0.08 * w):int(0.25 * w)] = (0.55, 0.45, 0.35)                   # shelf
    cx, cy = 0.49 * w + 6 * math.sin(t * 1.3), 0.45 * h + 3 * math.sin(t * 2.1)
    body = ((xx - cx) / (0.22 * w)) ** 2 + ((yy - (h * 1.05)) / (0.42 * h)) ** 2 < 1
    head = ((xx - cx) / (0.075 * w)) ** 2 + ((yy - cy) / (0.13 * h)) ** 2 < 1
    img[body] = (0.12, 0.12, 0.16); img[head] = (0.86, 0.70, 0.60)
    mouth = (((xx - cx) / 18) ** 2 + ((yy - cy - 35) / (4 + 5 * abs(math.sin(t * 9)))) ** 2) < 1; img[mouth] = (0.4, 0.1, 0.1)
    return np.clip(img, 0, 1).astype(np.float32)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--scenes'); ap.add_argument('--phrases'); ap.add_argument('--video'); ap.add_argument('--audio')
    ap.add_argument('--cutlist'); ap.add_argument('--out', required=True); ap.add_argument('--t0', type=float, default=0)
    ap.add_argument('--t1', type=float); ap.add_argument('--stills', default=''); ap.add_argument('--demo', action='store_true')
    ap.add_argument('--still_only', action='store_true', help='only write the stills, no video')
    a = ap.parse_args()
    ex = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'examples')
    scenes = json.load(open(a.scenes or os.path.join(ex, 'scenes.example.json')))
    PH = json.load(open(a.phrases or os.path.join(ex, 'phrases.example.json')))
    joins = []
    if a.cutlist:
        K = json.load(open(a.cutlist))['keep']; o = 0
        for x, y in K[:-1]: o += y - x; joins.append(o)
    else: joins = scenes.get('demo_joins', [])
    total = scenes.get('duration') or (sum(y - x for x, y in K) if a.cutlist else PH[-1]['e'] + 0.6)
    if a.demo: sw, sh, face = 1280, 720, (0.49, 0.45)
    else:
        pr = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', a.video], capture_output=True, text=True).stdout.strip().split(',')
        sw, sh = int(pr[0]), int(pr[1]); face = detect_face_anchor(a.video)
    print('face anchor', face)
    R = Renderer(scenes, PH, (sw, sh), face, joins, total)
    t0, t1 = a.t0, a.t1 or total; stills = [float(s) for s in a.stills.split(',') if s]
    rv = None if a.demo else subprocess.Popen(['ffmpeg', '-v', 'error', '-ss', str(t0), '-i', a.video, '-t', str(t1 - t0), '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], stdout=subprocess.PIPE)
    wr = None
    if not a.still_only:
        cmd = ['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-']
        if a.audio: cmd += ['-ss', str(t0), '-t', str(t1 - t0), '-i', a.audio, '-map', '0:v', '-map', '1:a', '-c:a', 'aac', '-b:a', '256k', '-shortest']
        wr = subprocess.Popen(cmd + ['-c:v', 'libx264', '-crf', '17', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', a.out], stdin=subprocess.PIPE)
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    n = 0; tt = time.time(); stem = os.path.splitext(a.out)[0]; fill_checked = False
    while True:
        t = t0 + n / FPS
        if t >= t1: break
        if a.still_only and stills and not any(abs(s - t) < 0.5 / FPS for s in stills):
            if rv: rv.stdout.read(sw * sh * 3)
            n += 1; continue
        if rv:
            b = rv.stdout.read(sw * sh * 3)
            if len(b) < sw * sh * 3: break
            src = np.frombuffer(b, np.uint8).reshape(sh, sw, 3).astype(np.float32) / 255
        else: src = demo_frame(t)
        if not fill_checked:
            scale, face_x, face_y, kp = R.person.pose(t)[:4]
            if kp < 0.2:
                ratio = fill_sharpness(R.person.place(src, scale, face_x, face_y), R.person.frame_bounds(scale, face_x, face_y))
                fill_checked = True
                print('fill sharpness', None if ratio is None else round(ratio, 3))
                if ratio is not None and ratio < 0.45:
                    raise SystemExit('填边比原画面糊太多: %.3f' % ratio)
        fr = R.frame(t, src)
        for s in stills:
            if abs(s - t) < 0.5 / FPS: Image.fromarray(fr).save(f'{stem}_still_{s:.2f}.jpg', quality=90)
        if wr: wr.stdin.write(fr.tobytes())
        n += 1
        if n % 60 == 0: print(n, f'{time.time() - tt:.1f}s', flush=True)
    if wr: wr.stdin.close(); wr.wait()
    print('frames', n, f'{time.time() - tt:.1f}s')

if __name__ == '__main__':
    main()
