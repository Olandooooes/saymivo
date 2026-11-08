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
    assert any(name.startswith('WIDE') for name in names) and 'PUSH' in names and 'PIP' in names, names
    times = [row['at'] for row in scenes['shots']]
    assert times == sorted(times) and len(times) == len(set(times)), times
    assert all(0 < stills[key] < 20 for key in ('wide', 'push', 'pip')), stills
    for index, row in enumerate(scenes['shots']):
        nxt = scenes['shots'][index + 1]['at'] if index + 1 < len(scenes['shots']) else scenes['duration']
        assert nxt - row['at'] <= 3.05, (row, nxt)
    for row in scenes['overlays']:
        assert row['end'] - row['start'] <= 3.25, row
    page = next(row for row in scenes['pages'] if row['start'] < 20 and row.get('bg') != 'dark_end')
    layer = page['layers'][0]
    assert layer['template'] == 'page_example', page
    shown = [layer['title'][0]['text'], layer['card']['big']]
    if layer.get('capsule'):
        shown.append(layer['capsule']['text'])
    assert len(shown) == len(set(shown)), shown
    assert '举一个具体的例子说明' in shown and '差在这一步' in shown, shown
    assert '它到底难在哪里？' not in shown
    assert len(layer['card']['big']) >= 4
    assert 'node' not in layer['card']
    assert page['end'] - page['start'] <= 3.25, page
    title = next(row for row in scenes['overlays'] if row['template'] == 'title_card')
    assert title['title']['text'] == phrases[0]['text']
    assert title.get('glass', {}).get('text') != phrases[1]['text']
    assert len(phrases[0]['text']) > 8
    assert scenes['chapters'][0]['title'] == ''
    named = [row for row in scenes['chapters'] if row['title'] == phrases[0]['text']]
    assert named and named[0]['at'] > phrases[0]['e']
    assert draft.duplicate_frames(scenes, phrases) == []
    pushes = []
    for index, row in enumerate(scenes['shots']):
        if row['shot'] != 'PUSH':
            continue
        nxt = scenes['shots'][index + 1]['at'] if index + 1 < len(scenes['shots']) else scenes['duration']
        pushes.append(nxt - row['at'])
    assert pushes and max(pushes) <= 2.5, pushes
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
    print('draft-ok', names[:8], stills)


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
    shown = draft.frame_layers(scenes, phrases, 0.6)
    assert shown.count('同一句') == 1, shown
    counted = draft.duplicate_frames(scenes, phrases, hide_matching_subtitle=False)
    assert counted and any('同一句' in row[1] for row in counted), counted
    scenes['overlays'][0]['items'][0]['text'] = '找错资料'
    scenes['overlays'][0]['accent']['text'] = '找错资料,'
    punct = draft.duplicate_frames(scenes, phrases[:0] or [{'text': '别的一句', 's': 0.1, 'e': 1.6, 'tokens': []}])
    assert punct and any('找错资料' in row[1] for row in punct), punct
    scenes['overlays'][0]['items'][0]['text'] = '同一句'
    scenes['overlays'][0]['accent']['text'] = '另外一句'
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
    mask = dist < -float(person.FILL.get('seam_px', 12))
    heavy = person.cv2.GaussianBlur(placed, (0, 0), 22)
    blurred = placed.copy()
    blurred[mask] = heavy[mask]
    bad = person.fill_sharpness(blurred, bounds)
    assert bad is not None and bad < 0.45, bad
    assert not person.fill_is_sharp(blurred, bounds)
    assert person.fill_person_ratio(placed, bounds, src) == 0
    assert not person.fill_has_person(placed, bounds, src)
    curtain = np.array([0.82, 0.81, 0.78], np.float32)
    body = src.copy()
    body[:, :220] = curtain
    body[120:640, 420:980] = (0.86, 0.70, 0.60)
    body[80:220, 480:900] = (0.08, 0.07, 0.06)
    placed_body = who.place(body, scale, face_x, face_y)
    body_bounds = who.last_bounds
    assert person.fill_person_ratio(placed_body, body_bounds, body) <= 0.01, person.fill_person_ratio(placed_body, body_bounds, body)
    assert not person.fill_has_person(placed_body, body_bounds, body)
    x0 = body_bounds[0]
    if x0 > 40:
        edge = placed_body[:, :int(x0) - 8]
        assert float(edge[..., 0].mean() - edge[..., 2].mean()) < 0.12
    painted = np.full_like(placed_body, curtain)
    painted[:90, :90] = (0.86, 0.70, 0.60)
    forced = (400.0, 200.0, 1600.0, 1000.0)
    assert person.fill_has_person(painted, forced, body)
    solid = np.full_like(src, (0.86, 0.70, 0.60))
    solid[180:620, 360:980] = (0.06, 0.05, 0.05)
    tight = who.place(solid, scale, face_x, face_y)
    assert not person.fill_has_person(tight, who.last_bounds, solid)
    assert who.last_pose[0] + 1e-6 >= scale
    print('fill-ok', round(ratio, 3), round(bad, 3), 'pulled', round(who.last_pose[0] / who.cover, 3))


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


