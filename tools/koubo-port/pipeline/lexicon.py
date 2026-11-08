"""User hotwords and display corrections.

Hotwords are passed to the next transcription. Accepted replacements change
subtitles, big text and labels only. Cut decisions keep the raw tokens.
"""
import json, os, re


def load(path):
    if not path or not os.path.exists(path):
        return {'hotwords': [], 'replace': []}
    data = json.load(open(path, encoding='utf-8'))
    hot = [str(item) for item in (data.get('hotwords') or []) if str(item).strip()]
    rows = []
    repl = data.get('replace') or []
    if isinstance(repl, dict):
        repl = [{'before': key, 'after': value, 'status': 'accepted'} for key, value in repl.items()]
    for row in repl:
        if not isinstance(row, dict):
            continue
        if row.get('status', 'accepted') != 'accepted':
            continue
        before, after = str(row.get('before') or ''), str(row.get('after') or '')
        if before and after and before != after:
            rows.append({'before': before, 'after': after})
    rows.sort(key=lambda item: len(item['before']), reverse=True)
    return {'hotwords': hot, 'replace': rows}


def hotword_arg(lex):
    words = []
    for item in list(lex.get('hotwords') or []) + [row['after'] for row in lex.get('replace') or []]:
        text = str(item).strip()
        if text and text not in words:
            words.append(text)
    return ' '.join(words)


def apply_display(text, lex):
    rows = sorted(lex.get('replace') or [], key=lambda item: len(item['before']), reverse=True)
    if not rows or not text:
        return text
    parts = []
    table = {}
    for row in rows:
        piece = re.escape(row['before'])
        if re.search(r'[A-Za-z0-9]', row['before']):
            piece = r'(?<![A-Za-z0-9])' + piece + r'(?![A-Za-z0-9])'
        parts.append(piece)
        table[row['before']] = row['after']
    return re.compile('|'.join(parts)).sub(lambda match: table[match.group(0)], text)
