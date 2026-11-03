"""Convert comparison copies only, using the existing local OpenCC install."""
import hashlib
import importlib.metadata
import json
from pathlib import Path
import platform
import sys


def digest(file):
    return hashlib.sha256(file.read_bytes()).hexdigest()


def convert_comparison_texts(texts):
    import opencc
    from opencc import OpenCC
    if not isinstance(texts, list) or any(not isinstance(text, str) for text in texts):
        raise ValueError('Expected an array of original comparison texts')
    package = Path(opencc.__file__).resolve().parent
    config_file = package / 'config/t2s.json'
    config = json.loads(config_file.read_text())
    dictionary_files = set()

    def discover(value):
        if isinstance(value, dict):
            if 'file' in value:
                dictionary_files.add(value['file'])
            for item in value.values():
                discover(item)
        elif isinstance(value, list):
            for item in value:
                discover(item)

    discover(config)
    try:
        version = importlib.metadata.version('opencc-python-reimplemented')
    except importlib.metadata.PackageNotFoundError:
        version = 'unreported'
    converter = OpenCC('t2s')
    return {'texts': [converter.convert(text) for text in texts], 'normalization': {
        'version': 'opencc-t2s-comparison-v1', 'method': 'OpenCC t2s; comparison copies only',
        'python': platform.python_version(), 'packageVersion': version,
        'scriptSha256': digest(Path(__file__)), 'configSha256': digest(config_file),
        'dictionaries': [{'name': name, 'sha256': digest(package / 'dictionary' / name)} for name in sorted(dictionary_files)],
        'implementation': [{'name': name, 'sha256': digest(package / name)} for name in ['__init__.py', 'opencc.py']],
        'rawRecognitionChanged': False, 'expectedTextSupplied': False}}


if __name__ == '__main__':
    request = json.load(sys.stdin)
    print(json.dumps(convert_comparison_texts(request['texts']), ensure_ascii=False))
