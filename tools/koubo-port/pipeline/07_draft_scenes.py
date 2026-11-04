"""Draft a generic scene list from subtitle phrases.

Phrases that belong to one idea share a template. Title, big text, label,
capsule and card all come from that idea. A template that would only have a
scrap of text (a card of a few characters, an empty page) falls back to a
simpler template. Nothing here is written for one script.

Each field on one template takes a different phrase. A field with nothing
left stays empty. The same phrase may also sit in the subtitle, but it is
not copied into a second graphic at the same time.

Later stretches keep every fitting template in the catalog moving. A shot
does not sit still for more than 3 seconds. Shot zoom values stay in style.json.

usage: python 07_draft_scenes.py workdir/
reads phrases.json ; writes scenes.json and preview_beats.json
"""
import json, os, re, sys

PAGE_KINDS = ('page_example', 'scattered_capsules', 'doc_stack', 'card_carousel', 'editor_mock')
PRIORITY = (
    'error_stack', 'doc_stack', 'headline_badges', 'card_carousel', 'editor_mock',
    'page_example', 'scattered_capsules', 'contrast_arrow', 'flow_pills',
    'side_panel', 'headline_pill', 'blur_lines', 'pill_lines',
)
RICH_WHOLE = {
    'error_stack', 'doc_stack', 'card_carousel', 'editor_mock', 'page_example',
    'scattered_capsules', 'headline_badges', 'contrast_arrow', 'flow_pills',
    'side_panel', 'title_card', 'neon_end',
}
MAX_SHOT = 3.0


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
    """Phrases that overlap a beat. Kept for callers that still ask by time.
    Drafting itself pairs by idea, not by this window."""
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
    if not found and phrases:
        text = clean(phrase_at(phrases, start).get('text'))
        found = [text or phrases[0].get('text') or ' ']
    return found


def line_size(text, base=118):
    count = max(1, len(text))
    fitted = int(900 * 776 / 1080 / count)
    return max(32, min(base, fitted))


def is_question(text):
    return any(mark in text for mark in ('？', '?', '吗', '呢', '有没有', '是不是', '能不能', '哪里', '什么', '怎么', '为何', '为什么'))


def is_contrast(text):
    return '从' in text and '到' in text and text.find('从') < text.find('到')


def contrast_open(text):
    if '从' not in text:
        return False
    return '到' not in text[text.find('从') + 1:]


def example_intro(text):
    return len(text) <= 16 and bool(re.search(r'(举个例子|比如说|例如|比如|比方|例子)', text))


def definition_follow(text):
    return text.startswith(('也就是', '就是说', '意思是', '亦即'))


def error_head(text):
    return any(mark in text for mark in ('误区', '风险', '容易错'))


def step_intro(text):
    return any(mark in text for mark in ('步骤', '流程', '接起来', '串起来'))


def list_intro(text):
    return bool(re.search(r'(三件|三点|三步|几件|几个方面|两件|两步)', text))


def list_item(text):
    return bool(re.match(r'^(第[一二三四五六七八九十]+|首先|其次|最后)', text.replace(' ', '')))


def tool_intro(text):
    return any(mark in text for mark in ('工具', '工作台', '产品', '软件')) and any(mark in text for mark in ('说', '讲', '用', '做'))


def tool_step(text):
    return any(mark in text for mark in ('导入', '整理', '安排', '标出', '调整', '导出', '剪辑', '字幕', '画面'))


def new_topic(text):
    return (
        text.startswith(('所以', '因此', '另外', '接下来'))
        or example_intro(text) or list_intro(text) or list_item(text)
        or tool_intro(text) or step_intro(text) or error_head(text)
        or contrast_open(text) or is_contrast(text) or is_question(text)
    )


