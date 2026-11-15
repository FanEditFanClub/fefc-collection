#!/usr/bin/env python3
"""Build an ad-hoc signed FEFC macOS app and disk image from the stock Kodi dmg.

Kodi 21 ships separate Intel (x86_64) and Apple Silicon (arm64) disk images. This does not
merge them into one universal binary. On a Mac the image is a UDZO dmg from hdiutil. On Linux
it is an HFS hybrid from genisoimage, which Finder may not mount; the GitHub macOS job is the
one that produces the image to install. On a Mac the app is ad-hoc signed (codesign -s -); there is
no Developer ID signature and no notarization.

usage: build_kodi_macos.py --arch arm64 --stock kodi-21.3-Omega-arm64.dmg --out dist/FEFC-macOS-arm64.dmg
       build_kodi_macos.py --arch all --cache /tmp/fefc-upstream --out dist
"""
import argparse
import hashlib
import json
import os
import plistlib
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fefc_kodi_bundle
import kodi_upstream

ROOT = Path(__file__).resolve().parent.parent
README = """FEFC for Mac
=============
This is an unofficial FEFC build of Kodi 21 with the FEFC skin, add-on, sounds, and settings
already installed. It is ad-hoc signed, not signed with an Apple Developer ID, and not notarized,
so macOS asks once before it opens.

1. Drag FEFC onto the Applications shortcut in this window. Replace the older FEFC app if macOS asks.
2. Right-click (or Control-click) FEFC.app in Applications, choose Open, then Open.
3. If macOS still says it cannot check the app, open System Settings > Privacy & Security,
   scroll down, and choose Open Anyway next to FEFC. Or run this once in Terminal:
   xattr -dr com.apple.quarantine /Applications/FEFC.app

FEFC-Mac.dmg is for Apple Silicon Macs (M1, M2, M3, M4). FEFC-Mac-Intel.dmg is for Intel Macs.
FEFC keeps its settings in ~/Library/Application Support/Kodi, the same folder a stock Kodi uses.
Updates use the same version.json and build number as the Fire TV and Android FEFC app.
"""


def count_symlinks(root):
    n = 0
    for dirpath, dirnames, filenames in os.walk(root):
        for name in dirnames + filenames:
            if os.path.islink(os.path.join(dirpath, name)):
                n += 1
    return n


def extract_dmg(dmg, dest):
    dest.mkdir(parents=True, exist_ok=True)
    if shutil.which('hdiutil'):
        mount = dest / 'mnt'
        mount.mkdir()
        subprocess.check_call(['hdiutil', 'attach', '-nobrowse', '-readonly', '-mountpoint', str(mount), str(dmg)])
        try:
            app = next(mount.glob('*.app'))
            subprocess.check_call(['ditto', str(app), str(dest / app.name)])
        finally:
            subprocess.check_call(['hdiutil', 'detach', str(mount)])
        return 'hdiutil', count_symlinks(dest)
    # Exit 2 is the stock disk image's shortcut to /Applications. 7z refuses that link and still unpacks the app.
    result = subprocess.run(['7z', 'x', '-y', '-o' + str(dest), str(dmg)])
    if result.returncode not in (0, 2):
        raise SystemExit('7z could not unpack %s (exit %s)' % (dmg, result.returncode))
    return '7z', count_symlinks(dest)


def find_app(tree):
    apps = [p for p in Path(tree).rglob('*.app') if (p / 'Contents' / 'Info.plist').is_file()]
    if not apps:
        raise SystemExit('no .app in %s' % tree)
    # Prefer the bundle whose name is Kodi.app, not a nested helper.
    apps.sort(key=lambda p: (p.name != 'Kodi.app', len(p.parts)))
    return apps[0]


def brand_plist(app):
    plist_path = app / 'Contents' / 'Info.plist'
    with plist_path.open('rb') as f:
        info = plistlib.load(f)
    ident = info.get('CFBundleIdentifier')
    info['CFBundleName'] = 'FEFC'
    info['CFBundleDisplayName'] = 'FEFC'
    if 'CFBundleGetInfoString' in info:
        info['CFBundleGetInfoString'] = 'FEFC (unofficial Kodi build)'
    with plist_path.open('wb') as f:
        plistlib.dump(info, f, fmt=plistlib.FMT_XML)
    return ident


