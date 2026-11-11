#!/usr/bin/env python3
"""Add the Samsung Tizen download to version.json.

Refuses to run unless FEFC_PUBLISH_PLATFORM=tizen. Mac and webOS are not written.
Does not change Android fields. Does not upload anything; the workflow uploads after this writes the file.
"""
import argparse
import hashlib
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fefc_release_manifest as manifest


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def entry(path, filename, abi='', note=''):
    info = {
        'url': manifest.public_url(filename),
        'sha256': sha256_file(path),
        'size': os.path.getsize(path),
        'filename': filename,
    }
    if abi:
        info['abi'] = abi
    if note:
        info['note'] = note
    return info


def main():
    if os.environ.get('FEFC_PUBLISH_PLATFORM') != 'tizen':
        print('FEFC_PUBLISH_PLATFORM must be tizen. Mac and webOS are not published from this script.', file=sys.stderr)
        return 2
    p = argparse.ArgumentParser()
    p.add_argument('--tizen', required=True)
    p.add_argument('--out', required=True)
    args = p.parse_args()
    current = manifest.fetch_previous()
    if not current or 'packages' not in current:
        print('refusing to publish without the current Android version.json', file=sys.stderr)
        return 1
    before = json.loads(json.dumps(current))
    out = manifest.attach_platform(current, 'tizen', entry(
        args.tizen, 'FEFC.wgt',
        note='Unsigned widget. Sign it with your own Samsung certificate before installing.'))
    platforms = out.get('platforms') or {}
    if set(platforms) - set((before.get('platforms') or {})) - {'tizen'}:
        print('refusing to add a platform other than tizen', file=sys.stderr)
        return 1
    if not manifest.android_fields_unchanged(before, out):
        print('Android fields changed. Not writing.', file=sys.stderr)
        return 1
    with open(args.out, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False)
    print('wrote', args.out)
    return 0


if __name__ == '__main__':
    sys.exit(main())
