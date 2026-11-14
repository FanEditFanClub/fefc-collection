const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

test('intro skip control reads SKIP and uses the Home tile look', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(html, /<button type="button" class="ihint" id="iskip" aria-label="Skip intro">SKIP<\/button>/);
  assert.doesNotMatch(html, /Skip ›|SKIP INTRO/);
  const css = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
  assert.match(css, /#intro \.ihint\{[^}]*border:2px solid #9fb6cf/);
  // Kodi: SKIP is the button the skin build adds to the video OSD (a dialog cannot draw over
  // fullscreen video). The unused SkipIntro WindowDialog was removed, so the service only
  // raises FEFC.Skip and focuses that OSD control.
  const py = fs.readFileSync(path.join(root, 'kodi-src/plugin.video.fefc/service.py'), 'utf8');
  assert.match(py, /setProperty\('FEFC\.Skip', '1'\)/);
  assert.match(py, /SetFocus\(11192\)/);
  assert.doesNotMatch(py, /class SkipIntro/);
  assert.doesNotMatch(py, /SKIP INTRO/);
  const skin = fs.readFileSync(path.join(root, 'tools/build_kodi_skin.py'), 'utf8');
  const osd = skin.slice(skin.indexOf('<control type="button" id="11192">'));
  assert.ok(osd.length > 0 && skin.includes('<control type="button" id="11192">'));
  assert.match(osd, /^[\s\S]{0,900}<label>SKIP<\/label>/);
  assert.match(osd, /^[\s\S]{0,1100}<texturenofocus border="24">fefc-ol-tile\.png<\/texturenofocus>/);
  assert.match(osd, /^[\s\S]{0,1300}Property\(FEFC\.Skip\)/);
  assert.doesNotMatch(skin, /SKIP INTRO/);
});

test('details actions use the Home tile include and keep the star', () => {
  const xml = fs.readFileSync(path.join(root, 'kodi-src/skin-fefc/xml/DialogVideoInfo.xml'), 'utf8');
  assert.match(xml, /FefcDetailTile/);
  assert.match(xml, /fefc-star\.png/);
  assert.doesNotMatch(xml, /FefcDialogButton/);
});
