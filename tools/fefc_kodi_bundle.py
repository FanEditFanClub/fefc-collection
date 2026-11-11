#!/usr/bin/env python3
"""Copy the FEFC add-on, skin, sounds, intro, and version file into a stock Kodi tree.

Used by the macOS and webOS packagers. The Android APK builder is separate and is not called from here.
"""
import json
import os
import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCRIPTED = ('plugin.video.fefc', 'repository.fefc', 'skin.fefc', 'resource.uisounds.fefc')
BINARY_EXT = {'.so', '.dll', '.dylib', '.pyd'}
DEFAULTS = (
    ('interface', 'skin', '1', 'lookandfeel.skin', 'skin.fefc'),
    ('system', 'audio', '2', 'audiooutput.guisoundmode', '2'),
    ('system', 'audio', '2', 'lookandfeel.soundskin', 'resource.uisounds.fefc'),
    ('media', 'video', '1', 'myvideos.selectaction', '3'),
)


def find_kodi_root(start):
    """Directory that contains addons/skin.estuary and system/addon-manifest.xml."""
    start = Path(start)
    for dirpath, _, filenames in os.walk(start):
        if 'addon-manifest.xml' not in filenames:
            continue
        system = Path(dirpath)
        if system.name != 'system':
            continue
        root = system.parent
        if (root / 'addons' / 'skin.estuary').is_dir():
            return root
    raise SystemExit('no stock Kodi tree under %s' % start)


def ensure_setting(xml, section, category, group, sid, default):
    """Set one Kodi default. A later platform file overrides settings.xml, which is what the Android builder relies on."""
    if re.search(r'<setting id="%s"' % re.escape(sid), xml):
        def repl(m):
            body = m.group(0)
            if '<default>' in body:
                return re.sub(r'<default>.*?</default>', '<default>%s</default>' % default, body, count=1, flags=re.S)
            return body.replace('</setting>', '<default>%s</default></setting>' % default, 1)
        return re.sub(r'<setting id="%s"[^>]*>.*?</setting>' % re.escape(sid), repl, xml, count=1, flags=re.S)
    setting = '<setting id="%s">\n          <default>%s</default>\n        </setting>' % (sid, default)
    chunk = '    <category id="%s">\n      <group id="%s">\n        %s\n      </group>\n    </category>' % (category, group, setting)
    sec = re.search(r'(<section id="%s"[^>]*>)' % re.escape(section), xml)
    if sec:
        return xml.replace(sec.group(1), sec.group(1) + '\n' + chunk, 1)
    block = '  <section id="%s">\n%s\n  </section>\n' % (section, chunk)
    if '</settings>' not in xml:
        raise SystemExit('settings file has no </settings>')
    return xml.replace('</settings>', block + '</settings>', 1)


def apply_fefc_defaults(xml_text):
    for item in DEFAULTS:
        xml_text = ensure_setting(xml_text, *item)
    return xml_text


def enable_addons(xml_text, addon_ids):
    extra = []
    for aid in addon_ids:
        if '<addon>%s</addon>' % aid not in xml_text:
            extra.append('  <addon>%s</addon>\n' % aid)
    if '</addons>' not in xml_text:
        raise SystemExit('addon-manifest.xml has no </addons>')
    return xml_text.replace('</addons>', ''.join(extra) + '</addons>')


def settings_path(kodi_root, platform):
    name = 'darwin_osx.xml' if platform == 'macos' else 'linux.xml'
    return Path(kodi_root) / 'system' / 'settings' / name


def scripted_addon_problems(addon_dir):
    """FEFC add-ons must stay Python, XML, and wav. webOS cannot load binary add-ons."""
    problems = []
    addon_dir = Path(addon_dir)
    if not addon_dir.is_dir():
        return ['missing ' + str(addon_dir)]
    for dirpath, _, files in os.walk(addon_dir):
        for fn in files:
            if Path(fn).suffix.lower() in BINARY_EXT:
                problems.append(os.path.join(dirpath, fn))
    xmlp = addon_dir / 'addon.xml'
    if not xmlp.is_file():
        problems.append('no addon.xml in ' + addon_dir.name)
        return problems
    text = xmlp.read_text(encoding='utf-8', errors='ignore')
    if 'xbmc.binary' in text or re.search(r'library_[a-z0-9]+\.so', text):
        problems.append(addon_dir.name + ' declares a binary library')
    if not re.search(r'<platform>\s*all\s*</platform>', text):
        problems.append(addon_dir.name + ' is not platform all')
    return problems


