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

test('person tiles use original folder names, not metadata full names', () => {
  const out = py(`
import json, sys
sys.path.insert(0, ${JSON.stringify(lib)})
import namesort
people = json.load(open('data/people.json'))
idx = {it['id']: it for it in json.load(open('data/index.json'))['items']}
rows = []
for i, v in people.items():
    drive = (idx.get(i) or {}).get('name') or ''
    label = namesort.original_folder_name(drive, v.get('folder'))
    assert label != v.get('name'), (label, v.get('name'))
    assert label == v.get('folder')
    rows.append((namesort.folder_sort_key(label), label))
rows.sort()
labels = [n for _, n in rows]
assert labels.index('Brooks') < labels.index('Carrey')
assert labels == sorted(labels, key=lambda s: namesort._fold(s))
assert 'Mel Brooks' not in labels
assert 'Scorcese' in labels and 'Scorsese' not in labels
assert namesort.original_folder_name('Scorcese', 'Martin Scorsese') == 'Scorcese'
assert namesort.original_folder_name('', 'Brooks') == 'Brooks'
assert namesort.folder_sort_key('Scorcese') == namesort._fold('Scorcese')
assert namesort.folder_sort_key('2001') == namesort._fold('2001')
print('ok', len(rows))
`);
  assert.match(out, /^ok /);
  const router = fs.readFileSync(path.join(lib, 'router.py'), 'utf8');
  assert.match(router, /namesort\.original_folder_name\(m\['items'\]\[k\]\[0\]\)/);
  assert.match(router, /namesort\.folder_sort_key\(m\['items'\]\[k\]\[0\]\)/);
  assert.doesNotMatch(router, /namesort\.display_name\(meta\[k\]\[0\]\)/);
  assert.doesNotMatch(router, /'%s  \(%d\)' % \(v\[0\], n\)/);
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
  assert.doesNotMatch(keymap, /action=armback/);
  assert.doesNotMatch(keymap, /\\nBack/);
  assert.match(keymap, /action=fefcmenu/);
  assert.ok(fs.existsSync(path.join(root, 'kodi-src/plugin.video.fefc/resources/ui-back.wav')));
  const router = fs.readFileSync(path.join(lib, 'router.py'), 'utf8');
  assert.match(router, /playSFX\(p, False\)/);
  assert.doesNotMatch(router, /Player\(\)\.stop\(\)/);
});

