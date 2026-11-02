#!/usr/bin/env python3
"""Pack FEFC web shell + local media into firetv/app/src/main/assets/www for offline-first Fire TV.

Bundles: HTML/JS/CSS, fonts, icons, covers, people photos, posters, data/*.json (index gzipped),
sfx, mosaic/preview clips, intro TV clip+audio.
NEVER bundles full fan-edit video files (Drive streams stay remote).
"""
from __future__ import annotations
import gzip, hashlib, json, os, shutil, sys
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'firetv' / 'app' / 'src' / 'main' / 'assets' / 'www'
MANIFEST = OUT / '_bundle_manifest.json'

# Paths / globs relative to ROOT that are copied as-is (or lightly processed).
SHELL = [
    'index.html', 'style.css', 'sw.js', 'manifest.json',
    'app.js', 'intro.js', 'clips.js', 'json-worker.js', 'audio.js', 'zoom.js', 'genres.js',
    'userdata.js', 'sync.js', 'syncui.js', 'ticker.js', 'tvplayer.js', 'qrgen.js',
    'newarrivals.js', 'readfirst.js', 'details-extra.js', 'eastereggs.js',
]
ICON_FILES = [
    'assets/favicon-32.png', 'assets/apple-touch-icon.png',
    'assets/icon-192.png', 'assets/icon-512.png', 'assets/icon-maskable-512.png',
    'assets/fefc-logo-carson.png', 'assets/fefc-logo.png', 'assets/fefc-wordmark.png',
    'assets/logo.png', 'assets/cover.jpg',
]
# Directories copied wholesale (no full fan-edit videos live here).
COPY_DIRS = [
    'assets/fonts',
    'assets/clips',      # mosaic / tile preview backgrounds — YES bundle
    'assets/sfx',
    'assets/genres',
]
# Image dirs downscaled for TV (max width).
IMG_DIRS = {
    'assets/covers': 720,
    'assets/people': 720,
    'assets/posters': 400,
}
# Single media files (intro — not a full fan edit).
SINGLE_MEDIA = [
    'assets/intro-tv.mp4',
    'assets/intro.mp3',
]
# Data JSONs; index.json stored gzipped as index.json.gz AND a slim copy for WebView.
DATA_FILES = None  # filled: all data/*.json except huge interim if present

# Hard deny: never copy anything that looks like a full fan-edit master.
DENY_SUFFIX = {'.mkv', '.avi', '.m2ts', '.ts', '.mpg', '.mpeg', '.wmv', '.flv'}
# Allow mp4/webm/m4v only under assets/clips or named intro — not under a hypothetical edits/ tree.
ALLOW_MP4_PREFIXES = ('assets/clips/', 'assets/intro')


def deny(rel: str) -> bool:
    rel = rel.replace('\\', '/')
    low = rel.lower()
    if 'fanedit' in low and low.endswith(('.mp4', '.mkv', '.m4v', '.webm')) and not low.startswith('assets/clips/'):
        return True
    if any(low.startswith(p) for p in ('edits/', 'full/', 'masters/', 'fanedits/')):
        return True
    suf = Path(low).suffix
    if suf in DENY_SUFFIX:
        return True
    if suf in {'.mp4', '.webm', '.m4v'} and not any(low.startswith(p) or low.startswith(p.replace('assets/','')) for p in ALLOW_MP4_PREFIXES):
        # allow only known preview/intro paths
        if not (low.startswith('assets/clips/') or low in ('assets/intro-tv.mp4', 'assets/intro.mp3') or low.endswith('/intro-tv.mp4')):
            return True
    return False


def ensure_clean():
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True)


def copy_file(src: Path, dest: Path):
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dest)


def downscale_image(src: Path, dest: Path, max_w: int):
    dest.parent.mkdir(parents=True, exist_ok=True)
    try:
        im = Image.open(src)
        if im.width > max_w:
            h = int(im.height * (max_w / im.width))
            im = im.resize((max_w, h), Image.LANCZOS)
        # Prefer JPEG for photos; keep PNG/WebP when source is PNG with alpha
        if src.suffix.lower() in {'.jpg', '.jpeg'} or im.mode == 'RGB':
            if dest.suffix.lower() not in {'.jpg', '.jpeg'}:
                dest = dest.with_suffix('.jpg')
            im = im.convert('RGB')
            im.save(dest, 'JPEG', quality=82, optimize=True)
        else:
            im.save(dest, optimize=True)
    except Exception as e:
        print('warn image', src, e)
        copy_file(src, dest)