ICON_FILE = 'FEFC.icns'


def brand_icon(app, work):
    """Give FEFC.app the FEFC icon (the Android/Fire TV launcher artwork, macOS-shaped): an .icns with every
    size from 16 to 1024 px built by iconutil, CFBundleIconFile pointing at it, and CFBundleIconName removed so
    macOS does not take the Kodi icon from Assets.car. Returns a dict describing what was done, or False."""
    import kodi_brand
    resources = app / 'Contents' / 'Resources'
    iconset = Path(work) / 'FEFC.iconset'
    kodi_brand.write_iconset(iconset)
    icns = resources / ICON_FILE
    if shutil.which('iconutil'):
        subprocess.check_call(['iconutil', '-c', 'icns', str(iconset), '-o', str(icns)])
        tool = 'iconutil'
    elif shutil.which('png2icns'):
        subprocess.check_call(['png2icns', str(icns)] + [str(iconset / n) for n in (
            'icon_16x16.png', 'icon_32x32.png', 'icon_128x128.png', 'icon_256x256.png', 'icon_512x512.png')])
        tool = 'png2icns'
    else:
        return False
    plist_path = app / 'Contents' / 'Info.plist'
    with plist_path.open('rb') as f:
        info = plistlib.load(f)
    old = {k: info.get(k) for k in ('CFBundleIconFile', 'CFBundleIconName')}
    # Older icon files that Kodi named get the same artwork, in case anything refers to them by name.
    for name in {str(old.get('CFBundleIconFile') or ''), 'kodi.icns', 'icon.icns'}:
        if name:
            other = resources / (name if name.endswith('.icns') else name + '.icns')
            if other.is_file() and other.name != ICON_FILE:
                shutil.copyfile(icns, other)
    info['CFBundleIconFile'] = ICON_FILE[:-5]
    info.pop('CFBundleIconName', None)
    with plist_path.open('wb') as f:
        plistlib.dump(info, f, fmt=plistlib.FMT_XML)
    return {'file': ICON_FILE, 'tool': tool, 'replaced': old, 'assets_car': (resources / 'Assets.car').is_file()}


# icns element types for every size from 16 to 1024 px (1x and 2x), as iconutil writes them.
# (iconutil writes 16 and 32 px as ic04/ic05 on current macOS; older tools use icp4/icp5 or is32/il32.)
ICNS_SIZES = {'icp4': 16, 'ic04': 16, 'is32': 16, 'icp5': 32, 'ic05': 32, 'il32': 32, 'ic11': 32, 'ic12': 64,
              'ic07': 128, 'ic13': 256, 'ic08': 256, 'ic14': 512, 'ic09': 512, 'ic10': 1024}
ICNS_REQUIRED_PX = (16, 32, 64, 128, 256, 512, 1024)


def icns_types(path):
    """Element type codes in an .icns file (a list, in file order)."""
    import struct
    data = Path(path).read_bytes()
    if data[:4] != b'icns' or struct.unpack('>I', data[4:8])[0] != len(data):
        raise SystemExit('not an icns file: %s' % path)
    types, i = [], 8
    while i + 8 <= len(data):
        t, n = data[i:i + 4].decode('latin-1'), struct.unpack('>I', data[i + 4:i + 8])[0]
        if n < 8:
            raise SystemExit('bad icns element in %s' % path)
        types.append(t)
        i += n
    return types


def adhoc_sign(app):
    """Ad-hoc sign the whole bundle. Apple Silicon refuses to run arm64 code whose signature no
    longer matches, and staging FEFC changes the bundle. Returns 'adhoc', or False off a Mac."""
    if not shutil.which('codesign'):
        return False
    subprocess.check_call(['xattr', '-cr', str(app)])
    subprocess.check_call(['codesign', '--force', '--deep', '--sign', '-', str(app)])
    subprocess.check_call(['codesign', '--verify', '--deep', '--strict', '--verbose=2', str(app)])
    return 'adhoc'


