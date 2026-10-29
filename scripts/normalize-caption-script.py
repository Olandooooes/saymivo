"""Normalize display script only; leave source recognition and word times alone."""
import json
import sys
from opencc import OpenCC

words = json.load(sys.stdin)
converter = OpenCC('t2s')
joined = converter.convert(''.join(words))
if len(joined) == sum(map(len, words)):
    result = []
    cursor = 0
    for word in words:
        result.append(joined[cursor:cursor + len(word)])
        cursor += len(word)
else:
    result = [converter.convert(word) for word in words]
print(json.dumps(result, ensure_ascii=False))
