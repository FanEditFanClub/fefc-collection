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
assert updateflow.version_key('0.6 Beta') == (0, 6, 0)
assert updateflow.version_key('0.6') == updateflow.version_key('0.6.0')
assert updateflow.release_is_newer('0.6 Beta', 1, '0.5.5 Beta', 99)
assert updateflow.release_is_newer('0.6.1', 2, '0.6 Beta', 50)
assert updateflow.release_is_newer('0.6.10', 3, '0.6.9', 80)
assert not updateflow.release_is_newer('0.6 Beta', 4, '0.6.0', 4)
assert updateflow.release_is_newer('0.6.0', 5, '0.6', 4)
assert not updateflow.release_is_newer('0.5.5 Beta', 100, '0.6 Beta', 1)
print('ok')
`);
  assert.equal(out, 'ok');
  const svc = fs.readFileSync(path.join(root, 'kodi-src/plugin.video.fefc/service.py'), 'utf8');
  assert.doesNotMatch(svc, /Dialog\.Close\(all,true\)/);
  assert.doesNotMatch(svc, /_record_installed_build\(new\)/);
  assert.match(svc, /state='checking'/);
  assert.match(svc, /release_is_newer/);
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

test('mosaic cells, skip safe area, cast color, ticker, about lives in settings', () => {
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
  assert.doesNotMatch(home, /<label>ABOUT<\/label>/);
  assert.doesNotMatch(home, /action=about/);
  assert.doesNotMatch(home, /id="9034"/);
  assert.match(home, /id="9033"[\s\S]{0,280}<onright>9023<\/onright>/);
  assert.match(home, /id="9023"[\s\S]{0,360}<onleft>9033<\/onleft>/);
  assert.match(home, /id="9023"[\s\S]{0,420}action=update/);
  assert.match(home, /FEFC\.UpdateLabel/);
  assert.match(home, /id="9031"[\s\S]{0,180}<width>220<\/width>/);
  assert.match(home, /id="9023"[\s\S]{0,200}<width>360<\/width>/);
  const settingsXml = fs.readFileSync(path.join(root, 'kodi-src/plugin.video.fefc/resources/settings.xml'), 'utf8');
  const strings = fs.readFileSync(path.join(root, 'kodi-src/plugin.video.fefc/resources/language/resource.language.en_gb/strings.po'), 'utf8');
  assert.match(settingsXml, /id="about_btn"[\s\S]{0,240}action=about/);
  assert.match(settingsXml, /id="check_update_btn"[\s\S]{0,240}action=update/);
  assert.match(strings, /msgctxt "#30030"\nmsgid "About"/);
  assert.match(strings, /msgctxt "#30031"\nmsgid "About"/);
  assert.match(strings, /msgctxt "#30032"\nmsgid "Check for software update"/);
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
  assert.doesNotMatch(skin, /end="99"/);
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
assert 'JOIN  Join' not in cta
assert 'DISCORD  Join the FEFC Discord' in cta
for piece in (ticker._cta(0), ticker._cta(1), ticker._cta(2), ticker._cta(3)):
    assert 'JOIN' not in piece, piece
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

test('support animation is the approved 24 fps clip as silent frames', () => {
  const media = path.join(root, 'kodi-src/plugin.video.fefc/resources/media/optimus-support');
  const frames = fs.readdirSync(media).filter((n) => /^f\d+\.jpg$/.test(n)).sort();
  assert.equal(frames.length, 265);
  assert.equal(frames[0], 'f001.jpg');
  assert.equal(frames[264], 'f265.jpg');
  const bytes = frames.reduce((n, f) => n + fs.statSync(path.join(media, f)).size, 0);
  assert.ok(bytes < 8000000, bytes);
  const out = py(`
