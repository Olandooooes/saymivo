"""Observed-token boundary checks, independent of any model or private media.

Forced alignment positions supplied text; it does not prove that text was spoken.
No character times are interpolated, including for zero-duration model tokens.
"""
import math
from forced_alignment_compare import clean

EPS = .001


def _number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def _range(source_range):
    if (not isinstance(source_range, (list, tuple)) or len(source_range) != 2
            or not all(_number(x) for x in source_range)
            or source_range[0] < 0 or source_range[1] <= source_range[0]):
        raise ValueError('Invalid source range')
    return source_range


def _words(words, source_range):
    a, b = _range(source_range)
    if not words:
        raise ValueError('Missing observed words')
    previous = a * 1000
    previous_id = None
    for word in words:
        x, y = word.get('startMs'), word.get('endMs')
        if (not all(_number(t) for t in [x, y]) or x < a * 1000 - 1
                or y > b * 1000 + 1 or y <= x or x < previous - 1
                or not clean(word.get('word', '')) or not isinstance(word.get('id'), int)
                or (previous_id is not None and word['id'] != previous_id + 1)):
            raise ValueError('Invalid or overlapping observed word range')
        previous = y
        previous_id = word['id']


def _quiet_intervals(quiet, source_range):
    a, b = _range(source_range)
    intervals = []
    for interval in quiet:
        if (not isinstance(interval, (list, tuple)) or len(interval) != 2
                or not all(_number(x) for x in interval) or interval[1] <= interval[0]):
            raise ValueError('Invalid quiet interval')
        x, y = max(a, interval[0]), min(b, interval[1])
        if x < y:
            intervals.append((x, y))
    return intervals


def select_alignment_window(words, first, last, quiet, source_range, context_units=3):
    """Use quiet audio edges and include EVERY observed word intersecting audio.

    Padding a text slice by fixed seconds can add speech omitted from the text,
    or begin inside a preceding word. Quiet edges avoid that known mismatch.
    Energy alone does not establish absence of untranscribed speech.
    """
    _words(words, source_range)
    if (not isinstance(first, int) or not isinstance(last, int)
            or first < 0 or last < first or last >= len(words)
            or not isinstance(context_units, int) or context_units < 1):
        raise ValueError('Invalid target word range')
    a, b = source_range
    lo = max(0, first - context_units)
    hi = min(len(words) - 1, last + context_units)
    desired_a, desired_b = words[lo]['startMs'] / 1000, words[hi]['endMs'] / 1000
    anchors = []
    for x, y in _quiet_intervals(quiet, source_range):
        # A low-energy interval can overlap weak consonants. Never choose an
        # edge inside a primary observed word, even when RMS calls it quiet.
        pieces = [(x + .03, y - .03)]
        for word in words:
            p, q = word['startMs'] / 1000 - .02, word['endMs'] / 1000 + .02
            next_pieces = []
            for left, right in pieces:
                if q <= left or p >= right:
                    next_pieces.append((left, right))
                else:
                    if left < p:
                        next_pieces.append((left, p))
                    if q < right:
                        next_pieces.append((q, right))
            pieces = next_pieces
        anchors.extend((left + right) / 2 for left, right in pieces if right - left >= .02)
    before = [t for t in anchors if t <= desired_a]
    after = [t for t in anchors if t >= desired_b]
    start, end = max(before, default=a), min(after, default=b)
    selected = [i for i, word in enumerate(words)
                if word['endMs'] / 1000 > start and word['startMs'] / 1000 < end]
    if not selected or selected[0] > first or selected[-1] < last:
        raise ValueError('Alignment window omitted target words')
    return {'sourceRange': [start, end], 'first': selected[0], 'last': selected[-1],
            'words': words[selected[0]:selected[-1] + 1],
            'leftAtEvidenceEdge': not before, 'rightAtEvidenceEdge': not after}


