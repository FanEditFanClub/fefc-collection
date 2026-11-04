#!/usr/bin/env python3
"""Build the Kodi repository from kodi-src/<addon-id>/ -> kodi-repo/ (addons.xml, addons.xml.md5, <id>/<id>-<ver>.zip, icons).
Deterministic zips (fixed mtimes) so rebuilding without changes produces no diff. Also writes kodi-repo/repository.fefc.zip
(latest repo add-on, stable name for 'Install from zip'). Usage: python3 tools/build_kodi_repo.py"""
import hashlib, os, re, shutil, sys, zipfile
import xml.etree.ElementTree as ET
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC, OUT = os.path.join(ROOT, 'kodi-src'), os.path.join(ROOT, 'kodi-repo')
FIXED = (2026, 1, 1, 0, 0, 0)

def build_zip(addon_id, ver, folder, dest):
    with zipfile.ZipFile(dest, 'w', zipfile.ZIP_DEFLATED) as z:
        for dp, dn, fn in os.walk(folder):
            dn[:] = sorted(d for d in dn if d != '__pycache__')
            for f in sorted(fn):
                if f.endswith(('.pyc', '.pyo')) or f == '.DS_Store':
                    continue
                full = os.path.join(dp, f)
                arc = addon_id + '/' + os.path.relpath(full, folder).replace(os.sep, '/')
                zi = zipfile.ZipInfo(arc, FIXED); zi.compress_type = zipfile.ZIP_DEFLATED; zi.external_attr = 0o644 << 16
                with open(full, 'rb') as fh:
                    z.writestr(zi, fh.read())

def main():
    os.makedirs(OUT, exist_ok=True)
    blocks = []
    for aid in sorted(os.listdir(SRC)):
        folder = os.path.join(SRC, aid)
        axml = os.path.join(folder, 'addon.xml')
        if not os.path.isfile(axml):
            continue
        root = ET.parse(axml).getroot()
        assert root.tag == 'addon' and root.get('id') == aid, aid
        ver = root.get('version')
        assert re.match(r'^\d+(\.\d+){1,3}$', ver), ver
        d = os.path.join(OUT, aid); os.makedirs(d, exist_ok=True)
        for f in os.listdir(d):
            if f.endswith('.zip'):
                os.remove(os.path.join(d, f))
        build_zip(aid, ver, folder, os.path.join(d, '%s-%s.zip' % (aid, ver)))
        for a in ('icon.png', 'fanart.jpg'):
            p = os.path.join(folder, 'resources', a)
            if os.path.isfile(p):
                shutil.copyfile(p, os.path.join(d, a))
        txt = open(axml, encoding='utf-8').read()
        blocks.append(re.sub(r'^<\?xml[^>]*\?>\s*', '', txt).strip())
        shutil.copyfile(os.path.join(d, '%s-%s.zip' % (aid, ver)), os.path.join(OUT, aid + '.zip'))   # stable 'latest' name
        print('built', aid, ver)
    xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<addons>\n' + '\n'.join(blocks) + '\n</addons>\n'
    ET.fromstring(xml)  # must parse
    open(os.path.join(OUT, 'addons.xml'), 'w', encoding='utf-8', newline='\n').write(xml)
    open(os.path.join(OUT, 'addons.xml.md5'), 'w').write(hashlib.md5(xml.encode('utf-8')).hexdigest())
    print('addons.xml md5', open(os.path.join(OUT, 'addons.xml.md5')).read())

if __name__ == '__main__':
    main()