def verify_bundle(app, rec):
    """Structure checks on the finished FEFC.app. Raises on the first problem; returns what was checked."""
    import re as _re
    app = Path(app)
    with (app / 'Contents' / 'Info.plist').open('rb') as f:
        info = plistlib.load(f)
    if info.get('CFBundleName') != 'FEFC' or info.get('CFBundleDisplayName') != 'FEFC':
        raise SystemExit('Info.plist is not branded FEFC')
    exe = app / 'Contents' / 'MacOS' / info.get('CFBundleExecutable', '')
    if not exe.is_file() or not os.access(exe, os.X_OK):
        raise SystemExit('bundle executable missing: %s' % exe)
    kodi_root = app / 'Contents' / 'Resources' / 'Kodi'
    want = ROOT / 'kodi-src' / 'plugin.video.fefc' / 'addon.xml'
    want_ver = _re.search(r'<addon[^>]*\bversion="([^"]+)"', want.read_text(encoding='utf-8')).group(1)
    found = {}
    for aid in fefc_kodi_bundle.SCRIPTED:
        axml = kodi_root / 'addons' / aid / 'addon.xml'
        if not axml.is_file():
            raise SystemExit('missing add-on in bundle: ' + aid)
        found[aid] = _re.search(r'<addon[^>]*\bversion="([^"]+)"', axml.read_text(encoding='utf-8')).group(1)
    if found['plugin.video.fefc'] != want_ver:
        raise SystemExit('bundled plugin.video.fefc %s is not kodi-src %s' % (found['plugin.video.fefc'], want_ver))
    manifest = (kodi_root / 'system' / 'addon-manifest.xml').read_text(encoding='utf-8')
    for aid in fefc_kodi_bundle.SCRIPTED:
        if '<addon>%s</addon>' % aid not in manifest:
            raise SystemExit('add-on not enabled in addon-manifest.xml: ' + aid)
    settings = (kodi_root / 'system' / 'settings' / 'darwin_osx.xml').read_text(encoding='utf-8')
    if 'skin.fefc' not in settings or 'resource.uisounds.fefc' not in settings:
        raise SystemExit('darwin_osx.xml does not default to the FEFC skin and sounds')
    build = json.loads((kodi_root / 'fefc-build.json').read_text(encoding='utf-8'))
    if build.get('version') != rec.get('version') or build.get('build') != rec.get('build') or build.get('platform') != 'macos':
        raise SystemExit('fefc-build.json does not match this build')
    for name in ('fefc-intro.mp4',):
        if not (kodi_root / 'media' / name).is_file():
            raise SystemExit('missing media/' + name)
    if not (kodi_root / 'system' / 'keymaps' / 'zz-fefc-nav.xml').is_file():
        raise SystemExit('missing FEFC keymap')
    if info.get('CFBundleIconFile') not in ('FEFC', 'FEFC.icns') or 'CFBundleIconName' in info:
        raise SystemExit('Info.plist does not point at the FEFC icon: %r %r' % (info.get('CFBundleIconFile'), info.get('CFBundleIconName')))
    icns = app / 'Contents' / 'Resources' / ICON_FILE
    if not icns.is_file():
        raise SystemExit('missing ' + ICON_FILE)
    types = icns_types(icns)
    sizes = sorted({ICNS_SIZES[t] for t in types if t in ICNS_SIZES})
    if shutil.which('iconutil') and not set(ICNS_REQUIRED_PX) <= set(sizes):
        raise SystemExit('FEFC.icns lacks sizes: %s (types %s)' % (sorted(set(ICNS_REQUIRED_PX) - set(sizes)), types))
    return {'addons': found, 'executable': exe.name, 'build': build.get('build'), 'version': build.get('version'),
            'icon': {'file': ICON_FILE, 'types': types, 'px': sizes}}


