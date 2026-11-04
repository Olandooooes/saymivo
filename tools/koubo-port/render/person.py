"""Person compositor - NO matting, NO background replacement (user fix #3).

The original frame is placed on the 16:9 canvas by a similarity transform (scale + face position).
When the person is pulled back (zoom < 1) the uncovered canvas is filled by mirroring the
ORIGINAL frame outward. The extension stays sharp. A short ramp only hides the seam, and the
strip below the frame is replicated so a mirrored torso does not appear. Shots are keyframes;
every change is a smooth eased zoom.
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

def _blend_seam(canvas, bounds, seam):
    """Hide the mirror crease in a band of `seam` px. Pixels further outside stay sharp."""
    span = float(seam)
    if span <= 0:
        return canvas
    height, width = canvas.shape[:2]
    x0, y0, x1, y1 = bounds
    yy, xx = np.ogrid[:height, :width]
    dist = np.minimum(np.minimum(xx - x0, x1 - xx), np.minimum(yy - y0, y1 - yy))
    weight = np.clip((span - np.abs(dist)) / span, 0.0, 1.0).astype(np.float32)
    if float(weight.max()) <= 0:
        return canvas
    weight = weight * weight * (3.0 - 2.0 * weight)
    blurred = cv2.GaussianBlur(canvas, (0, 0), max(1.0, span / 3.0))
    return canvas * (1.0 - weight[..., None]) + blurred * weight[..., None]


class Person:
    def __init__(self, src_w, src_h, face_frac, shots, joins=(), page_windows=()):
        self.sw, self.sh = src_w, src_h; self.face = (face_frac[0] * src_w, face_frac[1] * src_h)
        self.cover = max(W / src_w, H / src_h)
        self.kf = sorted(shots, key=lambda k: k['at']); self.joins = sorted(joins)
        self._ones = None

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
        if kp < 0.5: s = min(s, self.cover * PS['zoom_limits'][1] * (1 + delta))
        return s, fx, fy, kp, cx, cy, d

    def place(self, src, s, fx, fy):
        """src float HxWx3 -> canvas. Uncovered edges are a sharp mirror of the original frame."""
        matrix = np.float32([[s, 0, fx - self.face[0] * s], [0, s, fy - self.face[1] * s]])
        reflected = cv2.warpAffine(src, matrix, (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT_101)
        x0, y0 = float(matrix[0, 2]), float(matrix[1, 2])
        x1, y1 = x0 + self.sw * s, y0 + self.sh * s
        if x0 <= 0 and y0 <= 0 and x1 >= W and y1 >= H:
            return reflected
        canvas = reflected
        seam = max(0, int(FILL.get('seam_px', 12)))
        if y1 < H - 0.5:
            # Below the frame, repeat the last rows. Mirroring the body reads as a second person.
            replicated = cv2.warpAffine(src, matrix, (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
            y_edge = int(np.clip(round(y1), 0, H))
            canvas = reflected.copy()
            if seam <= 0:
                canvas[y_edge:] = replicated[y_edge:]
            else:
                top = max(0, y_edge - seam)
                bot = min(H, y_edge + seam)
                if bot < H:
                    canvas[bot:] = replicated[bot:]
                if bot > top:
                    ramp = np.linspace(0.0, 1.0, bot - top, dtype=np.float32)[:, None, None]
                    canvas[top:bot] = reflected[top:bot] * (1.0 - ramp) + replicated[top:bot] * ramp
        # Soften only the seam band. The mirror outside that band stays sharp.
        if seam > 0:
            canvas = _blend_seam(canvas, (x0, y0, x1, y1), seam)
        return canvas

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


def text_column(face_x_px):
    tc = PS['text_column']; f = face_x_px / W
    a, b = tc['face_left'] if f < 0.45 else tc['face_right'] if f > 0.55 else tc['centre']
    return int(a * W), int(b * W)