def same_idea(group, nxt):
    gap = nxt['s'] - group[-1]['e']
    if gap > 0.9:
        return False
    prev = clean(group[-1].get('text'))
    text = clean(nxt.get('text'))
    if example_intro(prev) and len(group) == 1 and gap < 0.85:
        return True
    if any(example_intro(clean(p.get('text'))) for p in group) and gap < 0.2 and len(group) < 4:
        return True
    if definition_follow(text) and gap < 0.85 and len(group) < 3:
        return True
    if contrast_open(prev) and not is_contrast(prev) and len(group) == 1 and gap < 0.85:
        return True
    if error_head(clean(group[0].get('text'))) and len(group) < 8 and gap < 0.75 and not new_topic(text):
        return True
    if any(step_intro(clean(p.get('text'))) for p in group) and len(group) < 6 and gap < 0.7 and not new_topic(text):
        return True
    if any(list_intro(clean(p.get('text'))) for p in group) and list_item(text) and len(group) < 6 and gap < 0.85:
        return True
    if any(tool_intro(clean(p.get('text'))) for p in group) and len(group) < 8 and gap < 0.75 and not new_topic(text):
        return True
    return False


def group_ideas(phrases):
    ideas = []
    current = []
    for phrase in phrases:
        if current and not same_idea(current, phrase):
            ideas.append(current)
            current = []
        current.append(phrase)
    if current:
        ideas.append(current)
    return ideas


def at(start, end, offset):
    return round(min(start + offset, max(start + 0.05, end - 0.2)), 3)


def timed(text, start, end, offset):
    return {'text': text, 'at': at(start, end, offset)}


def overlay_span(start, end):
    return round(start, 3), round(max(start + 0.4, end - 0.02), 3)


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


def title_card(texts, start, end):
    title = texts[0] if texts else ' '
    spec = {
        'template': 'title_card',
        'start': start,
        'end': end,
        'title': {'text': title, 'at': at(start, end, 0.12)},
        'arrows': {'at': at(start, end, 1.4), 'x': 0.62, 'y': 0.28, 'point': 'right'},
    }
    if len(texts) > 1 and texts[1] != title:
        spec['glass'] = {'text': texts[1], 'at': at(start, end, 0.7)}
    return spec


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
    blocked = set(blocked)
    sentence = next((text for text in texts if is_contrast(text)), '')
    if sentence:
        left, right = [clean(part) for part in sentence.split('到', 1)]
        if (len(left) >= 2 and len(right) >= 2 and left != right and left != sentence and right != sentence
                and left not in blocked and right not in blocked):
            return {
                'template': 'contrast_arrow',
                'start': start,
                'end': end,
                'from': timed(left, start, end, 0.16),
                'to': timed(right, start, end, 0.7),
            }
    if len(texts) >= 2 and contrast_open(texts[0]) and texts[0] not in blocked and texts[1] not in blocked and texts[0] != texts[1]:
        return {
            'template': 'contrast_arrow',
            'start': start,
            'end': end,
            'from': timed(texts[0], start, end, 0.16),
            'to': timed(texts[1], start, end, 0.7),
        }
    return headline_pill(texts, start, end)


def headline_badges(texts, start, end):
    points = [text for text in texts if list_item(text)]
    headline = next((text for text in texts if list_intro(text)), '')
    if not headline:
        headline = next((text for text in texts if text not in points), '')
    spec = {
        'template': 'headline_badges',
        'start': start,
        'end': end,
        'badges': {'n': min(3, max(2, len(points) or 2)), 'at': at(start, end, 0.45)},
    }
    if headline:
        spec['headline'] = timed(headline, start, end, 0.2)
    return spec


def error_stack(texts, start, end):
    body = [text for text in texts if text]
    if len(body) < 3:
        return pill_lines(texts, start, end)
    verdict = body[-1]
    items = body[:-1][:4]
    return {
        'template': 'error_stack',
        'start': start,
        'end': end,
        'items': [{'text': text, 'at': at(start, end, 0.12 + index * 0.32)} for index, text in enumerate(items)],
        'verdict': timed(verdict, start, end, 0.2 + 0.32 * len(items)),
    }


def page_example(texts, start, end):
    take = consume(texts)
    title = take()
    big = take()
    cap = take()
    if big and len(big) < 4:
        big = None
    if not title or not big:
        return None
    spec = {
        'template': 'page_example',
        'start': start,
        'end': end,
        'title': [timed(title, start, end, 0.16)],
        'card': {'big': big, 'at': at(start, end, 0.4)},
    }
    if cap and cap not in (title, big) and len(cap) >= 4:
        spec['capsule'] = timed(cap, start, end, 0.9)
    return spec