def test_phrase_split_keeps_a_clause_together():
    spec = importlib.util.spec_from_file_location('phrases_split', os.path.join(os.path.dirname(__file__), '06_phrases.py'))
    phrases = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(phrases)
    first = '这件事和以前的做法相比到底差在哪里'
    assert len(first) > 16
    kept = []
    clock = 0.1
    for char in first:
        kept.append([char, round(clock, 3), round(clock + 0.16, 3)])
        clock += 0.16
    clock += 0.4
    second = '下一句另外说完'
    for char in second:
        kept.append([char, round(clock, 3), round(clock + 0.16, 3)])
        clock += 0.16
    groups = phrases.split_tokens(kept)
    assert len(groups) == 2, [''.join(tok[0] for tok in group) for group in groups]
    assert ''.join(tok[0] for tok in groups[0]) == first
    assert ''.join(tok[0] for tok in groups[1]) == second
    marker = [['第', 0.0, 0.2], ['二', 0.2, 0.4]]
    clock = 0.9
    for char in '结果要能检查':
        marker.append([char, round(clock, 3), round(clock + 0.16, 3)])
        clock += 0.16
    joined = phrases.split_tokens(marker)
    assert len(joined) == 1, [''.join(tok[0] for tok in group) for group in joined]
    assert ''.join(tok[0] for tok in joined[0]).startswith('第二')
    forced = phrases.split_tokens(kept[:8], split_after=[4])
    assert len(forced) == 2
    print('phrase-split-ok', len(first))


def _load_draft():
    spec = importlib.util.spec_from_file_location('draft_catalog', os.path.join(os.path.dirname(__file__), '07_draft_scenes.py'))
    draft = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(draft)
    return draft


def test_thin_card_falls_back():
    draft = _load_draft()
    phrases = [
        {'text': '举个例子你说', 's': 0.2, 'e': 1.2, 'tokens': []},
        {'text': '在哪', 's': 1.5, 'e': 2.1, 'tokens': []},
        {'text': '结尾单独留一句', 's': 4.2, 'e': 5.4, 'tokens': []},
    ]
    scenes, _stills = draft.draft(phrases, 8)
    for page in scenes['pages']:
        layer = page['layers'][0]
        if layer['template'] == 'page_example':
            assert len(layer.get('card', {}).get('big', '')) >= 4, layer
    blob = json.dumps(scenes, ensure_ascii=False)
    assert '在哪' not in blob or 'page_example' not in blob
    assert draft.duplicate_frames(scenes, phrases) == []
    print('thin-ok')


