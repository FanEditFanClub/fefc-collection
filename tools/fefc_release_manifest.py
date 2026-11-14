#!/usr/bin/env python3
"""version.json for the FEFC Kodi app.

The Android fields are the ones kodi-apk.yml has published for org.xbmc.kodi and com.fefc.kodi.
platforms is added beside them. Old Android builds ignore unknown keys. A Mac, webOS, or Tizen
package is never written into url, sha256, size, or packages.
"""
import json
import os
import sys
import datetime
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APK_URL = 'https://fefc-collection.pages.dev/kodi-app/FEFC-Kodi.apk'
PHONE_URL = 'https://fefc-collection.pages.dev/kodi-app/FEFC.apk'
VERSION_URL = 'https://fefc-collection.pages.dev/kodi-app/version.json'
ANDROID_FIELDS = ('kodi', 'build', 'version', 'src', 'sha256', 'size', 'url', 'built', 'notes', 'packages', 'changelog')
HOST = 'https://fefc-collection.pages.dev/kodi-app/'


def android_manifest(kodi, build, version, src, sha256, size, sha256_phone, size_phone, changelog, built, notes=None):
    return {
        'kodi': kodi,
        'build': int(build),
        'version': version,
        'src': src,
        'sha256': sha256,
        'size': int(size),
        'url': APK_URL,
        'built': built,
        'notes': notes or ('FEFC app %s on Kodi %s' % (version, kodi)),
        'packages': {
            'org.xbmc.kodi': {'url': APK_URL, 'sha256': sha256, 'size': int(size)},
            'com.fefc.kodi': {'url': PHONE_URL, 'sha256': sha256_phone, 'size': int(size_phone)},
        },
        'changelog': changelog,
    }


def preserving_platforms(manifest, previous):
    """Keep platforms from the file already on the server. Android fields stay as written."""
    out = dict(manifest)
    plats = previous.get('platforms') if isinstance(previous, dict) else None
    if isinstance(plats, dict) and plats:
        out['platforms'] = plats
    return out


def android_fields_unchanged(before, after):
    return all(before.get(k) == after.get(k) for k in ANDROID_FIELDS)


def attach_platform(manifest, platform, info, arch=''):
    """Add one download under platforms. Does not change Android fields."""
    if set(ANDROID_FIELDS) - set(manifest):
        raise SystemExit('version.json is missing Android fields')
    out = dict(manifest)
    out['packages'] = json.loads(json.dumps(manifest.get('packages') or {}))
    plats = json.loads(json.dumps(manifest.get('platforms') or {}))
    block = plats.get(platform) or {}
    if not isinstance(block, dict):
        block = {}
    # The widget's own record wins. Copying the live version.json here stamped
    # 0.6.4's file with 0.6.3 Beta build 52, because the Android publish had not
    # landed yet.
    if info.get('version') not in (None, ''):
        block['version'] = info['version']
    else:
        block['version'] = manifest.get('version')
    if info.get('build') not in (None, ''):
        block['build'] = int(info['build'])
    else:
        block['build'] = manifest.get('build')
    block['kodi'] = info.get('kodi', manifest.get('kodi'))
    entry = {
        'url': info['url'],
        'sha256': info['sha256'],
        'size': int(info['size']),
        'filename': info['filename'],
    }
    if info.get('abi'):
        entry['abi'] = info['abi']
    if info.get('note'):
        entry['note'] = info['note']
    if arch:
        archs = dict(block.get('arch') or {})
        archs[arch] = entry
        block['arch'] = archs
    else:
        block.update(entry)
    plats[platform] = block
    out['platforms'] = plats
    if not android_fields_unchanged(manifest, out):
        raise SystemExit('refusing to change Android version.json fields')
    return out


def public_url(filename):
    return HOST + filename


def fetch_previous(url=VERSION_URL):
    try:
        req = urllib.request.Request(url + '?ts=%s' % os.getpid(), headers={'User-Agent': 'FEFC-Kodi-Build'})
        with urllib.request.urlopen(req, timeout=30) as r:
            data = json.loads(r.read().decode('utf-8'))
        return data if isinstance(data, dict) else {}
    except Exception as e:
        print('previous version.json not merged (%s)' % e)
        return {}