def scattered(texts, start, end):
    body = [text for text in texts if not step_intro(text) and not tool_intro(text)] or list(texts)
    body = [text for text in body if len(text) >= 2][:4]
    if len(body) < 3:
        return None
    return {
        'template': 'scattered_capsules',
        'start': start,
        'end': end,
        'items': [{'text': text, 'at': at(start, end, 0.2 + index * 0.28)} for index, text in enumerate(body)],
    }


def doc_stack(texts, start, end):
    intro = texts[0] if texts and step_intro(texts[0]) else ''
    body = [text for text in texts if text != intro]
    if len(body) < 2:
        return None
    spec = {
        'template': 'doc_stack',
        'start': start,
        'end': end,
        'items': [{'text': text, 'at': at(start, end, 0.35 + index * 0.38)} for index, text in enumerate(body[:5])],
        'slots_at': at(start, end, 0.16),
    }
    if intro:
        spec['header'] = [timed(intro, start, end, 0.08)]
    return spec


def card_carousel(texts, start, end):
    points = [text for text in texts if list_item(text)]
    if len(points) < 2:
        return None
    cards = []
    for index, text in enumerate(points[:4]):
        plain = text.replace(' ', '')
        mark = re.match(r'^(第[一二三四五六七八九十]+|首先|其次|最后)', plain)
        tag = mark.group(1) if mark else plain[:2]
        rest = plain[len(tag):] or plain
        if len(rest) < 2:
            rest = plain
        cards.append({'tag': tag, 'at': at(start, end, 0.16 + index * 0.4), 'lines': [{'text': rest}]})
    spec = {'template': 'card_carousel', 'start': start, 'end': end, 'cards': cards}
    header = next((text for text in texts if list_intro(text)), '')
    if header and header not in points:
        spec['header'] = header
    return spec


def editor_mock(texts, start, end):
    title = next((text for text in texts if tool_intro(text)), '')
    steps = [text for text in texts if tool_step(text) and text != title]
    if len(steps) < 2:
        return None
    spec = {
        'template': 'editor_mock',
        'start': start,
        'end': end,
        'checklist': [{'text': text, 'at': at(start, end, 0.28 + index * 0.32)} for index, text in enumerate(steps[:4])],
    }
    if title:
        spec['title'] = title
    return spec


def neon_end(texts, start, end):
    take = consume(texts)
    spec = {'template': 'neon_end', 'start': start, 'end': end}
    word, line = take(), take()
    if word:
        spec['word'] = timed(word, start, end, 0.2)
    if line and line != word:
        spec['line'] = timed(line, start, end, 0.55)
    return spec


def rich(name, idea):
    texts = [clean(p.get('text')) for p in idea if clean(p.get('text'))]
    count = len(texts)
    if name == 'page_example':
        return count >= 2 and example_intro(texts[0]) and len(texts[1]) >= 4
    if name == 'error_stack':
        return count >= 3 and any(error_head(text) for text in texts)
    if name == 'doc_stack':
        return count >= 3 and any(step_intro(text) for text in texts)
    if name == 'scattered_capsules':
        return count >= 3 and (any(step_intro(text) for text in texts) or any(tool_intro(text) for text in texts))
    if name == 'card_carousel':
        return sum(1 for text in texts if list_item(text)) >= 2
    if name == 'headline_badges':
        return any(list_intro(text) for text in texts) or sum(1 for text in texts if list_item(text)) >= 2
    if name == 'editor_mock':
        return any(tool_intro(text) for text in texts) and sum(1 for text in texts if tool_step(text)) >= 2
    if name == 'contrast_arrow':
        return any(is_contrast(text) for text in texts) or (count >= 2 and contrast_open(texts[0]))
    if name == 'flow_pills':
        return count >= 2 and any(is_contrast(text) or contrast_open(text) or step_intro(text) for text in texts)
    if name == 'side_panel':
        return count >= 2 or any(definition_follow(text) for text in texts)
    if name == 'headline_pill':
        return any(is_question(text) for text in texts)
    if name in ('blur_lines', 'pill_lines', 'title_card', 'neon_end'):
        return count >= 1
    return False