def test_gap_does_not_emit_an_empty_template():
    draft = _load_draft()
    phrases = [
        {'text': '先说完这一句', 's': 0.2, 'e': 1.4, 'tokens': []},
        {'text': '隔了一会儿再继续', 's': 6.0, 'e': 7.4, 'tokens': []},
        {'text': '结尾把这句话留下', 's': 9.0, 'e': 10.2, 'tokens': []},
    ]
    scenes, _stills = draft.draft(phrases, 12)
    for row in scenes['overlays']:
        assert list(draft.iter_timed_texts(row)), row
    for page in scenes['pages']:
        assert list(draft.iter_timed_texts(page)), page
    for index, row in enumerate(scenes['shots']):
        nxt = scenes['shots'][index + 1]['at'] if index + 1 < len(scenes['shots']) else scenes['duration']
        assert nxt - row['at'] <= 3.05, (row, nxt)
    print('gap-ok', len(scenes['overlays']), len(scenes['shots']))


def test_templates_cover_the_catalog():
    draft = _load_draft()

    def phrase(text, start, end):
        return {'text': text, 's': start, 'e': end, 'tokens': []}

    phrases = [
        phrase('开场先把这件事讲清楚', 0.2, 2.6),
        phrase('你有没有发现', 3.0, 4.0),
        phrase('这里有一个词叫示例', 4.6, 6.6),
        phrase('也就是一个定义', 7.0, 8.2),
        phrase('它和原来的做法到底差在哪里', 8.8, 11.4),
        phrase('举个例子你说', 12.0, 13.0),
        phrase('把这件具体的事做完', 13.4, 15.0),
        phrase('这句单独提醒一下', 16.2, 17.6),
        phrase('可以尝试把这些步骤接起来', 18.2, 20.2),
        phrase('先收集需要的材料', 20.6, 22.0),
        phrase('再核对一遍', 22.4, 23.4),
        phrase('整理成能检查的结果', 23.8, 25.4),
        phrase('再把后面的步骤接起来', 26.2, 27.2),
        phrase('先标出重点', 27.4, 28.2),
        phrase('再排好顺序', 28.4, 29.2),
        phrase('然后收成一页', 29.4, 30.4),
        phrase('关键的变化就是从旧做法', 32.0, 34.0),
        phrase('走向一套新做法', 34.4, 35.8),
        phrase('但这里有个误区', 38.0, 39.2),
        phrase('第一会找错材料', 39.6, 40.8),
        phrase('第二会理解错要求', 41.2, 42.6),
        phrase('第三会让结果跑偏', 43.0, 44.4),
        phrase('这句单独再说一次', 46.0, 47.4),
        phrase('接下来会看三件事', 50.0, 51.4),
        phrase('第一能不能做完', 52.0, 53.4),
        phrase('第二结果能不能检查', 54.0, 55.6),
        phrase('第三出错能不能改', 56.2, 57.8),
        phrase('拿正在做的这个工具来说', 60.0, 61.8),
        phrase('先导入一段素材', 62.2, 63.4),
        phrase('再整理字幕', 63.8, 65.0),
        phrase('然后安排画面', 65.4, 66.6),
        phrase('就这句', 68.0, 68.8),
        phrase('从草稿到成片就这一步', 70.0, 72.0),
        phrase('结尾把这句话留下', 74.0, 76.2),
        phrase('把这两个步骤接起来', 78.0, 78.8),
        phrase('先核对结果', 79.0, 79.8),
    ]
    scenes, _stills = draft.draft(phrases, 150)
    found = {row['template'] for row in scenes['overlays']}
    found.update(row['layers'][0]['template'] for row in scenes['pages'])
    needed = {
        'title_card', 'side_panel', 'headline_pill', 'contrast_arrow', 'blur_lines',
        'pill_lines', 'error_stack', 'headline_badges', 'flow_pills',
        'page_example', 'scattered_capsules', 'doc_stack', 'card_carousel', 'editor_mock', 'neon_end',
    }
    assert needed <= found, sorted(needed - found)
    for index, row in enumerate(scenes['shots']):
        nxt = scenes['shots'][index + 1]['at'] if index + 1 < len(scenes['shots']) else scenes['duration']
        assert 0.05 <= nxt - row['at'] <= 3.05, (row, nxt)
    wide = 0.0
    push = 0.0
    for index, row in enumerate(scenes['shots']):
        nxt = scenes['shots'][index + 1]['at'] if index + 1 < len(scenes['shots']) else scenes['duration']
        if row['shot'].startswith('WIDE'):
            wide += nxt - row['at']
        if row['shot'] == 'PUSH':
            push += nxt - row['at']
            assert nxt - row['at'] <= 2.5
    assert wide >= 0.85 * scenes['duration'] - 0.05, wide
    assert push <= 0.05 * scenes['duration'] + 0.05, push
    shares = draft.shot_shares(scenes)
    assert shares['share']['wide'] >= 0.85 - 1e-6, shares
    assert shares['share']['push'] <= 0.05 + 1e-6, shares
    assert draft.pairing_problems(scenes, phrases) == [], draft.pairing_problems(scenes, phrases)
    assert draft.duplicate_frames(scenes, phrases) == []
    short, _ = draft.draft(phrases, 91.366)
    short_shares = draft.shot_shares(short)
    assert short_shares['share']['wide'] >= 0.85 - 1e-6, short_shares
    assert short_shares['share']['push'] <= 0.05 + 1e-6, short_shares
    assert draft.pairing_problems(short, phrases) == []
    print('catalog-ok', sorted(found), 'wide', round(shares['share']['wide'], 3), 'push', round(shares['share']['push'], 3), 'pip', round(shares['share']['pip'], 3),
          'short91', round(short_shares['share']['wide'], 3), round(short_shares['share']['push'], 3), round(short_shares['share']['pip'], 3))


