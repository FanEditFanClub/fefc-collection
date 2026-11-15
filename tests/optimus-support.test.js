// 0.6.6: Support Us Optimus legs stutter. Frames must be complete and in order, and the pump must
// never reveal a frozen frame under the animated one.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const {spawnSync} = require('child_process');
const root = path.join(__dirname, '..');
const dir = path.join(root, 'kodi-src/plugin.video.fefc/resources/media/optimus-support');

test('265 frames, contiguous f001..f265, 480x933 JPEGs', () => {
  const names = fs.readdirSync(dir).filter((n) => /^f\d{3}\.jpg$/.test(n)).sort();
  assert.equal(names.length, 265);
  names.forEach((n, i) => assert.equal(n, 'f' + String(i + 1).padStart(3, '0') + '.jpg'));
});

test('every frame has both legs and no leg blinks against its neighbours', () => {
  const r = spawnSync('python3', ['tools/fix_support_legs.py', '--check'], {cwd: root, encoding: 'utf8'});
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /bad 0 \[\]/);
});

test('pump: one animated image over a back buffer holding the previous frame, 24 fps clock', () => {
  const src = fs.readFileSync(path.join(root, 'kodi-src/plugin.video.fefc/resources/lib/router.py'), 'utf8');
  const cls = src.slice(src.indexOf('class SupportWindow'), src.indexOf('\nclass ', src.indexOf('class SupportWindow') + 10));
  assert.equal((cls.match(/self\.art = xbmcgui\.ControlImage/g) || []).length, 1, 'one front image');
  assert.equal((cls.match(/self\.art_back = xbmcgui\.ControlImage/g) || []).length, 1, 'one back buffer');
  assert.ok(cls.indexOf('addControl(self.art_back)') < cls.indexOf('addControl(self.art)'), 'back buffer is drawn below');
  assert.match(cls, /frame_s = 1\.0 \/ 24\.0/);
  assert.match(cls, /self\.art_back\.setImage\(self\._frames\[last\], False\)/);
  assert.match(cls, /self\.art\.setImage\(self\._frames\[i\], False\)/);
});