def dmg_layout(work):
    """Background (1x and 2x), volume icon and Finder settings for the drag-install window."""
    import kodi_brand
    work = Path(work)
    bg1, bg2 = work / 'dmg-bg.png', work / 'dmg-bg@2x.png'
    kodi_brand.dmg_background(1).save(bg1)
    kodi_brand.dmg_background(2).save(bg2)
    background = str(bg1)
    if shutil.which('tiffutil'):
        tiff = work / 'dmg-bg.tiff'
        subprocess.check_call(['tiffutil', '-cathidpicheck', str(bg1), str(bg2), '-out', str(tiff)])
        background = str(tiff)
    w, h = kodi_brand.DMG_WINDOW
    return {
        'format': 'UDZO',
        'filesystem': 'HFS+',
        'symlinks': {'Applications': '/Applications'},
        'background': background,
        'window_rect': ((200, 120), (w, h)),
        'default_view': 'icon-view',
        'show_status_bar': False, 'show_tab_view': False, 'show_toolbar': False,
        'show_pathbar': False, 'show_sidebar': False, 'show_icon_preview': False,
        'arrange_by': None, 'grid_spacing': 100, 'label_pos': 'bottom', 'text_size': 13,
        'icon_size': kodi_brand.DMG_ICON_SIZE,
        'icon_locations': dict(kodi_brand.DMG_ICONS),
        'hide_extension': ['FEFC.app', 'Read Me.txt'],
    }


def pack_dmg(staging, out, work=None):
    """On a Mac with dmgbuild: a UDZO image whose window shows FEFC.app, an Applications shortcut and the
    Read Me on the FEFC background, with the FEFC volume icon. On a Mac without it: a plain hdiutil image
    (FEFC_REQUIRE_DMG_LAYOUT=1 makes that an error). Elsewhere it is a UDIF image whose contents are an
    ISO 9660 volume (Rock Ridge and Joliet), which needs the libdmg-hfsplus `dmg` tool."""
    out = Path(out).resolve()
    if out.exists():
        out.unlink()
    staging = Path(staging)
    if shutil.which('hdiutil'):
        try:
            import dmgbuild
        except ImportError:
            dmgbuild = None
        if dmgbuild is not None:
            settings = dmg_layout(work or staging.parent)
            settings['files'] = [str(p) for p in sorted(staging.iterdir())]
            icns = staging / 'FEFC.app' / 'Contents' / 'Resources' / ICON_FILE
            if icns.is_file():
                settings['icon'] = str(icns)
            dmgbuild.build_dmg(str(out), 'FEFC', settings=settings)
            return 'dmgbuild-udzo'
        if os.environ.get('FEFC_REQUIRE_DMG_LAYOUT') == '1':
            raise SystemExit('dmgbuild is not installed (pip install dmgbuild); refusing a disk image without the drag-install window')
        # No dmgbuild: still give the plain image an Applications shortcut.
        link = staging / 'Applications'
        if not link.exists():
            os.symlink('/Applications', link)
        subprocess.check_call(['hdiutil', 'create', '-volname', 'FEFC', '-srcfolder', str(staging), '-ov', '-format', 'UDZO', str(out)])
        return 'hdiutil-udzo'
    iso = out.with_suffix('.iso')
    if iso.exists():
        iso.unlink()
    subprocess.check_call(['genisoimage', '-V', 'FEFC', '-D', '-R', '-J', '-joliet-long', '-o', str(iso), str(staging)])
    tool = os.environ.get('FEFC_DMG_TOOL') or shutil.which('dmg')
    if not tool:
        raise SystemExit('wrote %s. A Mac build uses hdiutil. On Linux set FEFC_DMG_TOOL to the libdmg-hfsplus dmg tool.' % iso)
    subprocess.check_call([tool, str(iso), str(out)])
    iso.unlink()
    return 'udif-iso9660'


