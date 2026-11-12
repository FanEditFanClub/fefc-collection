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
import zipfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fefc_release_manifest as manifest


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def widget_record(path):
    with zipfile.ZipFile(path) as zipped:
        return json.loads(zipped.read('fefc-build.json').decode('utf-8'))


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
    if filename.endswith('.wgt'):
        record = widget_record(path)
        info['version'] = record.get('version')
        info['build'] = record.get('build')
    return info


def tizen_release_errors(block, record, file_sha, file_size, version_label, widget_ver):
    """Problems when platforms.tizen does not describe this widget. Empty means it matches."""
    import build_tizen_wgt
    errors = []
    block = block or {}
    record = record or {}
    if str(block.get('version') or '') != str(version_label):
        errors.append('platforms.tizen.version %r is not %r' % (block.get('version'), version_label))
    if str(record.get('version') or '') != str(version_label):
        errors.append('widget fefc-build.json version %r is not %r' % (record.get('version'), version_label))
    try:
        block_build = int(block.get('build'))
        record_build = int(record.get('build'))
    except (TypeError, ValueError):
        errors.append('build is missing')
        block_build = record_build = None
    if block_build is not None and block_build != record_build:
        errors.append('platforms.tizen.build %s is not widget build %s' % (block_build, record_build))
    if block.get('sha256') != file_sha:
        errors.append('platforms.tizen.sha256 does not match the widget file')
    try:
        if int(block.get('size')) != int(file_size):
            errors.append('platforms.tizen.size does not match the widget file')
    except (TypeError, ValueError):
        errors.append('size is missing')
    if record_build is not None:
        expected = build_tizen_wgt.widget_version(version_label, record_build)
        if widget_ver != expected:
            errors.append('widget version %s is not %s' % (widget_ver, expected))
    return errors


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
    info = entry(
        args.tizen, 'FEFC.wgt',
        note='Unsigned widget. Sign it with your own Samsung certificate before installing.')
    out = manifest.attach_platform(current, 'tizen', info)
    record = widget_record(args.tizen)
    with zipfile.ZipFile(args.tizen) as zipped:
        config = zipped.read('config.xml').decode('utf-8')
    import re
    stamped = re.search(r'<widget\b[^>]*\bversion="([^"]+)"', config)
    widget_ver = stamped.group(1) if stamped else ''
    label = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'kodi-src', 'fefc-version.txt'), encoding='utf-8').read().strip()
    errors = tizen_release_errors(
        (out.get('platforms') or {}).get('tizen'), record,
        info['sha256'], info['size'], label, widget_ver)
    if errors:
        print('refusing to publish a widget the manifest does not describe:', file=sys.stderr)
        for item in errors:
            print(' -', item, file=sys.stderr)
        return 1
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
