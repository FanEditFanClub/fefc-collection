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
    """Tizen's widget version is three numbers. The FEFC build number is the third component
    once a build exists, so a later package can replace an earlier one."""
    text = re.sub(r'(?i)\s*beta\s*$', '', str(version_label or '').strip())
    nums = [int(part) for part in re.findall(r'\d+', text)] or [0, 0, 0]
    while len(nums) < 3:
        nums.append(0)
    major, minor, patch = nums[0], nums[1], nums[2]
    third = max(patch, int(build or 0))
    return '%d.%d.%d' % (major, minor, third)


def stamp_config(text, widget_ver):
    return re.sub(r'(<widget\b[^>]*\bversion=")[^"]+"', r'\g<1>%s"' % widget_ver, text, count=1)


def write_icon(dest):
    from PIL import Image
    import kodi_brand
    dest.parent.mkdir(parents=True, exist_ok=True)
    kodi_brand.icon(512).convert('RGB').save(dest)


def build(out, build_num=None):
    out = Path(out)
    out.parent.mkdir(parents=True, exist_ok=True)
    rec = fefc_kodi_bundle.load_version()
    if build_num is not None:
        rec['build'] = int(build_num)
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
                    data = stamp_config(full.read_text(encoding='utf-8'), wver).encode('utf-8')
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
    args = p.parse_args()
    build(args.out, args.build)
    return 0


if __name__ == '__main__':
    sys.exit(main())
