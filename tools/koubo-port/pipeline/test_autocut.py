"""Synthetic rough-cut: fillers, a failed start, a retake, and one long pause. No real transcript."""
import json, os, sys, tempfile
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import importlib.util
spec = importlib.util.spec_from_file_location('autocut', os.path.join(os.path.dirname(__file__), '03_autocut.py'))
autocut = importlib.util.module_from_spec(spec)
spec.loader.exec_module(autocut)


def build(wd):
    chars = [
        ['先', 0.10, 0.30], ['看', 0.35, 0.55], ['这', 0.60, 0.80],
        ['先', 1.30, 1.50], ['看', 1.55, 1.75], ['这', 1.80, 2.00], ['里', 2.05, 2.25],
        ['嗯', 3.50, 3.80],
        ['我', 4.70, 4.90], ['们', 5.00, 5.20], ['重', 5.30, 5.50], ['新', 5.60, 5.80], ['做', 5.90, 6.10], ['一', 6.20, 6.40], ['遍', 6.50, 6.70],
        ['我', 8.10, 8.30], ['们', 8.40, 8.60], ['重', 8.70, 8.90], ['新', 9.00, 9.20], ['做', 9.30, 9.50], ['完', 9.60, 9.80],
        ['结', 15.20, 15.45], ['束', 15.60, 15.85],
    ]
    regions = [[0.0, 1.0], [1.2, 2.4], [2.6, 2.95], [3.4, 4.2], [4.6, 7.0], [8.0, 11.0], [15.0, 16.2]]
    dt = 0.02
    db = np.full(int(17 / dt), -20.0, dtype=np.float32)
    json.dump(chars, open(os.path.join(wd, 'chars.json'), 'w'), ensure_ascii=False)
    json.dump(regions, open(os.path.join(wd, 'speech_regions.json'), 'w'))
    json.dump({'fps': 30}, open(os.path.join(wd, 'probe.json'), 'w'))
    np.save(os.path.join(wd, 'energy_db.npy'), db)


def main():
    with tempfile.TemporaryDirectory() as wd:
        build(wd)
        ctx = autocut.Ctx(wd, json.load(open(os.path.join(os.path.dirname(__file__), '..', 'config', 'cut_rules.json'))))
        found, _ = autocut.detect(ctx)
        removed = autocut.to_intervals(ctx, found)
        gaps = autocut.compress_gaps(ctx, removed, [])
        kinds = [row['type'] for row in removed]
        assert any('起句失败' in kind for kind in kinds), kinds
        assert any('重说' in kind for kind in kinds), kinds
        assert any('语气词' in kind for kind in kinds), kinds
        assert any(gap['target'] == 0.75 and gap['orig'] > 3 for gap in gaps), gaps
        retake = next(row for row in removed if '重说' in row['type'])
        assert retake['e'] <= 8.15, retake
        assert retake['s'] < 5.0, retake
        keep = autocut.build_keep(ctx, removed, gaps)
        assert keep[0][0] >= 0
        assert sum(b - a for a, b in keep) < 16
        print('ok', kinds, 'gaps', len(gaps), 'out', round(sum(b - a for a, b in keep), 3))


