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
    # NO adaptive icon: the FEFC Fire TV WebView app (whose tile shows on Fire Sticks) ships only legacy PNG mipmaps.
    # Fire Stick launchers (Fire OS 7/8) render an adaptive mipmap-anydpi-v26 XML icon of a sideloaded app as a blank grey tile.
    import shutil as _sh
    for d in os.listdir(res):
        if 'anydpi' in d:
            for n in os.listdir(os.path.join(res, d)):
                if n.startswith('ic_launcher'): os.remove(os.path.join(res, d, n))
    for d in os.listdir(res):
        for n in ('ic_launcher_bg.png', 'ic_launcher_fg.png'):
            f = os.path.join(res, d, n)
            if os.path.isfile(f): os.remove(f)
    # Leanback banner exactly like the FEFC Fire TV WebView app (whose tile shows on older Fire OS launchers):
    # 320x180 dp => 320x180 px in plain drawable/ and drawable-xhdpi, 640x360 in xxhdpi/xxxhdpi, 8-bit RGB PNG.
    # (Earlier builds put 640x360 in xhdpi, had no default drawable/banner.png and no mdpi/hdpi-correct sizes.)
    for d, (w, h) in (('', (320, 180)), ('-mdpi', (160, 90)), ('-hdpi', (240, 135)), ('-xhdpi', (320, 180)), ('-xxhdpi', (640, 360)), ('-xxxhdpi', (640, 360))):
        os.makedirs(os.path.join(res, 'drawable' + d), exist_ok=True)
        banner(w, h).convert('RGB').save(os.path.join(res, 'drawable' + d, 'banner.png'), optimize=False)


# ---- macOS: app icon and the drag-install disk image window -------------------------------------
# Same artwork as the Android/Fire TV launcher icon (icon() above: FEFC logo on the FEFC gradient),
# shaped like a macOS app icon: a rounded square inside the 1024 canvas with Apple's standard margin.
MAC_ICON_SIZES = (16, 32, 128, 256, 512)  # each also at @2x, so 16 ... 1024 px
_mac_master = None


def mac_icon(size=1024):
    global _mac_master
    if _mac_master is None:
        S = 1024; body = 824; off = (S - body) // 2; radius = 185
        art = icon(body)
        mask = Image.new('L', (body * 4, body * 4), 0)
        ImageDraw.Draw(mask).rounded_rectangle((0, 0, body * 4 - 1, body * 4 - 1), radius * 4, fill=255)
        mask = mask.resize((body, body), Image.LANCZOS)
        canvas = Image.new('RGBA', (S, S), (0, 0, 0, 0))
        # soft drop shadow, like other Mac app icons
        shadow = Image.new('RGBA', (S, S), (0, 0, 0, 0))
        sm = Image.new('L', (S, S), 0); sm.paste(mask, (off, off + 12))
        from PIL import ImageFilter
        sm = sm.filter(ImageFilter.GaussianBlur(14)).point(lambda v: int(v * 0.45))
        shadow.putalpha(sm)
        canvas.alpha_composite(shadow)
        art.putalpha(mask)
        canvas.alpha_composite(art, (off, off))
        _mac_master = canvas
    return _mac_master if size == 1024 else _mac_master.resize((size, size), Image.LANCZOS)


def write_iconset(folder):
    """Apple .iconset folder (icon_16x16.png ... icon_512x512@2x.png) for iconutil."""
    os.makedirs(folder, exist_ok=True)
    names = []
    for s in MAC_ICON_SIZES:
        for scale, suffix in ((1, ''), (2, '@2x')):
            n = 'icon_%dx%d%s.png' % (s, s, suffix)
            mac_icon(s * scale).save(os.path.join(folder, n))
            names.append(n)
    return names


def _font(name, px):
    from PIL import ImageFont
    return ImageFont.truetype(os.path.join(A, 'fonts', name), px)


# Window content size and icon centres in points (Finder coordinates). The background is drawn to match.
DMG_WINDOW = (660, 560)   # window_rect includes the title bar; 560 keeps the Read Me label inside (no scroll bar)
DMG_ICON_SIZE = 112
DMG_ICONS = {'FEFC.app': (165, 200), 'Applications': (495, 200), 'Read Me.txt': (330, 440)}


def dmg_background(scale=1):
    w, h = DMG_WINDOW; W, H = w * scale, h * scale
    bg = Image.new('RGBA', (W, H), (0, 0, 0, 255))
    # wordmark across the top
    wm = wordmark(); s = min(W * 0.34 / wm.width, H * 0.13 / wm.height)
    wm = wm.resize((int(wm.width * s), int(wm.height * s)), Image.LANCZOS)
    bg.alpha_composite(wm, ((W - wm.width) // 2, int(22 * scale)))
    d = ImageDraw.Draw(bg)
    # arrow from the app to Applications
    (ax, ay), (bx, _) = DMG_ICONS['FEFC.app'], DMG_ICONS['Applications']
    x0 = (ax + DMG_ICON_SIZE // 2 + 26) * scale; x1 = (bx - DMG_ICON_SIZE // 2 - 26) * scale; y = ay * scale
    t = 7 * scale
    d.rounded_rectangle((x0, y - t, x1 - 30 * scale, y + t), t, fill=BLUE + (255,))
    d.polygon([(x1 - 40 * scale, y - 26 * scale), (x1, y), (x1 - 40 * scale, y + 26 * scale)], fill=BLUE + (255,))

    def centred(text, cy, font, fill):
        bb = d.textbbox((0, 0), text, font=font)
        d.text(((W - (bb[2] - bb[0])) // 2 - bb[0], int(cy * scale) - (bb[3] - bb[1]) // 2 - bb[1]), text, font=font, fill=fill)
    # Finder draws icon names in black (light mode) or white (dark mode); a mid-grey pill keeps both readable.
    for name, (cx, cy) in DMG_ICONS.items():
        top = cy + DMG_ICON_SIZE // 2 + 2
        d.rounded_rectangle(((cx - 62) * scale, top * scale, (cx + 62) * scale, (top + 24) * scale), 12 * scale, fill=(128, 138, 152, 255))
    centred('Drag FEFC to Applications', 300, _font('source-sans-3-600.ttf', 26 * scale), (255, 255, 255, 255))
    small = _font('source-sans-3-400.ttf', 14 * scale)
    centred('First time: in Applications, right-click FEFC and choose Open.', 340, small, (200, 208, 220, 255))
    centred('Still blocked? System Settings > Privacy & Security > Open Anyway.', 361, small, (200, 208, 220, 255))
    return bg.convert('RGB')
