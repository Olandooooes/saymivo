"""Source <-> output time mapping for a cutlist (keep = [[a, b], ...] in source seconds)."""
import json

def load(path): return json.load(open(path))['keep']

def s2o(t, keep):
    """source time -> output time (None if t falls inside a removed span)"""
    o = 0.0
    for a, b in keep:
        if t < a: return None
        if t <= b: return o + (t - a)
        o += b - a
    return None

def o2s(t, keep):
    """output time -> source time"""
    o = 0.0
    for a, b in keep:
        if t <= o + (b - a): return a + (t - o)
        o += b - a
    return keep[-1][1]

def joins(keep):
    """output times of every cut (used for jump-cut punch-ins)"""
    o, out = 0.0, []
    for a, b in keep[:-1]: o += b - a; out.append(round(o, 3))
    return out