def pick_template(idea, index, used):
    fits = [name for name in PRIORITY if rich(name, idea)]
    unused = [name for name in fits if name not in used]
    if index == 0:
        if unused:
            return unused[0]
        return fits[0] if fits else 'pill_lines'
    if unused:
        return unused[0]
    simples = [name for name in ('blur_lines', 'pill_lines', 'headline_pill', 'side_panel') if rich(name, idea) or name in ('blur_lines', 'pill_lines')]
    return simples[index % len(simples)]


def _can_pip(wide_sec, total, cursor, step):
    if total <= 0:
        return True
    rest = max(0.0, total - (cursor + step))
    return wide_sec + rest >= 0.60 * total - 0.25


def _want_push(text, cursor, push_sec, last_push, wide_sec, total, step):
    if not text or len(text) < 2 or len(text) > 14:
        return False
    if cursor - last_push < 11:
        return False
    push_step = min(step, 2.2)
    if push_sec + push_step > 0.15 * total + 0.05:
        return False
    rest = max(0.0, total - (cursor + push_step))
    return wide_sec + rest >= 0.60 * total - 0.25


def choose_presentation(kind, idea, room, cursor, wide_sec, push_sec, last_push, side, total):
    step = min(MAX_SHOT, room)
    if kind == 'title_card':
        return kind, 'WIDE_C', step
    if kind in PAGE_KINDS:
        if _can_pip(wide_sec, total, cursor, step):
            return kind, 'PIP', step
        kind = 'pill_lines'
    current = clean(phrase_at(idea, cursor + 0.05).get('text')) if idea else ''
    if kind in ('pill_lines', 'blur_lines', 'headline_pill', 'side_panel') and _want_push(current, cursor, push_sec, last_push, wide_sec, total, step):
        return kind, 'PUSH', min(step, 2.2)
    return kind, ('WIDE_R' if side == 'WIDE_L' else 'WIDE_L'), step


def realize(kind, texts, start, end, blocked):
    if kind == 'title_card':
        return 'overlay', title_card(texts, start, end)
    if kind == 'side_panel':
        return 'overlay', side_panel(texts, start, end)
    if kind == 'headline_pill':
        return 'overlay', headline_pill(texts, start, end)
    if kind == 'pill_lines':
        return 'overlay', pill_lines(texts, start, end)
    if kind == 'blur_lines':
        return 'overlay', blur_lines(texts, start, end)
    if kind == 'flow_pills':
        spec = flow_pills(texts, start, end)
        filled = sum(1 for key in ('a', 'b', 'bottom') if spec.get(key))
        if filled >= 2:
            return 'overlay', spec
        return 'overlay', headline_pill(texts, start, end)
    if kind == 'contrast_arrow':
        return 'overlay', contrast_arrow(texts, start, end, blocked)
    if kind == 'headline_badges':
        return 'overlay', headline_badges(texts, start, end)
    if kind == 'error_stack':
        return 'overlay', error_stack(texts, start, end)
    if kind == 'page_example':
        layer = page_example(texts, start, end)
        if layer:
            return 'page', layer
        return 'overlay', headline_pill(texts, start, end)
    if kind == 'scattered_capsules':
        layer = scattered(texts, start, end)
        if layer:
            return 'page', layer
        return 'overlay', pill_lines(texts, start, end)
    if kind == 'doc_stack':
        layer = doc_stack(texts, start, end)
        if layer:
            return 'page', layer
        return 'overlay', flow_pills(texts, start, end)
    if kind == 'card_carousel':
        layer = card_carousel(texts, start, end)
        if layer:
            return 'page', layer
        return 'overlay', headline_badges(texts, start, end)
    if kind == 'editor_mock':
        layer = editor_mock(texts, start, end)
        if layer:
            return 'page', layer
        return 'overlay', side_panel(texts, start, end)
    if kind == 'neon_end':
        return 'page', neon_end(texts, start, end)
    return 'overlay', pill_lines(texts, start, end)


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
        at_time = node['at'] if isinstance(node.get('at'), (int, float)) else inherited_at
        yield clean(node['text']), float(at_time)
    for key in ('header', 'title'):
        if isinstance(node.get(key), str) and clean(node.get(key)):
            yield clean(node[key]), inherited_at
    if isinstance(node.get('caption'), str) and clean(node.get('caption')):
        title = node.get('title')
        at_time = inherited_at
        if isinstance(title, list) and title and isinstance(title[0].get('at'), (int, float)):
            at_time = float(title[0]['at'])
        elif isinstance(title, dict) and isinstance(title.get('at'), (int, float)):
            at_time = float(title['at'])
        yield clean(node['caption']), at_time
    card = node.get('card')
    if isinstance(card, dict):
        at_time = float(card['at']) if isinstance(card.get('at'), (int, float)) else inherited_at
        for key in ('lead', 'big', 'node'):
            if isinstance(card.get(key), str) and clean(card.get(key)):
                yield clean(card[key]), at_time
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
            for text, at_time in iter_timed_texts(overlay):
                if t + 1e-9 >= at_time - 0.06:
                    texts.append(text)
    if _page_on(scenes, t, morph):
        pages = [page for page in scenes.get('pages') or [] if page['start'] <= t + 1e-9]
        if pages:
            for text, at_time in iter_timed_texts(pages[-1]):
                if t + 1e-9 >= at_time - 0.06:
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
        later = [row for row in beats if row['start'] > beat['start'] + 1e-6]
        if not later:
            return total
        nxt = later[0]
        if nxt['shot'] in ('PIP', 'END'):
            return nxt['start']
        return min(total, nxt['start'] + morph)
    return beat['span_end']


