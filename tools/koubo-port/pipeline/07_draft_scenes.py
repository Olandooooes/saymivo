"""Draft a generic scene list from subtitle phrases.

Phrases that belong to one idea share a template. Title, big text, label,
capsule and card all come from that idea. A template that would only have a
scrap of text (a card of a few characters, an empty page) falls back to a
simpler template. Nothing here is written for one script.

Each field on one template takes a different phrase. A field with nothing
left stays empty. A sentence that is already a title, a big line or a card
is not also drawn as the subtitle. Every text layer, including the subtitle
and the chapter bar, counts in the per-frame check. A line is not placed
before that sentence is spoken.

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
    'title_card', 'neon_end',
}
MAX_SHOT = 3.0


def clean(text):
    return ' '.join(str(text or '').split())


def fold_text(text):
    """One sentence, ignoring spaces and punctuation, so a caption and a big line match."""
    return re.sub(r'[^0-9a-z\u4e00-\u9fff]+', '', clean(text).lower())


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
    # A misconception only keeps the enumerated items that follow it.
    # Other sentences stay on their own screens, in speech order.
    if error_head(clean(group[0].get('text'))) and list_item(text) and len(group) < 5 and gap < 0.85:
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


def _ordered(texts, limit=None):
    body = []
    for text in texts:
        text = clean(text)
        if text and text not in body:
            body.append(text)
    if limit is not None:
        return body[:limit]
    return body


def side_panel(texts, start, end):
    """Two lines of one unit, top to bottom in speech order. A longer pile is not a panel."""
    body = _ordered(texts)
    if len(body) != 2:
        return None
    return {
        'template': 'side_panel',
        'start': start,
        'end': end,
        'items': [
            {'text': body[0], 'at': at(start, end, 0.16), 'style': 'h1'},
            {'text': body[1], 'at': at(start, end, 0.52), 'style': 'muted'},
        ],
    }


def _pill_and_lines(kind, texts, start, end, size):
    body = _ordered(texts, 2)
    spec = {'template': kind, 'start': start, 'end': end, 'lines': []}
    if len(body) == 2:
        spec['pill'] = timed(body[0], start, end, 0.08)
        spec['lines'].append({'text': body[1], 'at': at(start, end, 0.28), 'size': line_size(body[1], size)})
        return spec
    if body:
        spec['lines'].append({'text': body[0], 'at': at(start, end, 0.28), 'size': line_size(body[0], size)})
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
    """One contrast, or the steps of one process, both halves on this same screen."""
    body = _ordered(texts)
    sentence = next((text for text in body if is_contrast(text)), '')
    spec = {'template': 'flow_pills', 'start': start, 'end': end}
    if sentence:
        left, right = [clean(part) for part in sentence.split('到', 1)]
        if len(left) >= 2 and len(right) >= 2 and left != right and left != sentence and right != sentence:
            spec['a'] = timed(left, start, end, 0.12)
            spec['b'] = timed(right, start, end, 0.42)
        return spec
    if len(body) >= 2 and (contrast_open(body[0]) or step_intro(body[0])):
        spec['a'] = timed(body[0], start, end, 0.12)
        spec['b'] = timed(body[1], start, end, 0.42)
        if len(body) >= 3 and step_intro(body[0]):
            spec['bottom'] = timed(body[2], start, end, 0.7)
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
    body = _ordered(texts)
    head = next((text for text in body if error_head(text)), '')
    items = [text for text in body if list_item(text)]
    if len(items) < 2:
        return headline_pill(body[:1], start, end)
    ordered = ([head] if head and head not in items else []) + items
    verdict = ordered[-1]
    rows = ordered[:-1][:4]
    return {
        'template': 'error_stack',
        'start': start,
        'end': end,
        'items': [{'text': text, 'at': at(start, end, 0.12 + index * 0.32)} for index, text in enumerate(rows)],
        'verdict': timed(verdict, start, end, 0.2 + 0.32 * len(rows)),
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
    """Adjacent points share one card, in speech order. One thin line is not a card page."""
    points = [text for text in _ordered(texts) if list_item(text)]
    lines = [{'text': text} for text in points if len(text) >= 2][:4]
    if len(lines) < 2 or sum(len(line['text']) for line in lines) < 8:
        return None
    spec = {
        'template': 'card_carousel',
        'start': start,
        'end': end,
        'cards': [{'tag': '', 'at': at(start, end, 0.2), 'lines': lines}],
    }
    header = next((text for text in _ordered(texts) if list_intro(text) and text not in points), '')
    if header:
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
        return any(error_head(text) for text in texts) and sum(1 for text in texts if list_item(text)) >= 2
    if name == 'doc_stack':
        return count >= 3 and any(step_intro(text) for text in texts)
    if name == 'scattered_capsules':
        return count >= 3 and (any(step_intro(text) for text in texts) or any(tool_intro(text) for text in texts))
    if name == 'card_carousel':
        # An error list belongs on the error stack, not on a criteria card.
        if any(error_head(text) for text in texts):
            return False
        points = [text for text in texts if list_item(text) and len(text) >= 2]
        return len(points) >= 2 and sum(len(text) for text in points) >= 8
    if name == 'headline_badges':
        if any(error_head(text) for text in texts) and not any(list_intro(text) for text in texts):
            return False
        return any(list_intro(text) for text in texts) or sum(1 for text in texts if list_item(text)) >= 2
    if name == 'editor_mock':
        return any(tool_intro(text) for text in texts) and sum(1 for text in texts if tool_step(text)) >= 2
    if name == 'contrast_arrow':
        return any(is_contrast(text) for text in texts) or (count >= 2 and contrast_open(texts[0]))
    if name == 'flow_pills':
        return count >= 2 and any(is_contrast(text) or contrast_open(text) or step_intro(text) for text in texts)
    if name == 'side_panel':
        return count == 2
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


def _end_hold(total):
    if total < 6:
        return 0.0
    end_at = min(total - 0.8, max(1.0, total - MAX_SHOT))
    if end_at >= total - 0.3:
        return 0.0
    return max(0.0, total - end_at)


def budget():
    """Shot-time defaults. Zooms stay in style.json; only the shares live here."""
    raw = _style().get('person', {}).get('budget') or {}
    return {
        'wide_min': float(raw.get('wide_min', 0.85)),
        'push_max': float(raw.get('push_max', 0.05)),
        'push_each': float(raw.get('push_each', 2.2)),
        'push_gap': float(raw.get('push_gap', 24)),
        'pip_each': float(raw.get('pip_each', 2.0)),
    }


def _nonwide_allowance(wide_sec, cursor, total):
    """Seconds of push/window still allowed without dropping the wide share."""
    if total <= 0:
        return MAX_SHOT
    end_future = _end_hold(total) if cursor < total - _end_hold(total) - 0.15 else 0.0
    return max(0.0, wide_sec - cursor + (1.0 - budget()['wide_min']) * total - end_future)


def _pip_step(wide_sec, push_sec, cursor, total, step):
    cfg = budget()
    allow = _nonwide_allowance(wide_sec, cursor, total)
    pip_step = min(step, cfg['pip_each'], allow)
    if pip_step < 1.15:
        return 0.0
    return pip_step


def _want_push(text, cursor, push_sec, last_push, wide_sec, total, step):
    cfg = budget()
    if not text or len(text) < 2 or len(text) > 14:
        return 0.0
    if cursor - last_push < cfg['push_gap']:
        return 0.0
    allow = _nonwide_allowance(wide_sec, cursor, total)
    pip_so_far = max(0.0, cursor - wide_sec - push_sec)
    reserve_pages = 1 if total < 70 else 2
    reserve = max(0.0, reserve_pages * cfg['pip_each'] - pip_so_far)
    push_step = min(step, cfg['push_each'], max(0.0, cfg['push_max'] * total - push_sec), max(0.0, allow - reserve))
    if push_step < 0.8:
        return 0.0
    return push_step


def _text_dense(idea, cursor):
    if not idea:
        return False
    around = [phrase for phrase in idea if phrase['e'] > cursor - 0.05 and phrase['s'] < cursor + 2.4]
    if len(around) >= 2:
        return True
    current = clean(phrase_at(idea, cursor + 0.05).get('text'))
    return len(current) > 18


def choose_presentation(kind, idea, room, cursor, wide_sec, push_sec, last_push, side, total):
    step = min(MAX_SHOT, room)
    wide = 'WIDE_R' if side == 'WIDE_L' else 'WIDE_L'
    if kind == 'title_card':
        return kind, 'WIDE_C', step
    if kind in PAGE_KINDS:
        pip_step = _pip_step(wide_sec, push_sec, cursor, total, step)
        if pip_step:
            return kind, 'PIP', pip_step
        # The wide share cannot spare a window. One line on the pulled-back shot.
        return 'headline_pill', wide, step
    current = clean(phrase_at(idea, cursor + 0.05).get('text')) if idea else ''
    # A text-heavy beat stays pulled back. Push is a short, rare accent on one thin line.
    if kind in ('pill_lines', 'blur_lines', 'headline_pill') and not _text_dense(idea, cursor):
        push_step = _want_push(current, cursor, push_sec, last_push, wide_sec, total, step)
        if push_step:
            return kind, 'PUSH', push_step
    return kind, wide, step


def realize(kind, texts, start, end, blocked):
    if kind == 'title_card':
        return 'overlay', title_card(texts, start, end)
    if kind == 'side_panel':
        spec = side_panel(texts, start, end)
        if spec:
            return 'overlay', spec
        return 'overlay', headline_pill(_ordered(texts, 1), start, end)
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


def _style():
    global _STYLE
    if _STYLE is None:
        _STYLE = json.load(open(os.path.join(os.path.dirname(__file__), '..', 'config', 'style.json')))
    return _STYLE


def clock():
    style = _style()
    sub = style['subtitle']
    person = style['person']
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


def stop_before_same_sentence(overlays, pages):
    """If holding a line until it is finished would run into the next card that says it again, stop."""
    nodes = [node for node in list(overlays) + list(pages) if isinstance(node, dict)]
    nodes.sort(key=lambda node: float(node.get('start') or 0))
    folded = []
    for node in nodes:
        folded.append({fold_text(text) for text, _at in iter_timed_texts(node) if fold_text(text)})
    for index, node in enumerate(nodes):
        end = float(node.get('end') or 0)
        own = folded[index]
        if not own:
            continue
        for later in range(index + 1, len(nodes)):
            start = float(nodes[later].get('start') or 0)
            if start >= end:
                break
            if own & folded[later]:
                node['end'] = round(max(float(node.get('start') or 0) + 0.12, start - 0.08), 3)
                break


def graphic_texts(scenes, t):
    """Every graphic string visible at t, including the chapter bar. Not the subtitle."""
    _lead, _hold, morph = clock()
    return [text for text in _graphics_at(scenes, t, morph) if fold_text(text)]


def subtitle_text(phrases, t):
    lead, hold, _morph = clock()
    active = [phrase for phrase in phrases if phrase['s'] - lead <= t < phrase['e'] + hold]
    if not active:
        return ''
    return clean(active[-1].get('text'))


def frame_layers(scenes, phrases, t, hide_matching_subtitle=True):
    """Text layers actually drawn at t.

    The subtitle is one of them. When it repeats a graphic, it is not drawn,
    so it is left out. Pass hide_matching_subtitle=False to count it anyway.
    """
    layers = list(graphic_texts(scenes, t))
    folds = {fold_text(text) for text in layers}
    subtitle = subtitle_text(phrases, t)
    folded = fold_text(subtitle)
    if folded and not (hide_matching_subtitle and folded in folds):
        layers.append(subtitle)
    return layers


def duplicate_frames(scenes, phrases, fps=30, t1=None, hide_matching_subtitle=True):
    """Frames where one sentence is on screen more than once.

    Titles, big lines, cards, the chapter bar and the subtitle all count.
    A subtitle that repeats a graphic is hidden, and then it is not a second copy.
    """
    total = scenes.get('duration') or 0
    if t1 is not None:
        total = min(total, t1) if total else t1
    frames = int(round(max(0, total) * fps))
    hits = []
    for index in range(frames):
        t = index / fps
        folded = {}
        shown = {}
        for text in frame_layers(scenes, phrases, t, hide_matching_subtitle=hide_matching_subtitle):
            key = fold_text(text)
            folded[key] = folded.get(key, 0) + 1
            shown.setdefault(key, text)
        repeated = sorted(shown[key] for key, count in folded.items() if count > 1)
        if repeated:
            hits.append((round(t, 3), repeated))
            if len(hits) >= 30:
                break
    return hits


def _spoken_span(text, speech, near=None):
    """When this string is said. A contrast half is located inside its sentence."""
    text = clean(text)
    if not text or not speech:
        return None
    if text in speech:
        return speech[text]
    best = None
    for full, span in speech.items():
        if text not in full:
            continue
        frac = full.find(text) / max(1, len(full))
        start = span[0] + frac * max(0.0, span[1] - span[0])
        if near is not None and abs(start - near) > 4.0 and not (span[0] - 0.3 <= near <= span[1] + 0.3):
            continue
        if best is None or start < best[0]:
            best = (start, span[1])
    return best


def anchor_to_speech(spec, speech, limit=None):
    """Do not show a line before it is spoken. Keep the overlay up through that line."""
    if not speech:
        return spec
    latest = float(spec.get('end') or 0)

    def walk(node):
        nonlocal latest
        if isinstance(node, list):
            for item in node:
                walk(item)
            return
        if not isinstance(node, dict):
            return
        if isinstance(node.get('text'), str) and isinstance(node.get('at'), (int, float)):
            found = _spoken_span(node['text'], speech, near=float(node['at']))
            if found:
                node['at'] = round(max(float(node['at']), found[0]), 3)
                latest = max(latest, found[1])
        for value in node.values():
            if isinstance(value, (dict, list)):
                walk(value)

    original_end = float(spec.get('end') or 0)
    walk(spec)
    # Only stretch the overlay when a line would otherwise start after it has gone.
    # A line that already fits stays on its beat, so a long sentence does not pin one card down.
    shown_at = []

    def collect(node):
        if isinstance(node, list):
            for item in node:
                collect(item)
            return
        if isinstance(node, dict):
            if isinstance(node.get('text'), str) and isinstance(node.get('at'), (int, float)):
                shown_at.append(float(node['at']))
            for value in node.values():
                if isinstance(value, (dict, list)):
                    collect(value)

    collect(spec)
    if shown_at and max(shown_at) > original_end - 0.4 and latest > original_end:
        end = max(latest, max(shown_at) + 0.45)
        if limit is not None:
            end = min(end, float(limit))
        spec['end'] = round(end, 3)
    return spec


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
    if len(texts) == 2:
        return 'side_panel'
    return 'blur_lines' if len(texts) <= 1 else 'headline_pill'


def _tally(beats):
    wide = push = 0.0
    for beat in beats:
        dur = max(0.0, beat['end'] - beat['start'])
        if beat['shot'] == 'PUSH':
            push += dur
        elif beat['shot'] not in ('PIP', 'END'):
            wide += dur
    return wide, push


def _reserve_shown(node, texts, start, hold, reserved):
    reserve_node(node, start, hold, reserved)
    shown = [text for text, _at in iter_timed_texts(node)]
    for source in _ordered(texts):
        if source in shown:
            continue
        if any(part and part != source and part in source for part in shown):
            reserved.append((source, start, hold))


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
    shown = set()
    for beat in beats:
        until = _visible_until(beat, beats, morph, total)
        idea = spans[beat['idea']][2] if beat.get('idea') is not None and beat['idea'] < len(spans) else phrases
        whole = [clean(p.get('text')) for p in idea]
        overlap = [clean(p.get('text')) for p in idea if p['e'] > beat['start'] - 0.05 and p['s'] < beat['end'] + 0.15]

        def pool_for(name, whole=whole, overlap=overlap, idea=idea, beat=beat):
            if name in RICH_WHOLE:
                return whole
            rows = overlap
            if name in SIMPLE_KINDS and len(rows) > 2:
                current = ''
                for phrase in idea:
                    if phrase['s'] <= beat['start'] + 0.2:
                        current = clean(phrase.get('text'))
                rows = [current] if current else rows[:1]
            return rows

        def ready(name):
            return _holds(name, _free_texts(pool_for(name), beat['start'], until, reserved))

        kind = beat['kind']
        if kind not in STRUCTURAL_KINDS and not ready(kind):
            if kind not in SIMPLE_KINDS and kind not in missed:
                missed.append(kind)
            replacement = None
            for name in missed:
                if name in PAGE_KINDS and beat['shot'] not in ('PIP', 'END') and not _pip_step(*_tally(built), beat['start'], total, beat['end'] - beat['start']):
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
                if name in PAGE_KINDS and beat['shot'] not in ('PIP', 'END') and not _pip_step(*_tally(built), beat['start'], total, beat['end'] - beat['start']):
                    continue
                if rich(name, idea) and ready(name):
                    missed.remove(name)
                    kind = name
                    break
        if kind not in STRUCTURAL_KINDS and kind in shown:
            for name in PRIORITY:
                if name in shown:
                    continue
                if rich(name, idea) and _holds(name, _free_texts(pool_for(name), beat['start'], until, reserved)):
                    kind = name
                    break
        texts = _free_texts(pool_for(kind), beat['start'], until, reserved)
        if beat['kind'] == 'neon_end':
            closing = [clean(phrase.get('text')) for phrase in phrases if clean(phrase.get('text'))]
            texts = closing[-1:] or texts
        role, spec = realize(kind, texts, beat['span_start'], beat['span_end'] if role_expects_overlay(beat) else beat['end'], _blocked(reserved, beat['start'], until))
        if not any(True for _text, _at in iter_timed_texts(spec)):
            if beat['shot'] == 'PIP':
                beat = dict(beat)
                beat['shot'] = 'WIDE_L' if int(beat['start']) % 2 == 0 else 'WIDE_R'
            built.append(beat)
            continue
        # realize's start/end: pages should cover the shot, overlays the span
        idea_end = spans[beat['idea']][1] if beat.get('idea') is not None and beat['idea'] < len(spans) else until
        hold = max(until, idea_end)
        if role == 'page' and spec.get('template') != 'neon_end' and beat['shot'] not in ('PIP', 'END'):
            wide_sec, push_sec = _tally(built)
            pip_step = _pip_step(wide_sec, push_sec, beat['start'], total, beat['end'] - beat['start'])
            if not pip_step:
                role, spec = 'overlay', headline_pill(_ordered(texts, 1), beat['span_start'], beat['span_end'])
            else:
                original_end = beat['end']
                beat = dict(beat)
                beat['shot'] = 'PIP'
                beat['end'] = round(min(original_end, beat['start'] + pip_step), 3)
                beat['_resume'] = original_end
        if role == 'page':
            spec['start'] = beat['start']
            spec['end'] = beat['end']
            speech = {}
            for phrase in idea:
                said = clean(phrase.get('text'))
                if said:
                    speech[said] = (float(phrase['s']), float(phrase['e']))
            anchor_to_speech(spec, speech, limit=beat['end'])
            if spec.get('template') == 'neon_end':
                beat = dict(beat)
                beat['shot'] = 'END'
            page = {'start': beat['start'], 'end': beat['end'], 'bg': _page_bg(spec['template']), 'layers': [spec]}
            _reserve_shown(page, texts, beat['start'], hold, reserved)
            pages.append(page)
            shown.add(spec['template'])
            built.append(beat)
            resume = beat.get('_resume')
            if resume and resume > beat['end'] + 0.2:
                built.append(_beat(beat['end'], resume, 'WIDE_L' if int(beat['end']) % 2 == 0 else 'WIDE_R', 'blur_lines'))
            continue
        if beat['shot'] in ('PIP', 'END') and spec['template'] not in ('neon_end',):
            beat = dict(beat)
            beat['shot'] = 'WIDE_L' if int(beat['start']) % 2 == 0 else 'WIDE_R'
        spec['start'], spec['end'] = beat['span_start'], beat['span_end']
        speech = {}
        for phrase in idea:
            said = clean(phrase.get('text'))
            if said:
                speech[said] = (float(phrase['s']), float(phrase['e']))
        anchor_to_speech(spec, speech, limit=total)
        _reserve_shown(spec, texts, beat['span_start'], hold, reserved)
        overlays.append(spec)
        shown.add(spec['template'])
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
    stop_before_same_sentence(overlays, pages)
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


def shot_shares(scenes):
    total = float(scenes.get('duration') or 0)
    seconds = {'wide': 0.0, 'push': 0.0, 'pip': 0.0, 'end': 0.0}
    shots = scenes.get('shots') or []
    for index, row in enumerate(shots):
        nxt = shots[index + 1]['at'] if index + 1 < len(shots) else total
        shot = row['shot']
        key = 'wide' if str(shot).startswith('WIDE') else str(shot).lower()
        seconds[key] = seconds.get(key, 0.0) + max(0.0, nxt - row['at'])
    share = {key: (value / total if total else 0.0) for key, value in seconds.items()}
    return {'seconds': seconds, 'share': share, 'duration': total}


def pairing_problems(scenes, phrases):
    """Same-screen copy must follow speech order and a card must hold more than one line."""
    problems = []

    def when(text):
        for phrase in phrases:
            spoken = clean(phrase.get('text'))
            if not spoken or not text:
                continue
            if text == spoken or text in spoken:
                at = spoken.find(text)
                return phrase['s'] + (0 if at < 0 else at) * 0.001
        return None

    nodes = list(scenes.get('overlays') or [])
    for page in scenes.get('pages') or []:
        nodes.extend(page.get('layers') or [])
    for node in nodes:
        rows = []
        for text, at_time in iter_timed_texts(node):
            found = when(text)
            if found is None:
                problems.append(('outside', node.get('template')))
            else:
                rows.append((at_time, found))
        speech = [found for _at, found in sorted(rows)]
        if speech != sorted(speech):
            problems.append(('order', node.get('template')))
        if node.get('template') in SIMPLE_KINDS and len(rows) > 2:
            problems.append(('pile', node.get('template')))
        if node.get('template') == 'card_carousel':
            for card in node.get('cards') or []:
                lines = card.get('lines') or []
                if len(lines) < 2:
                    problems.append(('empty-card', node.get('start')))
    return problems


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
    shares = shot_shares(scenes)
    problems = pairing_problems(scenes, phrases)
    print('templates', ' '.join(sorted(set(names))))
    print('opening', ' '.join(names), 'stills', stills)
    print('shares', ' '.join('%s %.1f%% (%.2fs)' % (key, 100 * shares['share'].get(key, 0), shares['seconds'].get(key, 0)) for key in ('wide', 'push', 'pip', 'end')))
    print('pairing', 'ok' if not problems else problems[:8])


if __name__ == '__main__':
    main(sys.argv[1])