def test_unrelated_lines_stay_on_their_own_screens():
    draft = _load_draft()
    phrases = [
        {'text': '但这里有个误区', 's': 0.4, 'e': 1.6, 'tokens': []},
        {'text': '不代表每一步都可靠', 's': 2.0, 'e': 3.4, 'tokens': []},
        {'text': '找错资料', 's': 3.8, 'e': 4.8, 'tokens': []},
        {'text': '能自己执行', 's': 5.2, 'e': 6.4, 'tokens': []},
        {'text': '理解错要求', 's': 6.8, 'e': 8.0, 'tokens': []},
        {'text': '结尾把这句话留下', 's': 18.0, 'e': 20.0, 'tokens': []},
    ]
    scenes, _stills = draft.draft(phrases, 22)
    claims = ('但这里有个误区', '不代表每一步都可靠', '找错资料', '能自己执行', '理解错要求')
    nodes = list(scenes['overlays'])
    for page in scenes['pages']:
        nodes.extend(page['layers'])
    for node in nodes:
        texts = [text for text, _at in draft.iter_timed_texts(node)]
        hits = [text for text in texts if text in claims]
        assert len(hits) <= 1, (node.get('template'), hits)
    assert draft.pairing_problems(scenes, phrases) == []
    print('pair-ok')


def test_carousel_merges_points_or_drops():
    draft = _load_draft()
    phrases = [
        {'text': '开场先把这件事讲清楚', 's': 0.2, 'e': 1.4, 'tokens': []},
        {'text': '接下来会看三件事', 's': 2.0, 'e': 3.2, 'tokens': []},
        {'text': '第一能不能做完', 's': 3.6, 'e': 4.8, 'tokens': []},
        {'text': '第二结果能不能检查', 's': 5.2, 'e': 6.6, 'tokens': []},
        {'text': '第三出错能不能改', 's': 7.0, 'e': 8.4, 'tokens': []},
        {'text': '结尾把这句话留下', 's': 36.0, 'e': 38.0, 'tokens': []},
    ]
    scenes, _stills = draft.draft(phrases, 48)
    cards = [page['layers'][0] for page in scenes['pages'] if page['layers'][0]['template'] == 'card_carousel']
    assert cards, [page['layers'][0]['template'] for page in scenes['pages']]
    lines = [line['text'] for line in cards[0]['cards'][0]['lines']]
    assert lines == ['第一能不能做完', '第二结果能不能检查', '第三出错能不能改'], lines
    assert all(len(card.get('lines') or []) >= 2 for layer in cards for card in layer['cards'])
    thin_phrases = [
        {'text': '开场先把这件事讲清楚', 's': 0.2, 'e': 1.4, 'tokens': []},
        {'text': '接下来会看三件事', 's': 2.0, 'e': 3.2, 'tokens': []},
        {'text': '第三只有这句', 's': 3.6, 'e': 4.8, 'tokens': []},
        {'text': '结尾把这句话留下', 's': 20.0, 'e': 22.0, 'tokens': []},
    ]
    thin, _stills = draft.draft(thin_phrases, 28)
    assert all(page['layers'][0]['template'] != 'card_carousel' for page in thin['pages'])
    print('card-ok')


