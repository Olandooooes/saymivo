"""Draft a generic scene list from subtitle phrases.

On-screen copy is a whole spoken phrase. A label is never a character budget
cut out of a longer sentence. Nothing here is written for one script.

Each field on one template takes a different phrase. A field with nothing
left stays empty. The same phrase may also sit in the subtitle, but it is
not copied into a second graphic at the same time.

The opening 20 seconds always plays one template order: opening title, frosted
glass card, white panel, chapter type, a push no longer than 2.2 s, a white
page with the small window and a capsule, then a blur slide and a flow.
Later stretches rotate templates so a shot does not sit still for more than
about 3 seconds. Shot zoom values stay in style.json.

usage: python 07_draft_scenes.py workdir/
reads phrases.json ; writes scenes.json and preview_beats.json
"""
import json, os, sys

OPENING = (
    (0.00, 3.00, 'WIDE_C', 'title_card'),
    (3.00, 6.00, 'WIDE_R', 'side_panel'),
    (6.00, 9.00, 'WIDE_L', 'headline_pill'),
    (9.00, 11.20, 'PUSH', 'pill_lines'),
    (11.20, 14.20, 'PIP', 'page_example'),
    (14.20, 17.20, 'WIDE_R', 'blur_lines'),
    (17.20, 20.20, 'WIDE_L', 'flow_pills'),
)
ROTATE = ('side_panel', 'headline_pill', 'blur_lines', 'pill_lines', 'flow_pills')


def clean(text):
    return ' '.join(str(text or '').split())


def phrase_at(phrases, time):
    current = phrases[0]
    for phrase in phrases:
        if phrase['s'] <= time + 0.02:
            current = phrase
        else:
            break
    return current


def texts_between(phrases, start, end, pad=0.4):
    """Phrases that belong to this beat: most of the phrase sits inside it,
    or the next phrase starts just as the beat ends. A sentence that only
    grazes the boundary stays with the beat that actually speaks it."""
    found = []
    for phrase in phrases:
        dur = max(0.05, phrase['e'] - phrase['s'])
        overlap = min(phrase['e'], end) - max(phrase['s'], start)
        starts_soon = end <= phrase['s'] < end + pad
        if overlap < 0.2 and not starts_soon:
            continue
        if phrase['e'] > end and overlap < 0.5 * dur and not starts_soon:
            continue
        text = clean(phrase.get('text'))
        if text and text not in found:
            found.append(text)
    if not found:
        text = clean(phrase_at(phrases, start).get('text'))
        found = [text or phrases[0].get('text') or ' ']
    return found


def line_size(text, base=118):
    count = max(1, len(text))
    fitted = int(900 * 776 / 1080 / count)
    return max(32, min(base, fitted))


def is_question(text):
    return any(mark in text for mark in ('？', '?')) or text.endswith('吗')


def is_contrast(text):
    return '从' in text and '到' in text and text.find('从') < text.find('到')


def is_list(text):
    return any(mark in text for mark in ('第一', '第二', '首先', '其次'))


def at(start, end, offset):
    return round(min(start + offset, max(start + 0.05, end - 0.2)), 3)


def timed(text, start, end, offset):
    return {'text': text, 'at': at(start, end, offset)}


def overlay_span(start, end):
    return round(start, 3), round(max(start + 0.4, end - 0.02), 3)


def title_card(phrases, start, end):
    title = clean(phrases[0].get('text')) or ' '
    glass = clean(phrases[1].get('text')) if len(phrases) > 1 else title
    return {
        'template': 'title_card',
        'start': start,
        'end': end,
        'title': {'text': title, 'at': at(start, end, 0.12)},
        'glass': {'text': glass, 'at': at(start, end, 0.85)},
        'arrows': {'at': at(start, end, 1.7), 'x': 0.62, 'y': 0.28, 'point': 'right'},
    }


