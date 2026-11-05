#!/usr/bin/env python3
"""FEFC branding images for the Kodi-based FEFC app (generated from the web app's own logo assets)."""
import os
from PIL import Image, ImageDraw
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
A = os.path.join(ROOT, 'assets')
BG_TOP, BG_BOT, BLUE = (11, 24, 44), (0, 0, 0), (47, 168, 255)
def grad(w, h):
    im = Image.new('RGB', (w, h)); px = im.load()
    for y in range(h):
        t = y / max(1, h - 1)
        c = tuple(int(BG_TOP[i] * (1 - t) + BG_BOT[i] * t) for i in range(3))
        for x in range(w): px[x, y] = c
    return im
def logo(): return Image.open(os.path.join(A, 'fefc-logo.png')).convert('RGBA')
def wordmark(): return Image.open(os.path.join(A, 'fefc-wordmark.png')).convert('RGBA')
def paste_fit(bg, im, frac_w, frac_h, cy=0.5):
    w, h = bg.size; s = min(w * frac_w / im.width, h * frac_h / im.height)
    r = im.resize((max(1, int(im.width * s)), max(1, int(im.height * s))), Image.LANCZOS)
    bg.alpha_composite(r, ((w - r.width) // 2, int(h * cy - r.height / 2)))
def icon(size):
    s = 4 * size; bg = grad(s, s).convert('RGBA')
    paste_fit(bg, logo(), 0.62, 0.62)
    return bg.resize((size, size), Image.LANCZOS)
def banner(w, h):
    # full-bleed leanback banner: opaque gradient edge to edge, wordmark large, accent bar along the bottom edge
    bg = grad(w * 2, h * 2).convert('RGBA'); paste_fit(bg, wordmark(), 0.80, 0.72, 0.47)
    d = ImageDraw.Draw(bg); d.rectangle((0, h * 2 - max(4, h // 18), w * 2, h * 2), fill=BLUE + (255,))
    return bg.resize((w, h), Image.LANCZOS).convert('RGB')
def splash(w, h):
    bg = grad(w, h).convert('RGBA'); paste_fit(bg, wordmark(), 0.42, 0.5, 0.5); return bg
def white_mark(size):
    im = Image.new('RGBA', (size * 4, size * 4), (0, 0, 0, 0)); paste_fit(im, logo(), 0.92, 0.92)
    return im.resize((size, size), Image.LANCZOS)
def save(im, path, mode=None):
    if path.endswith('.jpg'): im.convert('RGB').save(path, quality=92)
    else: im.save(path)
def brand_apk_tree(dec):
    res = os.path.join(dec, 'res')
    for d in os.listdir(res):
        p = os.path.join(res, d)
        for name, fn in (('ic_launcher.png', lambda sz: icon(sz[0])), ('banner.png', lambda sz: banner(*sz)),
                         ('applaunch_screen.png', lambda sz: splash(*sz)), ('notif_icon.png', lambda sz: white_mark(sz[0])),
                         ('ic_recommendation_80dp.png', lambda sz: white_mark(sz[0]).convert('RGBA'))):
            f = os.path.join(p, name)
            if os.path.isfile(f):
                sz = Image.open(f).size; save(fn(sz), f)
    m = os.path.join(dec, 'assets', 'media')
    for n, sz in (('icon16x16.png', 16), ('icon32x32.png', 32), ('icon48x48.png', 48), ('icon80x80.png', 80), ('icon120x120.png', 120), ('icon256x256.png', 256), ('vendor_icon.png', 256), ('vendor_logo.png', 256)):
        f = os.path.join(m, n)
        if os.path.isfile(f): save(icon(sz) if 'vendor_logo' not in n else white_mark(Image.open(f).size[0]), f)
    for n, fn in (('banner.png', lambda s: banner(*s)), ('applaunch_screen.png', lambda s: splash(*s))):
        f = os.path.join(m, n)
        if os.path.isfile(f): save(fn(Image.open(f).size), f)
    f = os.path.join(m, 'splash.jpg')
    if os.path.isfile(f): save(splash(*Image.open(f).size), f)

def adaptive(dec):
    """Full-bleed adaptive icon (API 26+) + legacy mipmaps + leanback banners at every density."""
    res = os.path.join(dec, 'res')
    for d, px in (('mdpi', 48), ('hdpi', 72), ('xhdpi', 96), ('xxhdpi', 144), ('xxxhdpi', 192)):
        os.makedirs(os.path.join(res, 'mipmap-' + d), exist_ok=True)
        icon(px).convert('RGB').save(os.path.join(res, 'mipmap-' + d, 'ic_launcher.png'))
    os.makedirs(os.path.join(res, 'mipmap-anydpi-v26'), exist_ok=True)
    bgim = grad(432, 432); bgim.save(os.path.join(res, 'drawable-xxxhdpi', 'ic_launcher_bg.png'))
    fg = Image.new('RGBA', (432, 432), (0, 0, 0, 0)); paste_fit(fg, logo(), 0.56, 0.56); fg.save(os.path.join(res, 'drawable-xxxhdpi', 'ic_launcher_fg.png'))
    open(os.path.join(res, 'mipmap-anydpi-v26', 'ic_launcher.xml'), 'w').write(
        '<?xml version="1.0" encoding="utf-8"?>\n<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n'
        '    <background android:drawable="@drawable/ic_launcher_bg"/>\n    <foreground android:drawable="@drawable/ic_launcher_fg"/>\n</adaptive-icon>\n')
    # Leanback banner exactly like the FEFC Fire TV WebView app (whose tile shows on older Fire OS launchers):
    # 320x180 dp => 320x180 px in plain drawable/ and drawable-xhdpi, 640x360 in xxhdpi/xxxhdpi, 8-bit RGB PNG.
    # (Earlier builds put 640x360 in xhdpi, had no default drawable/banner.png and no mdpi/hdpi-correct sizes.)
    for d, (w, h) in (('', (320, 180)), ('-mdpi', (160, 90)), ('-hdpi', (240, 135)), ('-xhdpi', (320, 180)), ('-xxhdpi', (640, 360)), ('-xxxhdpi', (640, 360))):
        os.makedirs(os.path.join(res, 'drawable' + d), exist_ok=True)
        banner(w, h).convert('RGB').save(os.path.join(res, 'drawable' + d, 'banner.png'), optimize=False)
