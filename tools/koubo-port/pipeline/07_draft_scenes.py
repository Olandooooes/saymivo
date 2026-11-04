"""Draft a generic scene list from subtitle phrases.

On-screen copy is a slice of what was spoken. Nothing here is written for one script.
The opening always shows three shot sizes from the style spec, inside the first 20 seconds:
a pulled-back off-centre wide, a push-in no longer than 2.5 s, and a small circular window.
Later phrases follow the same triggers (question, contrast, long line, closing).

usage: python 07_draft_scenes.py workdir/
reads phrases.json ; writes scenes.json and preview_beats.json
"""
import json, os, sys

PUNCT = '，,。！？!?、；;：:'


def clip_text(text, limit):
    text = ' '.join(str(text or '').split())
    if len(text) <= limit:
        return text or ' '
    cut = text[:limit]
    if limit < len(text) and text[limit - 1].isascii() and text[limit].isascii():
        space = cut.rfind(' ')
        if space > 1:
            cut = cut[:space]
    for index, char in enumerate(cut):
        if char in PUNCT and index >= 2:
            return cut[:index]
    return cut.strip() or text[:limit]


def phrase_at(phrases, time):
    current = phrases[0]
    for phrase in phrases:
        if phrase['s'] <= time + 0.02:
            current = phrase
        else:
            break
    return current


def phrase_after(phrases, phrase):
    for item in phrases:
        if item['s'] >= phrase['e'] - 0.05 and item is not phrase:
            return item
    return phrase


def is_question(text):
    return any(mark in text for mark in ('？', '?')) or text.endswith('吗')


def is_contrast(text):
    return '从' in text and '到' in text


def clamp(value, lo, hi):
    return max(lo, min(hi, value))


def opening(phrases):
    """Three looks inside 20 s. Phrase onsets move the beats, but they stay in range."""
    second = phrases[min(1, len(phrases) - 1)]['s']
    fourth = phrases[min(3, len(phrases) - 1)]['s']
    off = clamp(second - 0.12, 3.2, 5.6)
    push = clamp(fourth - 0.08, off + 2.4, 9.2)
    pip = push + 2.2
    wide_back = pip + 4.6
    return {'off': round(off, 3), 'push': round(push, 3), 'pip': round(pip, 3), 'wide_back': round(wide_back, 3)}