def build_one(stock, out, arch, kodi_version, build_num):
    work = Path(tempfile.mkdtemp(prefix='fefc-macos-'))
    try:
        tool, links = extract_dmg(Path(stock), work / 'src')
        app = find_app(work / 'src')
        ident = brand_plist(app)
        branded_icon = brand_icon(app, work)
        signature = app / 'Contents' / '_CodeSignature'
        if signature.is_dir():
            shutil.rmtree(signature)
        kodi_root = app / 'Contents' / 'Resources' / 'Kodi'
        rec = fefc_kodi_bundle.stage_fefc(kodi_root, 'macos', arch, 'macos-' + arch, kodi_version, build=build_num)
        intro = kodi_root / 'media' / 'fefc-intro.mp4'
        stock_intro = ROOT / 'assets' / 'intro-tv.mp4'
        if intro.is_file() and stock_intro.is_file():
            if hashlib.sha256(intro.read_bytes()).hexdigest() != hashlib.sha256(stock_intro.read_bytes()).hexdigest():
                raise SystemExit('intro video bytes changed')
        fefc_app = work / 'stage' / 'FEFC.app'
        fefc_app.parent.mkdir()
        shutil.move(str(app), str(fefc_app))
        signed = adhoc_sign(fefc_app)
        checks = verify_bundle(fefc_app, rec)
        (work / 'stage' / 'Read Me.txt').write_text(README, encoding='utf-8')
        packer = pack_dmg(work / 'stage', out, work)
        report = {
            'platform': 'macos',
            'arch': arch,
            'file': str(out),
            'bytes': Path(out).stat().st_size,
            'sha256': hashlib.sha256(Path(out).read_bytes()).hexdigest(),
            'kodi': kodi_version,
            'bundle_id': ident,
            'display_name': 'FEFC',
            'fefc_version': rec.get('version'),
            'fefc_build': rec.get('build'),
            'signed': signed,
            'notarized': False,
            'checks': checks,
            'extractor': tool,
            'packer': packer,
            'symlinks': links,
            'icon': branded_icon,
            'stock': str(stock),
            'installable_here': packer in ('dmgbuild-udzo', 'hdiutil-udzo', 'udif-iso9660'),
            'native_hfs': packer in ('dmgbuild-udzo', 'hdiutil-udzo'),
            'drag_install_window': packer == 'dmgbuild-udzo',
        }
        Path(str(out) + '.report.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
        print(json.dumps(report, indent=2))
        return report
    finally:
        shutil.rmtree(work, ignore_errors=True)


def stocks_for_all(cache, kodi_version):
    cache = Path(cache)
    found = {}
    for arch in ('arm64', 'x86_64'):
        matches = sorted(cache.glob('kodi-*-%s.dmg' % arch))
        stable = [p for p in matches if kodi_upstream.DMG_STABLE.search(p.name)]
        if kodi_version:
            stable = [p for p in stable if ('kodi-%s-' % kodi_version) in p.name] or stable
        if not stable:
            raise SystemExit('no %s dmg in %s' % (arch, cache))
        found[arch] = stable[-1]
    return found


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--arch', choices=('arm64', 'x86_64', 'all'), default='all')
    p.add_argument('--stock', default='')
    p.add_argument('--cache', default='')
    p.add_argument('--out', default='')
    p.add_argument('--kodi-version', default='21.3')
    p.add_argument('--build', type=int, default=None)
    args = p.parse_args()
    out_dir = Path(args.out) if args.out else (ROOT / 'dist')
    if args.arch == 'all':
        if not args.cache:
            raise SystemExit('--arch all needs --cache with both stock dmgs')
        out_dir.mkdir(parents=True, exist_ok=True)
        for arch, stock in stocks_for_all(args.cache, args.kodi_version).items():
            build_one(stock, out_dir / ('FEFC-macOS-%s.dmg' % arch), arch, args.kodi_version, args.build)
        return 0
    if not args.stock:
        raise SystemExit('--stock is required for one architecture')
    out = Path(args.out) if args.out else (ROOT / 'dist' / ('FEFC-macOS-%s.dmg' % args.arch))
    out.parent.mkdir(parents=True, exist_ok=True)
    build_one(args.stock, out, args.arch, args.kodi_version, args.build)
    return 0


if __name__ == '__main__':
    sys.exit(main())