import os, sys
sys.path.insert(0, ${JSON.stringify(lib)})
import optimusframes
media = ${JSON.stringify(path.join(root, 'kodi-src/plugin.video.fefc/resources/media'))}
frames = optimusframes.support_frames(media)
assert len(frames) == 265
assert all(p.endswith('.jpg') for p in frames)
assert not any(p.lower().endswith(('.mp4', '.m4a', '.aac', '.wav')) for p in frames)
print('ok', len(frames))
`);
  assert.match(out, /^ok /);
  const router = fs.readFileSync(path.join(lib, 'router.py'), 'utf8');
  assert.match(router, /support_frames/);
  assert.match(router, /1\.0 \/ 24\.0/);
  assert.match(router, /def _pump/);
  assert.doesNotMatch(router, /Player\(\)\.play\([^)]*optimus/);
});

test('item kind, my list actions, and opening sfx stay off the wall player', () => {
  const router = fs.readFileSync(path.join(lib, 'router.py'), 'utf8');
  const nav = fs.readFileSync(path.join(root, 'kodi-src/skin-fefc/xml/MyVideoNav.xml'), 'utf8');
  assert.match(router, /fefc_kind', 'video'/);
  assert.match(router, /fefc_kind', 'folder'/);
  assert.match(router, /shapes\.stamp\(li, 'action'/);
  const inc = fs.readFileSync(path.join(root, 'kodi-src/skin-fefc/xml/Includes_FEFC.xml'), 'utf8');
  assert.match(inc, /String\.IsEqual\(ListItem\.Property\(fefc_kind\),video\)/);
  assert.match(router, /def mylist_shuffle/);
  assert.match(router, /No starred videos to shuffle/);
  assert.match(router, /Name Z-A/);
  assert.match(router, /playSFX\(path, False\)/);
  assert.match(router, /_foreground_video\(\)/);
  assert.doesNotMatch(router, /Player\(\)\.play\(path\)/);
  assert.match(nav, /fefc-star\.png/);
  assert.match(nav, /Container\.PluginCategory,My List/);
});

test('folder tiles stay landscape and videos stay portrait at every depth', () => {
  const nav = fs.readFileSync(path.join(root, 'kodi-src/skin-fefc/xml/MyVideoNav.xml'), 'utf8');
  const inc = fs.readFileSync(path.join(root, 'kodi-src/skin-fefc/xml/Includes_FEFC.xml'), 'utf8');
  const router = fs.readFileSync(path.join(lib, 'router.py'), 'utf8');
  assert.match(nav, /Container\.SetViewMode\(501\)/);
  assert.match(nav, /content="FefcBrowser"/);
  assert.match(nav, /value="501"/);
  assert.match(nav, /value="500"/);
  assert.doesNotMatch(nav, /wraplist/);
  assert.doesNotMatch(nav, /Container\.Content\(movies\)/);
  assert.match(inc, /include name="FefcBrowser"/);
  assert.match(inc, /itemlayout width="283" height="150"/);
  assert.doesNotMatch(inc, /itemlayout[^>]*condition=/);
  assert.match(inc, /fefc_kind\),video\)/);
  assert.match(inc, /fefc_kind\),spacer\)/);
  assert.equal((inc.match(/<height>268<\/height>/g) || []).length, 2);
  assert.equal((inc.match(/<height>168<\/height>/g) || []).length, 2);
  // Poster block (group top 8 + title top 272 + title 168) fills the cells under it
  // and stops before the next real row. 3 x 150 = 450. 168px holds four 30px lines,
  // so the third line of a title is not sliced.
  assert.ok(8 + 272 + 168 > 150 * 2 && 8 + 272 + 168 <= 150 * 3);
  assert.ok(168 >= 30 * 4);
  assert.doesNotMatch(router, /nv > nf/);
  assert.match(router, /shapes\.listing_mode/);
  assert.match(router, /shapes\.stamp/);
  assert.match(router, /shapes\.pack/);
  assert.match(router, /def _enqueue/);
  const out = py(`
import json, sys
sys.path.insert(0, ${JSON.stringify(lib)})
import catalog, shapes
from webcounts import FOLD

class LI:
    def __init__(self):
        self.props = {}
        self.art = {}
    def setProperty(self, k, v):
        self.props[k] = v
    def setArt(self, art):
        self.art = dict(art)

