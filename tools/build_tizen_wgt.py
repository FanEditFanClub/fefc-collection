#!/usr/bin/env python3
"""Pack the unsigned Samsung Tizen TV widget (.wgt).

The widget is a zip of tizen/app. Tizen will not install it until it is signed with a Samsung
certificate profile (tizen package -t wgt -s <profile>). This script does not sign.

usage: build_tizen_wgt.py --out dist/FEFC.wgt
"""
import argparse
import hashlib
import json
import os
import re
import sys
import zipfile
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fefc_kodi_bundle

ROOT = Path(__file__).resolve().parent.parent
APP = ROOT / 'tizen' / 'app'


def widget_version(version_label, build):
    """Tizen's widget version is three numbers, each 0–255. The words people see stay
    the FEFC label (for example 0.6.3 Beta). The third number is the patch from that
    label, or the FEFC build number when that build is higher, so a later package
    can replace an earlier one. 0.6.3 Beta with build 51 is 0.6.51."""
    text = re.sub(r'(?i)\s*beta\s*$', '', str(version_label or '').strip())
    nums = [int(part) for part in re.findall(r'\d+', text)] or [0, 0, 0]
    while len(nums) < 3:
        nums.append(0)
    major, minor, patch = nums[0], nums[1], nums[2]
    third = patch if int(build or 0) <= patch else int(build)
    parts = (major, minor, third)
    if any(part < 0 or part > 255 for part in parts):
        raise SystemExit('Tizen widget version %d.%d.%d is outside 0–255' % parts)
    return '%d.%d.%d' % parts


def stamp_config(text, widget_ver, fefc_version):
    text = re.sub(r'(<widget\b[^>]*\bversion=")[^"]+"', r'\g<1>%s"' % widget_ver, text, count=1)
    desc = ('FEFC %s. The picture is the live FEFC site. Playback uses AVPlay when the TV provides it.'
            % fefc_version)
    return re.sub(r'(<description>)[^<]*(</description>)', r'\g<1>%s\g<2>' % desc, text, count=1)


def write_icon(dest):
    from PIL import Image
    import kodi_brand
    dest.parent.mkdir(parents=True, exist_ok=True)
    kodi_brand.icon(512).convert('RGB').save(dest)


def version_key(text):
    return tuple(int(part) for part in str(text).split('.'))


def choose_build(version_label, explicit, previous):
    """Build number stamped into the widget.

    --build 51 made 0.6.3, 0.6.4, and 0.6.5 all package version 0.6.51, so a TV
    that already had 0.6.51 would not install the new file. A new FEFC version
    takes one higher than the Android build and the published Tizen build, then
    keeps climbing until the three-number widget version is higher than the one
    already in version.json.
    """
    previous = previous if isinstance(previous, dict) else {}
    tizen = (previous.get('platforms') or {}).get('tizen') or {}
    if not isinstance(tizen, dict):
        tizen = {}

    def as_int(value):
        try:
            return int(value or 0)
        except (TypeError, ValueError):
            return 0

    android_build = as_int(previous.get('build'))
    tizen_build = as_int(tizen.get('build'))
    same_release = str(previous.get('version') or '').strip() == str(version_label or '').strip()
    if explicit is not None:
        build = int(explicit)
    elif same_release and android_build:
        build = android_build
    else:
        build = max(android_build, tizen_build) + 1
    floor = None
    if tizen.get('version') not in (None, '') and tizen.get('build') not in (None, ''):
        floor = version_key(widget_version(tizen.get('version'), tizen.get('build')))
    while floor is not None and version_key(widget_version(version_label, build)) <= floor:
        build += 1
        if build > 255:
            raise SystemExit('no Tizen build number left above %s' % '.'.join(str(n) for n in floor))
    return build


def published_record():
    """Live version.json, or {} when it cannot be read."""
    import urllib.request
    url = 'https://fefc-collection.pages.dev/kodi-app/version.json'
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'FEFC-Tizen-Build'})
        with urllib.request.urlopen(req, timeout=20) as resp:
            data = json.loads(resp.read().decode('utf-8'))
        return data if isinstance(data, dict) else {}
    except Exception as exc:
        print('published version.json not used (%s)' % exc)
        return {}


