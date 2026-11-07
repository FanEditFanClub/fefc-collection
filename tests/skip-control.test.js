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
  const py = fs.readFileSync(path.join(root, 'kodi-src/plugin.video.fefc/service.py'), 'utf8');
  assert.match(py, /'SKIP'/);
  assert.match(py, /fefc-ol-tile\.png/);
  assert.doesNotMatch(py, /SKIP INTRO/);
});

test('details actions use the Home tile include and keep the star', () => {
  const xml = fs.readFileSync(path.join(root, 'kodi-src/skin-fefc/xml/DialogVideoInfo.xml'), 'utf8');
  assert.match(xml, /FefcDetailTile/);
  assert.match(xml, /fefc-star\.png/);
  assert.doesNotMatch(xml, /FefcDialogButton/);
});