def load_version(root=ROOT):
    rec = {}
    bj = root / 'kodi-src' / 'fefc-build.json'
    if bj.is_file():
        rec.update(json.loads(bj.read_text(encoding='utf-8')))
    vf = root / 'kodi-src' / 'fefc-version.txt'
    if vf.is_file():
        rec['version'] = vf.read_text(encoding='utf-8').strip()
    return rec


def stage_fefc(kodi_root, platform, arch, pkg, kodi_version, build=None, src='local', skin=True):
    """Inject FEFC into a stock Kodi resource directory. Returns the build record written into the tree."""
    kodi_root = Path(kodi_root)
    addons = kodi_root / 'addons'
    for aid in ('plugin.video.fefc', 'repository.fefc'):
        src_dir = ROOT / 'kodi-src' / aid
        if not src_dir.is_dir():
            raise SystemExit('missing ' + str(src_dir))
        dest = addons / aid
        if dest.exists():
            shutil.rmtree(dest)
        shutil.copytree(src_dir, dest, ignore=shutil.ignore_patterns('__pycache__', '*.pyc'))
    if skin:
        tools = str(Path(__file__).resolve().parent)
        if tools not in sys.path:
            sys.path.insert(0, tools)
        import build_kodi_skin
        import kodi_navsfx
        est = addons / 'skin.estuary'
        if not est.is_dir():
            raise SystemExit('stock skin.estuary is not in this Kodi tree')
        build_kodi_skin.build(est, addons / 'skin.fefc')
        print('uisounds:', kodi_navsfx.build(addons / 'resource.uisounds.fefc'))
    sp = settings_path(kodi_root, platform)
    sp.parent.mkdir(parents=True, exist_ok=True)
    current = sp.read_text(encoding='utf-8') if sp.is_file() else '<?xml version="1.0" encoding="utf-8" ?>\n<settings version="1">\n</settings>\n'
    sp.write_text(apply_fefc_defaults(current), encoding='utf-8')
    manifest = kodi_root / 'system' / 'addon-manifest.xml'
    if not manifest.is_file():
        raise SystemExit('missing addon-manifest.xml')
    manifest.write_text(enable_addons(manifest.read_text(encoding='utf-8'), SCRIPTED), encoding='utf-8')
    keymaps = kodi_root / 'system' / 'keymaps'
    keymaps.mkdir(parents=True, exist_ok=True)
    nav = ROOT / 'kodi-src' / 'plugin.video.fefc' / 'resources' / 'keymaps' / 'fefc-nav.xml'
    if nav.is_file():
        shutil.copy(nav, keymaps / 'fefc-nav.xml')
    media = kodi_root / 'media'
    media.mkdir(parents=True, exist_ok=True)
    intro = ROOT / 'assets' / 'intro-tv.mp4'
    if intro.is_file():
        shutil.copy(intro, media / 'fefc-intro.mp4')
    for src_name, dst_name in (('home-wall.mp4', 'fefc-home-wall.mp4'), ('home-wall-silent.mp4', 'fefc-home-wall-silent.mp4')):
        src_file = ROOT / 'assets' / src_name
        if src_file.is_file():
            shutil.copy(src_file, media / dst_name)
    notice = ROOT / 'kodi-src' / 'FEFC-NOTICE.txt'
    if notice.is_file():
        shutil.copy(notice, kodi_root / 'FEFC-NOTICE.txt')
    rec = load_version()
    if build is not None:
        rec['build'] = int(build)
    rec['kodi'] = kodi_version or rec.get('kodi') or ''
    rec['version'] = rec.get('version') or ''
    rec['src'] = src
    rec['pkg'] = pkg
    rec['platform'] = platform
    rec['arch'] = arch
    (kodi_root / 'fefc-build.json').write_text(json.dumps(rec) + '\n', encoding='utf-8')
    problems = []
    for aid in (SCRIPTED if skin else ('plugin.video.fefc', 'repository.fefc')):
        problems.extend(scripted_addon_problems(addons / aid))
    if problems:
        raise SystemExit('FEFC add-ons are not script-only:\n' + '\n'.join(problems))
    return rec
