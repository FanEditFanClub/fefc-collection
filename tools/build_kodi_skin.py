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
		<description lang="en_GB">Skin of the Fan Edit Fan Club app: FEFC colours, Jura font, 5x5 tile grid and a details page that fits the screen. Derived from the Estuary skin by phil65 and Ichabod Fletchman (Kodi, GPL-2.0-or-later / CC BY-SA 4.0). Not an official Kodi skin.</description>
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


def make_textures(media):
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
    shutil.copy(ROOT / 'assets' / 'fefc-logo.png', media / 'fefc-logo.png')
    shutil.copy(ROOT / 'assets' / 'fefc-wordmark.png', media / 'fefc-wordmark.png')
    return media


def patch_fonts(xml_dir):
    p = xml_dir / 'Font.xml'
    s = p.read_text(encoding='utf-8')
    s = s.replace('NotoSans-Regular.ttf', 'Jura-Regular.ttf').replace('Roboto-Thin.ttf', 'Jura-Regular.ttf')
    extra = ''
    for name, size in (('font9_title', 20), ('font10_title', 22), ('font12_title', 27), ('font13_title', 30), ('font14_title', 42),
                       ('font_tile', 44), ('font11_tile', 34), ('font_title_big', 56)):
        extra += ('\t\t<font>\n\t\t\t<name>%s</name>\n\t\t\t<filename>Jura-Bold.ttf</filename>\n'
                  '\t\t\t<size>%d</size>\n\t\t</font>\n') % (name, size)
    # add to every fontset
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
        '(fonts/JURA-OFL.txt). Changes: FEFC colours, Jura font, 5x5 grid view, details page and home layout. '
        'Not an official Kodi skin.\n', encoding='utf-8')
    return out


if __name__ == '__main__':
    build(sys.argv[1], sys.argv[2])
    print('skin.fefc ->', sys.argv[2])
