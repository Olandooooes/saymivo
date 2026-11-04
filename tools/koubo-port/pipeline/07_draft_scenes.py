"""Draft a generic scene list from subtitle phrases.

On-screen copy is a whole spoken phrase. A label is never a character budget
cut out of a longer sentence. Nothing here is written for one script.

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


def shortest(texts):
    return min(texts, key=len)


def longest(texts):
    return max(texts, key=len)


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


def side_panel(texts, start, end):
    styles = ('h1', 'muted', 'h2')
    items = []
    for index, text in enumerate(texts[:3]):
        items.append({'text': text, 'at': at(start, end, 0.16 + index * 0.32), 'style': styles[index]})
    return {
        'template': 'side_panel',
        'start': start,
        'end': end,
        'items': items,
        'accent': timed(shortest(texts), start, end, 0.45),
    }


def headline_pill(texts, start, end):
    pill = shortest(texts)
    lines = [text for text in texts if text != pill] or [pill]
    return {
        'template': 'headline_pill',
        'start': start,
        'end': end,
        'pill': timed(pill, start, end, 0.08),
        'lines': [{'text': text, 'at': at(start, end, 0.28 + index * 0.42), 'size': line_size(text, 118)} for index, text in enumerate(lines[:2])],
    }


def pill_lines(texts, start, end):
    pill = shortest(texts)
    lines = [text for text in texts if text != pill] or [pill]
    return {
        'template': 'pill_lines',
        'start': start,
        'end': end,
        'pill': timed(pill, start, end, 0.08),
        'lines': [{'text': text, 'at': at(start, end, 0.28 + index * 0.4), 'size': line_size(text, 110)} for index, text in enumerate(lines[:2])],
    }


def blur_lines(texts, start, end):
    return {
        'template': 'blur_lines',
        'start': start,
        'end': end,
        'lines': [{'text': text, 'at': at(start, end, 0.16 + index * 0.4), 'size': line_size(text, 104 if index == 0 else 96)} for index, text in enumerate(texts[:2])],
    }


def flow_pills(texts, start, end):
    left = shortest(texts)
    right = next((text for text in texts if text != left), left)
    body = longest(texts)
    spec = {
        'template': 'flow_pills',
        'start': start,
        'end': end,
        'a': timed(left, start, end, 0.12),
        'b': timed(right, start, end, 0.42),
    }
    if body != left:
        spec['bottom'] = timed(body, start, end, 0.7)
    return spec


def contrast_arrow(texts, start, end):
    sentence = next((text for text in texts if is_contrast(text)), texts[0])
    left, right = sentence.split('到', 1)
    return {
        'template': 'contrast_arrow',
        'start': start,
        'end': end,
        'header': timed(sentence, start, end, 0.06),
        'from': timed(left or sentence, start, end, 0.16),
        'to': timed(right or sentence, start, end, 0.7),
    }


def headline_badges(texts, start, end):
    return {
        'template': 'headline_badges',
        'start': start,
        'end': end,
        'pill': timed(shortest(texts), start, end, 0.08),
        'headline': timed(longest(texts), start, end, 0.28),
        'badges': {'n': min(3, max(2, len(texts))), 'at': at(start, end, 0.45)},
    }


def page_example(texts, start, end):
    node = shortest(texts)
    lead = next((text for text in texts if text != node), node)
    big = longest(texts)
    capsule = next((text for text in texts if text not in (node, big)), node)
    title = [timed(big, start, end, 0.16)]
    if lead != big:
        title.append({**timed(lead, start, end, 0.28), 'accent': True})
    return {
        'template': 'page_example',
        'start': start,
        'end': end,
        'kicker': timed(node, start, end, 0.08),
        'title': title,
        'caption': lead if lead != big else node,
        'card': {
            'at': at(start, end, 0.4),
            'lead': node,
            'big': big,
            'node': node,
            'children': 3,
        },
        'capsule': timed(capsule, start, end, 0.9),
    }


def scattered(texts, start, end):
    return {
        'template': 'scattered_capsules',
        'start': start,
        'end': end,
        'lead': timed(shortest(texts), start, end, 0.08),
        'items': [{'text': text, 'at': at(start, end, 0.28 + index * 0.28)} for index, text in enumerate(texts[:4])],
        'capsule': timed(longest(texts), start, end, 1.05),
    }


def build_overlay(kind, texts, start, end, phrases):
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
        return contrast_arrow(texts, start, end)
    if kind == 'headline_badges':
        return headline_badges(texts, start, end)
    return pill_lines(texts, start, end)


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


def draft(phrases, total):
    shots, overlays, pages = [], [], []
    wide_sec = push_sec = 0.0
    last_pip = -99.0
    last_push = -99.0
    pip_count = 0
    side = 'WIDE_L'
    for start, end, shot, kind in OPENING:
        if start >= total - 0.15:
            break
        end = min(end, total)
        span_start, span_end = overlay_span(start, end)
        shots.append({'at': round(start, 3), 'shot': shot})
        texts = texts_between(phrases, start, end)
        if shot == 'PIP':
            pages.append(page_for('page_example', texts, span_start, round(end, 3), pip_count))
            pip_count += 1
            last_pip = start
        elif shot == 'PUSH':
            overlays.append(build_overlay(kind, texts, span_start, span_end, phrases))
            push_sec += end - start
            last_push = start
        else:
            overlays.append(build_overlay(kind, texts, span_start, span_end, phrases))
            wide_sec += end - start
        if shot.startswith('WIDE'):
            side = 'WIDE_R' if shot == 'WIDE_L' else 'WIDE_L'

    cursor = 20.2
    rotate_at = 0
    while cursor < total - 3.4:
        if shots and abs(shots[-1]['at'] - cursor) < 0.05:
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
        span_start, span_end = overlay_span(cursor, end)
        shots.append({'at': round(cursor, 3), 'shot': shot})
        texts = texts_between(phrases, cursor, end)
        if shot == 'PIP':
            pages.append(page_for('page', texts, span_start, round(end, 3), pip_count))
            pip_count += 1
        else:
            overlays.append(build_overlay(kind, texts, span_start, span_end, phrases))
        cursor = round(end, 3)

    if total > 8 and shots and shots[-1]['shot'] != 'END' and total - shots[-1]['at'] > 1.2:
        end_at = round(max(shots[-1]['at'] + 0.8, min(total - 0.4, max(shots[-1]['at'] + 0.8, total - 3.2))), 3)
        if end_at > shots[-1]['at'] + 0.2 and end_at < total:
            for row in overlays:
                if row['start'] >= end_at:
                    row['drop'] = True
                elif row['end'] > end_at:
                    row['end'] = round(end_at - 0.02, 3)
            for page in pages:
                if page['start'] >= end_at:
                    page['drop'] = True
                elif page['end'] > end_at:
                    page['end'] = round(end_at - 0.02, 3)
                    for layer in page['layers']:
                        layer['end'] = page['end']
            shots = [row for row in shots if row['at'] < end_at - 0.05]
            shots.append({'at': end_at, 'shot': 'END'})
            end_phrase = clean(phrase_at(phrases, end_at).get('text')) or clean(phrases[-1].get('text'))
            pages.append({
                'start': end_at,
                'end': round(total, 3),
                'bg': 'dark_end',
                'layers': [{
                    'template': 'neon_end',
                    'start': end_at,
                    'end': round(total, 3),
                    'word': timed(shortest(texts_between(phrases, end_at, total, 0.2) or [end_phrase]), end_at, total, 0.2),
                    'line': timed(end_phrase, end_at, total, 0.45),
                }],
            })
    overlays = [row for row in overlays if not row.get('drop') and row['end'] > row['start']]
    pages = [row for row in pages if not row.get('drop') and row['end'] > row['start']]
    for row in overlays + pages:
        row.pop('drop', None)
    scenes = {
        'chapters': [{'title': clean(phrases[0].get('text')) or ' ', 'at': 0}],
        'shots': shots,
        'overlays': overlays,
        'pages': pages,
        'duration': round(total, 3),
        'end_fade': True,
    }
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