def aligned_evidence(words, tokens, source_range):
    """Return conservative observed groups and character coverage of each word."""
    a, b = _range(source_range)
    expected = ''.join(clean(w['word']) for w in words)
    actual = ''.join(clean(t.get('text', '')) for t in tokens)
    result = {'tokenTextMatches': bool(expected) and expected == actual,
              'groups': [], 'wordCharacters': [], 'unresolved': [],
              'sourceRange': [a, b]}
    cursor = 0
    for word in words:
        stop = cursor + len(clean(word['word']))
        result['wordCharacters'].append({'id': word['id'], 'start': cursor, 'end': stop})
        cursor = stop
    if not result['tokenTextMatches']:
        result['unresolved'].append('Model token text does not match all supplied words')
        return result
    raw = []
    cursor = 0
    previous_end = 0
    for index, token in enumerate(tokens):
        stop = cursor + len(clean(token.get('text', '')))
        x, y = token.get('start_time'), token.get('end_time')
        valid = (all(_number(t) for t in [x, y]) and 0 <= x <= y <= b - a + EPS
                 and x >= previous_end - EPS)
        if _number(x) and x < previous_end - EPS:
            # Both observations at an overlapping boundary are unsupported;
            # marking only the later word could certify the earlier cut edge.
            for preceding in raw:
                if preceding['endSec'] is not None and preceding['endSec'] > a + x + EPS:
                    preceding['valid'] = False
        raw.append({'text': token.get('text', ''), 'charStart': cursor, 'charEnd': stop,
                    'startSec': a + x if _number(x) else None,
                    'endSec': a + y if _number(y) else None,
                    'tokenIndices': [index], 'valid': valid})
        if _number(y):
            previous_end = max(previous_end, y)
        cursor = stop
    groups = []
    i = 0
    while i < len(raw):
        unit = dict(raw[i])
        if unit['valid'] and unit['startSec'] == unit['endSec']:
            # A zero timestamp can be grouped only with directly adjacent
            # equal-time observations. Never assign a synthetic word time.
            last = i
            while (last + 1 < len(raw) and raw[last + 1]['valid']
                   and raw[last + 1]['startSec'] == unit['endSec']):
                last += 1
                unit['text'] += raw[last]['text']
                unit['charEnd'] = raw[last]['charEnd']
                unit['endSec'] = raw[last]['endSec']
                unit['tokenIndices'] += raw[last]['tokenIndices']
                if unit['endSec'] > unit['startSec']:
                    break
            if unit['endSec'] == unit['startSec']:
                previous = groups[-1] if groups else None
                if previous and previous['valid'] and previous['endSec'] == unit['startSec']:
                    previous['text'] += unit['text']
                    previous['charEnd'] = unit['charEnd']
                    previous['tokenIndices'] += unit['tokenIndices']
                    i = last + 1
                    continue
                unit['valid'] = False
            i = last
        groups.append(unit)
        i += 1
    result['groups'] = groups
    return result


def observed_span(evidence, first_id, last_id, exact_boundaries=True):
    """Get an outer span; an inside-group boundary remains unsupported."""
    if not evidence['tokenTextMatches']:
        return {'status': 'needs-review', 'reason': 'alignment-text-mismatch'}
    characters = evidence['wordCharacters']
    first = next((w for w in characters if w['id'] == first_id), None)
    last = next((w for w in characters if w['id'] == last_id), None)
    if not first or not last or first['start'] >= last['end']:
        return {'status': 'needs-review', 'reason': 'missing-word-coverage'}
    lo, hi = first['start'], last['end']
    groups = [g for g in evidence['groups'] if g['charStart'] < hi and g['charEnd'] > lo]
    if not groups or any(not g['valid'] for g in groups):
        return {'status': 'needs-review', 'reason': 'invalid-or-unresolved-observed-span'}
    if any(right['startSec'] < left['endSec'] - EPS for left, right in zip(groups, groups[1:])):
        return {'status': 'needs-review', 'reason': 'overlapping-observed-spans'}
    exact = groups[0]['charStart'] == lo and groups[-1]['charEnd'] == hi
    if exact_boundaries and not exact:
        return {'status': 'needs-review', 'reason': 'boundary-inside-indivisible-observed-group'}
    return {'status': 'observed', 'startSec': groups[0]['startSec'],
            'endSec': groups[-1]['endSec'], 'exactBoundaries': exact,
            'groupedTokenIndices': [g['tokenIndices'] for g in groups if len(g['tokenIndices']) > 1]}


