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
    block['version'] = manifest.get('version')
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


def main(argv):
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