def _blocked(reserved, start, until):
    return {text for text, a, b in reserved if overlaps(a, b, start, until)}


SIMPLE_KINDS = ('blur_lines', 'pill_lines', 'headline_pill', 'side_panel')
STRUCTURAL_KINDS = ('title_card', 'neon_end')


def _holds(kind, texts):
    """The template can be drawn from these phrases without an empty field."""
    if not texts:
        return False
    _role, spec = realize(kind, texts, 0.0, 1.0, ())
    if spec.get('template') != kind:
        return False
    if kind == 'flow_pills' and sum(1 for key in ('a', 'b', 'bottom') if spec.get(key)) < 2:
        return False
    if kind == 'page_example' and len((spec.get('card') or {}).get('big') or '') < 4:
        return False
    return any(True for _text, _at in iter_timed_texts(spec))


def _simple_kind(texts):
    if any(is_question(text) for text in texts):
        return 'headline_pill'
    if len(texts) >= 2:
        return 'side_panel'
    return 'blur_lines'


def _free_texts(texts, start, until, reserved):
    found = []
    for text in texts:
        text = clean(text)
        if not text or text in found:
            continue
        if any(text == prev and overlaps(a, b, start, until) for prev, a, b in reserved):
            continue
        found.append(text)
    return found


def _beat(start, end, shot, kind):
    span_start, span_end = overlay_span(start, end)
    return {
        'start': round(start, 3),
        'end': round(end, 3),
        'shot': shot,
        'kind': kind,
        'span_start': span_start,
        'span_end': span_end,
    }


def _close_with_end(beats, total):
    if total < 6 or not beats:
        return beats
    end_at = round(min(total - 0.8, max(beats[0]['start'] + 1.0, total - MAX_SHOT)), 3)
    if end_at >= total - 0.3:
        return beats
    kept = []
    for beat in beats:
        if beat['start'] >= end_at - 0.05:
            continue
        if beat['end'] > end_at:
            beat = dict(beat)
            beat['end'] = round(end_at, 3)
            beat['span_start'], beat['span_end'] = overlay_span(beat['start'], beat['end'])
        if beat['end'] > beat['start'] + 0.05 and (beat['end'] <= end_at + 0.02 or beat['end'] - beat['start'] >= 0.3):
            kept.append(beat)
    if not kept:
        kept = [beats[0]]
    ending = _beat(end_at, total, 'END', 'neon_end')
    ending['idea'] = kept[-1].get('idea', 0)
    kept.append(ending)
    return kept