def published_build(version_label):
    """Build number from the live version.json when it names this same FEFC version.
    Returns None if the file cannot be read or the version string differs."""
    import urllib.request
    url = 'https://fefc-collection.pages.dev/kodi-app/version.json'
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'FEFC-Tizen-Build'})
        with urllib.request.urlopen(req, timeout=20) as resp:
            data = json.loads(resp.read().decode('utf-8'))
    except Exception as exc:
        print('published version.json not used (%s)' % exc)
        return None
    if str(data.get('version') or '').strip() != str(version_label or '').strip():
        print('published version %r does not match %r' % (data.get('version'), version_label))
        return None
    try:
        return int(data.get('build') or 0)
    except (TypeError, ValueError):
        return None


def build(out, build_num=None, use_published_build=False, previous=None):
    out = Path(out)
    out.parent.mkdir(parents=True, exist_ok=True)
    rec = fefc_kodi_bundle.load_version()
    if previous is None and (build_num is None or use_published_build):
        previous = published_record()
    rec['build'] = choose_build(rec.get('version'), build_num, previous or {})
    rec['platform'] = 'tizen'
    rec['pkg'] = 'tizen'
    rec['runtime'] = 'tizen-web'
    rec.setdefault('kodi', '')
    wver = widget_version(rec.get('version'), rec.get('build') or 0)
    if out.exists():
        out.unlink()
    with zipfile.ZipFile(out, 'w', compression=zipfile.ZIP_DEFLATED) as z:
        for dirpath, _, files in os.walk(APP):
            for fn in files:
                full = Path(dirpath) / fn
                rel = full.relative_to(APP).as_posix()
                if rel == 'config.xml':
                    data = stamp_config(full.read_text(encoding='utf-8'), wver, rec.get('version') or '').encode('utf-8')
                    z.writestr(rel, data)
                elif rel == 'icon.png':
                    continue
                else:
                    z.write(full, rel)
        # icon and the shared version record are generated, not hand-edited
        icon_path = out.with_suffix('.icon.png')
        write_icon(icon_path)
        z.write(icon_path, 'icon.png')
        icon_path.unlink()
        z.writestr('fefc-build.json', json.dumps(rec) + '\n')
    with zipfile.ZipFile(out) as z:
        names = set(z.namelist())
        for required in ('config.xml', 'index.html', 'icon.png', 'js/shell.js', 'js/version.js', 'fefc-build.json', 'css/shell.css'):
            if required not in names:
                raise SystemExit('wgt missing ' + required)
        if any(n.startswith('author-signature') or n.startswith('signature') for n in names):
            raise SystemExit('wgt was signed; this script only builds the unsigned package')
        config = z.read('config.xml').decode('utf-8')
        if 'version="%s"' % wver not in config:
            raise SystemExit('widget version was not stamped')
        if 'samsung.com/privilege/avplay' not in config or 'tv.inputdevice' not in config:
            raise SystemExit('config.xml is missing TV privileges')
    report = {
        'platform': 'tizen',
        'file': str(out),
        'bytes': out.stat().st_size,
        'sha256': hashlib.sha256(out.read_bytes()).hexdigest(),
        'widget_version': wver,
        'fefc_version': rec.get('version'),
        'fefc_build': rec.get('build'),
        'signed': False,
    }
    out.with_suffix('.report.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(report, indent=2))
    return report


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--out', default=str(ROOT / 'dist' / 'FEFC.wgt'))
    p.add_argument('--build', type=int, default=None)
    p.add_argument('--use-published-build', action='store_true',
                   help='If fefc-build.json has build 0, use version.json when it names the same FEFC version.')
    args = p.parse_args()
    build(args.out, args.build, use_published_build=args.use_published_build)
    return 0


if __name__ == '__main__':
    sys.exit(main())