v = LI(); shapes.stamp(v, 'video', 'poster.jpg')
assert v.props['fefc_kind'] == 'video' and v.art['poster'] == 'poster.jpg' and v.art['landscape'] == ''
f = LI(); shapes.stamp(f, 'folder', 'wide.jpg')
assert f.props['fefc_kind'] == 'folder' and f.art['landscape'] == 'wide.jpg' and f.art['poster'] == ''
a = LI(); shapes.stamp(a, 'action', 'tool.jpg')
assert a.props['fefc_kind'] == 'action' and a.art['landscape'] == 'tool.jpg' and a.art.get('poster') == ''
# Utilities are landscape. Only a video file is portrait. Blank is the Back/Up row.
utilities = [
    ('Back / Up', ''),
    ('Sort', 'action'),
    ('Shuffle Play', 'action'),
    ('Support Us', 'action'),
    ('Read Me', 'action'),
    ('Read First', 'folder'),
    ('Check for update', 'action'),
    ('Link My List', 'folder'),
    ('Sync My List', 'folder'),
    ('Recently Opened', 'folder'),
    ('Downloads', 'folder'),
    ('Next page', 'folder'),
]
for label, kind in utilities:
    assert shapes.shape_for_kind(kind) == 'landscape', label
    assert shapes.shape_for_kind(kind) != 'portrait', label
assert shapes.shape_for_kind('video') == 'portrait'
for kind in ('', 'folder', 'action', 'spacer', 'tool', 'button'):
    assert shapes.shape_for_kind(kind) != 'portrait', kind
# Landscape cards come first, in their own rows. Videos start on a fresh row.
mixed_kinds = ['folder', 'video', 'action', 'video', 'folder']
mixed_slots = shapes.pack(mixed_kinds)
assert [s for s in mixed_slots if s != 'spacer'] == ['folder', 'action', 'folder', 'video', 'video']
assert mixed_slots.index('video') % shapes.COLS == 0
assert shapes.audit(mixed_slots) == []
# Down off a landscape padding cell reaches the portrait grid, not the menu.
# 5 landscape cards pad column 5; the video is index 6.
padded = shapes.pack(['action'] * 5 + ['video'])
assert padded[5] == 'spacer' and padded[6] == 'video'
assert shapes.skip_delta(5, 4, lambda i, p=padded: p[i] if 0 <= i < len(p) else None) == 1
# Down from the last landscape card lands in the empty part of the video row
# and comes back to the video, not the menu bar.
assert shapes.skip_delta(10, 4, lambda i, p=padded: p[i] if 0 <= i < len(p) else None) == -4
# Down off the spacer under the last video reaches the menu. Up is the other way.
last = len(padded) - 1
assert shapes.skip_delta(last, last - shapes.COLS, lambda i, p=padded: p[i] if 0 <= i < len(p) else None) == 'menu'
assert shapes.skip_delta(1, 0, lambda i: {0: 'video', 1: 'spacer', 2: 'spacer', 3: 'folder'}.get(i)) == 2
assert shapes.skip_delta(0, None, lambda i: 'folder' if i == 0 else None) is None
assert shapes.skip_delta(2, 1, lambda i: {0: 'folder', 1: 'video', 2: 'spacer'}.get(i)) == -1
assert shapes.skip_delta(8, 2, lambda i: {2: 'video', 8: 'spacer'}.get(i)) == 'menu'
# Up from the menu lands on a spacer with no in-grid origin. That must walk
# up to a real tile, not straight back to the menu.
assert shapes.skip_delta(last, None, lambda i, p=padded: p[i] if 0 <= i < len(p) else None) == 'menu'
back = shapes.skip_delta(last, None, lambda i, p=padded: p[i] if 0 <= i < len(p) else None, from_menu=True)
assert back != 'menu' and back is not None and back < 0, back
idx = json.load(open('data/index.json'))
added = json.load(open('data/added.json'))
m = catalog.build_model({'index': idx, 'added': added})

def child_key(fid):
    it = m['items'].get(fid)
    return (it[3] if it and it[3] else fid)

def kids(fid):
    return [k for k in m['kids'].get(child_key(fid), []) if k in m['items']]

def kinds_for(fid, actions=0):
    out = ['action'] * actions
    key = child_key(fid)
    for _did, _name, kind in (m.get('docs') or {}).get(key, []):
        out.append('action' if kind == 'support' else 'folder')
    for k in kids(fid):
        if m['items'][k][2]:
            if (m.get('rcnt') or m['cnt']).get(k):
                out.append('folder')
        else:
            out.append('video')
    return out

def grouped(kinds):
    return [k for k in kinds if k != 'video'] + ['video' for k in kinds if k == 'video']

