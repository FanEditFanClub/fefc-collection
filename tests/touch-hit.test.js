// 0.6.6 build 68: a tap on the lower half of a poster (or its title) lands on a
// reserved cell under it; that cell must hand the select to the poster's video.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const {spawnSync} = require('child_process');
const root = path.join(__dirname, '..');
const lib = path.join(root, 'kodi-src/plugin.video.fefc/resources');

function py(code) {
  const r = spawnSync('python3', ['-c', code], {encoding: 'utf8', cwd: root});
  if (r.status !== 0) throw new Error(r.stderr || r.stdout);
  return r.stdout.trim();
}

test('every cell under a poster belongs to that poster; padding cells to none', () => {
  const out = py(`
import sys; sys.path.insert(0, ${JSON.stringify(lib)})
from lib import shapes
s = shapes.pack(['folder', 'action', 'video', 'video', 'video'], leading=1)
owners = [shapes.poster_owner(s, i) for i in range(len(s))]
vids = [i for i, k in enumerate(s) if k == 'video']
for v in vids:
    for k in range(1, shapes.SPAN):
        j = v + k * shapes.COLS
        if j < len(s):
            assert owners[j] == v, (j, owners[j], v)
for i, k in enumerate(s):
    if k != 'spacer':
        assert owners[i] is None
# the padding that finishes the landscape row has no poster over it
assert owners[2] is None and owners[4] is None
lk = lambda i: s[i] if 0 <= i < len(s) else None
assert shapes.owner_delta(vids[0] + 2 * shapes.COLS, lk) == -2 * shapes.COLS
assert shapes.owner_delta(vids[0], lk) is None
print('ok')
`);
  assert.strictEqual(out, 'ok');
});

test('reserved cells carry their video and gridpad selects it; TV skip path is unchanged', () => {
  const router = fs.readFileSync(path.join(lib, 'lib/router.py'), 'utf8');
  assert.match(router, /kw\['target'\] = owner_url/);
  assert.match(router, /SetFocus\(%s,%d,absolute\)' % \(cid, n\)\)\s*\n\s*xbmc.executebuiltin\('Action\(Select\)'\)/);
  const svc = fs.readFileSync(path.join(root, 'kodi-src/plugin.video.fefc/service.py'), 'utf8');
  // pointer-only branch, then the original D-pad skip
  assert.match(svc, /Window\.IsVisible\(10099\)[\s\S]*step = skip_delta\(pos, origin, lookup, from_menu=from_menu\)/);
});

test('History records Play, VLC and Drive when picked', () => {
  const router = fs.readFileSync(path.join(lib, 'lib/router.py'), 'utf8');
  for (const fn of ['def play(self)', 'def open_vlc(self)', 'def open_drive(self)', 'def play_download(self)']) {
    const body = router.slice(router.indexOf(fn), router.indexOf('\n    def ', router.indexOf(fn) + 10));
    assert.match(body, /_record_opened\(/, fn);
  }
});
