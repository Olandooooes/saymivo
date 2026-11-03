"""Pure complete-window checks for a separate, free speech recognizer.

Expected text is only compared AFTER recognition. It must never enter the
recognizer as a prompt, transcript, hotword list or forced-alignment input.
"""
import copy
import math
import unicodedata

from retake_boundary_check import select_alignment_window

CONFIRMATION_VERSION = 'separate-complete-free-windows-v3'


def normalize_confirmation_text(text):
    if not isinstance(text, str):
        raise ValueError('Recognition text must be a string')
    value = unicodedata.normalize('NFKC', text).lower().replace('\u2019', "'").replace('\u2212', '-')
    compact = ''.join(char for char in value if not char.isspace())
    result = []
    for index, char in enumerate(compact):
        previous = compact[index - 1] if index else ''
        following = compact[index + 1] if index + 1 < len(compact) else ''
        category = unicodedata.category(char)[0]
        if category in 'LNS':
            result.append(char)
        elif category == 'P' and previous.isdecimal() and following.isdecimal():
            result.append(char)
        elif char in '+-' and following.isdecimal():
            result.append(char)
        elif char == '%':
            result.append(char)
        elif char == "'" and previous.isalpha() and following.isalpha():
            result.append(char)
    return ''.join(result)


def compare_complete_window(expected, observed, comparison_copies=None, normalization_receipt=None):
    copies = [expected, observed] if comparison_copies is None else comparison_copies
    if not isinstance(copies, (list, tuple)) or len(copies) != 2:
        raise ValueError('Expected two comparison copies')
    a, b = [normalize_confirmation_text(text) for text in copies]
    confirmed = bool(a) and a == b
    return {'confirmed': confirmed,
            'reason': 'complete-free-window-text-confirmed' if confirmed else 'complete-free-window-text-mismatch',
            'expectedText': expected, 'text': observed, 'normalizedExpected': a, 'normalizedObserved': b,
            'comparisonExpectedText': copies[0], 'comparisonObservedText': copies[1],
            'comparisonNormalization': normalization_receipt,
            'comparison': 'entire observed window; no substring acceptance', 'expectedTextSupplied': False}


def _index(value):
    return isinstance(value, int) and not isinstance(value, bool)


def _separate_take_window(words, first, last, other_first, other_last, quiet, source_range):
    """Bracket one take in real quiet, so free ASR cannot collapse two takes.

    Boundary v2 still checks the wider neighboring words independently. This
    free recognition window contains every actual intersecting source word;
    no transcript is supplied to the recognizer.
    """
    # Reuse the established full clock/quiet validation, without changing the
    # wider forced-alignment planner or its evidence identity.
    select_alignment_window(words, first, last, quiet, source_range, context_units=1)
    target_start, target_end = words[first]['startMs'] / 1000, words[last]['endMs'] / 1000
    anchors = []
    for raw_start, raw_end in quiet:
        start, end = max(source_range[0], raw_start) + .03, min(source_range[1], raw_end) - .03
        pieces = [(start, end)] if end > start else []
        for word in words:
            a, b = word['startMs'] / 1000 - .02, word['endMs'] / 1000 + .02
            pieces = [(x, y) for left, right in pieces for x, y in
                      ([(left, right)] if b <= left or a >= right else [(left, min(right, a)), (max(left, b), right)])
                      if y - x >= .02]
        anchors.extend((a + b) / 2 for a, b in pieces if b - a >= .02)
    before = [value for value in anchors if value <= target_start - .02 + 1e-9]
    after = [value for value in anchors if value >= target_end + .02 - 1e-9]
    if not before or not after:
        raise ValueError('Separate complete take has no measured quiet boundary')
    a, b = max(before), min(after)
    selected = [i for i, word in enumerate(words)
                if word['endMs'] / 1000 > a and word['startMs'] / 1000 < b]
    if not selected or selected[0] > first or selected[-1] < last:
        raise ValueError('Separate free window omits target source words')
    if any(other_first <= index <= other_last for index in selected):
        raise ValueError('Free window would combine both recordings')
    return {'sourceRange': [a, b], 'first': selected[0], 'last': selected[-1],
            'words': words[selected[0]:selected[-1] + 1],
            'leftAtEvidenceEdge': False, 'rightAtEvidenceEdge': False}


def _unresolved_ranges(source):
    ranges = []
    for value in source.get('unresolved', []):
        if not isinstance(value, dict):
            raise ValueError('Invalid unresolved source observation')
        raw = [value['word']] if isinstance(value.get('word'), dict) else value.get('words', [value])
        if not isinstance(raw, list) or any(not isinstance(word, dict) for word in raw):
            raise ValueError('Invalid unresolved source range')
        a = value.get('startMs', min((word.get('startMs', math.nan) for word in raw), default=math.nan))
        b = value.get('endMs', max((word.get('endMs', math.nan) for word in raw), default=math.nan))
        if not all(isinstance(number, (float, int)) and math.isfinite(number) for number in [a, b]) or b < a:
            raise ValueError('Unlocated unresolved source observation')
        ranges.append([a / 1000 - .03, b / 1000 + .03])
    return ranges


