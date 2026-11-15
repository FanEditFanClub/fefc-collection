'use strict';
// Kodi loads keymaps in file-name order and a later file overrides an earlier one. The stock
// keyboard.xml / mouse.xml / remote.xml / touchscreen.xml bind menu, right-click and long-press to
// ContextMenu (which adds "Add to favourites"), so FEFC's keymap must sort after all of them.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('FEFC keymap is installed under a name that loads after the stock keymaps', () => {
  const name = 'zz-fefc-nav.xml';
  const stock = ['appcommand.xml', 'gamepad.xml', 'joystick.xml', 'keyboard.xml', 'mouse.xml', 'remote.xml', 'touchscreen.xml'];
  const sorted = [...stock, name].sort();
  assert.strictEqual(sorted[sorted.length - 1], name);
  for (const f of ['tools/fefc_kodi_bundle.py', 'tools/build_kodi_apk.py', 'tools/build_kodi_macos.py']) {
    const s = read(f);
    assert.ok(s.includes(name), f + ' installs ' + name);
    assert.ok(!/copy\([^)]*,[^)]*'fefc-nav\.xml'\)/.test(s), f + ' must not install the old name');
  }
});

test('menu key, right-click and touch long-press open the FEFC menu (no Add to favourites)', () => {
  const km = read('kodi-src/plugin.video.fefc/resources/keymaps/fefc-nav.xml');
  for (const re of [/<menu>RunPlugin\(plugin:\/\/plugin\.video\.fefc\/\?action=fefcmenu\)<\/menu>/,
    /<rightclick>RunPlugin\(plugin:\/\/plugin\.video\.fefc\/\?action=fefcmenu\)<\/rightclick>/,
    /<longpress>RunPlugin\(plugin:\/\/plugin\.video\.fefc\/\?action=fefcmenu\)<\/longpress>/,
    /<select mod="longpress">RunPlugin\(plugin:\/\/plugin\.video\.fefc\/\?action=fefcmenu\)<\/select>/]) {
    assert.match(km, re);
  }
  const router = read('kodi-src/plugin.video.fefc/resources/lib/router.py');
  const i = router.indexOf('def fefcmenu');
  const body = router.slice(i, router.indexOf('\n    def ', i + 10));
  assert.ok(body.includes("'Add to My List'"));
  assert.ok(!/favourite'/i.test(body.replace(/"""[\s\S]*?"""/, '')), 'FEFC menu has no favourites entry');
});