def consume(texts):
    pool = []
    for text in texts:
        text = clean(text)
        if text and text not in pool:
            pool.append(text)

    def take():
        if not pool:
            return None
        return pool.pop(0)

    return take


def side_panel(texts, start, end):
    take = consume(texts)
    spec = {'template': 'side_panel', 'start': start, 'end': end, 'items': []}
    head = take()
    if head:
        spec['items'].append({'text': head, 'at': at(start, end, 0.16), 'style': 'h1'})
    accent = take()
    if accent:
        spec['accent'] = timed(accent, start, end, 0.45)
    for index, style_name in enumerate(('muted', 'h2')):
        extra = take()
        if not extra:
            break
        spec['items'].append({'text': extra, 'at': at(start, end, 0.72 + index * 0.28), 'style': style_name})
    return spec


def _pill_and_lines(kind, texts, start, end, size):
    take = consume(texts)
    spec = {'template': kind, 'start': start, 'end': end, 'lines': []}
    line = take()
    label = take()
    extra = take()
    if line:
        spec['lines'].append({'text': line, 'at': at(start, end, 0.28), 'size': line_size(line, size)})
    if extra:
        spec['lines'].append({'text': extra, 'at': at(start, end, 0.68), 'size': line_size(extra, size - 8)})
    if label:
        spec['pill'] = timed(label, start, end, 0.08)
    return spec


def headline_pill(texts, start, end):
    return _pill_and_lines('headline_pill', texts, start, end, 118)


def pill_lines(texts, start, end):
    return _pill_and_lines('pill_lines', texts, start, end, 110)


def blur_lines(texts, start, end):
    take = consume(texts)
    lines = []
    for index in range(2):
        text = take()
        if not text:
            break
        lines.append({'text': text, 'at': at(start, end, 0.16 + index * 0.4), 'size': line_size(text, 104 if index == 0 else 96)})
    return {'template': 'blur_lines', 'start': start, 'end': end, 'lines': lines}


def flow_pills(texts, start, end):
    take = consume(texts)
    spec = {'template': 'flow_pills', 'start': start, 'end': end}
    left, right, body = take(), take(), take()
    if left:
        spec['a'] = timed(left, start, end, 0.12)
    if right:
        spec['b'] = timed(right, start, end, 0.42)
    if body:
        spec['bottom'] = timed(body, start, end, 0.7)
    return spec


def contrast_arrow(texts, start, end, blocked=()):
    sentence = next((text for text in texts if is_contrast(text)), '')
    parts = [clean(part) for part in sentence.split('到', 1)] if sentence else []
    left = parts[0] if len(parts) == 2 else ''
    right = parts[1] if len(parts) == 2 else ''
    blocked = set(blocked)
    if (not left or not right or left == sentence or right == sentence or left == right
            or left in blocked or right in blocked or left == right):
        return headline_pill(texts, start, end)
    return {
        'template': 'contrast_arrow',
        'start': start,
        'end': end,
        'header': timed(sentence, start, end, 0.06),
        'from': timed(left, start, end, 0.16),
        'to': timed(right, start, end, 0.7),
    }


def headline_badges(texts, start, end):
    take = consume(texts)
    spec = {
        'template': 'headline_badges',
        'start': start,
        'end': end,
        'badges': {'n': min(3, max(2, len([text for text in texts if clean(text)]))), 'at': at(start, end, 0.45)},
    }
    headline = take()
    if headline:
        spec['headline'] = timed(headline, start, end, 0.28)
    label = take()
    if label:
        spec['pill'] = timed(label, start, end, 0.08)
    return spec


