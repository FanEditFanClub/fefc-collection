#!/usr/bin/env python3
"""Build an unsigned FEFC webOS IPK from the stock Kodi webOS package.

Stock IPK -> same add-on, skin, and sounds as the Android FEFC app -> repacked ar archive.
The app id stays org.xbmc.kodi because the native binary is built for that id. The title becomes FEFC.
There is no LG Seller Lounge signature. Developer Mode can install the repacked IPK.

usage: build_kodi_webos.py --out dist/FEFC-webOS.ipk [--stock path.ipk] [--kodi-version 21.0]
"""
import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tarfile
import tempfile
import urllib.request
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fefc_kodi_bundle
import kodi_upstream

ROOT = Path(__file__).resolve().parent.parent


def elf_machine(path):
    with open(path, 'rb') as f:
        magic = f.read(20)
    if magic[:4] != b'\x7fELF':
        return ''
    machine = int.from_bytes(magic[18:20], 'little')
    if machine == 183:
        return 'aarch64'
    if machine == 40:
        return 'arm'
    return 'elf-%s' % machine


def download(url, dest):
    print('downloading', url)
    req = urllib.request.Request(url, headers={'User-Agent': 'FEFC-Kodi-Build'})
    with urllib.request.urlopen(req, timeout=120) as r, open(dest, 'wb') as f:
        shutil.copyfileobj(r, f)


def choose_stock(stock, kodi_version):
    if stock:
        return Path(stock), kodi_version or '21.0'
    html = urllib.request.urlopen('https://mirrors.kodi.tv/releases/webos/', timeout=60).read().decode('utf-8', 'ignore')
    names = kodi_upstream.WEBOS_NAME.findall(html)
    # findall returns tuples; rebuild filenames from the page instead
    import re
    files = re.findall(r'org\.xbmc\.kodi-webos_[^"<> ]+\.ipk', html)
    available = kodi_upstream.stable_webos(files)
    ver = kodi_upstream.choose_version(available, kodi_version or '')
    if not ver:
        raise SystemExit('no stable webOS IPK listed')
    filename = available[ver]
    dest = Path(tempfile.gettempdir()) / filename
    if not dest.is_file():
        download(kodi_upstream.webos_url(filename), dest)
    return dest, ver


def retar(src_dir, dest):
    if os.path.exists(dest):
        os.remove(dest)
    with tarfile.open(dest, 'w:gz') as tar:
        for child in sorted(Path(src_dir).iterdir()):
            tar.add(child, arcname=child.name, recursive=True)


def brand_images(app):
    from PIL import Image
    import kodi_brand
    for name in ('icon.png', 'largeIcon.png'):
        f = app / name
        if not f.is_file():
            continue
        size = Image.open(f).size
        kodi_brand.icon(max(size)).resize(size, Image.LANCZOS).save(f)
    splash = app / 'media' / 'applaunch_screen.png'
    if splash.is_file():
        size = Image.open(splash).size
        kodi_brand.splash(*size).save(splash)


def build(stock, out, kodi_version, build_num):
    out = Path(out).resolve()
    out.parent.mkdir(parents=True, exist_ok=True)
    work = Path(tempfile.mkdtemp(prefix='fefc-webos-'))
    try:
        subprocess.check_call(['ar', 'x', str(stock)], cwd=work)
        data = work / 'data.tar.gz'
        if not data.is_file():
            raise SystemExit('IPK has no data.tar.gz')
        tree = work / 'tree'
        tree.mkdir()
        with tarfile.open(data, 'r:gz') as tar:
            tar.extractall(tree)
        appinfo = next(tree.rglob('appinfo.json'))
        app = appinfo.parent
        info = json.loads(appinfo.read_text(encoding='utf-8'))
        if info.get('id') != 'org.xbmc.kodi':
            raise SystemExit('unexpected webOS app id %s' % info.get('id'))
        binary = app / (info.get('main') or 'kodi-webos')
        abi = elf_machine(binary) if binary.is_file() else 'arm'
        info['title'] = 'FEFC'
        info['vendor'] = 'Fan Edit Fan Club'
        appinfo.write_text(json.dumps(info, indent=2) + '\n', encoding='utf-8')
        brand_images(app)
        rec = fefc_kodi_bundle.stage_fefc(app, 'webos', abi or 'arm', 'org.xbmc.kodi', kodi_version, build=build_num)
        intro = app / 'media' / 'fefc-intro.mp4'
        stock_intro = ROOT / 'assets' / 'intro-tv.mp4'
        if intro.is_file() and stock_intro.is_file():
            if hashlib.sha256(intro.read_bytes()).hexdigest() != hashlib.sha256(stock_intro.read_bytes()).hexdigest():
                raise SystemExit('intro video bytes changed')
        retar(tree, data)
        if out.exists():
            out.unlink()
        subprocess.check_call(['ar', 'rc', str(out), 'debian-binary', 'control.tar.gz', 'data.tar.gz'], cwd=work)
        report = {
            'platform': 'webos',
            'file': str(out),
            'bytes': out.stat().st_size,
            'sha256': hashlib.sha256(out.read_bytes()).hexdigest(),
            'kodi': kodi_version,
            'abi': abi,
            'app_id': info['id'],
            'app_version': info.get('version'),
            'title': info['title'],
            'fefc_version': rec.get('version'),
            'fefc_build': rec.get('build'),
            'signed': False,
            'stock': str(stock),
        }
        report_path = out.with_suffix('.report.json')
        report_path.write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
        print(json.dumps(report, indent=2))
        return report
    finally:
        shutil.rmtree(work, ignore_errors=True)


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--out', default=str(ROOT / 'dist' / 'FEFC-webOS.ipk'))
    p.add_argument('--stock', default='')
    p.add_argument('--kodi-version', default='')
    p.add_argument('--build', type=int, default=None)
    args = p.parse_args()
    stock, ver = choose_stock(args.stock, args.kodi_version)
    build(stock, args.out, ver, args.build)
    return 0


if __name__ == '__main__':
    sys.exit(main())
