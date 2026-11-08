"""Person compositor - NO matting, NO background replacement (user fix #3).

The original frame is placed on the 16:9 canvas by a similarity transform (scale + face position).
When the person is pulled back (zoom < 1) the uncovered canvas is filled by mirroring only the
background beside the person. The person, including hair and a shoulder, is not mirrored.
The extension stays sharp. A short ramp hides the seam only where that edge is background.
Shots are keyframes; every change is a smooth eased zoom.
"""
from common import *
PS = STYLE['person']; SHOTS = PS['shots']; FILL = PS['fill_when_zoomed_out']

YUNET_URL = 'https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx'

def _yunet():
    p = os.environ.get('YUNET_MODEL', os.path.expanduser('~/.cache/saymivo/face_detection_yunet_2023mar.onnx'))
    if not os.path.exists(p):
        import urllib.request; os.makedirs(os.path.dirname(p), exist_ok=True); urllib.request.urlretrieve(YUNET_URL, p)
    return p

def detect_face_anchor(video_path, n=9):
    """median face centre over n frames, as source fractions (YuNet -> Haar -> style.json fallback)"""
    try:
        cap = cv2.VideoCapture(video_path); N = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or 1; pts = []; det = None
        for i in range(n):
            cap.set(cv2.CAP_PROP_POS_FRAMES, int(N * (i + 0.5) / n)); ok, fr = cap.read()
            if not ok: continue
            h, w = fr.shape[:2]
            if det is None:
                if hasattr(cv2, 'FaceDetectorYN'): det = ('yn', cv2.FaceDetectorYN.create(_yunet(), '', (w, h), 0.7))
                else: det = ('haar', cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml'))
            if det[0] == 'yn':
                _, f = det[1].detect(fr); f = [] if f is None else [r[:4] for r in f]
            else:
                f = det[1].detectMultiScale(cv2.cvtColor(fr, cv2.COLOR_BGR2GRAY), 1.1, 5, minSize=(h // 10,) * 2)
            if len(f): x, y, bw, bh = max(f, key=lambda r: r[2] * r[3]); pts.append(((x + bw / 2) / w, (y + bh / 2) / h))
        if len(pts) >= 3: return tuple(float(v) for v in np.median(np.array(pts), 0))
    except Exception as e: print('face detection failed, using fallback:', e)
    return tuple(PS['face_anchor']['fallback'])

def _skin_mask(src):
    """Skin-coloured pixels in an RGB frame. Curtain and a dark shirt are not skin."""
    u8 = np.clip(src * 255.0, 0, 255).astype(np.uint8) if src.dtype != np.uint8 else src
    if u8.ndim == 2:
        return np.zeros(u8.shape, dtype=bool)
    ycrcb = cv2.cvtColor(u8, cv2.COLOR_RGB2YCrCb)
    y = ycrcb[:, :, 0].astype(np.int16)
    cr = ycrcb[:, :, 1].astype(np.int16)
    cb = ycrcb[:, :, 2].astype(np.int16)
    return (y >= 48) & (cr >= 135) & (cr <= 180) & (cb >= 80) & (cb <= 135)


def _luma(src):
    rgb = src[..., :3]
    if rgb.dtype == np.uint8:
        rgb = rgb.astype(np.float32) / 255.0
    return 0.2126 * rgb[..., 0] + 0.7152 * rgb[..., 1] + 0.0722 * rgb[..., 2]


def _person_mask(src):
    """Skin, hair and clothing. A frame with no skin is not a person, so a
    striped test pattern is left untouched."""
    skin = _skin_mask(src)
    if float(skin.mean()) < 0.004:
        return np.zeros(skin.shape, dtype=bool)
    luma = _luma(src)
    col_skin = skin.mean(axis=0)
    clean = np.flatnonzero(col_skin < 0.01)
    if clean.size >= 8:
        ref = float(np.median(luma[:, clean]))
    else:
        ref = float(np.percentile(luma, 85))
    dark = luma < ref * 0.72
    person = skin | dark
    person = cv2.dilate(person.astype(np.uint8), np.ones((7, 7), np.uint8), iterations=1) > 0
    return person


def _clean_margin(flags):
    """How many leading entries are False. A fully clean row returns its length."""
    if flags.size == 0 or not flags.any():
        return int(flags.size)
    if flags[0]:
        return 0
    return int(np.argmax(flags))


def _person_columns(src):
    """Columns that contain the body, not a warm speckle in the curtain.
    The cut is inset a few columns so the shoulder edge is not tiled."""
    skin = _skin_mask(src)
    height, width = skin.shape[:2]
    if height == 0 or width == 0 or float(skin.mean()) < 0.004:
        return np.zeros(width, dtype=bool)
    luma = _luma(src)
    col_skin = skin.mean(axis=0)
    col_luma = np.median(luma, axis=0)
    seed = col_skin < 0.01
    if int(seed.sum()) >= 8:
        ref = float(np.median(col_luma[seed]))
    else:
        ref = float(np.percentile(luma, 80))
    dark_frac = (luma < ref * 0.72).mean(axis=0)
    col = (col_skin > 0.04) | (dark_frac > 0.05)
    return np.convolve(col.astype(np.float32), np.ones(17, np.float32), mode='same') > 0


def _background_strip(src):
    """Curtain columns beside the person, with hair and the shirt scrubbed out.

    Returns the whole frame when nothing in it is a person. Returns None when
    a person is present but no clean background column remains: the caller
    must pull the shot in instead of mirroring the body.
    """
    grown = _person_columns(src)
    height, width = src.shape[:2]
    if width == 0 or not grown.any():
        return src
    left = _clean_margin(grown)
    right = _clean_margin(grown[::-1])
    if left < 8 and right < 8:
        return None
    if left >= right:
        strip = src[:, :left].copy()
    else:
        strip = src[:, width - right:].copy()
    return _scrub_person(strip)


def _scrub_person(strip):
    """Replace leftover skin or hair in an otherwise clean strip with its curtain colour."""
    luma = _luma(strip)
    ref = float(np.median(luma))
    bad = _skin_mask(strip) | (luma < ref * 0.72)
    if not bad.any():
        return strip
    clean = ~bad
    if int(clean.sum()) < 16:
        return None
    out = np.array(strip, copy=True)
    out[bad] = np.median(strip[clean], axis=0)
    return out


def _reflect_coord(coord, n):
    coord = np.abs(np.asarray(coord, dtype=np.float64))
    if n <= 1:
        return np.zeros_like(coord)
    period = 2.0 * n
    coord = np.mod(coord, period)
    return np.where(coord >= n, np.maximum(0.0, period - coord - 1.0), coord)


def _edge_skin(src):
    skin = _skin_mask(src)
    if skin.size == 0:
        return {'left': 1.0, 'right': 1.0, 'top': 1.0, 'bottom': 1.0}
    return {
        'left': float(skin[:, :3].mean()),
        'right': float(skin[:, -3:].mean()),
        'top': float(skin[:3, :].mean()),
        'bottom': float(skin[-3:, :].mean()),
    }


def _curtain_fill(src, s, x0, y0):
    """Mirror the curtain strip across the canvas, aligned to the placed frame.
    None when the only pixels available are the person."""
    strip = _background_strip(src)
    if strip is None or strip.size == 0:
        return None
    strip = np.ascontiguousarray(strip, dtype=np.float32)
    sh, sw = strip.shape[:2]
    if sh < 2 or sw < 2:
        return None
    ys = _reflect_coord((np.arange(H, dtype=np.float64) + 0.5 - y0) / max(s, 1e-6), sh)
    xs = _reflect_coord((np.arange(W, dtype=np.float64) + 0.5 - x0) / max(s, 1e-6), sw)
    map_y, map_x = np.meshgrid(ys, xs, indexing='ij')
    return cv2.remap(strip, map_x.astype(np.float32), map_y.astype(np.float32), cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT_101)


def _blend_seam(canvas, bounds, seam, src=None):
    """Hide the mirror crease in a band of `seam` px. Pixels further outside stay sharp.
    An edge that is the person is not blended, so a shoulder or the hair is not smeared out."""
    span = float(seam)
    if span <= 0:
        return canvas
    height, width = canvas.shape[:2]
    x0, y0, x1, y1 = bounds
    yy, xx = np.ogrid[:height, :width]
    dist = np.minimum(np.minimum(xx - x0, x1 - xx), np.minimum(yy - y0, y1 - yy))
    weight = np.clip((span - np.abs(dist)) / span, 0.0, 1.0).astype(np.float32)
    if src is not None:
        edge = _edge_person(src)
        if edge['left'] >= 0.02:
            weight = np.where(xx + 0.5 < x0, 0.0, weight)
        if edge['right'] >= 0.02:
            weight = np.where(xx + 0.5 >= x1, 0.0, weight)
        if edge['top'] >= 0.02:
            weight = np.where(yy + 0.5 < y0, 0.0, weight)
        if edge['bottom'] >= 0.02:
            weight = np.where(yy + 0.5 >= y1, 0.0, weight)
    if float(weight.max()) <= 0:
        return canvas
    weight = weight * weight * (3.0 - 2.0 * weight)
    # Blur the curtain side only, so the kernel cannot pick up the person.
    blurred = cv2.GaussianBlur(canvas, (0, 0), max(1.0, span / 3.0))
    return canvas * (1.0 - weight[..., None]) + blurred * weight[..., None]


def _edge_person(src):
    person = _person_mask(src)
    if person.size == 0:
        return {'left': 1.0, 'right': 1.0, 'top': 1.0, 'bottom': 1.0}
    return {
        'left': float(person[:, :4].mean()),
        'right': float(person[:, -4:].mean()),
        'top': float(person[:4, :].mean()),
        'bottom': float(person[-4:, :].mean()),
    }


class Person:
    def __init__(self, src_w, src_h, face_frac, shots, joins=(), page_windows=()):
        self.sw, self.sh = src_w, src_h; self.face = (face_frac[0] * src_w, face_frac[1] * src_h)
        self.cover = max(W / src_w, H / src_h)
        self.kf = sorted(shots, key=lambda k: k['at']); self.joins = sorted(joins)
        self._ones = None
        self.last_pose = None
        self.last_bounds = None

    # ---- pose of a named shot: (scale, face_x_px, face_y_px, kp, circle_cx, circle_cy, circle_d)
    def shot_pose(self, name):
        S = SHOTS[name]
        if 'circle_d' in S:
            d = S['circle_d'] * W; cx, cy = S['center'][0] * W, S['center'][1] * H
            return (self.cover * S['inner_zoom'], cx, cy + S.get('face_offset_y', 0) * d, 1.0, cx, cy, d)
        z = clamp(S['zoom'], *PS['zoom_limits']); s = self.cover * z
        fx = S['face_x'] * W
        if z <= 1:      # pulled back: aim the face at face_y, but keep the frame (almost) on the bottom edge
            ty_bottom = H - self.sh * s; ty_face = S.get('face_y', 0.5) * H - self.face[1] * s
            ty = min(max(ty_face, ty_bottom - PS['max_bottom_gap'] * H), max(ty_bottom, 0))
            fy = ty + self.face[1] * s
        else: fy = self.face[1] * self.cover
        P = SHOTS['PIP']
        return (s, fx, fy, 0.0, P['center'][0] * W, P['center'][1] * H, P['circle_d'] * W)

    def pose(self, t):
        kf = self.kf
        i = max([j for j, k in enumerate(kf) if k['at'] <= t] or [0])
        cur = self.shot_pose(kf[i]['shot'])
        if i > 0:
            prev = self.shot_pose(kf[i - 1]['shot'])
            morph = (prev[3] != cur[3])
            dur = kf[i].get('dur', PS['pip_morph']['dur'] if morph else PS['shot_change']['dur'])
            k = ease_io((t - kf[i]['at']) / dur)
            cur = tuple(lerp(a, b, k) for a, b in zip(prev, cur))
        s, fx, fy, kp, cx, cy, d = cur
        # jump-cut punch: toggle at every join since this keyframe, skipping joins near a shot change
        t_kf = kf[i]['at']; par = 0
        for j in self.joins:
            if t_kf + 0.3 < j <= t and all(abs(j - k['at']) > 0.3 for k in kf): par ^= 1
        delta = PS['jump_cut_punch']['pip_delta'] if kp > 0.5 else PS['jump_cut_punch']['wide_delta']
        drift = 1 + min(PS['drift']['max'], PS['drift']['per_sec'] * max(0, t - t_kf))
        s *= (1 + delta * par) * drift
        if kp < 0.5: s = min(s, self.cover * PS['zoom_limits'][1])
        return s, fx, fy, kp, cx, cy, d

    def place(self, src, s, fx, fy):
        """src float HxWx3 -> canvas. Gaps are a sharp mirror of the curtain beside the person.
        If that curtain cannot cover the gap without the body, this frame is pulled in
        or recentered until the fill is only background."""
        s, fx, fy = self._pose_clear_of_person(src, s, fx, fy)
        canvas, bounds = self._paint(src, s, fx, fy)
        if canvas is None or fill_has_person(canvas, bounds, src):
            s, fx, fy = self._pose_that_covers(fy)
            canvas, bounds = self._paint(src, s, fx, fy)
        self.last_pose = (s, fx, fy)
        self.last_bounds = bounds
        return canvas

    def _pose_clear_of_person(self, src, s, fx, fy):
        canvas, bounds = self._paint(src, s, fx, fy)
        if canvas is not None and not fill_has_person(canvas, bounds, src):
            return s, fx, fy
        scale, face_x, face_y = float(s), float(fx), float(fy)
        for _ in range(10):
            if scale < self.cover - 1e-3:
                scale = min(self.cover, scale + max(0.04, (self.cover - s) * 0.2))
            else:
                face_x, face_y = self._nudge_onto_canvas(scale, face_x, face_y)
            canvas, bounds = self._paint(src, scale, face_x, face_y)
            if canvas is not None and not fill_has_person(canvas, bounds, src):
                return scale, face_x, face_y
        return self._pose_that_covers(face_y)

    def _nudge_onto_canvas(self, s, fx, fy):
        """Move the frame toward covering the canvas. A wider gap is closed first."""
        x0, y0, x1, y1 = self.frame_bounds(s, fx, fy)
        if x0 > 1 and x1 - W >= x0:
            fx -= min(x0, x1 - W) * 0.65
        elif x1 < W - 1 and -x0 >= W - x1:
            fx += min(W - x1, -x0) * 0.65
        if y0 > 1 and y1 - H >= y0:
            fy -= min(y0, y1 - H) * 0.65
        elif y1 < H - 1 and -y0 >= H - y1:
            fy += min(H - y1, -y0) * 0.65
        return fx, fy

    def _pose_that_covers(self, fy):
        """No gap left to mirror. The face stays as close to the requested height as the cover allows."""
        s = self.cover
        fx = self.face[0] * s + max(0.0, (W - self.sw * s) / 2.0)
        face_y = min(max(fy, self.face[1] * s), H - (self.sh - self.face[1]) * s)
        return s, fx, face_y

    def _paint(self, src, s, fx, fy):
        matrix = np.float32([[s, 0, fx - self.face[0] * s], [0, s, fy - self.face[1] * s]])
        x0, y0 = float(matrix[0, 2]), float(matrix[1, 2])
        x1, y1 = x0 + self.sw * s, y0 + self.sh * s
        bounds = (x0, y0, x1, y1)
        if x0 <= 0.5 and y0 <= 0.5 and x1 >= W - 0.5 and y1 >= H - 0.5:
            painted = cv2.warpAffine(src, matrix, (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT)
            return painted, bounds
        curtain = _curtain_fill(src, s, x0, y0)
        if curtain is None:
            return None, bounds
        warped = cv2.warpAffine(src, matrix, (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT)
        canvas = curtain
        yy, xx = np.ogrid[:H, :W]
        inside = (xx + 0.5 >= x0) & (xx + 0.5 < x1) & (yy + 0.5 >= y0) & (yy + 0.5 < y1)
        canvas = canvas.copy()
        canvas[inside] = warped[inside]
        seam = max(0, int(FILL.get('seam_px', 12)))
        if seam > 0:
            canvas = _blend_seam(canvas, bounds, seam, src)
        return canvas, bounds

    def frame_bounds(self, s, fx, fy):
        x0 = fx - self.face[0] * s
        y0 = fy - self.face[1] * s
        return (x0, y0, x0 + self.sw * s, y0 + self.sh * s)

    def composite(self, t, src, page_fn, overlay_fn):
        """returns (frame, kp, pose). page_fn(t)->page frame, overlay_fn(c, t)"""
        s, fx, fy, kp, cx, cy, d = p = self.pose(t)
        pw = self.place(src, s, fx, fy)
        if kp <= 0.001:
            overlay_fn(pw, t); return pw, kp, p
        page = page_fn(t)
        x0 = lerp(0, cx - d / 2, kp); y0 = lerp(0, cy - d / 2, kp); x1 = lerp(W, cx + d / 2, kp); y1 = lerp(H, cy + d / 2, kp); r = lerp(0, d / 2, kp)
        m = Image.new('L', (W * 2, H * 2), 0); ImageDraw.Draw(m).rounded_rectangle([x0 * 2, y0 * 2, x1 * 2, y1 * 2], r * 2, fill=255)
        m = np.asarray(m.resize((W, H), Image.BILINEAR)).astype(np.float32)[..., None] / 255
        M = PS['pip_morph']
        if kp > 0.5:
            sm = cv2.GaussianBlur(m[..., 0], (0, 0), M['shadow_blur'])[..., None]
            page = page * (1 - np.roll(sm, M['shadow_offset'], axis=0) * M['shadow_alpha'] * clamp((kp - 0.5) * 2))
        c = page * (1 - m) + pw * m
        if kp < 0.999: overlay_fn(c, t)
        return c, kp, p

def _gray_u8(image):
    arr = np.clip(image, 0, 1) if image.dtype != np.uint8 else image
    if arr.dtype != np.uint8:
        arr = (arr * 255.0).astype(np.uint8)
    if arr.ndim == 3:
        arr = cv2.cvtColor(arr, cv2.COLOR_RGB2GRAY)
    return arr


def laplacian_var(image, mask):
    vals = cv2.Laplacian(_gray_u8(image), cv2.CV_64F)[mask]
    if vals.size < 40:
        return None
    return float(vals.var())


def fill_sharpness(placed, bounds, seam_px=None):
    """Laplacian variance of the filled margin divided by the frame's own edge.
    A blurred extension falls well below 1. None when the frame already covers the canvas."""
    seam = float(FILL.get('seam_px', 12) if seam_px is None else seam_px)
    band = seam + 48.0
    h, w = placed.shape[:2]
    x0, y0, x1, y1 = bounds
    yy, xx = np.ogrid[:h, :w]
    dist = np.minimum(np.minimum(xx - x0, x1 - xx), np.minimum(yy - y0, y1 - yy))
    reference = (dist >= seam) & (dist < band)
    filled = dist < -seam
    # Compare the fill with the curtain it continues. Hair and the shirt are
    # sharper than cloth, and using them as the reference would fail a clean fill.
    person = _person_mask(placed)
    if person.any():
        background = reference & ~person
        if int(background.sum()) >= 80:
            reference = background
    if int(reference.sum()) < 80 or int(filled.sum()) < 80:
        return None
    src_v = laplacian_var(placed, reference)
    fill_v = laplacian_var(placed, filled)
    if not src_v:
        return None
    return fill_v / src_v


def fill_is_sharp(placed, bounds, min_ratio=0.45, seam_px=None):
    ratio = fill_sharpness(placed, bounds, seam_px=seam_px)
    if ratio is None:
        return True
    return ratio >= min_ratio


def _fill_outside(placed, bounds, seam):
    height, width = placed.shape[:2]
    x0, y0, x1, y1 = bounds
    yy, xx = np.ogrid[:height, :width]
    dist = np.minimum(np.minimum(xx - x0, x1 - xx), np.minimum(yy - y0, y1 - yy))
    return dist < -float(seam)


def fill_person_ratio(canvas, bounds, src=None, seam_px=None):
    """Share of the fill that is skin, or hair and clothing darker than the curtain.
    Zero when the frame already covers the canvas."""
    seam = float(FILL.get('seam_px', 12) if seam_px is None else seam_px)
    outside = _fill_outside(canvas, bounds, seam)
    if int(outside.sum()) < 64:
        return 0.0
    skin = _skin_mask(canvas)
    skin_ratio = float(skin[outside].mean())
    if src is None or float(_skin_mask(src).mean()) < 0.004:
        return skin_ratio
    luma = _luma(canvas)
    person = _person_mask(src)
    clean = ~person
    if int(clean.sum()) >= 16:
        ref = float(np.median(_luma(src)[clean]))
    else:
        ref = float(np.percentile(_luma(src), 90))
    dark = luma < ref * 0.62
    return max(skin_ratio, float(dark[outside].mean()))


def fill_has_person(canvas, bounds, src=None, seam_px=None, limit=0.01, faces=False):
    """True when the fill contains a person. Skin, hair, clothing, or a face box all count."""
    if fill_person_ratio(canvas, bounds, src, seam_px) > limit:
        return True
    if faces and _face_in_fill(canvas, bounds, seam_px):
        return True
    return False


def _face_in_fill(canvas, bounds, seam_px=None):
    seam = float(FILL.get('seam_px', 12) if seam_px is None else seam_px)
    if canvas.dtype != np.uint8:
        u8 = np.clip(canvas * 255.0, 0, 255).astype(np.uint8)
    else:
        u8 = canvas
    bgr = cv2.cvtColor(u8, cv2.COLOR_RGB2BGR)
    height, width = bgr.shape[:2]
    try:
        det = cv2.FaceDetectorYN.create(_yunet(), '', (width, height), 0.6, 0.3, 5000)
        _, found = det.detect(bgr)
    except Exception:
        return False
    if found is None:
        return False
    x0, y0, x1, y1 = bounds
    for row in found:
        cx = float(row[0] + row[2] / 2.0)
        cy = float(row[1] + row[3] / 2.0)
        if x0 + seam <= cx <= x1 - seam and y0 + seam <= cy <= y1 - seam:
            continue
        return True
    return False


def text_column(face_x_px):
    tc = PS['text_column']; f = face_x_px / W
    a, b = tc['face_left'] if f < 0.45 else tc['face_right'] if f > 0.55 else tc['centre']
    return int(a * W), int(b * W)