def page_example(texts, start, end):
    take = consume(texts)
    spec = {'template': 'page_example', 'start': start, 'end': end}
    title = take()
    big = take()
    cap = take()
    node = take()
    kicker = take()
    caption = take()
    lead = take()
    if title:
        spec['title'] = [timed(title, start, end, 0.16)]
    if kicker:
        spec['kicker'] = timed(kicker, start, end, 0.08)
    if caption:
        spec['caption'] = caption
    card = {}
    if lead:
        card['lead'] = lead
    if big:
        card['big'] = big
    if node:
        card['node'] = node
        card['children'] = 3
    if card:
        card['at'] = at(start, end, 0.4)
        spec['card'] = card
    if cap:
        spec['capsule'] = timed(cap, start, end, 0.9)
    return spec


def scattered(texts, start, end):
    take = consume(texts)
    items = []
    for index in range(4):
        text = take()
        if not text:
            break
        items.append({'text': text, 'at': at(start, end, 0.28 + index * 0.28)})
    spec = {'template': 'scattered_capsules', 'start': start, 'end': end, 'items': items}
    lead = take()
    cap = take()
    if lead:
        spec['lead'] = timed(lead, start, end, 0.08)
    if cap:
        spec['capsule'] = timed(cap, start, end, 1.05)
    return spec


def build_overlay(kind, texts, start, end, phrases, blocked=()):
    if kind == 'title_card':
        return title_card(phrases, start, end)
    if kind == 'side_panel':
        return side_panel(texts, start, end)
    if kind == 'headline_pill':
        return headline_pill(texts, start, end)
    if kind == 'pill_lines':
        return pill_lines(texts, start, end)
    if kind == 'blur_lines':
        return blur_lines(texts, start, end)
    if kind == 'flow_pills':
        return flow_pills(texts, start, end)
    if kind == 'contrast_arrow':
        return contrast_arrow(texts, start, end, blocked)
    if kind == 'headline_badges':
        return headline_badges(texts, start, end)
    return pill_lines(texts, start, end)


def neon_end(texts, start, end):
    take = consume(texts)
    spec = {'template': 'neon_end', 'start': start, 'end': end}
    word, line = take(), take()
    if word:
        spec['word'] = timed(word, start, end, 0.2)
    if line:
        spec['line'] = timed(line, start, end, 0.45)
    return spec


def page_for(kind, texts, start, end, pip_count):
    layer = scattered(texts, start, end) if pip_count % 2 == 1 else page_example(texts, start, end)
    if kind == 'page_example':
        layer = page_example(texts, start, end)
    return {
        'start': start,
        'end': end,
        'bg': 'offwhite',
        'layers': [layer],
    }


def choose_later(text, cursor, last_pip, last_push, push_sec, wide_sec, total, step_room):
    if is_question(text):
        return 'headline_pill', 'WIDE', 2.8
    if is_contrast(text):
        return 'contrast_arrow', 'WIDE', 2.8
    if is_list(text):
        return 'headline_badges', 'WIDE', 2.8
    if len(text) >= 18 and cursor - last_pip > 12:
        step = 3.0
        if wide_sec + (total - cursor - step) >= 0.60 * total:
            return 'page', 'PIP', step
    if len(text) <= 12 and text.endswith(('！', '!', '？', '?')) and cursor - last_push > 12:
        step = 2.2
        if push_sec + step <= 0.15 * total + 1e-6 and step <= 2.5 and wide_sec + (total - cursor - step) >= 0.60 * total:
            return 'pill_lines', 'PUSH', step
    return ROTATE[step_room % len(ROTATE)], 'WIDE', 2.8


_STYLE = None


def clock():
    global _STYLE
    if _STYLE is None:
        _STYLE = json.load(open(os.path.join(os.path.dirname(__file__), '..', 'config', 'style.json')))
    sub = _STYLE['subtitle']
    person = _STYLE['person']
    morph = max(person['shot_change']['dur'], person['pip_morph']['dur'])
    return sub['lead'], sub['hold_after'], morph


def overlaps(a0, a1, b0, b1):
    return a0 < b1 - 1e-9 and b0 < a1 - 1e-9