def test_opening_shots():
    spec = importlib.util.spec_from_file_location('draft', os.path.join(os.path.dirname(__file__), '07_draft_scenes.py'))
    draft = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(draft)
    phrases = [
        {'text': '开场先讲清楚这件事', 's': 0.2, 'e': 2.4, 'tokens': []},
        {'text': '它到底难在哪里？', 's': 2.8, 'e': 5.2, 'tokens': []},
        {'text': '从旧办法到新办法', 's': 5.6, 'e': 8.4, 'tokens': []},
        {'text': '关键的一句就在这里', 's': 8.8, 'e': 11.0, 'tokens': []},
        {'text': '举一个具体的例子说明', 's': 11.4, 'e': 12.4, 'tokens': []},
        {'text': '差在这一步', 's': 12.5, 'e': 13.3, 'tokens': []},
        {'text': '你就这么说', 's': 13.4, 'e': 14.5, 'tokens': []},
        {'text': '后面还有一段要说完', 's': 16.0, 'e': 20.0, 'tokens': []},
        {'text': '结尾把这句话留下', 's': 36.0, 'e': 39.0, 'tokens': []},
    ]
    scenes, stills = draft.draft(phrases, 40)
    names = [row['shot'] for row in scenes['shots']]
    assert 'WIDE_R' in names and 'PUSH' in names and 'PIP' in names, names
    times = [row['at'] for row in scenes['shots']]
    assert times == sorted(times) and len(times) == len(set(times)), times
    assert all(0 < stills[key] < 20 for key in ('wide', 'push', 'pip')), stills
    push_at = next(row['at'] for row in scenes['shots'] if row['shot'] == 'PUSH')
    pip_at = next(row['at'] for row in scenes['shots'] if row['shot'] == 'PIP')
    assert 0 < pip_at - push_at <= 2.5, (push_at, pip_at)
    opening = [row['template'] for row in scenes['overlays'] if row['start'] < 20]
    assert {'title_card', 'side_panel', 'headline_pill', 'pill_lines', 'blur_lines', 'flow_pills'} <= set(opening), opening
    for row in scenes['overlays']:
        if row['start'] < 20:
            assert row['end'] - row['start'] <= 3.25, row
    page = next(row for row in scenes['pages'] if row['start'] < 20 and row.get('bg') != 'dark_end')
    layer = page['layers'][0]
    assert layer['template'] == 'page_example', page
    shown = [layer['title'][0]['text'], layer['card']['big'], layer['capsule']['text']]
    assert len(shown) == len(set(shown)), shown
    assert 'node' not in layer['card']
    assert page['end'] - page['start'] <= 3.25, page
    title = next(row for row in scenes['overlays'] if row['template'] == 'title_card')
    assert title['title']['text'] == phrases[0]['text']
    assert title['glass']['text'] == phrases[1]['text']
    assert len(phrases[0]['text']) > 8
    assert scenes['chapters'][0]['title'] == ''
    named = [row for row in scenes['chapters'] if row['title'] == phrases[0]['text']]
    assert named and named[0]['at'] > phrases[0]['e']
    assert draft.duplicate_frames(scenes, phrases) == []
    panel = next(row for row in scenes['overlays'] if row['template'] == 'side_panel' and row['start'] < 20)
    panel_texts = [item['text'] for item in panel['items']]
    if panel.get('accent'):
        panel_texts.append(panel['accent']['text'])
    assert len(panel_texts) == len(set(panel_texts)), panel_texts
    spoken = [row['text'] for row in phrases]
    def acceptable(text):
        if text in spoken:
            return True
        for phrase in spoken:
            if '到' in phrase and '从' in phrase:
                left, right = phrase.split('到', 1)
                if text in (left, right):
                    return True
        return False
    def walk(value):
        if isinstance(value, dict):
            if isinstance(value.get('text'), str) and value['text'].strip():
                assert acceptable(value['text'].strip()), value['text']
            for item in value.values():
                walk(item)
        elif isinstance(value, list):
            for item in value:
                walk(item)
    walk(scenes)
    print('draft-ok', names[:8], stills, opening)


def test_hangover_bridges_a_short_vocalization():
    spec = importlib.util.spec_from_file_location('vad', os.path.join(os.path.dirname(__file__), '02_speech_regions.py'))
    vad = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(vad)
    db = np.full(200, -50.0)
    db[50:55] = -28          # 0.10 s burst
    db[68:70] = -30          # 0.26 s later, 0.04 s burst, just past the 0.25 s merge
    rules = {'energy_vad': {'frame_ms': 20, 'threshold_db': -34, 'merge_gap': 0.25, 'min_region': 0.12, 'hangover_ms': 0}}
    strict = vad.speech_regions(db, rules)
    assert strict == [], strict
    rules['energy_vad']['hangover_ms'] = 40
    hung = vad.speech_regions(db, rules)
    assert len(hung) == 1 and hung[0][0] <= 1.0 and hung[0][1] >= 1.36, hung
    click = np.full(200, -50.0); click[10] = -20
    assert vad.speech_regions(click, rules) == []
    print('hangover-ok', hung)


def test_display_replacement_keeps_longer_latin():
    spec = importlib.util.spec_from_file_location('lexicon', os.path.join(os.path.dirname(__file__), 'lexicon.py'))
    lexicon = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(lexicon)
    with tempfile.TemporaryDirectory() as wd:
        path = os.path.join(wd, 'lexicon.json')
        json.dump({'hotwords': ['AI Agent'], 'replace': [
            {'before': 'AI', 'after': '人工智能', 'status': 'accepted'},
            {'before': 'AIA', 'after': 'AI Agent', 'status': 'accepted'},
            {'before': 'skip', 'after': 'nope', 'status': 'proposed'},
        ]}, open(path, 'w'), ensure_ascii=False)
        lex = lexicon.load(path)
        assert lexicon.apply_display('AIA 技能', lex) == 'AI Agent 技能'
        assert lexicon.apply_display('AI 技能', lex) == '人工智能 技能'
        assert lexicon.apply_display('skip', lex) == 'skip'
        assert 'AI Agent' in lexicon.hotword_arg(lex)
    print('lexicon-ok')