def _page_bg(template):
    return {
        'doc_stack': 'dark_glow',
        'card_carousel': 'grey',
        'scattered_capsules': 'grey',
        'neon_end': 'dark_end',
    }.get(template, 'offwhite')


def draft(phrases, total):
    ideas = group_ideas(phrases)
    spans = []
    for index, idea in enumerate(ideas):
        start = max(0.0, idea[0]['s'] - 0.04)
        nxt = ideas[index + 1][0]['s'] - 0.04 if index + 1 < len(ideas) else total
        end = min(total, max(nxt, idea[-1]['e'] + 0.12))
        if end < start + 0.3:
            end = min(total, start + 0.3)
        spans.append((start, end, idea))
    if spans:
        start, end, idea = spans[0]
        spans[0] = (0.0, max(end, 0.4), idea)

    beats = []
    used = set()
    cursor = 0.0
    wide_sec = push_sec = 0.0
    last_push = -99.0
    side = 'WIDE_L'
    seen = {}
    guard = 0
    while cursor < total - 0.12 and guard < 500:
        guard += 1
        idea_i = None
        span_end = total
        for index, (start, end, _idea) in enumerate(spans):
            if start - 0.02 <= cursor < end - 0.02:
                idea_i = index
                span_end = end
                break
        inside = idea_i is not None
        if idea_i is None:
            future = [index for index, (start, _end, _idea) in enumerate(spans) if start > cursor + 0.02]
            if future:
                idea_i = max(0, future[0] - 1)
                span_end = spans[future[0]][0]
            elif spans:
                idea_i = len(spans) - 1
                span_end = total
            else:
                break
        idea = spans[idea_i][2]
        room = min(MAX_SHOT, max(0.0, span_end - cursor), total - cursor)
        if room < 0.08:
            if beats and room > 0:
                beats[-1]['end'] = round(min(total, beats[-1]['end'] + room), 3)
                beats[-1]['span_start'], beats[-1]['span_end'] = overlay_span(beats[-1]['start'], beats[-1]['end'])
            cursor = round(min(total, span_end if span_end > cursor + 0.01 else cursor + 0.08), 3)
            continue
        if inside:
            index = seen.get(idea_i, 0)
            kind = 'title_card' if idea_i == 0 and index == 0 else pick_template(idea, index, used)
            seen[idea_i] = index + 1
        else:
            kind = 'blur_lines' if int(cursor * 2) % 2 == 0 else 'pill_lines'
        kind, shot, step = choose_presentation(kind, idea, room, cursor, wide_sec, push_sec, last_push, side, total)
        step = min(step, room, total - cursor)
        if step < 0.08:
            cursor = round(min(total, cursor + max(room, 0.08)), 3)
            continue
        start = round(cursor, 3)
        end = round(min(total, cursor + step), 3)
        if end <= start + 0.05:
            cursor = round(min(total, start + 0.08), 3)
            continue
        beats.append(_beat(start, end, shot, kind))
        beats[-1]['idea'] = idea_i
        used.add(kind)
        dur = end - start
        if shot == 'PUSH':
            push_sec += dur
            last_push = start
        elif shot not in ('PIP', 'END'):
            wide_sec += dur
            if shot.startswith('WIDE') and shot != 'WIDE_C':
                side = shot
        cursor = end

    beats = _close_with_end(beats, total)
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
        bar_at = round(min(total - 0.05, bar_at), 3)
    chapters = [{'title': '', 'at': 0}]
    reserved = []
    if first and 0 < bar_at < total - 0.05:
        chapters.append({'title': first, 'at': bar_at})
        reserved.append((first, bar_at, total))

    overlays, pages = [], []
    built = []
    missed = []
    for beat in beats:
        until = _visible_until(beat, beats, morph, total)
        idea = spans[beat['idea']][2] if beat.get('idea') is not None and beat['idea'] < len(spans) else phrases
        whole = [clean(p.get('text')) for p in idea]
        overlap = [clean(p.get('text')) for p in idea if p['e'] > beat['start'] - 0.05 and p['s'] < beat['end'] + 0.15]

        def pool_for(name, whole=whole, overlap=overlap):
            return whole if name in RICH_WHOLE else overlap

        def ready(name):
            return _holds(name, _free_texts(pool_for(name), beat['start'], until, reserved))

        kind = beat['kind']
        if kind not in STRUCTURAL_KINDS and not ready(kind):
            if kind not in SIMPLE_KINDS and kind not in missed:
                missed.append(kind)
            replacement = None
            for name in missed:
                if name in PAGE_KINDS and beat['shot'] not in ('PIP', 'END'):
                    continue
                if rich(name, idea) and ready(name):
                    replacement = name
                    break
            if replacement:
                missed.remove(replacement)
                kind = replacement
            else:
                free_now = _free_texts(overlap, beat['start'], until, reserved)
                kind = _simple_kind(free_now) if free_now else kind
        elif kind in SIMPLE_KINDS and missed:
            for name in list(missed):
                if name in PAGE_KINDS and beat['shot'] not in ('PIP', 'END'):
                    continue
                if rich(name, idea) and ready(name):
                    missed.remove(name)
                    kind = name
                    break
        texts = _free_texts(pool_for(kind), beat['start'], until, reserved)
        role, spec = realize(kind, texts, beat['span_start'], beat['span_end'] if role_expects_overlay(beat) else beat['end'], _blocked(reserved, beat['start'], until))
        if not any(True for _text, _at in iter_timed_texts(spec)):
            built.append(beat)
            continue
        # realize's start/end: pages should cover the shot, overlays the span
        if role == 'page':
            spec['start'] = beat['start']
            spec['end'] = beat['end']
            if beat['shot'] not in ('PIP', 'END'):
                beat = dict(beat)
                beat['shot'] = 'END' if spec['template'] == 'neon_end' else 'PIP'
            page = {'start': beat['start'], 'end': beat['end'], 'bg': _page_bg(spec['template']), 'layers': [spec]}
            reserve_node(page, beat['start'], until, reserved)
            pages.append(page)
            built.append(beat)
            continue
        if beat['shot'] in ('PIP', 'END') and spec['template'] not in ('neon_end',):
            beat = dict(beat)
            beat['shot'] = 'WIDE_L' if int(beat['start']) % 2 == 0 else 'WIDE_R'
        spec['start'], spec['end'] = beat['span_start'], beat['span_end']
        reserve_node(spec, beat['span_start'], beat['span_end'], reserved)
        overlays.append(spec)
        built.append(beat)

    shots = [{'at': beat['start'], 'shot': beat['shot']} for beat in built]
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
        'wide': _still_at(built, lambda shot: shot.startswith('WIDE'), 4.0, total),
        'push': _still_at(built, lambda shot: shot == 'PUSH', 9.0, total),
        'pip': _still_at(built, lambda shot: shot == 'PIP', 12.0, total),
    }
    return scenes, stills