def write_android(out_path):
    cl = json.load(open(os.path.join(ROOT, 'kodi-src', 'fefc-changelog.json'), encoding='utf-8')).get('versions', [])
    built = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    manifest = android_manifest(
        os.environ['KODI_VER'], os.environ['NEXT_BUILD'], os.environ['APP_VERSION'], os.environ['SRC_HASH'],
        os.environ['SHA'], os.environ['SIZE'], os.environ['SHA2'], os.environ['SIZE2'], cl, built)
    manifest = preserving_platforms(manifest, fetch_previous())
    if not android_fields_unchanged(android_manifest(
            os.environ['KODI_VER'], os.environ['NEXT_BUILD'], os.environ['APP_VERSION'], os.environ['SRC_HASH'],
            os.environ['SHA'], os.environ['SIZE'], os.environ['SHA2'], os.environ['SIZE2'], cl, built), manifest):
        raise SystemExit('Android fields changed while preserving platforms')
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, ensure_ascii=False)
    return manifest


MAC_IMAGES = (('arm64', 'FEFC-Mac.dmg'), ('x86_64', 'FEFC-Mac-Intel.dmg'))
MAC_NOTE = 'Ad-hoc signed, not notarized. Right-click FEFC.app > Open the first time.'


def _sha256(path):
    import hashlib
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def mac_release_errors(report, path, build, version):
    """Problems when a Mac image's build report does not describe this release. Empty means it matches."""
    errors = []
    if int(report.get('fefc_build') or -1) != int(build):
        errors.append('%s build %r is not %s' % (path, report.get('fefc_build'), build))
    if str(report.get('fefc_version') or '') != str(version):
        errors.append('%s label %r is not %r' % (path, report.get('fefc_version'), version))
    if report.get('signed') != 'adhoc':
        errors.append('%s is not ad-hoc signed' % path)
    if report.get('platform') != 'macos':
        errors.append('%s is not a macOS build' % path)
    if os.path.isfile(path):
        if _sha256(path) != report.get('sha256') or os.path.getsize(path) != int(report.get('bytes') or 0):
            errors.append('%s does not match its report' % path)
    else:
        errors.append('missing ' + path)
    return errors


def with_macos(manifest, images, build, version, kodi):
    """platforms.macos describes exactly these images (arch -> (path, report)). Nothing else changes.
    With no images the macOS entry is removed, so a Mac never downloads an image from an older build."""
    out = json.loads(json.dumps(manifest))
    plats = out.get('platforms') or {}
    plats.pop('macos', None)
    if plats:
        out['platforms'] = plats
    else:
        out.pop('platforms', None)
    for arch, (path, report) in images.items():
        name = os.path.basename(path)
        out = attach_platform(out, 'macos', {
            'url': public_url(name), 'sha256': report['sha256'], 'size': int(report['bytes']), 'filename': name,
            'version': version, 'build': int(build), 'kodi': kodi, 'note': MAC_NOTE}, arch)
    if not android_fields_unchanged(manifest, out):
        raise SystemExit('refusing to change Android version.json fields')
    return out


def attach_macos(argv):
    def arg(name, default=None):
        return argv[argv.index(name) + 1] if name in argv else default
    path, folder = arg('--manifest'), arg('--dir', 'dist')
    build, version, kodi, ok = arg('--build'), arg('--version'), arg('--kodi'), arg('--ok', 'false') == 'true'
    manifest = json.load(open(path, encoding='utf-8'))
    images = {}
    if ok:
        errors = []
        for arch, name in MAC_IMAGES:
            img = os.path.join(folder, name)
            report = json.load(open(img + '.report.json', encoding='utf-8')) if os.path.isfile(img + '.report.json') else {}
            errors += mac_release_errors(report, img, build, version)
            images[arch] = (img, report)
        if errors:
            raise SystemExit('Mac images do not match this release:\n' + '\n'.join(errors))
    out = with_macos(manifest, images, build, version, kodi)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False)
    print('platforms.macos', 'set for ' + ', '.join(sorted(images)) if images else 'removed (no Mac images in this release)')
    return 0


def main(argv):
    if len(argv) >= 2 and argv[1] == 'attach-macos':
        return attach_macos(argv)
    if len(argv) >= 2 and argv[1] == 'write-android':
        out = 'version.json'
        if '--out' in argv:
            out = argv[argv.index('--out') + 1]
        write_android(out)
        print('wrote', out)
        return 0
    print('usage: fefc_release_manifest.py write-android --out version.json', file=sys.stderr)
    return 2


if __name__ == '__main__':
    sys.exit(main(sys.argv))
