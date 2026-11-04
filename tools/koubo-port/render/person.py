"""Person compositor - NO matting, NO background replacement (user fix #3).

The original frame is placed on the 16:9 canvas by a similarity transform (scale + face position).
When the person is pulled back (zoom < 1) the uncovered canvas is filled by reflect-extending the
ORIGINAL frame and blurring it lightly (sigma 22, -8 %), cross-faded over a 70 px feather, so it reads
as the same room, slightly out of focus. Shots are keyframes; every change is a smooth eased zoom.
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
        """src float HxWx3 -> canvas with blurred reflect-extension where the frame does not cover"""
        M = np.float32([[s, 0, fx - self.face[0] * s], [0, s, fy - self.face[1] * s]])
        ext = cv2.warpAffine(src, M, (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT_101)
        x0, y0 = M[0, 2], M[1, 2]; x1, y1 = x0 + self.sw * s, y0 + self.sh * s
        if x0 <= 0 and y0 <= 0 and x1 >= W and y1 >= H: return ext                    # frame covers canvas
        if y1 < H:      # below the frame the torso continues: replicate (a mirrored torso reads as a glitch)
            yb = max(0, int(y1) - 2)
            ext[yb:] = cv2.warpAffine(src, M, (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)[yb:]
        sm = cv2.resize(ext, (W // 4, H // 4), interpolation=cv2.INTER_AREA)
        bl = cv2.resize(cv2.GaussianBlur(sm, (0, 0), FILL['blur_sigma'] / 4), (W, H)) * (1 - FILL['darken'])
        # feather: distance (px) from the uncovered region, ramped over feather_px inside the frame
        xx = np.arange(W, dtype=np.float32); yy = np.arange(H, dtype=np.float32)
        fe = FILL['feather_px']
        big = np.float32(1e9)
        dx = np.minimum(xx - x0 if x0 > 0 else big, x1 - xx if x1 < W else big) * np.ones(W, np.float32)
        dy = np.minimum(yy - y0 if y0 > 0 else big, y1 - yy if y1 < H else big) * np.ones(H, np.float32)
        m = np.clip(np.minimum(dy[:, None], dx[None, :]) / fe, 0, 1); m = (m * m * (3 - 2 * m))[..., None]
        return ext * m + bl * (1 - m)

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

def text_column(face_x_px):
    tc = PS['text_column']; f = face_x_px / W
    a, b = tc['face_left'] if f < 0.45 else tc['face_right'] if f > 0.55 else tc['centre']
    return int(a * W), int(b * W)