def role_expects_overlay(beat):
    return beat['kind'] not in PAGE_KINDS and beat['kind'] != 'neon_end'


def _still_at(beats, pred, fallback, total):
    for beat in beats:
        if beat['start'] < min(20, total) and pred(beat['shot']):
            return round(min(max(0.2, beat['start'] + 0.35), max(0.4, min(19.5, total - 0.2))), 3)
    return round(min(fallback, max(0.4, min(19.5, total - 0.2))), 3)


def main(wd):
    phrases = json.load(open(os.path.join(wd, 'phrases.json')))
    if not phrases:
        raise SystemExit('没有字幕意群，不能起草分镜')
    keep = json.load(open(os.path.join(wd, 'cutlist.json')))['keep']
    total = sum(b - a for a, b in keep)
    scenes, stills = draft(phrases, total)
    json.dump(scenes, open(os.path.join(wd, 'scenes.json'), 'w'), ensure_ascii=False, indent=1)
    json.dump(stills, open(os.path.join(wd, 'preview_beats.json'), 'w'), ensure_ascii=False, indent=1)
    names = []
    for row in scenes['overlays']:
        names.append(row['template'])
    for row in scenes['pages']:
        names.append(row['layers'][0]['template'])
    print('templates', ' '.join(sorted(set(names))))
    print('opening', ' '.join(names), 'stills', stills)


if __name__ == '__main__':
    main(sys.argv[1])
