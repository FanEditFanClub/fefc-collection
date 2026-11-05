#!/usr/bin/env python3
"""Build skin.fefc from Kodi's bundled Estuary skin (CC BY-SA 4.0 / GPL-2.0) plus the
overlay in kodi-src/skin-fefc. Usage: build_kodi_skin.py <skin.estuary dir> <out dir>"""
import os, re, shutil, sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
OVER = ROOT / 'kodi-src' / 'skin-fefc'
VERSION = os.environ.get('FEFC_SKIN_VERSION', '1.0.0')

COLORS = '''<?xml version="1.0" encoding="UTF-8"?>
<colors>
	<color name="primary_background">FF0B2A4A</color>
	<color name="secondary_background">330B3A66</color>
	<color name="dialog_tint">FF0B1220</color>
	<color name="background">FF03060C</color>
	<color name="bg_image">FFA0A0A0</color>
	<color name="bg_overlay">30FFFFFF</color>
	<color name="black">FF000000</color>
	<color name="white">FFF0F0F0</color>
	<color name="grey">FF8E9BB0</color>
	<color name="blue">FF99CCFF</color>
	<color name="red">FFCC6666</color>
	<color name="button_focus">FF2FA8FF</color>
	<color name="button_alt_focus">802FA8FF</color>
	<color name="text_shadow">22000000</color>
	<color name="border_alpha">60FFFFFF</color>
	<color name="disabled">40FFFFFF</color>
	<color name="selected">FFFF9C00</color>
	<color name="invalid">FFCC6666</color>
</colors>
'''

ADDON = '''<?xml version="1.0" encoding="UTF-8"?>
<addon id="skin.fefc" version="%s" name="FEFC" provider-name="Fan Edit Fan Club">
	<requires>
		<import addon="xbmc.gui" version="5.17.0"/>
	</requires>
	<extension point="xbmc.gui.skin" debugging="false">
		<res width="1920" height="1080" aspect="16:9" default="true" folder="xml" />
	</extension>
	<extension point="xbmc.addon.metadata">
		<platform>all</platform>
		<license>CC BY-SA 4.0, GNU GENERAL PUBLIC LICENSE Version 2.0, SIL OFL 1.1 (Jura font)</license>
		<source>https://github.com/FanEditFanClub/fefc-collection</source>
		<summary lang="en_GB">FEFC skin for the Fan Edit Fan Club app</summary>
		<description lang="en_GB">Skin of the Fan Edit Fan Club app: FEFC colours, Noto Sans font, 5x5 tile grid and a details page that fits the screen. Derived from the Estuary skin by phil65 and Ichabod Fletchman (Kodi, GPL-2.0-or-later / CC BY-SA 4.0). Not an official Kodi skin.</description>
		<assets>
			<icon>resources/icon.png</icon>
			<fanart>resources/fanart.jpg</fanart>
		</assets>
	</extension>
</addon>
''' % VERSION


def rrect_tile(size, border, fill_top, fill_bot, line, lw, radius, glow=None):
    s = size
    img = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    if glow:
        g = Image.new('RGBA', (s, s), (0, 0, 0, 0))
        ImageDraw.Draw(g).rounded_rectangle((6, 6, s - 7, s - 7), radius, outline=glow, width=6)
        img = Image.alpha_composite(img, g.filter(ImageFilter.GaussianBlur(3)))
    grad = Image.new('RGBA', (s, s))
    px = grad.load()
    for y in range(s):
        t = y / (s - 1)
        c = tuple(int(fill_top[i] * (1 - t) + fill_bot[i] * t) for i in range(4))
        for x in range(s):
            px[x, y] = c
    m = Image.new('L', (s * 4, s * 4), 0)
    ImageDraw.Draw(m).rounded_rectangle((2 * 4, 2 * 4, (s - 3) * 4, (s - 3) * 4), radius * 4, fill=255)
    m = m.resize((s, s), Image.LANCZOS)
    body = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    body.paste(grad, (0, 0), m)
    img = Image.alpha_composite(img, body)
    ol = Image.new('RGBA', (s * 4, s * 4), (0, 0, 0, 0))
    ImageDraw.Draw(ol).rounded_rectangle((2 * 4, 2 * 4, (s - 3) * 4, (s - 3) * 4), radius * 4, outline=line, width=lw * 4)
    ol = ol.resize((s, s), Image.LANCZOS)
    return Image.alpha_composite(img, ol)