def iter_timed_texts(node, inherited_at=0.0):
    """Visible copy in a template spec: timed text, plus card and caption strings."""
    if isinstance(node, list):
        for item in node:
            yield from iter_timed_texts(item, inherited_at)
        return
    if not isinstance(node, dict):
        return
    if isinstance(node.get('text'), str) and clean(node.get('text')):
        at = node['at'] if isinstance(node.get('at'), (int, float)) else inherited_at
        yield clean(node['text']), float(at)
    if isinstance(node.get('caption'), str) and clean(node.get('caption')):
        title = node.get('title')
        at = inherited_at
        if isinstance(title, list) and title and isinstance(title[0].get('at'), (int, float)):
            at = float(title[0]['at'])
        elif isinstance(title, dict) and isinstance(title.get('at'), (int, float)):
            at = float(title['at'])
        yield clean(node['caption']), at
    card = node.get('card')
    if isinstance(card, dict):
        at = float(card['at']) if isinstance(card.get('at'), (int, float)) else inherited_at
        for key in ('lead', 'big', 'node'):
            if isinstance(card.get(key), str) and clean(card.get(key)):
                yield clean(card[key]), at
    for key, value in node.items():
        if key == 'card':
            continue
        if isinstance(value, (dict, list)):
            yield from iter_timed_texts(value, inherited_at)


def reserve_node(node, start, end, reserved):
    seen = set()
    for text, _at in iter_timed_texts(node):
        if text in seen:
            continue
        seen.add(text)
        reserved.append((text, start, end))


def available_texts(phrases, start, end, reserved, until):
    found = []
    for text in texts_between(phrases, start, end):
        text = clean(text)
        if not text:
            continue
        if any(text == prev and overlaps(a, b, start, until) for prev, a, b in reserved):
            continue
        if text not in found:
            found.append(text)
    return found


def _shot_index(shots, t):
    idx = 0
    for i, shot in enumerate(shots):
        if shot['at'] <= t + 1e-9:
            idx = i
        else:
            break
    return idx


def _overlay_on(scenes, t, morph):
    shots = scenes.get('shots') or []
    if not shots:
        return True
    idx = _shot_index(shots, t)
    if shots[idx]['shot'] not in ('PIP', 'END'):
        return True
    return t < shots[idx]['at'] + morph


def _page_on(scenes, t, morph):
    shots = scenes.get('shots') or []
    if not shots:
        return False
    idx = _shot_index(shots, t)
    if shots[idx]['shot'] in ('PIP', 'END'):
        return True
    if idx > 0 and shots[idx - 1]['shot'] in ('PIP', 'END') and t < shots[idx]['at'] + morph:
        return True
    return False


def _graphics_at(scenes, t, morph):
    texts = []
    for chapter in scenes.get('chapters') or []:
        title = clean(chapter.get('title'))
        if title and chapter.get('at', 0) <= t + 1e-9:
            texts.append(title)
    if _overlay_on(scenes, t, morph):
        for overlay in scenes.get('overlays') or []:
            if t < overlay['start'] - 0.06 or t > overlay['end'] + 1e-9:
                continue
            for text, at in iter_timed_texts(overlay):
                if t + 1e-9 >= at - 0.06:
                    texts.append(text)
    if _page_on(scenes, t, morph):
        pages = [page for page in scenes.get('pages') or [] if page['start'] <= t + 1e-9]
        if pages:
            for text, at in iter_timed_texts(pages[-1]):
                if t + 1e-9 >= at - 0.06:
                    texts.append(text)
    return texts


def duplicate_frames(scenes, phrases, fps=30, t1=None):
    """Frames where one sentence is on screen more than once.

    The subtitle may match a single graphic. It is not counted here, so that
    one overlap stays allowed. Any other repeat fails.
    """
    _lead, _hold, morph = clock()
    total = scenes.get('duration') or 0
    if t1 is not None:
        total = min(total, t1) if total else t1
    frames = int(round(max(0, total) * fps))
    hits = []
    for index in range(frames):
        t = index / fps
        counts = {}
        for text in _graphics_at(scenes, t, morph):
            counts[text] = counts.get(text, 0) + 1
        repeated = sorted(text for text, count in counts.items() if count > 1)
        if repeated:
            hits.append((round(t, 3), repeated))
            if len(hits) >= 30:
                break
    return hits