def check(name, kinds):
    assert kinds, name + ' empty'
    mode = shapes.listing_mode('video' in kinds)
    assert mode['view'] == 501 and mode['wrap'] is False, name
    assert mode['content'] == ('movies' if 'video' in kinds else 'files'), name
    slots = shapes.pack(kinds)
    real = [s for s in slots if s != 'spacer']
    assert real == grouped(kinds), (name, 'order', real[:12])
    if 'video' in kinds:
        assert slots.index('video') % shapes.COLS == 0, (name, 'video shared a landscape row')
        # Every video row is only videos and the cells reserved under them.
        for i, s in enumerate(slots):
            if s != 'video':
                continue
            row = (i // shapes.COLS) * shapes.COLS
            for c in range(shapes.COLS):
                j = row + c
                cell = slots[j] if j < len(slots) else None
                assert cell in ('video', 'spacer'), (name, 'mixed row', row, cell)
    for k in kinds:
        shape = shapes.shape_for_kind(k)
        if k == 'video':
            assert shape == 'portrait', (name, k, shape)
        else:
            assert shape == 'landscape', (name, k, shape)
    problems = shapes.audit(slots)
    assert not problems, (name, problems[:6])
    # A poster fills the cells under it: the next real row is SPAN cells down,
    # which is the poster block, not an empty band.
    if 'video' in kinds:
        assert shapes.SPAN * shapes.CELL_H == shapes.ROW_H['portrait']
        assert shapes.ROW_H['landscape'] == shapes.CELL_H
    print('PASS', name, 'items', len(kinds), 'videos', kinds.count('video'), 'slots', len(slots), 'view', mode['view'])

# A folder page: Back, then Sort, Shuffle, and Support Us, then its own rows.
# Back is the parent row (no kind). Sort and Shuffle are action. Support Us is action.
check('Folder with Back, Sort, Shuffle, Support Us', ['', 'action', 'action', 'action', 'folder', 'video'])
# Collections, including that same utility row
check('Collections', ['action', 'action'] + kinds_for(FOLD['collections']))
# Actors & Directors, then one person folder
people = kids(FOLD['directors'])
assert people, 'no directors'
check('Actors and Directors', ['folder'] * len(kids(FOLD['actors'])[:8] + people[:8]))
person = next(k for k in people if any(not m['items'][c][2] for c in kids(k)))
check('Director folder', kinds_for(person))
# Nested mixed folder, two or more levels under Collections
mixed = None
stack = [(FOLD['collections'], 1)]
seen = set()
while stack:
    fid, depth = stack.pop()
    if fid in seen:
        continue
    seen.add(fid)
    ks = kinds_for(fid)
    if depth >= 2 and 'folder' in ks and 'video' in ks:
        mixed = fid
        break
    if depth < 4:
        for k in kids(fid):
            if m['items'][k][2]:
                stack.append((k, depth + 1))
assert mixed, 'no mixed nested folder'
check('Nested mixed folder', kinds_for(mixed))
# New Arrivals
recent = [i for i in catalog.recent_ids(m)[:60] if i in m['items']]
check('New Arrivals', ['video' if not m['items'][i][2] else 'folder' for i in recent] + ['folder'])
# My List: Back, then Link, Sort, Shuffle, Recently Opened, Downloads (landscape), then videos
starred = [i for i in recent if not m['items'][i][2]][:5]
mylist = ['', 'folder', 'folder', 'folder', 'folder', 'folder'] + ['video'] * len(starred)
check('My List', mylist)
assert sum(1 for k in mylist if shapes.shape_for_kind(k) == 'landscape') == 6
assert all(shapes.shape_for_kind(k) == 'portrait' for k in mylist if k == 'video')
# Search results
found = catalog.search(m, 'star')
assert found, 'search empty'
check('Search results', ['folder' if m['items'][i][2] else 'video' for i in found])
# Plugin root: Collections, New Arrivals, Genres, My List, Search, Read Me,
# Support Us, Check for update. All are action cards, none are videos.
check('Plugin root', ['action'] * 8)
print('PASS Utilities', len(utilities))
print('IDS', json.dumps({'director': person, 'mixed': mixed, 'mixed_name': m['items'][mixed][0], 'director_name': m['items'][person][0]}))
`);
  assert.match(out, /PASS Utilities/);
  assert.match(out, /PASS Folder with Back, Sort, Shuffle, Support Us/);
  assert.match(out, /PASS Collections/);
  assert.match(out, /PASS Director folder/);
  assert.match(out, /PASS Nested mixed folder/);
  assert.match(out, /PASS New Arrivals/);
  assert.match(out, /PASS My List/);
  assert.match(out, /PASS Search results/);
  assert.match(out, /PASS Plugin root/);
  const ids = out.split('IDS ').pop();
  fs.writeFileSync('/tmp/shape-ids.json', ids.trim() + '\n');
});

test('genre lists leave out To Be Catalogued', () => {
  const out = py(`
import json, sys
sys.path.insert(0, ${JSON.stringify(lib)})
import catalog
idx = json.load(open('data/index.json'))
added = json.load(open('data/added.json'))
m = catalog.build_model({
    'index': idx,
    'added': added,
    'genres': json.load(open('data/genres.json')),
    'video-genres': json.load(open('data/video-genres.json')),
})
tbc = catalog.tbc_members(m['items'], m['kids'])
assert catalog.TBC_ID in tbc
col = '1fEaxNbFIrEwKRygETVm4jgtJGVAqKxGB'
assert col not in tbc, 'main collection was treated as To Be Catalogued'
listed = []
for g, ids in list(m['genre_videos'].items()) + list(m['genre_folders'].items()):
    for i in ids:
        if i in tbc or (m['items'][i][3] and m['items'][i][3] in tbc):
            listed.append((g, i))
assert not listed, ('tbc still listed', len(listed))
# Before = current lists plus catalogued items under TBC that carry the genre.
def carries(i, g):
    return g in (m['vgenres'].get(i) or [])
want = ['Action', 'Comedy', 'Drama', 'Horror', 'Sci-Fi']
print('GENRE videos_before videos_after videos_excluded folders_after')
for g in want:
    after_v = set(catalog.dedupe(m, m['genre_videos'].get(g) or []))
    after_f = catalog.dedupe(m, m['genre_folders'].get(g) or [])
    extra = [i for i in tbc if i in m['items'] and not m['items'][i][2] and carries(i, g) and i not in after_v]
    print('%s %d %d %d %d' % (g, len(after_v) + len(extra), len(after_v), len(extra), len(after_f)))
print('TBC_MEMBERS', len(tbc))
print('TBC_LEFT', len(listed))
`);
  assert.match(out, /TBC_LEFT 0/);
  const horror = out.split('\n').find((line) => line.startsWith('Horror '));
  const parts = horror.trim().split(/\s+/);
  assert.ok(Number(parts[2]) > 0, horror);
  assert.ok(Number(parts[3]) > 0, horror);
  console.log(out);
});

test('genre tiles are clean names on pages of nine', () => {
  const router = fs.readFileSync(path.join(lib, 'router.py'), 'utf8');
  assert.doesNotMatch(router, /%s  \(%d\)' % \(g,/);
  const out = py(`
import sys
sys.path.insert(0, ${JSON.stringify(lib)})
import genrepages
assert genrepages.clean_genre_name('01 - Horror') == 'Horror'
assert genrepages.clean_genre_name('12. Sci-Fi') == 'Sci-Fi'
assert genrepages.clean_genre_name('Comedy  (42)') == 'Comedy'
assert genrepages.clean_genre_name('Drama (7)') == 'Drama'
assert genrepages.clean_genre_name('Action #3') == 'Action'
assert genrepages.clean_genre_name('Fantasy') == 'Fantasy'
names = ['01 - Horror', 'Comedy  (42)', 'Unsorted', 'Uncategorized', 'Adventure', 'animation']
pages = genrepages.genre_pages(names, 9)
flat = [p for page in pages for p in page]
labels = [a for a, _ in flat]
assert labels == ['Adventure', 'animation', 'Comedy', 'Horror', 'Uncategorized'], labels
assert all(k == 'Unsorted' or 'Unsorted' not in labels for k in labels)
# Nine per page, last page short, no empty slots in the data.
many = ['G%02d' % i for i in range(20)]
ps = genrepages.genre_pages(many)
assert [len(p) for p in ps] == [9, 9, 2]
assert sum(len(p) for p in ps) == 20
print('ok', len(ps))
`);
  assert.equal(out, 'ok 3');
});

test('search screen keeps the approved loop and parks the caret', () => {
  const router = fs.readFileSync(path.join(lib, 'router.py'), 'utf8');
  const plan = fs.readFileSync(path.join(lib, 'optimusplan.py'), 'utf8');
  const show = fs.readFileSync(path.join(lib, 'genreshow.py'), 'utf8');
  assert.match(plan, /TITLE = 'Search with Fan Edit Optimus'/);
  assert.match(router, /optimusplan\.TITLE, font='font13'/);
  assert.doesNotMatch(router, /title_h, gap, bar_h/);
  assert.match(router, /fefc-mark-grok\.png/);
  assert.match(router, /fefc-mark-discord\.png/);
  assert.match(router, /fefc-mark-muse\.png/);
  const home = fs.readFileSync(path.join(root, 'kodi-src/skin-fefc/xml/Home.xml'), 'utf8');
  const bar = fs.readFileSync(path.join(root, 'kodi-src/skin-fefc/xml/Includes_FEFC.xml'), 'utf8');
  const genres = fs.readFileSync(path.join(lib, 'genreshow.py'), 'utf8');
  assert.match(home, /FEFC\.Genres/);
  assert.match(genres, /FEFC\.Genres/);
  assert.match(genres, /DialogGenres\.xml/);
  assert.match(bar, /fefc-ic-home\.png/);
  assert.match(bar, /<label>HOME<\/label>/);
  assert.match(bar, /fefc-ic-search\.png/);
  assert.match(bar, /<label>SEARCH<\/label>/);
  assert.match(plan, /Optimus is watching a fan edit\. Type to interrupt him\./);
  assert.match(plan, /FRAME_MS = 125/);
  assert.doesNotMatch(router, /Select the bar and type a title/);
  assert.match(router, /def _park_edit/);
  assert.match(router, /setPosition\(-400, -200\)/);
  assert.match(router, /fefc-ic-search\.png/);
  assert.match(show, /%d\/%d/);
  assert.match(show, /ACTION_PARENT_DIR/);
  assert.match(show, /self\.menu\[0\]/);
  assert.match(genres, /self\.menu\[0\]/);
});

test('drive first frames are not used when show or folder art exists', () => {
  const out = py(`
import json, sys
sys.path.insert(0, ${JSON.stringify(lib)})
import catalog
m = catalog.build_model({
    'index': json.load(open('data/index.json')),
    'posters': json.load(open('data/posters.json')),
    'folderthumbs': json.load(open('data/folderthumbs.json')),
    'added': json.load(open('data/added.json')),
})
rep = catalog.art_report(m)
assert rep['drive_before'] > rep['missing_after'], rep
assert rep['replaced'] > 0, rep
assert not any(str(u).startswith('drive:') or 'drive.google.com/thumbnail' in str(u) for u in m['art'].values())
# Cited titles borrow real art when the catalogue already has it. No TMDB call.
needles = ('home alone 2', 'craig ferguson', 'gumby', 'astro-monster', 'astro monster', 'godzilla')
hit = {n: {'art': 0, 'missing': 0} for n in needles}
for i, v in m['items'].items():
    if v[2]:
        continue
    n = v[0].lower()
    for needle in needles:
        if needle in n:
            hit[needle]['art' if m['art'].get(i) else 'missing'] += 1
print('ART', rep['videos'], rep['drive_before'], rep['missing_after'], rep['replaced'],
      rep['by'].get('sibling', 0), rep['by'].get('show', 0), rep['by'].get('folder', 0))
for n, c in hit.items():
    print('TITLE', n, c['art'], c['missing'])
# A title the catalogue can already illustrate must not stay on a first frame.
assert hit['godzilla']['art'] > 0
assert hit['home alone 2']['art'] > 0 and hit['home alone 2']['missing'] == 0
assert hit['gumby']['art'] > 300
assert hit['astro-monster']['art'] + hit.get('astro monster', {}).get('art', 0) > 0
`);
  assert.match(out, /ART /);
  console.log(out);
});

test('regressions: back key, menu words, genre list, nav gain', () => {
  const keymap = fs.readFileSync(path.join(root, 'kodi-src/plugin.video.fefc/resources/keymaps/fefc-nav.xml'), 'utf8');
  assert.match(keymap, /<back>PreviousMenu<\/back>/);
  assert.match(keymap, /<escape>PreviousMenu<\/escape>/);
  assert.match(keymap, /<backspace>PreviousMenu<\/backspace>/);
  assert.match(keymap, /<browser_back>PreviousMenu<\/browser_back>/);
  assert.doesNotMatch(keymap, /armback/);
  assert.doesNotMatch(keymap, /<back>[^<]*RunPlugin/);
  const home = fs.readFileSync(path.join(root, 'kodi-src/skin-fefc/xml/Home.xml'), 'utf8');
  const skin = fs.readFileSync(path.join(root, 'kodi-src/skin-fefc/xml/Includes_FEFC.xml'), 'utf8');
  const nav = fs.readFileSync(path.join(root, 'kodi-src/skin-fefc/xml/MyVideoNav.xml'), 'utf8');
  assert.match(home, /RunPlugin\(plugin:\/\/plugin\.video\.fefc\/\?action=genres\)/);
  assert.doesNotMatch(home, /ActivateWindow\(Videos,plugin:\/\/plugin\.video\.fefc\/\?action=genres/);
  assert.doesNotMatch(nav, /Video add-ons/);
  assert.doesNotMatch(nav, /Playlists/);
  assert.doesNotMatch(home, /Video add-ons/);
  const router = fs.readFileSync(path.join(lib, 'router.py'), 'utf8');
  assert.match(router, /GENRE_PAGE = 60/);
  assert.match(router, /genre-menu\.json/);
  const genresFn = router.slice(router.indexOf('def genres('), router.indexOf('\n    def genre('));
  assert.doesNotMatch(genresFn, /endOfDirectory\(/);
  assert.match(genresFn, /action='genre'/);
  const nvs = fs.readFileSync(path.join(root, 'tools/kodi_navsfx.py'), 'utf8');
  assert.match(nvs, /NAV_QUIET = 0\.85/);
  assert.match(nvs, /NAV_QUIET_NAMES = \('move', 'back'\)/);
  assert.match(router, /SUPPORT_H/);
  const out = py(`
import json, sys
sys.path.insert(0, ${JSON.stringify(lib)})
import catalog
from PIL import ImageFont
font = ImageFont.truetype('/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf', 20)
need = {
    'SOUND ON': font.getbbox('SOUND ON')[2] + 52 + 26,
    'SOUND OFF': font.getbbox('SOUND OFF')[2] + 52 + 26,
    'SETTINGS': font.getbbox('SETTINGS')[2] + 52 + 26,
    'Checking for updates': font.getbbox('Checking for updates')[2] + 52,
}
# Shared bar buttons, from the skin include. SOUND is 240, SETTINGS is 220.
assert need['SOUND OFF'] <= 240, need
assert need['SETTINGS'] <= 220, need
assert need['Checking for updates'] <= 360, need
raw = {}
for n in catalog.SOURCES:
    p = 'data/' + n + '.json'
    try:
        raw[n] = json.load(open(p))
    except FileNotFoundError:
        pass
m = catalog.build_model(raw)
tbc = catalog.tbc_members(m['items'], m['kids'])
menu = json.load(open('kodi-src/plugin.video.fefc/resources/genre-menu.json'))
bad = []
for row in menu:
    g = row['key']
    folders = [i for i in catalog.dedupe(m, m['genre_folders'].get(g) or []) if i not in tbc]
    vids = [i for i in catalog.dedupe(m, m['genre_videos'].get(g) or []) if i not in tbc]
    print('GENRE', g, len(folders), len(vids))
    if not folders and not vids:
        bad.append(g)
assert not bad, bad
print('ok', len(menu))
`);
  assert.match(out, /^ok /m);
  console.log(out);
});

test('page pack, ticker windows, search open, marks, shared bar', () => {
  const home = fs.readFileSync(path.join(root, 'kodi-src/skin-fefc/xml/Home.xml'), 'utf8');
  const skin = fs.readFileSync(path.join(root, 'kodi-src/skin-fefc/xml/Includes_FEFC.xml'), 'utf8');
  const nav = fs.readFileSync(path.join(root, 'kodi-src/skin-fefc/xml/MyVideoNav.xml'), 'utf8');
  const info = fs.readFileSync(path.join(root, 'kodi-src/skin-fefc/xml/DialogVideoInfo.xml'), 'utf8');
  const genres = fs.readFileSync(path.join(root, 'kodi-src/plugin.video.fefc/resources/skins/Default/1080i/DialogGenres.xml'), 'utf8');
  for (const xml of [home, nav, info]) {
    assert.match(xml, /FefcTicker/);
  }
  assert.match(genres, /<scroll>true<\/scroll>/);
  assert.match(skin, /Integer\.IsEqual\(Container\.Viewmode,\$PARAM\[id\]\)/);
  assert.match(nav, /FefcTopBar/);
  assert.match(skin, /id="9290"[\s\S]{0,220}<width>220<\/width>/);
  assert.match(skin, /id="9294"[\s\S]{0,280}<width>240<\/width>/);
  assert.match(skin, /id="9292"[\s\S]{0,280}<width>220<\/width>/);
  assert.match(home, /id="9031"[\s\S]{0,180}<width>220<\/width>/);
  assert.match(home, /id="9032"[\s\S]{0,220}<width>240<\/width>/);
  assert.match(home, /id="9033"[\s\S]{0,220}<width>220<\/width>/);
  assert.match(genres, /id="9402"[\s\S]{0,120}<width>220<\/width>[\s\S]{0,500}<label>SEARCH<\/label>/);
  assert.match(genres, /id="9403"[\s\S]{0,120}<width>240<\/width>/);
  assert.match(genres, /id="9404"[\s\S]{0,120}<width>220<\/width>/);
  const router = fs.readFileSync(path.join(lib, 'router.py'), 'utf8');
  const searchFn = router.slice(router.indexOf('def search('), router.indexOf('\n    def searchbox('));
  const endAt = searchFn.indexOf('endOfDirectory');
  const winAt = searchFn.indexOf('OptimusWindow');
  assert.ok(endAt >= 0 && winAt > endAt, 'directory must end before the search window');
  assert.match(router, /_close_busy\(\)/);
  assert.match(router, /_media_file\('fefc-mark-grok\.png'\)/);
  assert.match(router, /_media_file\('fefc-mark-discord\.png'\)/);
  assert.match(router, /_media_file\('fefc-mark-muse\.png'\)/);
  assert.match(router, /width \* 15 \/ 200\.0/);
  assert.match(router, /pagepack\.folder_page/);
  assert.match(router, /_marquee_loop/);
  for (const name of ['fefc-mark-grok.png', 'fefc-mark-discord.png', 'fefc-mark-muse.png']) {
    assert.ok(fs.existsSync(path.join(root, 'kodi-src/plugin.video.fefc/resources/media', name)), name);
  }
  assert.ok(fs.existsSync(path.join(root, 'kodi-src/plugin.video.fefc/resources/shipped/pages.pack')));
  const out = py(`
import sys, time
sys.path.insert(0, ${JSON.stringify(lib)})
import pagepack
p = pagepack.shipped_path()
t0 = time.perf_counter()
root = pagepack.root_id(p)
doc = pagepack.folder_page(root, 0, p)
folder_ms = (time.perf_counter() - t0) * 1000
assert doc and len(doc['rows']) == 60 and doc['total'] > 60, doc
t1 = time.perf_counter()
g = pagepack.genre_page('Action', 0, p)
genre_ms = (time.perf_counter() - t1) * 1000
assert g and len(g['rows']) == 60 and g['total'] > 60
t2 = time.perf_counter()
r = pagepack.recent_page(0, p)
recent_ms = (time.perf_counter() - t2) * 1000
assert r and len(r['rows']) == 60
t3 = time.perf_counter()
s = pagepack.search_page('tarantino', 0, p)
search_ms = (time.perf_counter() - t3) * 1000
assert s and s['total'] > 0 and len(s['rows']) <= 60
import os, optimusframes
media = os.path.normpath(os.path.join(os.path.dirname(pagepack.shipped_path()), '..', 'media'))
t4 = time.perf_counter()
frames = optimusframes.frame_list(media)
open_ms = (time.perf_counter() - t4) * 1000
assert frames
print('TIMES folder %.2f genre %.2f recent %.2f search %.2f frames %.2f rows %d' % (
    folder_ms, genre_ms, recent_ms, search_ms, open_ms, doc['total']))
`);
  assert.match(out, /TIMES /);
  console.log(out);
});

