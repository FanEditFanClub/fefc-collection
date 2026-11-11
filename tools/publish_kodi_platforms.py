#!/usr/bin/env python3
"""Add macOS, webOS, and Tizen downloads to version.json.

Refuses to run unless FEFC_PUBLISH_NEW_PLATFORMS=true. Does not change Android fields.
Does not upload anything; the workflow uploads after this writes the file.
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
    if os.environ.get('FEFC_PUBLISH_NEW_PLATFORMS') != 'true':
        print('FEFC_PUBLISH_NEW_PLATFORMS is not true. Not writing a publishable version.json.', file=sys.stderr)
        return 2
    p = argparse.ArgumentParser()
    p.add_argument('--webos', required=True)
    p.add_argument('--macos-arm64', required=True)
    p.add_argument('--macos-x86_64', required=True)
    p.add_argument('--tizen', required=True)
    p.add_argument('--out', required=True)
    p.add_argument('--kodi-webos', default='21.0')
    args = p.parse_args()
    current = manifest.fetch_previous()
    if not current or 'packages' not in current:
        print('refusing to publish without the current Android version.json', file=sys.stderr)
        return 1
    before = json.loads(json.dumps(current))
    out = current
    out = manifest.attach_platform(out, 'webos', entry(
        args.webos, 'FEFC-webOS.ipk', abi='arm',
        note='Stable Kodi webOS package is 32-bit arm. Upstream has no 21.3 IPK; this build follows the newest stable IPK.'), arch='arm')
    out = manifest.attach_platform(out, 'webos', entry(
        args.webos, 'FEFC-webOS.ipk', abi='arm',
        note='Same file as arch arm. A 64-bit-only TV cannot install it.'), arch='all')
    out['platforms']['webos']['kodi'] = args.kodi_webos
    out = manifest.attach_platform(out, 'macos', entry(args.macos_arm64, 'FEFC-macOS-arm64.dmg'), arch='arm64')
    out = manifest.attach_platform(out, 'macos', entry(args.macos_x86_64, 'FEFC-macOS-x86_64.dmg'), arch='x86_64')
    out = manifest.attach_platform(out, 'tizen', entry(args.tizen, 'FEFC.wgt'))
    if not manifest.android_fields_unchanged(before, out):
        print('Android fields changed. Not writing.', file=sys.stderr)
        return 1
    with open(args.out, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False)
    print('wrote', args.out)
    return 0


if __name__ == '__main__':
    sys.exit(main())
