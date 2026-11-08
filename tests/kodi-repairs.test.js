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

test('mosaic cells, skip safe area, cast color, ticker, home-only about', () => {
  const wall = fs.readFileSync(path.join(root, 'tools/build_home_wall.py'), 'utf8');
  assert.match(wall, /TW, TH, GP = 400, 200, 12/);
  assert.match(wall, /348 - TW - GP/);
  assert.match(wall, /1172 \+ TW \+ GP/);
  assert.doesNotMatch(wall, /TW, TH = 324, 200/);
  const home = fs.readFileSync(path.join(root, 'kodi-src/skin-fefc/xml/Home.xml'), 'utf8');
  assert.match(home, /<control type="videowindow">\s*<left>0<\/left><top>0<\/top><width>1920<\/width><height>1080<\/height>/);
  assert.match(home, /<label>ABOUT<\/label>/);
  assert.match(home, /FEFC\.UpdateLabel/);
  assert.match(home, /<width>276<\/width>/);
  const skin = fs.readFileSync(path.join(root, 'kodi-src/skin-fefc/xml/Includes_FEFC.xml'), 'utf8');
  assert.doesNotMatch(skin, /<label>ABOUT<\/label>/);
  assert.doesNotMatch(skin, /FEFC\.UpdateLabel/);
  assert.match(skin, /<font>font_folder<\/font>/);
  assert.match(skin, /<scroll>true<\/scroll>/);
  assert.match(skin, /<scrollspeed>70<\/scrollspeed>/);
  const info = fs.readFileSync(path.join(root, 'kodi-src/skin-fefc/xml/DialogVideoInfo.xml'), 'utf8');
  assert.doesNotMatch(info, /textcolor>FF99CCFF<\/textcolor><label>\$INFO\[ListItem\.Label\]/);
  assert.match(info, /fefc-ol-focus\.png/);
  const svc = fs.readFileSync(path.join(root, 'kodi-src/plugin.video.fefc/service.py'), 'utf8');
  assert.match(svc, /ControlButton\(960, 520, 280, 140, 'SKIP'/);
  assert.doesNotMatch(svc, /1544, 886/);
  assert.doesNotMatch(svc, /ticker_frame/);
  const support = fs.readFileSync(path.join(lib, 'router.py'), 'utf8');
  assert.doesNotMatch(support, /def _bob/);
  assert.match(support, /aspectRatio=self\.KEEP/);
  const fonts = fs.readFileSync(path.join(root, 'tools/build_kodi_skin.py'), 'utf8');
  assert.match(fonts, /font_folder[\s\S]{0,80}<size>26<\/size>/);
});

test('restored wall frame has tiles in the 5+5+3 places and black behind the menu', () => {
  const out = py(`
import subprocess, os
from PIL import Image
src = 'assets/home-wall.mp4'
frame = '/tmp/fefc-wall-frame.png'
r = subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', src, '-frames:v', '1', frame], capture_output=True)
assert r.returncode == 0, r.stderr
im = Image.open(frame).convert('RGB')
assert im.size == (1920, 1080), im.size
def luma(x, y, w=24, h=24):
    c = im.crop((x, y, x+w, y+h))
    p = list(c.getdata())
    return sum(sum(px) for px in p) / (len(p) * 3)
# menu cell centres must be the black plate in the rendered wall
for x, y in ((548, 312), (960, 312), (1372, 312)):
    assert luma(x, y) < 12, (x, y, luma(x, y))
# a side tile and a bottom tile must carry picture
assert luma(120, 80) > 12, luma(120, 80)
assert luma(1700, 80) > 12, luma(1700, 80)
assert luma(548, 920) > 12, luma(548, 920)
print('ok', round(luma(120, 80), 1), round(luma(548, 312), 1))
`);
  assert.match(out, /^ok /);
});