def pack():
    ensure_clean()
    entries = []
    total = 0

    def add(rel: str, path: Path):
        nonlocal total
        if not path.is_file():
            return
        rel = rel.replace('\\', '/')
        if deny(rel):
            print('SKIP full-edit-like', rel)
            return
        sz = path.stat().st_size
        total += sz
        entries.append({'path': rel, 'size': sz})

    # Shell
    for name in SHELL:
        src = ROOT / name
        if src.exists():
            dest = OUT / name
            copy_file(src, dest)
            add(name, dest)

    # Icons
    for name in ICON_FILES:
        src = ROOT / name
        if src.exists():
            dest = OUT / name
            copy_file(src, dest)
            add(name, dest)

    # Copy dirs
    for d in COPY_DIRS:
        src = ROOT / d
        if not src.exists():
            continue
        for f in src.rglob('*'):
            if not f.is_file():
                continue
            rel = str(f.relative_to(ROOT)).replace('\\', '/')
            if deny(rel):
                print('SKIP', rel)
                continue
            dest = OUT / rel
            copy_file(f, dest)
            add(rel, dest)

    # Downscaled image dirs
    for d, max_w in IMG_DIRS.items():
        src = ROOT / d
        if not src.exists():
            continue
        for f in src.rglob('*'):
            if not f.is_file():
                continue
            rel = str(f.relative_to(ROOT)).replace('\\', '/')
            dest = OUT / rel
            if f.suffix.lower() in {'.jpg', '.jpeg', '.png', '.webp'}:
                downscale_image(f, dest, max_w)
                # dest may have changed suffix
                if not dest.exists():
                    # find written file
                    cand = dest.with_suffix('.jpg')
                    dest = cand if cand.exists() else dest
                add(rel if dest.exists() else rel, dest if dest.exists() else OUT / rel)
            else:
                copy_file(f, dest)
                add(rel, dest)

    # Single media
    for name in SINGLE_MEDIA:
        src = ROOT / name
        if src.exists():
            if deny(name):
                print('SKIP', name)
                continue
            dest = OUT / name
            copy_file(src, dest)
            add(name, dest)

    # Data JSONs
    data = ROOT / 'data'
    for f in sorted(data.glob('*.json')):
        rel = f'data/{f.name}'
        if f.name.endswith('.interim.json'):
            continue  # skip partial crawls
        dest = OUT / rel
        if f.name == 'index.json' and f.stat().st_size > 500_000:
            # Serve gzip; also keep a tiny pointer note — WebView interceptor will decompress
            gz = OUT / 'data' / 'index.json.gz'
            gz.parent.mkdir(parents=True, exist_ok=True)
            with open(f, 'rb') as inf, gzip.open(gz, 'wb', compresslevel=9) as out:
                shutil.copyfileobj(inf, out)
            add('data/index.json.gz', gz)
            # Also write uncompressed if under budget leftover — skip to save space; interceptor gunzips
            # Write a 1-byte placeholder so path exists? Better: interceptor maps index.json -> gz
            (OUT / 'data').mkdir(exist_ok=True)
            (OUT / 'data' / '.index_is_gz').write_text('1\n')
        else:
            copy_file(f, dest)
            add(rel, dest)

    # readfirst html if any
    for extra in ['data/readfirst.html']:
        src = ROOT / extra
        if src.exists():
            copy_file(src, OUT / extra)
            add(extra, OUT / extra)

    # screenshots / optimus — small branding, include
    for name in ['assets/optimus.png', 'assets/optimus-watch.webp', 'assets/optimus-full.webp']:
        src = ROOT / name
        if src.exists() and src.stat().st_size < 2_000_000:
            copy_file(src, OUT / name)
            add(name, OUT / name)

    man = {
        'version': json.loads((ROOT / 'VERSION').read_text()),
        'totalBytes': total,
        'totalMB': round(total / (1024 * 1024), 2),
        'fileCount': len(entries),
        'note': 'Everything local except full fan-edit videos (stream from Drive). Tile preview clips included.',
        'files': entries,
    }
    MANIFEST.write_text(json.dumps(man, indent=2) + '\n')
    print(f'Packed {len(entries)} files, {man["totalMB"]} MB -> {OUT}')
    if man['totalMB'] > 145:
        print('WARNING: approaching 150MB APK budget', file=sys.stderr)
    return man

if __name__ == '__main__':
    pack()