test('mosaic cells, skip safe area, cast color, ticker, home-only about', () => {
  const out = py(`
import sys
sys.path.insert(0, ${JSON.stringify(lib)})
import wallplan
cells = wallplan.mosaic_cells()
assert len(cells) == 10
xs = sorted({c[0] for c in cells})
ys = sorted({c[1] for c in cells})
assert len(xs) == 2 and len(ys) == 5
top = [c for c in cells if c[1] == ys[0]]
bot = [c for c in cells if c[1] == ys[-1]]
left = [c for c in cells if c[0] == xs[0]]
right = [c for c in cells if c[0] == xs[-1]]
assert len(top) == 2 and len(bot) == 2 and len(left) == 5 and len(right) == 5
assert (348, ys[0], 400, 200) not in cells
assert (760, ys[-1], 400, 200) not in cells
assert all(c[2] == 400 and c[3] == 200 for c in cells)
# centre 3x3 is not a video cell
assert (348, 212, 400, 200) not in cells
# four corners
for x in (xs[0], xs[-1]):
    for y in (ys[0], ys[-1]):
        assert (x, y, 400, 200) in cells
x, y, w, h = wallplan.skip_button()
assert x + w <= 1824 and y + h <= 1026
assert x >= 1400 and y >= 860
assert w >= 200 and h >= 72
print('ok', x, y, w, h)
`);
  assert.match(out, /^ok /);
  const wall = fs.readFileSync(path.join(root, 'tools/build_home_wall.py'), 'utf8');
  assert.match(wall, /mosaic_cells\(\)/);
  const home = fs.readFileSync(path.join(root, 'kodi-src/skin-fefc/xml/Home.xml'), 'utf8');
  assert.match(home, /<control type="videowindow">\s*<left>0<\/left><top>0<\/top><width>1920<\/width><height>1080<\/height>/);
  assert.match(home, /<label>ABOUT<\/label>/);
  assert.match(home, /FEFC\.UpdateLabel/);
  assert.match(home, /id="9031"[\s\S]{0,180}<width>220<\/width>/);
  assert.match(home, /<width>360<\/width>/);
  assert.match(home, /id="8990"/);
  assert.match(home, /<label>ACTORS &amp;<\/label>/);
  assert.match(home, /<label>DIRECTORS<\/label>/);
  assert.doesNotMatch(home, /PlayerControl\(Stop\)[\s\S]{0,80}id="8990"/);
  const skin = fs.readFileSync(path.join(root, 'kodi-src/skin-fefc/xml/Includes_FEFC.xml'), 'utf8');
  assert.doesNotMatch(skin, /<label>ABOUT<\/label>/);
  assert.doesNotMatch(skin, /FEFC\.UpdateLabel/);
  assert.match(skin, /<label>HOME<\/label>/);
  assert.match(skin, /<label>SEARCH<\/label>/);
  assert.match(skin, /<label>SETTINGS<\/label>/);
  assert.match(skin, /id="9290"[\s\S]{0,220}<width>220<\/width>/);
  const keep = fs.readFileSync(path.join(root, 'kodi-src/skin-fefc/xml/Custom_11191_WallKeep.xml'), 'utf8');
  assert.match(keep, /id="11191"/);
  assert.match(keep, /videowindow/);
  assert.match(skin, /<font>font_folder<\/font>/);
  assert.match(skin, /<scroll>true<\/scroll>/);
  assert.match(skin, /<scrollspeed>48<\/scrollspeed>/);
  assert.match(skin, /pulse="true"/);
  assert.match(skin, /FefcWallKeep/);
  const info = fs.readFileSync(path.join(root, 'kodi-src/skin-fefc/xml/DialogVideoInfo.xml'), 'utf8');
  assert.doesNotMatch(info, /textcolor>FF99CCFF<\/textcolor><label>\$INFO\[ListItem\.Label\]/);
  assert.match(info, /fefc-ol-focus\.png/);
  assert.match(info, /FefcWallKeep/);
  const svc = fs.readFileSync(path.join(root, 'kodi-src/plugin.video.fefc/service.py'), 'utf8');
  assert.match(svc, /skip_button\(\)/);
  assert.match(svc, /pos >= 3\.0/);
  assert.doesNotMatch(svc, /960, 520, 280, 140, 'SKIP'/);
  assert.doesNotMatch(svc, /ticker_frame/);
  const support = fs.readFileSync(path.join(lib, 'router.py'), 'utf8');
  assert.doesNotMatch(support, /def _bob/);
  assert.match(support, /aspectRatio=self\.KEEP/);
  assert.match(support, /aspectRatio=2/);
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
# corners, top-middle row, a side tile and a bottom tile must carry picture
assert luma(120, 80) > 12, luma(120, 80)
assert luma(548, 80) > 12, luma(548, 80)
assert luma(960, 80) > 12, luma(960, 80)
assert luma(1372, 80) > 12, luma(1372, 80)
assert luma(1700, 80) > 12, luma(1700, 80)
assert luma(548, 920) > 12, luma(548, 920)
print('ok', round(luma(120, 80), 1), round(luma(960, 80), 1), round(luma(548, 312), 1))
`);
  assert.match(out, /^ok /);
});

test('ticker strips visible URLs and keeps post text', () => {
  const out = py(`
import sys
sys.path.insert(0, ${JSON.stringify(lib)})
import ticker
assert ticker._clean('Watch https://example.com/a today') == 'Watch today'
assert 'discord.gg' not in ticker._clean('Join discord.gg/d8A9xHTey7 now')
assert ticker._clean('Hello [site](https://x.com/a) fans') == 'Hello site fans'
assert ticker._clean('Plain sentence about fan edits.') == 'Plain sentence about fan edits.'
text = ticker.build_text([], [{'src': 'discord', 'title': 'New cut https://fanedit.org/x is up'}])
assert 'http' not in text and 'fanedit.org' not in text
assert 'New cut' in text and 'is up' in text
cta = ticker.build_text([], [])
assert 'discord.gg' not in cta and 'http' not in cta
assert 'Discord' in cta
print('ok')
`);
  assert.equal(out, 'ok');
});

test('QR png is square with a 4-module quiet zone', () => {
  const out = py(`
import sys
sys.path.insert(0, ${JSON.stringify(lib)})
import qrdraw
url = 'https://www.patreon.com/cw/FanEditFanClub'
rows, info = qrdraw.rgb_rows(url, size=600, quiet=4)
assert info['quiet'] == 4
assert info['side'] == len(rows)
assert len(rows[0]) // 3 == info['side']
px = info['px']
q = 4 * px
# corners of the quiet zone are white; a module inside the finder is not all white
assert rows[0][:3] == b'\\xff\\xff\\xff'
assert rows[q][q*3:q*3+3] == b'\\x00\\x00\\x00'
print('ok', info['side'], info['modules'])
`);
  assert.match(out, /^ok /);
});

test('search animation is silent frames and does not use the video player', () => {
  const media = path.join(root, 'kodi-src/plugin.video.fefc/resources/media/optimus-search');
  const frames = fs.readdirSync(media).filter((n) => /^f\d+\.jpg$/.test(n)).sort();
  assert.ok(frames.length >= 24 && frames.length <= 60);
  const bytes = frames.reduce((n, f) => n + fs.statSync(path.join(media, f)).size, 0);
  assert.ok(bytes < 800000, bytes);
  const out = py(`
import os, sys
sys.path.insert(0, ${JSON.stringify(lib)})
import optimusframes, optimusplan
media = ${JSON.stringify(path.join(root, 'kodi-src/plugin.video.fefc/resources/media'))}
frames = optimusframes.frame_list(media)
assert frames and all(p.endswith('.jpg') for p in frames)
assert not any(p.lower().endswith(('.mp4', '.m4a', '.aac', '.wav')) for p in frames)
assert optimusplan.FRAME_MS >= 80
print('ok', len(frames))
`);
  assert.match(out, /^ok /);
  const router = fs.readFileSync(path.join(lib, 'router.py'), 'utf8');
  assert.match(router, /def _halt_anim/);
  assert.match(router, /setFocus\(self\.btn\)/);
  assert.doesNotMatch(router, /Player\(\)\.play\([^)]*optimus/);
  assert.doesNotMatch(router, /optimus-popcorn-search\.mp4/);
});

test('item kind, my list actions, and opening sfx stay off the wall player', () => {
  const router = fs.readFileSync(path.join(lib, 'router.py'), 'utf8');
  const nav = fs.readFileSync(path.join(root, 'kodi-src/skin-fefc/xml/MyVideoNav.xml'), 'utf8');
  assert.match(router, /fefc_kind', 'video'/);
  assert.match(router, /fefc_kind', 'folder'/);
  assert.match(router, /fefc_kind', 'action'/);
  assert.match(nav, /String\.IsEqual\(ListItem\.Property\(fefc_kind\),video\)/);
  assert.match(router, /def mylist_shuffle/);
  assert.match(router, /No starred videos to shuffle/);
  assert.match(router, /Name Z-A/);
  assert.match(router, /playSFX\(path, False\)/);
  assert.match(router, /_foreground_video\(\)/);
  assert.doesNotMatch(router, /Player\(\)\.play\(path\)/);
  assert.match(nav, /fefc-star\.png/);
  assert.match(nav, /Container\.PluginCategory,My List/);
});
