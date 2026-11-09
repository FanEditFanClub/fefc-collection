const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const {spawnSync} = require('child_process');
const root = path.join(__dirname, '..');
const lib = path.join(root, 'kodi-src/plugin.video.fefc/resources/lib');

function py(code) {
  const r = spawnSync('python3', ['-c', code], {encoding: 'utf8', cwd: root});
  if (r.status !== 0) throw new Error(r.stderr || r.stdout);
  return r.stdout.trim();
}

test('person tiles sort by surname and drop counts', () => {
  const out = py(`
import json, sys
sys.path.insert(0, ${JSON.stringify(lib)})
import namesort
people = json.load(open('data/people.json'))
rows = []
for i, v in people.items():
    name = v.get('name') or ''
    rows.append((namesort.sort_key(name, v.get('folder')), namesort.display_name(name), namesort.surname(name)))
rows.sort()
names = [n for _, n, _ in rows]
# Brooks before Carrey by surname; first-name order would put Jim first.
assert names.index('Mel Brooks') < names.index('Jim Carrey')
surnames = [s for _, _, s in rows]
assert surnames == sorted(surnames, key=lambda s: namesort._fold(s))
assert namesort.surname('Robert Downey Jr.') == 'Downey'
assert namesort.surname('Ludwig van Beethoven') == 'van Beethoven'
assert namesort.surname('Martin Scorsese') == 'Scorsese'
# misspelled folder must not replace the real surname
assert namesort.sort_key('Martin Scorsese', 'Scorcese')[0] == namesort._fold('Scorsese')
assert namesort.sort_key('Martin Scorsese', 'Scorsese')[0] == namesort._fold('Scorsese')
assert namesort.display_name('01 - Mel Brooks') == 'Mel Brooks'
assert namesort.display_name('Brooks  (12)') == 'Brooks'
assert '(12)' not in namesort.display_name('Nicolas Cage  (4)')
assert namesort.surname('José González') == 'González'
print('ok', len(rows))
`);
  assert.match(out, /^ok /);
  const router = fs.readFileSync(path.join(lib, 'router.py'), 'utf8');
  assert.match(router, /rows\.sort\(key=lambda k: namesort\.sort_key\(meta\[k\]\[0\]\)\)/);
  assert.match(router, /SORT_METHOD_UNSORTED/);
  assert.doesNotMatch(router, /rows\.sort\(key=lambda k: catalog\.natkey/);
});

test('search submit, empty query, no match, and catalogue failure', () => {
  const out = py(`
import sys
sys.path.insert(0, ${JSON.stringify(lib)})
import searchflow
assert searchflow.submit('')['ok'] is False
assert searchflow.submit('   ')['status'].startswith('Type a title')
assert searchflow.submit('  Dune  ') == {'ok': True, 'query': 'Dune', 'status': ''}
assert 'could not be loaded' in searchflow.result_message('Dune', 0, True)
assert searchflow.result_message('Dune', 0, False).startswith('No results')
assert searchflow.result_message('Dune', 3, False) == ''
print('ok')
`);
  assert.equal(out, 'ok');
  const router = fs.readFileSync(path.join(lib, 'router.py'), 'utf8');
  assert.match(router, /ControlEdit/);
  assert.doesNotMatch(router, /action='noop'/);
});

test('update labels, package identity, and installer package', () => {
  const out = py(`
import io, json, sys, zipfile
sys.path.insert(0, ${JSON.stringify(lib)})
import updateflow
assert updateflow.label_for('checking') == 'Checking for updates'
assert updateflow.label_for('up_to_date') == 'Up to date'
assert updateflow.label_for('available') == 'Update available'
assert updateflow.label_for('failed') == 'Unable to check'
assert updateflow.installed_from_apk({'build': 45}, {'build': 99})['build'] == 45
url, size, sha = updateflow.package_download({'url': 'http://org', 'sha256': 'aaa', 'packages': {'com.fefc.kodi': {'url': 'http://phone', 'sha256': 'bbb', 'size': 3}}}, 'com.fefc.kodi')
assert url == 'http://phone' and sha == 'bbb'
assert updateflow.package_download({'url': 'http://org', 'sha256': 'aaa'}, 'com.fefc.kodi')[0] == ''
buf = io.BytesIO()
with zipfile.ZipFile(buf, 'w') as z:
    z.writestr('assets/fefc-build.json', json.dumps({'pkg': 'org.xbmc.kodi', 'build': 46}))
ident = updateflow.read_apk_identity(buf.getvalue())
assert updateflow.handoff_ok(ident, 'org.xbmc.kodi', 45, True)
assert not updateflow.handoff_ok(ident, 'com.fefc.kodi', 45, True)
assert not updateflow.handoff_ok(ident, 'org.xbmc.kodi', 46, True)
assert not updateflow.handoff_ok(ident, 'org.xbmc.kodi', 45, False)
assert updateflow.installer_builtin('') == ''
built = updateflow.installer_builtin('content://org.xbmc.kodi.fefcupdate/ext/FEFC-update.apk', updateflow.installer_package_for('org.xbmc.kodi'))
assert built.startswith('StartAndroidActivity(com.android.packageinstaller,')
phone = updateflow.installer_builtin('content://com.fefc.kodi.fefcupdate/ext/FEFC-update.apk', updateflow.installer_package_for('com.fefc.kodi'))
assert phone.startswith('StartAndroidActivity(com.google.android.packageinstaller,')
assert updateflow.installer_builtin('') == ''
print('ok')
`);
  assert.equal(out, 'ok');
  const svc = fs.readFileSync(path.join(root, 'kodi-src/plugin.video.fefc/service.py'), 'utf8');
  assert.doesNotMatch(svc, /Dialog\.Close\(all,true\)/);
  assert.doesNotMatch(svc, /_record_installed_build\(new\)/);
  assert.match(svc, /state='checking'/);
  assert.match(svc, /state='failed'/);
  assert.match(svc, /Downloading %s: %d%% \(%d \/ %d MB\)/);
});

test('back cue respects mute and does not double', () => {
  const out = py(`
import sys
sys.path.insert(0, ${JSON.stringify(lib)})
import backcue
assert backcue.gui_sound_mode(True) == 2
assert backcue.gui_sound_mode(False) == 0
assert backcue.should_play(False, 100, 10, 0) is False
assert backcue.should_play(True, 0, 10, 0) is False
assert backcue.should_play(True, 50, 10, 9.8) is False
assert backcue.should_play(True, 50, 10, 9.0) is True
assert backcue.plugin_back_should_play(True, 50, 10, 0, True) is False
play, skip = backcue.arm_back(True, 50, 10, 0, True)
assert play is False and skip is True
play, skip = backcue.arm_back(True, 50, 10, 0, False)
assert play is True and skip is True
play, skip = backcue.arm_back(False, 50, 10, 0, False)
assert play is False and skip is False
print('ok')
`);
  assert.equal(out, 'ok');
  const xml = fs.readFileSync(path.join(root, 'tools/kodi_navsfx.py'), 'utf8');
  assert.match(xml, /<name>back<\/name><file>back\.wav<\/file>/);
  assert.match(xml, /<name>previousmenu<\/name><file>back\.wav<\/file>/);
  assert.match(xml, /<name>parentdir<\/name><file>back\.wav<\/file>/);
  const keymap = fs.readFileSync(path.join(root, 'kodi-src/plugin.video.fefc/resources/keymaps/fefc-nav.xml'), 'utf8');
  assert.match(keymap, /action=armback/);
  assert.match(keymap, /\\nBack/);
  assert.ok(fs.existsSync(path.join(root, 'kodi-src/plugin.video.fefc/resources/ui-back.wav')));
  const router = fs.readFileSync(path.join(lib, 'router.py'), 'utf8');
  assert.match(router, /playSFX\(p, False\)/);
  assert.doesNotMatch(router, /Player\(\)\.stop\(\)/);
});

test('mosaic lattice, outside tap, skip, bar fit, ticker slide', () => {
  const out = py(`
import sys
sys.path.insert(0, 'tools')
import home_layout as L
cells = L.cells()
assert len(cells) == 16
assert len({(w, h) for _c, _r, _x, _y, w, h in cells}) == 1
assert L.CELL_W == 352 and L.CELL_H == 198
for side in ('top', 'bottom', 'left', 'right'):
    n = [c for c in cells if L.on_side(c[0], c[1], side)]
    assert len(n) == 5, (side, len(n))
beside = [c for c in cells if c[0] in (0, 4) and c[1] in (1, 2, 3)]
assert len(beside) == 6
for col, row in ((0, 0), (4, 0), (0, 4), (4, 4)):
    hit = [c for c in cells if c[0] == col and c[1] == row]
    assert len(hit) == 1
    _c, _r, x, y, w, h = hit[0]
    assert x >= 0 and y >= 0 and x + w <= L.W and y + h <= L.H
mx, my, mw, mh = L.menu_block()
assert (mx, my, mw, mh) == (400, 225, 1120, 630)
# menu cells are the same rectangle the video cells use
assert L.cell_rect(1, 1) == (400, 225, 352, 198)
assert L.cell_rect(2, 0)[0] == 784
print('ok')
`);
  assert.equal(out, 'ok');
  const home = fs.readFileSync(path.join(root, 'kodi-src/skin-fefc/xml/Home.xml'), 'utf8');
  assert.match(home, /<control type="videowindow">\s*<left>0<\/left><top>0<\/top><width>1920<\/width><height>1080<\/height>/);
  assert.match(home, /<control type="button" id="9001">\s*<left>400<\/left><top>225<\/top><width>352<\/width><height>198<\/height>/);
  assert.match(home, /<control type="button" id="9009">\s*<left>1168<\/left><top>657<\/top><width>352<\/width><height>198<\/height>/);
  assert.match(home, /<control type="button" id="9049">/);
  const guard = home.slice(home.indexOf('id="9049"'), home.indexOf('id="9000"'));
  assert.doesNotMatch(guard, /PlayerControl|FullScreen|ActivateWindow|RunPlugin/);
  assert.match(home, /<control type="button" id="9040">/);
  assert.match(home, /<label>SKIP<\/label>/);
  assert.match(home, /SetFocus\(9040\)/);
  assert.match(home, /<label>SEARCH<\/label>/);
  assert.match(home, /<label>SETTINGS<\/label>/);
  assert.match(home, /<width>165<\/width>/);
  assert.match(home, /<width>185<\/width>/);
  assert.match(home, /<width>250<\/width>/);
  const skin = fs.readFileSync(path.join(root, 'kodi-src/skin-fefc/xml/Includes_FEFC.xml'), 'utf8');
  assert.match(skin, /<include name="FefcBarIconButton">[\s\S]*?<textoffsetx>36<\/textoffsetx>/);
  assert.match(skin, /end="-16000,0"/);
  assert.match(skin, /tween="linear"/);
  assert.match(skin, /loop="true"/);
  assert.doesNotMatch(skin, /<scroll>true<\/scroll>/);
  assert.doesNotMatch(skin, /<label>ABOUT<\/label>/);
  const svc = fs.readFileSync(path.join(root, 'kodi-src/plugin.video.fefc/service.py'), 'utf8');
  assert.match(svc, /SKIP_AFTER = 3\.0/);
  assert.match(svc, /windowed=True/);
  assert.match(svc, /SetFocus\(9040\)/);
  assert.match(svc, /fit_loop/);
  assert.doesNotMatch(svc, /ticker_frame/);
  assert.doesNotMatch(svc, /PlayMedia\(/);
  assert.doesNotMatch(svc, /ControlButton\(960/);
  const fonts = fs.readFileSync(path.join(root, 'tools/build_kodi_skin.py'), 'utf8');
  assert.match(fonts, /fefc_bar<\/name>[\s\S]{0,80}<size>22<\/size>/);
});

test('bar labels fit after Kodi doubles textoffsetx', () => {
  const out = py(`
from PIL import ImageFont
font = ImageFont.truetype('/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf', 22)
def tw(s):
    return font.getlength(s)
# width - 2*offset must hold the word. Icon buttons use offset 36.
need = {
    'SEARCH': (165, 36),
    'SETTINGS': (185, 36),
    'SOUND OFF': (208, 36),
    'HOME': (151, 36),
    'ABOUT': (104, 0),
    'RESUME': (120, 0),
    'STOP': (90, 0),
    'Checking for updates': (250, 0),
    'Update available': (250, 0),
    'Unable to check': (250, 0),
    'Up to date': (250, 0),
}
for label, (width, offset) in need.items():
    room = width - 2 * offset
    got = tw(label)
    assert got + 6 <= room, (label, got, room)
print('ok')
`);
  assert.equal(out, 'ok');
});

test('ticker loop string lands on the slide slot', () => {
  const out = py(`
import sys
sys.path.insert(0, ${JSON.stringify(lib)})
import tickerfit
font = 'kodi-src/skin-fefc/fonts/Jura-Bold.ttf'
sample = '[COLOR FF5865F2]\\ue001[/COLOR]  Join the FEFC Discord    •    [COLOR FFFFB02E]NEW[/COLOR]  Example Edit'
fitted = tickerfit.fit_loop(sample, font)
w = tickerfit.text_width(tickerfit.strip_colors(fitted), font, 27)
assert abs(w - tickerfit.SLOT) < 8, w
assert '\\ue001' in fitted and 'NEW' in fitted
print('ok', round(w, 1))
`);
  assert.match(out, /^ok /);
});

test('wall frame shows all four corners, the top row, and black behind the menu', () => {
  const out = py(`
import subprocess
from PIL import Image
src = 'assets/home-wall.mp4'
frame = '/tmp/fefc-wall-frame.png'
r = subprocess.run(['ffmpeg', '-y', '-v', 'error', '-ss', '2', '-i', src, '-frames:v', '1', frame], capture_output=True)
assert r.returncode == 0, r.stderr
im = Image.open(frame).convert('RGB')
assert im.size == (1920, 1080), im.size
def p90(box):
    c = im.crop(box)
    vals = sorted(sum(px) / 3 for px in c.getdata())
    return vals[int(len(vals) * 0.9)]
# menu centre is the black plate (a dark clip can sit near black in one 24px sample)
assert p90((784, 441, 1136, 639)) < 3, p90((784, 441, 1136, 639))
# four corners, top centre, bottom centre, and a side cell carry picture
boxes = {
    'tl': (16, 9, 368, 207),
    'tr': (1552, 9, 1904, 207),
    'bl': (16, 873, 368, 1071),
    'br': (1552, 873, 1904, 1071),
    'top': (784, 9, 1136, 207),
    'bottom': (784, 873, 1136, 1071),
    'side': (16, 441, 368, 639),
}
for name, box in boxes.items():
    assert p90(box) > 18, (name, p90(box))
# gutter between the left column and the menu is black
assert p90((368, 40, 400, 180)) < 8
print('ok', round(p90(boxes['tl']), 1), round(p90(boxes['top']), 1))
`);
  assert.match(out, /^ok /);
});