def plan_confirmation_window(source, candidate, side, max_window_sec=19, context_units=0):
    """Use a separate quiet-bounded take, with EVERY intersecting source word."""
    try:
        if side not in ['earlier', 'retain']:
            raise ValueError('Unsupported confirmation side')
        if (not isinstance(max_window_sec, (int, float)) or not math.isfinite(max_window_sec)
                or max_window_sec <= 0):
            raise ValueError('Invalid maximum recognition window')
        first, last = ((candidate['first'], candidate['last']) if side == 'earlier'
                       else (candidate['replacementFirst'], candidate['replacementLast']))
        if not _index(first) or not _index(last) or not 0 <= first <= last < len(source['words']):
            raise ValueError('Missing target source word indices')
        other_first, other_last = ((candidate['replacementFirst'], candidate['replacementLast']) if side == 'earlier'
                                   else (candidate['first'], candidate['last']))
        if (not _index(other_first) or not _index(other_last)
                or not 0 <= other_first <= other_last < len(source['words'])
                or not (other_last < first or other_first > last)):
            raise ValueError('Missing separate opposite take')
        if context_units != 0:
            raise ValueError('Free recognition must not add neighboring recordings')
        if candidate.get('src') != source.get('src'):
            raise ValueError('Candidate belongs to a different source')
        words = [{**word, 'id': index} for index, word in enumerate(source['words'])]
        target_text = ''.join(word['word'] for word in words[first:last + 1])
        if normalize_confirmation_text(target_text) != normalize_confirmation_text(candidate[side]['text']):
            raise ValueError('Candidate text does not equal selected observed source words')
        window = _separate_take_window(words, first, last, other_first, other_last, source['quiet'], source['range'])
        a, b = window['sourceRange']
        if any(min(b, end) > max(a, start) for start, end in _unresolved_ranges(source)):
            raise ValueError('Separate free window includes unresolved source audio')
        if b - a > max_window_sec:
            return {'ready': False, 'reason': 'complete-free-window-too-long', 'range': [a, b],
                    'maximumWindowSec': max_window_sec, 'expectedTextSupplied': False}
        expected = ''.join(word['word'] for word in window['words'])
        if not normalize_confirmation_text(expected):
            raise ValueError('Empty complete recognition window')
        return {'ready': True, 'reason': 'complete-source-window-planned', 'range': [a, b],
                'expectedText': expected, 'windowFirst': window['first'], 'windowLast': window['last'],
                'wordIds': [word['id'] for word in window['words']], 'targetWordRange': [first, last],
                'leftAtEvidenceEdge': window['leftAtEvidenceEdge'], 'rightAtEvidenceEdge': window['rightAtEvidenceEdge'],
                'windowPolicy': 'one complete take between measured quiet edges; opposite take excluded',
                'expectedTextSupplied': False}
    except (ValueError, TypeError, KeyError, IndexError, OverflowError) as error:
        return {'ready': False, 'reason': 'invalid-complete-free-window', 'detail': str(error), 'expectedTextSupplied': False}


def confirm_candidate(candidate, source, recognize, cache=None):
    """recognize receives ONLY actual source start/end seconds, never text."""
    cache = {} if cache is None else cache
    observations = {}
    for side in ['earlier', 'retain']:
        plan = plan_confirmation_window(source, candidate, side)
        if not plan['ready']:
            observations[side] = {**plan, 'confirmed': False}
            continue
        a, b = plan['range']
        key = (source.get('src'), source.get('sourceSha256'), source.get('wav'), a, b)
        if key not in cache:
            try:
                value = recognize(a, b)
                if not isinstance(value, dict) or not isinstance(value.get('text'), str):
                    raise ValueError('Free recognizer did not return complete text')
                cache[key] = copy.deepcopy(value)
            except Exception as error:
                cache[key] = {'error': str(error)}
        observed = copy.deepcopy(cache[key])
        if 'error' in observed:
            observations[side] = {**plan, 'confirmed': False, 'reason': 'complete-free-observation-failed', 'detail': observed['error']}
            continue
        observations[side] = {**plan, **compare_complete_window(plan['expectedText'], observed['text']),
                              'words': observed.get('words', []), 'recognition': observed,
                              'recognitionInput': 'source-zero audio only'}
    confirmed = all(value.get('confirmed') is True for value in observations.values())
    return {'id': candidate.get('id'), 'confirmed': confirmed,
            'reason': 'both-complete-free-windows-confirmed' if confirmed else 'complete-free-window-not-confirmed',
            'version': CONFIRMATION_VERSION, 'expectedTextSupplied': False, 'observations': observations}