def background(path):
    w, h = 1920, 1080
    img = Image.new('RGB', (w, h))
    px = img.load()
    for y in range(h):
        t = y / (h - 1)
        c = (int(11 * (1 - t) + 1 * t), int(24 * (1 - t) + 3 * t), int(44 * (1 - t) + 8 * t))
        for x in range(w):
            px[x, y] = c
    glow = Image.new('RGB', (w, h), (0, 0, 0))
    ImageDraw.Draw(glow).ellipse((460, -420, 1460, 380), fill=(20, 60, 110))
    glow = glow.filter(ImageFilter.GaussianBlur(160))
    from PIL import ImageChops
    img = ImageChops.add(img, glow)
    img.save(path, quality=90)


CHROME_WINDOWS = {'DialogTextViewer.xml', 'Settings.xml', 'SettingsCategory.xml', 'SettingsSystemInfo.xml',
                  'DialogAddonSettings.xml', 'SkinSettings.xml', 'SettingsProfile.xml'}


def make_textures(media):
    from PIL import ImageFont
    media.mkdir(parents=True, exist_ok=True)
    rrect_tile(128, 26, (24, 42, 68, 235), (6, 10, 18, 245), (153, 204, 255, 90), 2, 22).save(media / 'fefc-tile.png')
    rrect_tile(128, 26, (30, 62, 104, 245), (8, 18, 34, 250), (47, 168, 255, 255), 4, 22, glow=(47, 168, 255, 200)).save(media / 'fefc-tile-focus.png')
    rrect_tile(128, 26, (0, 0, 0, 0), (0, 0, 0, 0), (47, 168, 255, 255), 4, 22, glow=(47, 168, 255, 200)).save(media / 'fefc-tile-ring.png')
    sh = Image.new('RGBA', (4, 64))
    for y in range(64):
        for x in range(4):
            sh.putpixel((x, y), (0, 0, 0, int(235 * (y / 63) ** 1.4)))
    sh.save(media / 'fefc-shade.png')
    background(media / 'fefc-bg.jpg')
    Image.new('RGB', (16, 16), (255, 255, 255)).save(media / 'fefc-white.png')
    import math
    st = Image.new('RGBA', (128, 128), (0, 0, 0, 0))
    pts = [(64 + (60 if i % 2 == 0 else 25) * math.sin(i * math.pi / 5), 68 - (60 if i % 2 == 0 else 25) * math.cos(i * math.pi / 5)) for i in range(10)]
    ImageDraw.Draw(st).polygon(pts, fill=(255, 196, 0, 255))
    st.save(media / 'fefc-star.png')
    # LCARS (web app details page): white shapes tinted with colordiffuse in the XML
    W = (255, 255, 255, 255)
    pill = Image.new('RGBA', (96, 96), (0, 0, 0, 0)); ImageDraw.Draw(pill).rounded_rectangle((0, 0, 95, 95), 47, fill=W)
    pill.save(media / 'fefc-lc-pill.png')
    # OnLive-style Home tiles: dark glossy, thin grey border; focus = orange border with a soft glow
    from PIL import ImageFilter
    def ol(focus):
        w, h, m = 200, 100, 12
        im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
        if focus:
            gl = Image.new('RGBA', (w, h), (0, 0, 0, 0))
            ImageDraw.Draw(gl).rounded_rectangle((m - 6, m - 6, w - m + 5, h - m + 5), 14, fill=(255, 156, 0, 200))
            im = Image.alpha_composite(im, gl.filter(ImageFilter.GaussianBlur(5)))
        body = Image.new('RGBA', (w, h), (0, 0, 0, 0)); d = ImageDraw.Draw(body)
        d.rounded_rectangle((m, m, w - m - 1, h - m - 1), 10, fill=(14, 15, 18, 242),
                            outline=(255, 156, 0, 255) if focus else (110, 114, 120, 255), width=3 if focus else 2)
        d.rounded_rectangle((m + 3, m + 3, w - m - 4, (h // 2)), 8, fill=(255, 255, 255, 18))   # gloss
        return Image.alpha_composite(im, body)
    ol(False).save(media / 'fefc-ol-tile.png'); ol(True).save(media / 'fefc-ol-focus.png')
    # top-bar icons (white, 4x supersampled): magnifier, gear, speaker on / muted
    def icon(draw_fn, name):
        im = Image.new('RGBA', (224, 224), (0, 0, 0, 0)); draw_fn(ImageDraw.Draw(im))
        im.resize((56, 56), Image.LANCZOS).save(media / name)
    def mag(d):
        d.ellipse((24, 24, 144, 144), outline=W, width=22); d.line((128, 128, 200, 200), fill=W, width=30)
    def gear(d):
        import math
        for k in range(8):
            a = k * math.pi / 4; cx, cy = 112 + 78 * math.cos(a), 112 + 78 * math.sin(a)
            d.ellipse((cx - 22, cy - 22, cx + 22, cy + 22), fill=W)
        d.ellipse((36, 36, 188, 188), fill=W); d.ellipse((82, 82, 142, 142), fill=(0, 0, 0, 0))
    def spk(d, on):
        d.rectangle((20, 80, 70, 144), fill=W); d.polygon([(60, 80), (120, 30), (120, 194), (60, 144)], fill=W)
        if on:
            d.arc((100, 60, 170, 164), -50, 50, fill=W, width=16); d.arc((110, 26, 210, 198), -50, 50, fill=W, width=16)
        else:
            d.line((145, 75, 205, 150), fill=W, width=20); d.line((205, 75, 145, 150), fill=W, width=20)
    icon(mag, 'fefc-ic-search.png'); icon(gear, 'fefc-ic-gear.png')
    icon(lambda d: spk(d, True), 'fefc-ic-sound.png'); icon(lambda d: spk(d, False), 'fefc-ic-mute.png')
    lpill = Image.new('RGBA', (96, 96), (0, 0, 0, 0)); d = ImageDraw.Draw(lpill)
    d.rounded_rectangle((0, 0, 95, 95), 47, fill=W); d.rectangle((48, 0, 95, 95), fill=W)
    lpill.save(media / 'fefc-lc-lpill.png')   # rounded left end only
    for name, flip in (('fefc-lc-elbow-top.png', False), ('fefc-lc-elbow-bot.png', True)):
        el = Image.new('RGBA', (220, 120), W); d = ImageDraw.Draw(el); T = (0, 0, 0, 0)
        d.rectangle((0, 0, 59, 59), fill=T); d.pieslice((0, 0, 119, 119), 180, 270, fill=W)   # outer curve
        d.rectangle((170, 40, 219, 119), fill=T)                                               # inside cut-out
        d.rectangle((170, 40, 199, 69), fill=W); d.pieslice((170, 40, 229, 99), 180, 270, fill=T)  # inner curve
        if flip:
            el = el.transpose(Image.FLIP_TOP_BOTTOM)
        el.save(media / name)

    # Support Us brand icons (Patreon / PayPal / Venmo) + landscape tiles for Support / Shuffle / Sort
    _jf = OVER / 'fonts' / 'Jura-Bold.ttf'
    _jr = OVER / 'fonts' / 'Jura-Regular.ttf'
    try:
        font_b = ImageFont.truetype(str(_jf), 140)
        font_tile = ImageFont.truetype(str(_jf), 52)
        font_sub = ImageFont.truetype(str(_jr if _jr.exists() else _jf), 28)
    except Exception:
        font_b = font_tile = font_sub = ImageFont.load_default()
    def brand_icon(letter, bg, name):
        im = Image.new('RGBA', (256, 256), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
        d.ellipse((16, 16, 240, 240), fill=bg)
        bb = d.textbbox((0, 0), letter, font=font_b); tw, th = bb[2] - bb[0], bb[3] - bb[1]
        d.text(((256 - tw) / 2, (256 - th) / 2 - 10), letter, fill=W, font=font_b)
        im.resize((128, 128), Image.LANCZOS).save(media / name)
    brand_icon('P', (255, 66, 77, 255), 'fefc-ic-patreon.png')
    brand_icon('P', (0, 112, 186, 255), 'fefc-ic-paypal.png')
    brand_icon('V', (61, 149, 217, 255), 'fefc-ic-venmo.png')
    def land_tile(lines, name):
        w, h, m = 640, 320, 24
        im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
        body = Image.new('RGBA', (w, h), (0, 0, 0, 0)); d = ImageDraw.Draw(body)
        d.rounded_rectangle((m, m, w - m - 1, h - m - 1), 18, fill=(14, 15, 18, 242), outline=(110, 114, 120, 255), width=3)
        d.rounded_rectangle((m + 4, m + 4, w - m - 5, h // 2), 14, fill=(255, 255, 255, 18))
        y = 110 if len(lines) == 1 else 95
        for i, t in enumerate(lines):
            f = font_tile if i == 0 else font_sub
            col = (255, 255, 255, 255) if i == 0 else (200, 205, 215, 255)
            bb = d.textbbox((0, 0), t, font=f); tw = bb[2] - bb[0]
            d.text(((w - tw) / 2, y), t, fill=col, font=f); y += 60 if i == 0 else 40
        Image.alpha_composite(im, body).save(media / name)
    land_tile(['SUPPORT US', 'Patreon  ·  PayPal  ·  Venmo'], 'fefc-support-tile.png')
    land_tile(['SHUFFLE PLAY'], 'fefc-shuffle-tile.png')
    land_tile(['SORT'], 'fefc-sort-tile.png')

    shutil.copy(ROOT / 'assets' / 'fefc-logo.png', media / 'fefc-logo.png')
    shutil.copy(ROOT / 'assets' / 'fefc-wordmark.png', media / 'fefc-wordmark.png')
    for f in sorted((ROOT / 'assets' / 'ticker-icons').glob('*.png')):
        shutil.copy(f, media / f.name)
    return media


def patch_fonts(xml_dir):
    p = xml_dir / 'Font.xml'
    s = p.read_text(encoding='utf-8')
    # 0.3.20: clean, readable TV sans everywhere (Noto Sans, OFL, ships with Estuary) instead of Jura
    s = s.replace('Roboto-Thin.ttf', 'NotoSans-Regular.ttf')
    extra = ''
    for name, size in (('font9_title', 20), ('font10_title', 22), ('font12_title', 27), ('font13_title', 30), ('font14_title', 42),
                       ('font_tile', 44), ('font11_tile', 34), ('font_title_big', 56)):
        extra += ('\t\t<font>\n\t\t\t<name>%s</name>\n\t\t\t<filename>NotoSans-Bold.ttf</filename>\n'
                  '\t\t\t<size>%d</size>\n\t\t</font>\n') % (name, size)
    # add to every fontset
    if not (xml_dir.parent / 'fonts' / 'NotoSans-Bold.ttf').exists():
        extra = extra.replace('NotoSans-Bold.ttf', 'NotoSans-Regular.ttf')
    s = re.sub(r'(</fontset>)', extra + r'\1', s)
    p.write_text(s, encoding='utf-8')


def build(est, out):
    est, out = Path(est), Path(out)
    if out.exists():
        shutil.rmtree(out)
    shutil.copytree(est, out)
    for d in ('themes', 'resources'):
        shutil.rmtree(out / d, ignore_errors=True)
    for f in (out / 'colors').glob('*.xml'):
        f.unlink()
    for f in ('curial.xbt', 'flat.xbt'):
        (out / 'media' / f).unlink(missing_ok=True)
    lang = out / 'language'
    for d in lang.iterdir():
        if d.name != 'resource.language.en_gb':
            shutil.rmtree(d)
    (out / 'changelog.txt').unlink(missing_ok=True)
    (out / 'addon.xml').write_text(ADDON, encoding='utf-8')
    (out / 'colors' / 'defaults.xml').write_text(COLORS, encoding='utf-8')
    fonts = out / 'fonts'
    for f in ('Jura-Regular.ttf', 'Jura-Bold.ttf', 'OFL.txt'):
        shutil.copy(OVER / 'fonts' / f, fonts / ('JURA-OFL.txt' if f == 'OFL.txt' else f))
    for f in ('Roboto-Thin.ttf', 'NotoSans-Regular.ttf'):
        pass  # kept: other fonts may still be referenced by language-specific font sets
    xml = out / 'xml'
    patch_fonts(xml)
    for f in (OVER / 'xml').glob('*.xml'):
        shutil.copy(f, xml / f.name)
    # TV overscan margin: every stock window the overlay does not replace is shrunk to 90 % around the screen centre
    # (the overlay's own windows are laid out inside the safe area themselves). Video playback is left alone.
    own = {f.name for f in (OVER / 'xml').glob('*.xml')} | {'VideoFullScreen.xml', 'Includes.xml', 'Variables.xml', 'Font.xml',
                                                            'Defaults.xml', 'Startup.xml', 'Includes_FEFC.xml'}
    zoom = ('\n\t<animation effect="zoom" start="100" end="90" center="960,540" time="0" condition="true" type="conditional">Conditional</animation>')
    nz = 0
    for f in xml.glob('*.xml'):
        if f.name in own:
            continue
        t = f.read_text(encoding='utf-8')
        if f.name in CHROME_WINDOWS and '</controls>' in t:
            # full-page stock windows get the FEFC top bar + ticker; their own content is shrunk to 82 % to sit between them
            z = zoom.replace('end="90"', 'end="82"')
            t2 = re.sub(r'(<window\b[^>]*>)', lambda m: m.group(1) + z, t, count=1)
            i = t2.rindex('</controls>')
            t2 = (t2[:i] + '\t<control type="group">\n\t\t<animation effect="zoom" start="100" end="121.95" center="960,540" time="0" '
                  'condition="true" type="conditional">Conditional</animation>\n\t\t<include>FefcTopBar</include>\n'
                  '\t\t<include>FefcTicker</include>\n\t</control>\n\t' + t2[i:])
        else:
            t2 = re.sub(r'(<window\b[^>]*>)', lambda m: m.group(1) + zoom, t, count=1)
        if t2 != t:
            f.write_text(t2, encoding='utf-8'); nz += 1
    print('overscan zoom added to', nz, 'windows')
    inc = xml / 'Includes.xml'
    s = inc.read_text(encoding='utf-8')
    s = s.replace('<include file="Variables.xml" />', '<include file="Variables.xml" />\n\t<include file="Includes_FEFC.xml" />', 1)
    assert 'Includes_FEFC.xml' in s
    inc.write_text(s, encoding='utf-8')
    media = out / 'media'
    make_textures(media)
    res = out / 'resources'
    res.mkdir(exist_ok=True)
    ic = Image.open(ROOT / 'assets' / 'fefc-logo.png').convert('RGBA').resize((384, 384))
    bg = Image.new('RGBA', (512, 512), (11, 24, 44, 255))
    bg.alpha_composite(ic, (64, 64))
    bg.convert('RGB').save(res / 'icon.png')
    Image.open(media / 'fefc-bg.jpg').save(res / 'fanart.jpg', quality=85)
    (out / 'LICENSE-FEFC.txt').write_text(
        'skin.fefc is derived from the Estuary skin of Kodi (c) phil65, Ichabod Fletchman and the Kodi contributors, '
        'licensed CC BY-SA 4.0 and GPL-2.0-or-later (see LICENSE.txt). The Jura font is (c) Daniel Johnson, SIL OFL 1.1 '
        '(fonts/JURA-OFL.txt). Changes: FEFC colours, Noto Sans font, 5x5 grid view, details page and home layout. '
        'Not an official Kodi skin.\n', encoding='utf-8')
    return out


if __name__ == '__main__':
    build(sys.argv[1], sys.argv[2])
    print('skin.fefc ->', sys.argv[2])