def test_contrast_halves_stay_on_one_shot():
    draft = _load_draft()
    sentence = '关键的变化就是从回答一个问题到开始执行'
    phrases = [
        {'text': '开场先把这件事讲清楚', 's': 0.2, 'e': 1.4, 'tokens': []},
        {'text': sentence, 's': 2.0, 'e': 6.4, 'tokens': []},
        {'text': '结尾把这句话留下', 's': 20.0, 'e': 22.0, 'tokens': []},
    ]
    scenes, _stills = draft.draft(phrases, 24)
    left, right = sentence.split('到', 1)
    homes = []
    for row in scenes['overlays']:
        texts = [text for text, _at in draft.iter_timed_texts(row)]
        if sentence in texts or left in texts or right in texts:
            homes.append(texts)
    assert len(homes) == 1, homes
    if left in homes[0] or right in homes[0]:
        assert left in homes[0] and right in homes[0]
    assert draft.pairing_problems(scenes, phrases) == []
    print('contrast-ok')


def test_contrast_second_half_waits_for_speech():
    draft = _load_draft()
    phrases = [
        {'text': '开场先把这件事讲清楚', 's': 0.2, 'e': 1.4, 'tokens': []},
        {'text': '关键的变化就是从回答一个问题', 's': 2.0, 'e': 4.2, 'tokens': []},
        {'text': '走向执行一项任务', 's': 4.9, 'e': 6.4, 'tokens': []},
        {'text': '结尾把这句话留下', 's': 20.0, 'e': 22.0, 'tokens': []},
    ]
    scenes, _stills = draft.draft(phrases, 24)
    contrast = [row for row in scenes['overlays'] if row.get('template') == 'contrast_arrow']
    assert contrast, [row.get('template') for row in scenes['overlays']]
    row = contrast[0]
    assert row['to']['at'] >= 4.9 - 1e-6, row['to']
    assert row['end'] >= 6.4 - 1e-6, row['end']
    before = draft.graphic_texts(scenes, 4.2)
    assert all('走向执行一项任务' not in text for text in before), before
    during = draft.graphic_texts(scenes, 5.4)
    assert any('走向执行一项任务' in text for text in during), during
    assert draft.duplicate_frames(scenes, phrases) == []
    print('contrast-wait-ok', row['to']['at'], row['end'])


if __name__ == '__main__':
    main()
    test_opening_shots()
    test_phrase_split_keeps_a_clause_together()
    test_thin_card_falls_back()
    test_gap_does_not_emit_an_empty_template()
    test_templates_cover_the_catalog()
    test_unrelated_lines_stay_on_their_own_screens()
    test_carousel_merges_points_or_drops()
    test_contrast_halves_stay_on_one_shot()
    test_contrast_second_half_waits_for_speech()
    test_hangover_bridges_a_short_vocalization()
    test_display_replacement_keeps_longer_latin()
    test_phrase_display_uses_lexicon()
    test_duplicate_frames_flags_a_repeat()
    test_fill_stays_sharp()
    test_shot_zoom_stays_locked()
