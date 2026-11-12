#!/usr/bin/env python3
"""Fail if a built FEFC APK is missing UI cue wavs or the sound-skin mapping.

Both packages (org.xbmc.kodi and com.fefc.kodi) must be checked. The wavs live
at assets/addons/resource.uisounds.fefc/resources/. android.xml must default
GUI sounds to always (2) and the FEFC sound skin, or the wall video mutes them.
"""
import sys
import zipfile

sys.path.insert(0, 'kodi-src/plugin.video.fefc/resources/lib')
import cues


def check(apk_path):
    z = zipfile.ZipFile(apk_path)
    names = set(z.namelist())
    missing = [p for p in cues.apk_asset_paths() if p not in names]
    if missing:
        raise SystemExit('%s is missing cue assets: %s' % (apk_path, ', '.join(missing)))
    xml = z.read('assets/addons/resource.uisounds.fefc/resources/sounds.xml').decode('utf-8')
    for action, filename in cues.SKIN_ACTIONS:
        needle = '<name>%s</name><file>%s</file>' % (action, filename)
        if needle not in xml.replace(' ', '').replace('\t', '').replace('\n', ''):
            # The generated file has tabs and newlines between the tags. Match the pair loosely.
            if ('<name>%s</name>' % action) not in xml or ('<file>%s</file>' % filename) not in xml:
                raise SystemExit('%s sounds.xml has no %s -> %s' % (apk_path, action, filename))
    settings = []
    for name in names:
        if name.startswith('assets/system/settings/') and name.endswith('.xml'):
            settings.append(z.read(name).decode('utf-8', 'replace'))
    blob = '\n'.join(settings)
    if 'resource.uisounds.fefc' not in blob:
        raise SystemExit('%s settings do not select %s' % (apk_path, cues.SOUND_SKIN))
    if '<default>%s</default>' % cues.GUI_SOUND_ALWAYS not in blob and '<default>2</default>' not in blob:
        raise SystemExit('%s settings do not default guisoundmode to always' % apk_path)
    for name in cues.REQUIRED_WAVS:
        data = z.read('assets/addons/resource.uisounds.fefc/resources/' + name)
        if len(data) < 100 or data[:4] != b'RIFF':
            raise SystemExit('%s %s is not a wav' % (apk_path, name))
    print('cues ok', apk_path)


def main(argv):
    if len(argv) < 2:
        raise SystemExit('usage: verify_apk_cues.py FEFC-Kodi.apk FEFC.apk')
    for path in argv[1:]:
        check(path)
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