def test_phrase_display_uses_lexicon():
    spec = importlib.util.spec_from_file_location('phrases', os.path.join(os.path.dirname(__file__), '06_phrases.py'))
    phrases = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(phrases)
    with tempfile.TemporaryDirectory() as wd:
        json.dump([['AIA', 0.1, 0.4], ['技', 0.5, 0.7], ['能', 0.8, 1.0]], open(os.path.join(wd, 'chars.json'), 'w'), ensure_ascii=False)
        json.dump({'keep': [[0, 2]]}, open(os.path.join(wd, 'cutlist.json'), 'w'))
        json.dump({'replace': [{'before': 'AIA', 'after': 'AI Agent', 'status': 'accepted'}]}, open(os.path.join(wd, 'lexicon.json'), 'w'), ensure_ascii=False)
        phrases.main(wd)
        out = json.load(open(os.path.join(wd, 'phrases.json')))
        assert out[0]['text'].startswith('AI Agent'), out[0]['text']
        assert out[0]['raw'].startswith('AIA'), out[0]['raw']
        assert out[0]['tokens'][0][0] == 'AIA'
    print('phrase-display-ok', out[0]['text'])


def test_duplicate_frames_flags_a_repeat():
    spec = importlib.util.spec_from_file_location('draft_dup', os.path.join(os.path.dirname(__file__), '07_draft_scenes.py'))
    draft = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(draft)
    scenes = {
        'duration': 2,
        'chapters': [{'title': '', 'at': 0}],
        'shots': [{'at': 0, 'shot': 'WIDE_L'}],
        'overlays': [{
            'template': 'side_panel',
            'start': 0.1,
            'end': 1.8,
            'items': [{'text': '同一句', 'at': 0.2, 'style': 'h1'}],
            'accent': {'text': '同一句', 'at': 0.4},
        }],
        'pages': [],
    }
    phrases = [{'text': '同一句', 's': 0.1, 'e': 1.6, 'tokens': []}]
    bad = draft.duplicate_frames(scenes, phrases)
    assert bad and any('同一句' in row[1] for row in bad), bad
    scenes['overlays'][0]['accent']['text'] = '另外一句'
    assert draft.duplicate_frames(scenes, phrases) == []
    scenes['chapters'].append({'title': '另外一句', 'at': 0.5})
    bad = draft.duplicate_frames(scenes, phrases)
    assert bad and any('另外一句' in row[1] for row in bad), bad
    print('duplicate-ok', len(bad))


def test_fill_stays_sharp():
    render = os.path.join(os.path.dirname(__file__), '..', 'render')
    if render not in sys.path:
        sys.path.insert(0, render)
    import person
    src = np.zeros((720, 1280, 3), np.float32)
    stripe = ((np.arange(1280) // 10) % 2).astype(np.float32)
    tone = np.array([0.86, 0.84, 0.80], np.float32)
    src[:] = tone * (0.55 + 0.45 * stripe)[None, :, None]
    who = person.Person(1280, 720, (0.49, 0.62), [{'at': 0, 'shot': 'WIDE_R'}])
    scale, face_x, face_y = who.shot_pose('WIDE_R')[:3]
    placed = who.place(src, scale, face_x, face_y)
    bounds = who.frame_bounds(scale, face_x, face_y)
    ratio = person.fill_sharpness(placed, bounds)
    assert ratio is not None and ratio >= 0.45, ratio
    assert person.fill_is_sharp(placed, bounds)
    x0, y0, x1, y1 = bounds
    height, width = placed.shape[:2]
    yy, xx = np.ogrid[:height, :width]
    dist = np.minimum(np.minimum(xx - x0, x1 - xx), np.minimum(yy - y0, y1 - yy))
    mask = dist < -12
    heavy = person.cv2.GaussianBlur(placed, (0, 0), 22)
    blurred = placed.copy()
    blurred[mask] = heavy[mask]
    bad = person.fill_sharpness(blurred, bounds)
    assert bad is not None and bad < 0.45, bad
    assert not person.fill_is_sharp(blurred, bounds)
    print('fill-ok', round(ratio, 3), round(bad, 3))


def test_shot_zoom_stays_locked():
    style = json.load(open(os.path.join(os.path.dirname(__file__), '..', 'config', 'style.json')))
    shots = style['person']['shots']
    assert shots['WIDE_L']['zoom'] == 0.8
    assert shots['WIDE_R']['zoom'] == 0.8
    assert shots['PUSH']['zoom'] == 1.08
    assert style['canvas']['window'] is None
    assert style['canvas']['wallpaper'] is None
    assert style['person']['matting'] is False
    fill = style['person']['fill_when_zoomed_out']
    assert fill['method'] == 'reflect_extend'
    assert 'blur_sigma' not in fill
    print('zoom-ok', shots['WIDE_L']['zoom'], shots['PUSH']['zoom'])


if __name__ == '__main__':
    main()
    test_opening_shots()
    test_hangover_bridges_a_short_vocalization()
    test_display_replacement_keeps_longer_latin()
    test_phrase_display_uses_lexicon()
    test_duplicate_frames_flags_a_repeat()
    test_fill_stays_sharp()
    test_shot_zoom_stays_locked()