def _visible_until(beat, beats, morph, total):
    if beat['shot'] in ('PIP', 'END'):
        later = [row for row in beats if row['start'] > beat['start'] + 1e-6 and not row.get('drop')]
        if not later:
            return total
        nxt = later[0]
        if nxt['shot'] in ('PIP', 'END'):
            return nxt['start']
        return min(total, nxt['start'] + morph)
    return beat['span_end']


def _blocked(reserved, start, until):
    return {text for text, a, b in reserved if overlaps(a, b, start, until)}


def draft(phrases, total):
    beats = []
    wide_sec = push_sec = 0.0
    last_pip = -99.0
    last_push = -99.0
    pip_count = 0
    side = 'WIDE_L'

    def add_beat(start, end, shot, kind, page_kind, count):
        span_start, span_end = overlay_span(start, end)
        beats.append({
            'start': round(start, 3),
            'end': round(end, 3),
            'shot': shot,
            'kind': kind,
            'page_kind': page_kind,
            'pip_count': count,
            'span_start': span_start,
            'span_end': span_end,
        })

    for start, end, shot, kind in OPENING:
        if start >= total - 0.15:
            break
        end = min(end, total)
        add_beat(start, end, shot, kind, 'page_example' if shot == 'PIP' else '', pip_count)
        if shot == 'PIP':
            pip_count += 1
            last_pip = start
        elif shot == 'PUSH':
            push_sec += end - start
            last_push = start
        else:
            wide_sec += end - start
        if shot.startswith('WIDE'):
            side = 'WIDE_R' if shot == 'WIDE_L' else 'WIDE_L'

    cursor = 20.2
    rotate_at = 0
    while cursor < total - 3.4:
        if beats and abs(beats[-1]['start'] - cursor) < 0.05:
            cursor = round(cursor + 0.1, 3)
            continue
        phrase = phrase_at(phrases, cursor + 0.2)
        text = clean(phrase.get('text'))
        kind, shot, step = choose_later(text, cursor, last_pip, last_push, push_sec, wide_sec, total, rotate_at)
        step = min(step, total - cursor)
        if step < 0.8:
            break
        if shot == 'WIDE':
            side = 'WIDE_R' if side == 'WIDE_L' else 'WIDE_L'
            shot = side
            rotate_at += 1
            wide_sec += step
        elif shot == 'PUSH':
            push_sec += step
            last_push = cursor
        else:
            last_pip = cursor
        end = cursor + step
        add_beat(cursor, end, shot, kind if shot != 'PIP' else 'page', 'page' if shot == 'PIP' else '', pip_count)
        if shot == 'PIP':
            pip_count += 1
        cursor = round(end, 3)

    if total > 8 and beats and beats[-1]['shot'] != 'END' and total - beats[-1]['start'] > 1.2:
        end_at = round(max(beats[-1]['start'] + 0.8, min(total - 0.4, max(beats[-1]['start'] + 0.8, total - 3.2))), 3)
        if end_at > beats[-1]['start'] + 0.2 and end_at < total:
            for beat in beats:
                if beat['start'] >= end_at:
                    beat['drop'] = True
                elif beat['shot'] not in ('PIP', 'END') and beat['span_end'] > end_at:
                    beat['span_end'] = round(end_at - 0.02, 3)
                elif beat['shot'] in ('PIP', 'END') and beat['end'] > end_at:
                    beat['end'] = round(end_at - 0.02, 3)
                    beat['span_end'] = beat['end']
            beats = [beat for beat in beats if not beat.get('drop') and beat['start'] < end_at - 0.05 and beat['end'] > beat['start']]
            beats.append({
                'start': end_at,
                'end': round(total, 3),
                'shot': 'END',
                'kind': 'neon_end',
                'page_kind': 'neon_end',
                'pip_count': pip_count,
                'span_start': end_at,
                'span_end': round(total, 3),
            })

    _lead, hold, morph = clock()
    title_end = 0.0
    for beat in beats:
        if beat['kind'] == 'title_card':
            title_end = beat['span_end']
    first = clean(phrases[0].get('text')) if phrases else ''
    bar_at = 0.0
    if phrases and first:
        bar_at = phrases[0]['e'] + hold + 0.02
        if title_end:
            bar_at = max(bar_at, title_end + 0.02)
        bar_at = round(bar_at, 3)
    chapters = [{'title': '', 'at': 0}]
    reserved = []
    if first and 0 < bar_at < total - 0.05:
        chapters.append({'title': first, 'at': bar_at})
        reserved.append((first, bar_at, total))

    overlays, pages = [], []
    for beat in beats:
        until = _visible_until(beat, beats, morph, total)
        if beat['shot'] == 'END':
            texts = available_texts(phrases, beat['start'], beat['end'], reserved, total)
            layer = neon_end(texts, beat['start'], beat['end'])
            page = {'start': beat['start'], 'end': beat['end'], 'bg': 'dark_end', 'layers': [layer]}
            reserve_node(page, beat['start'], total, reserved)
            pages.append(page)
            continue
        if beat['shot'] == 'PIP':
            texts = available_texts(phrases, beat['start'], beat['end'], reserved, until)
            page = page_for(beat['page_kind'], texts, beat['span_start'], beat['end'], beat['pip_count'])
            reserve_node(page, beat['span_start'], until, reserved)
            pages.append(page)
            continue
        texts = available_texts(phrases, beat['start'], beat['end'], reserved, beat['span_end'])
        overlay = build_overlay(beat['kind'], texts, beat['span_start'], beat['span_end'], phrases, _blocked(reserved, beat['start'], beat['span_end']))
        reserve_node(overlay, beat['span_start'], beat['span_end'], reserved)
        overlays.append(overlay)

    shots = [{'at': beat['start'], 'shot': beat['shot']} for beat in beats]
    scenes = {
        'chapters': chapters,
        'shots': shots,
        'overlays': overlays,
        'pages': pages,
        'duration': round(total, 3),
        'end_fade': True,
    }
    repeated = duplicate_frames(scenes, phrases)
    if repeated:
        raise ValueError('同一画面里有重复的句子: %s' % repeated[:8])
    stills = {
        'wide': round(min(4.05, max(0.4, total - 0.2)), 3),
        'push': round(min(9.85, max(0.8, total - 0.2)), 3),
        'pip': round(min(12.35, max(1.2, total - 0.2)), 3),
    }
    return scenes, stills


def main(wd):
    phrases = json.load(open(os.path.join(wd, 'phrases.json')))
    if not phrases:
        raise SystemExit('没有字幕意群，不能起草分镜')
    keep = json.load(open(os.path.join(wd, 'cutlist.json')))['keep']
    total = sum(b - a for a, b in keep)
    scenes, stills = draft(phrases, total)
    json.dump(scenes, open(os.path.join(wd, 'scenes.json'), 'w'), ensure_ascii=False, indent=1)
    json.dump(stills, open(os.path.join(wd, 'preview_beats.json'), 'w'), ensure_ascii=False, indent=1)
    names = [row['template'] for row in scenes['overlays'] if row['start'] < 20]
    pages = [row['layers'][0]['template'] for row in scenes['pages'] if row['start'] < 20]
    print('opening', ' '.join(names + pages), 'stills', stills)


if __name__ == '__main__':
    main(sys.argv[1])
