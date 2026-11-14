const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const {spawnSync} = require('child_process');

const root = path.join(__dirname, '..');
const lib = path.join(root, 'kodi-src/plugin.video.fefc/resources/lib');

test('About settings lists the eight entries in order, and downloads stay on the allowed builds', () => {
  const xml = fs.readFileSync(path.join(root, 'kodi-src/plugin.video.fefc/resources/settings.xml'), 'utf8');
  const strings = fs.readFileSync(path.join(root, 'kodi-src/plugin.video.fefc/resources/language/resource.language.en_gb/strings.po'), 'utf8');
  const router = fs.readFileSync(path.join(root, 'kodi-src/plugin.video.fefc/resources/lib/router.py'), 'utf8');
  const aboutStart = xml.indexOf('<category id="about"');
  const aboutEnd = xml.indexOf('</category>', aboutStart);
  const about = xml.slice(aboutStart, aboutEnd);
  const notesStart = xml.indexOf('<category id="notifications"');
  const notes = xml.slice(notesStart, xml.indexOf('</category>', notesStart));
  assert.ok(aboutStart >= 0 && aboutEnd > aboutStart);
  assert.doesNotMatch(about, /id="about_btn"/);
  assert.doesNotMatch(about, /action=about<\/data>/);
  assert.doesNotMatch(about, /FEFC-Kodi\.apk/);
  assert.doesNotMatch(about, /org\.xbmc\.kodi/);
  assert.doesNotMatch(notes, /check_update_btn|manual_download_btn|action=update|action=(?:manual_)?downloads/);
  const order = [
    ['about_version', '30036', 'action=about&amp;part=version', 'Version & Info'],
    ['check_update_btn', '30032', 'action=update', 'Check for Update'],
    ['manual_download_btn', '30034', 'action=manual_downloads)', 'Download latest version'],
    ['about_feedback', '30035', 'action=about&amp;part=feedback', 'Give Feedback'],
    ['about_news', '30037', 'action=about&amp;part=news', "What's New"],
    ['about_privacy', '30038', 'action=about&amp;part=privacy', 'Privacy Policy'],
    ['about_terms', '30039', 'action=about&amp;part=terms', 'Terms of Use'],
    ['about_notices', '30040', 'action=about&amp;part=notices', 'Open-source notices'],
  ];
  let at = -1;
  for (const [id, label, action, title] of order) {
    const i = about.indexOf('id="' + id + '"');
    assert.ok(i > at, id);
    at = i;
    assert.match(about, new RegExp('id="' + id + '"[\\s\\S]{0,280}label="' + label + '"'));
    assert.match(about, new RegExp(action.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(strings, new RegExp('msgctxt "#' + label + '"\\nmsgid "' + title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"'));
  }
  const settingIds = [...about.matchAll(/<setting id="([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(settingIds, order.map(row => row[0]));
  const listed = spawnSync('python3', ['-c', `
import json, sys
sys.path.insert(0, ${JSON.stringify(lib)})
import updateflow
rows = updateflow.manual_downloads({
  'version': '0.6.5 Beta',
  'packages': {'com.fefc.kodi': {'url': 'https://fefc-collection.pages.dev/kodi-app/FEFC.apk'},
               'org.xbmc.kodi': {'url': 'https://fefc-collection.pages.dev/kodi-app/FEFC-Kodi.apk'}},
  'platforms': {'tizen': {'url': 'https://fefc-collection.pages.dev/kodi-app/FEFC.wgt'},
                'macos': {'url': 'https://example.invalid/FEFC.dmg'},
                'webos': {'url': 'https://example.invalid/FEFC.ipk'}},
})
blob = json.dumps(rows)
assert 'FEFC-Kodi.apk' not in blob and 'org.xbmc.kodi' not in blob
assert 'macos' not in blob.lower() and 'webos' not in blob.lower()
assert [r['platform'] for r in rows] == ['Fire TV & Android', 'Samsung TV', 'Samsung TV guide', 'Web']
assert rows[0]['url'].endswith('/FEFC.apk') and rows[0]['short'].endswith('is.gd/8la6gb')
assert rows[1]['url'].endswith('/FEFC.wgt')
assert rows[2]['url'].endswith('/samsung')
assert rows[3]['url'] == 'https://collection.faneditfanclub.com'
print('ok')
`], {encoding: 'utf8', cwd: root});
  if (listed.status !== 0)
    throw new Error(listed.stderr || listed.stdout);
  assert.equal(listed.stdout.trim(), 'ok');
  const aboutFn = router.slice(router.indexOf('    def about('), router.indexOf('    def feedback('));
  assert.doesNotMatch(aboutFn, /dlg\.select/);
  assert.match(aboutFn, /part == 'feedback'/);
  assert.match(aboutFn, /part == 'version'/);
  assert.match(aboutFn, /part == 'news'/);
  assert.match(aboutFn, /part == 'privacy'/);
  assert.match(aboutFn, /part == 'terms'/);
  assert.match(aboutFn, /part == 'notices'/);
  // "Download latest version" opens the Manual Downloads list, not the offline Downloads folder.
  assert.doesNotMatch(about, /action=downloads\)/);
  assert.match(router, /'manual_downloads': 'manual_downloads'/);
  assert.match(router, /def manual_downloads\(self\):[\s\S]{0,800}ManualDownloads\(/);
  // A category whose only row is labeled the same as the category is the extra tap.
  const categories = [...xml.matchAll(/<category id="([^"]+)" label="(\d+)">([\s\S]*?)<\/category>/g)];
  for (const [, id, label, body] of categories) {
    const settings = [...body.matchAll(/<setting id="([^"]+)"[^>]*label="(\d+)"/g)];
    if (settings.length !== 1)
      continue;
    assert.notEqual(settings[0][2], label, id + ' is a single row with the category name');
  }
});
