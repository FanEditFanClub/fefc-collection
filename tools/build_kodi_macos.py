#!/usr/bin/env python3
"""Build an unsigned FEFC macOS app and disk image from the stock Kodi dmg.

Kodi 21 ships separate Intel (x86_64) and Apple Silicon (arm64) disk images. This does not
merge them into one universal binary. On a Mac the image is a UDZO dmg from hdiutil. On Linux
it is an HFS hybrid from genisoimage, which Finder may not mount; the GitHub macOS job is the
one that produces the image to install. There is no Developer ID signature and no notarization.

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
This is an unofficial FEFC build of Kodi. It is not signed with an Apple Developer ID and it is not notarized.

1. Drag FEFC.app to the Applications folder. Replace the older FEFC app if macOS asks.
2. In Terminal, clear the stock signature and the download quarantine, then open it once by hand:
   codesign --remove-signature /Applications/FEFC.app
   xattr -dr com.apple.quarantine /Applications/FEFC.app
   Right-click FEFC.app, choose Open, then Open.
3. Open FEFC. The first launch still asks you to confirm an unsigned app.

Updates use the same version.json as the Android FEFC app.
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


def brand_icon(app):
    resources = app / 'Contents' / 'Resources'
    icns = next((resources / name for name in ('icon.icns', 'kodi.icns') if (resources / name).is_file()), None)
    if icns is None or not shutil.which('png2icns'):
        return False
    try:
        import kodi_brand
        png = icns.with_suffix('.png')
        kodi_brand.icon(1024).save(png)
        subprocess.check_call(['png2icns', str(icns), str(png)])
        png.unlink(missing_ok=True)
        return True
    except Exception as e:
        print('icon not replaced:', e)
        return False


def pack_dmg(staging, out):
    """On a Mac this is a native UDZO image. Elsewhere it is a UDIF image whose contents are an ISO 9660
    volume (Rock Ridge and Joliet), which Disk Utility can open. That needs the libdmg-hfsplus `dmg` tool."""
    out = Path(out).resolve()
    if out.exists():
        out.unlink()
    if shutil.which('hdiutil'):
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
        branded_icon = brand_icon(app)
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
        (work / 'stage' / 'Read Me.txt').write_text(README, encoding='utf-8')
        packer = pack_dmg(work / 'stage', out)
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
            'signed': False,
            'notarized': False,
            'extractor': tool,
            'packer': packer,
            'symlinks': links,
            'icon': branded_icon,
            'stock': str(stock),
            'installable_here': packer in ('hdiutil-udzo', 'udif-iso9660'),
            'native_hfs': packer == 'hdiutil-udzo',
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
