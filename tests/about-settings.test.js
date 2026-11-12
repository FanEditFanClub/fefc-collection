const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

test('About settings lists the six entries directly, with no drill-in row', () => {
  const xml = fs.readFileSync(path.join(root, 'kodi-src/plugin.video.fefc/resources/settings.xml'), 'utf8');
  const strings = fs.readFileSync(path.join(root, 'kodi-src/plugin.video.fefc/resources/language/resource.language.en_gb/strings.po'), 'utf8');
  const router = fs.readFileSync(path.join(root, 'kodi-src/plugin.video.fefc/resources/lib/router.py'), 'utf8');
  const aboutStart = xml.indexOf('<category id="about"');
  const aboutEnd = xml.indexOf('</category>', aboutStart);
  const about = xml.slice(aboutStart, aboutEnd);
  assert.ok(aboutStart >= 0 && aboutEnd > aboutStart);
  assert.doesNotMatch(about, /id="about_btn"/);
  assert.doesNotMatch(about, /action=about<\/data>/);
  assert.doesNotMatch(about, /action=about"<\/data>/);
  const order = [
    ['about_feedback', '30035', 'feedback', 'Give feedback'],
    ['about_version', '30036', 'version', 'Version and info'],
    ['about_news', '30037', 'news', "What's new"],
    ['about_privacy', '30038', 'privacy', 'Privacy Policy'],
    ['about_terms', '30039', 'terms', 'Terms of Use'],
    ['about_notices', '30040', 'notices', 'Open-source notices'],
  ];
  let at = -1;
  for (const [id, label, part, title] of order) {
    const i = about.indexOf('id="' + id + '"');
    assert.ok(i > at, id);
    at = i;
    assert.match(about, new RegExp('id="' + id + '"[\\s\\S]{0,280}label="' + label + '"'));
    assert.match(about, new RegExp('action=about&amp;part=' + part));
    assert.match(strings, new RegExp('msgctxt "#' + label + '"\\nmsgid "' + title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"'));
  }
  const settingIds = [...about.matchAll(/<setting id="([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(settingIds, order.map(row => row[0]));
  const aboutFn = router.slice(router.indexOf('    def about('), router.indexOf('    def feedback('));
  assert.doesNotMatch(aboutFn, /dlg\.select/);
  assert.match(aboutFn, /part == 'feedback'/);
  assert.match(aboutFn, /part == 'version'/);
  assert.match(aboutFn, /part == 'news'/);
  assert.match(aboutFn, /part == 'privacy'/);
  assert.match(aboutFn, /part == 'terms'/);
  assert.match(aboutFn, /part == 'notices'/);
  // A category whose only row is labeled the same as the category is the extra tap.
  const categories = [...xml.matchAll(/<category id="([^"]+)" label="(\d+)">([\s\S]*?)<\/category>/g)];
  for (const [, id, label, body] of categories) {
    const settings = [...body.matchAll(/<setting id="([^"]+)"[^>]*label="(\d+)"/g)];
    if (settings.length !== 1)
      continue;
    assert.notEqual(settings[0][2], label, id + ' is a single row with the category name');
  }
});