def draft(phrases, total):
    beats = opening(phrases)
    off, push, pip, back = beats['off'], beats['push'], beats['pip'], beats['wide_back']
    back = min(back, max(pip + 3.2, 16.0))
    if back > total - 0.4:
        back = total
    shots = [
        {'at': 0, 'shot': 'WIDE_C'},
        {'at': off, 'shot': 'WIDE_R'},
        {'at': push, 'shot': 'PUSH'},
        {'at': pip, 'shot': 'PIP'},
    ]
    if back < total - 0.8:
        shots.append({'at': round(back, 3), 'shot': 'WIDE_L'})
        cursor = back + 2.4
    else:
        cursor = pip + 4.6
    side = 'WIDE_L'
    while cursor < total - 5:
        phrase = phrase_at(phrases, cursor)
        dur = max(2.2, min(7.5, phrase['e'] - phrase['s'] + 0.4))
        if cursor > total - 6:
            shots.append({'at': round(cursor, 3), 'shot': 'END'})
            break
        if len(phrase['text']) >= 18:
            shots.append({'at': round(cursor, 3), 'shot': 'PIP'})
            cursor += min(6.0, dur)
            continue
        if len(phrase['text']) <= 10 and phrase['text'].endswith(('！', '!', '？', '?')):
            shots.append({'at': round(cursor, 3), 'shot': 'PUSH'})
            cursor += 2.2
            continue
        side = 'WIDE_R' if side == 'WIDE_L' else 'WIDE_L'
        shots.append({'at': round(cursor, 3), 'shot': side})
        cursor += dur
    if total > 8 and (not shots or shots[-1]['shot'] != 'END') and total - shots[-1]['at'] > 3:
        shots.append({'at': round(max(shots[-1]['at'] + 0.8, total - 3.5), 3), 'shot': 'END'})

    first = phrases[0]
    nxt = phrases[min(1, len(phrases) - 1)]
    off_phrase = phrase_at(phrases, off + 0.2)
    push_phrase = phrase_at(phrases, push + 0.15)
    pip_phrase = phrase_at(phrases, pip + 0.2)
    pip_next = phrase_at(phrases, min(total - 0.2, pip + 1.4))
    title = clip_text(first['text'], 8)
    glass = clip_text(nxt['text'], 14)
    overlays = [
        {
            'template': 'title_card',
            'start': 0,
            'end': off - 0.05,
            'title': {'text': title, 'at': max(0.05, first['s'])},
            'glass': {'text': glass, 'at': max(0.2, nxt['s'])},
            'arrows': {'at': off - 0.8, 'x': 0.62, 'y': 0.28, 'point': 'right'},
        },
    ]
    if is_question(off_phrase['text']) or len(off_phrase['text']) <= 16:
        earlier = phrases[max(0, phrases.index(off_phrase) - 1)]
        pill = clip_text(earlier['text'], 8) if earlier is not off_phrase else clip_text(off_phrase['text'], 8)
        line = clip_text(off_phrase['text'], 8)
        if pill == line:
            pill = clip_text(off_phrase['text'], 4)
        nxt = phrase_after(phrases, off_phrase)
        lines = [{'text': line, 'at': off + 0.16, 'size': 118}]
        if nxt is not off_phrase and clip_text(nxt['text'], 8) != line:
            lines.append({'text': clip_text(nxt['text'], 8), 'at': max(off + 0.45, nxt['s'] - 0.06), 'size': 100})
        overlays.append({
            'template': 'headline_pill',
            'start': off,
            'end': push - 0.05,
            'pill': {'text': pill, 'at': off + 0.05},
            'lines': lines,
        })
    else:
        items = []
        styles = ['h1', 'muted', 'h2']
        for index, style in enumerate(styles):
            phrase = phrase_at(phrases, off + index * 0.7)
            items.append({'text': clip_text(phrase['text'], 12), 'at': off + 0.15 + index * 0.35, 'style': style})
        overlays.append({
            'template': 'side_panel',
            'start': off,
            'end': push - 0.05,
            'items': items,
            'accent': {'text': clip_text(off_phrase['text'], 4), 'at': off + 1.1},
        })
    if is_contrast(push_phrase['text']):
        parts = push_phrase['text'].split('到', 1)
        overlays.append({
            'template': 'contrast_arrow',
            'start': push,
            'end': pip - 0.05,
            'header': {'text': clip_text(push_phrase['text'], 8), 'at': push + 0.05},
            'from': {'text': clip_text(parts[0], 6), 'at': push + 0.12},
            'to': {'text': clip_text(parts[1] if len(parts) > 1 else push_phrase['text'], 6), 'at': push + 0.7},
        })
    else:
        overlays.append({
            'template': 'pill_lines',
            'start': push,
            'end': pip - 0.05,
            'pill': {'text': clip_text(push_phrase['text'], 8), 'at': push + 0.05},
            'lines': [{'text': clip_text(push_phrase['text'], 8), 'at': push + 0.2, 'size': 110}],
        })

    page_end = min(total, back if back > pip + 1 else pip + 4.6)
    node = clip_text(pip_phrase['text'], 4)
    pages = [{
        'start': pip,
        'end': page_end,
        'bg': 'offwhite',
        'layers': [{
            'template': 'page_example',
            'start': pip,
            'end': page_end,
            'kicker': {'text': clip_text(pip_phrase['text'], 6), 'at': pip + 0.08},
            'title': [
                {'text': clip_text(pip_phrase['text'], 6), 'at': pip + 0.12},
                {'text': clip_text(pip_next['text'], 4), 'at': pip + 0.28, 'accent': True},
            ],
            'caption': clip_text(pip_next['text'], 18),
            'card': {
                'at': pip + 0.45,
                'lead': clip_text(pip_phrase['text'], 8),
                'big': clip_text(pip_phrase['text'], 8),
                'node': node,
                'children': 3,
            },
            'capsule': {'text': clip_text(pip_next['text'], 10), 'at': pip + 1.15},
        }],
    }]
    if shots[-1]['shot'] == 'END':
        end_at = shots[-1]['at']
        end_phrase = phrase_at(phrases, end_at)
        pages.append({
            'start': end_at,
            'end': total,
            'bg': 'dark_end',
            'layers': [{
                'template': 'neon_end',
                'start': end_at,
                'end': total,
                'word': {'text': clip_text(end_phrase['text'], 4), 'at': end_at + 0.2},
                'line': {'text': clip_text(end_phrase['text'], 12), 'at': end_at + 0.45},
            }],
        })
    chapters = [{'title': clip_text(first['text'], 6), 'at': 0}]
    scenes = {
        'chapters': chapters,
        'shots': shots,
        'overlays': overlays,
        'pages': pages,
        'duration': round(total, 3),
        'end_fade': True,
    }
    stills = {
        'wide': round(off + 1.05, 3),
        'push': round(push + 1.05, 3),
        'pip': round(pip + 1.15, 3),
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
    names = [row['shot'] for row in scenes['shots'][:4]]
    print('shots', ' '.join(names), 'stills', stills)


if __name__ == '__main__':
    main(sys.argv[1])