def check_planned_cut(cut, words, quiet, source_range, remove_evidence, retain_evidence=None):
    """Check actual cutpoints against BOTH clocks and retained neighboring words.

    This is a timestamp gate, not a listening or editorial acceptance result.
    """
    _words(words, source_range)
    reasons = []
    first, last = cut['first'], cut['last']
    if not isinstance(first, int) or not isinstance(last, int) or not 0 <= first <= last < len(words):
        raise ValueError('Invalid cut word range')
    start, end = cut.get('startSec'), cut.get('endSec')
    if not all(_number(t) for t in [start, end]) or not source_range[0] <= start < end <= source_range[1]:
        raise ValueError('Invalid planned cut range')
    removed = observed_span(remove_evidence, words[first]['id'], words[last]['id'])
    if removed['status'] != 'observed':
        reasons.append('removed-' + removed['reason'])
    else:
        lower = min(words[first]['startMs'] / 1000, removed['startSec'])
        upper = max(words[last]['endMs'] / 1000, removed['endSec'])
        if start > lower + EPS or end < upper - EPS:
            reasons.append('planned-cut-does-not-cover-both-removed-observations')
    retained = None
    if cut.get('kind') != 'filler':
        rf, rl = cut.get('replacementFirst'), cut.get('replacementLast')
        # A better complete take can precede the rejected take. Only disjoint
        # observed ranges are supported; this is unrelated to timeline order.
        if (not isinstance(rf, int) or not isinstance(rl, int) or not 0 <= rf <= rl < len(words)
                or not (rl < first or rf > last)):
            raise ValueError('Invalid retained replacement range')
        retained = observed_span(retain_evidence, words[rf]['id'], words[rl]['id']) if retain_evidence else {'status': 'needs-review', 'reason': 'missing-independent-evidence'}
        if retained['status'] != 'observed':
            reasons.append('replacement-' + retained['reason'])
    protected = []
    # Keep all primary observations protected, not only a single chosen clock.
    for i, word in enumerate(words):
        if first <= i <= last:
            continue
        protected.append({'id': word['id'], 'clock': 'primary',
                          'startSec': word['startMs'] / 1000, 'endSec': word['endMs'] / 1000})
    for evidence in [remove_evidence, retain_evidence]:
        if not evidence:
            continue
        for wc in evidence['wordCharacters']:
            if words[first]['id'] <= wc['id'] <= words[last]['id']:
                continue
            span = observed_span(evidence, wc['id'], wc['id'], exact_boundaries=False)
            if span['status'] == 'observed':
                protected.append({'id': wc['id'], 'clock': 'independent', **span})
    neighbors = []
    for i in [first - 1, last + 1]:
        if i < 0 or i >= len(words):
            reasons.append('adjacent-retained-context-missing')
            continue
        neighbor = observed_span(remove_evidence, words[i]['id'], words[i]['id'], exact_boundaries=False)
        neighbors.append({'id': words[i]['id'], **neighbor})
        if neighbor['status'] != 'observed':
            reasons.append('adjacent-retained-' + neighbor['reason'])
    collisions = [p for p in protected if min(end, p['endSec']) - max(start, p['startSec']) > EPS]
    if collisions:
        reasons.append('planned-cut-clips-retained-observation')
    intervals = _quiet_intervals(quiet, source_range)
    if not all(any(x + .03 - EPS <= t <= y - .03 + EPS for x, y in intervals) for t in [start, end]):
        reasons.append('planned-cut-not-inside-measured-quiet')
    return {'status': 'needs-review' if reasons else 'machine-boundary-checked',
            'reasons': sorted(set(reasons)), 'removedBoundary': removed,
            'replacementBoundary': retained, 'retainedNeighbors': neighbors,
            'retainedCollisions': collisions,
            'scope': 'union of observed word ranges and quiet measurements; does not establish spoken text or listening acceptance'}
