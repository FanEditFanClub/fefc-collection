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

test('manual downloads list FEFC.apk, the Samsung widget, and the web app only', () => {
  const app = fs.readFileSync(path.join(root, 'src/app.js'), 'utf8');
  const tizen = fs.readFileSync(path.join(root, 'tizen/app/index.html'), 'utf8');
  const settings = fs.readFileSync(path.join(root, 'kodi-src/plugin.video.fefc/resources/settings.xml'), 'utf8');
  const popup = fs.readFileSync(path.join(lib, 'updatepopup.py'), 'utf8');
  for (const text of [app, tizen, settings, popup]) {
    assert.doesNotMatch(text, /FEFC-Kodi\.apk/);
    assert.doesNotMatch(text, /org\.xbmc\.kodi/);
  }
  assert.match(app, /kodi-app\/FEFC\.apk/);
  assert.match(app, /kodi-app\/FEFC\.wgt/);
  assert.match(app, /collection\.faneditfanclub\.com\/samsung/);
  assert.match(settings, /action=downloads/);
  assert.match(popup, /class ManualDownloads/);
  const out = py(`
import json, sys
sys.path.insert(0, ${JSON.stringify(lib)})
import updateflow
rows = updateflow.manual_downloads({
  'version': '0.6.4 Beta',
  'packages': {'com.fefc.kodi': {'url': 'https://fefc-collection.pages.dev/kodi-app/FEFC.apk'}},
  'platforms': {'tizen': {'url': 'https://fefc-collection.pages.dev/kodi-app/FEFC.wgt'},
                'macos': {'url': 'https://example.invalid/FEFC.dmg'},
                'webos': {'url': 'https://example.invalid/FEFC.ipk'}},
})
blob = json.dumps(rows)
assert 'FEFC-Kodi.apk' not in blob and 'org.xbmc.kodi' not in blob
assert 'macos' not in blob.lower() and 'webos' not in blob.lower()
platforms = [r['platform'] for r in rows]
assert platforms == ['Fire TV & Android', 'Samsung TV', 'Samsung TV guide', 'Web']
assert rows[0]['url'].endswith('/FEFC.apk')
assert rows[1]['url'].endswith('/FEFC.wgt')
assert rows[2]['url'].endswith('/samsung')
assert rows[3]['url'] == 'https://collection.faneditfanclub.com'
# A manifest that only has the old package is replaced with the standalone APK.
bad = updateflow.manual_downloads({'version': '0.6.4 Beta', 'packages': {'org.xbmc.kodi': {'url': 'https://fefc-collection.pages.dev/kodi-app/FEFC-Kodi.apk'}}})
assert bad[0]['url'].endswith('/FEFC.apk')
assert 'FEFC-Kodi' not in json.dumps(bad)
print('ok')
`);
  assert.equal(out, 'ok');
});

test('genre lists are root-only, deduped, and follow IMDb labels', () => {
  const out = py(`
import sys
sys.path.insert(0, ${JSON.stringify(lib)})
import catalog
F = 'application/vnd.google-apps.folder'
root = 'root'
tbc = catalog.TBC_ID
items = [
  {'id': root, 'name': 'Collection', 'mimeType': F, 'parent': ''},
  {'id': 'patton', 'name': 'Patton.mkv', 'kind': 'video', 'parent': root},
  {'id': 'ash', 'name': 'Ash vs Evil Dead', 'mimeType': F, 'parent': root},
  {'id': 'ash-ep', 'name': 'Ash Episode.mkv', 'kind': 'video', 'parent': 'ash'},
  {'id': 'ash-copy', 'name': 'Ash vs Evil Dead', 'mimeType': F, 'parent': root, 'targetId': 'ash'},
  {'id': 'show', 'name': 'Some Series', 'mimeType': F, 'parent': root},
  {'id': 'ep', 'name': 'Episode 1.mkv', 'kind': 'video', 'parent': 'show'},
  {'id': tbc, 'name': 'To Be Catalogued', 'mimeType': F, 'parent': root},
  {'id': 'tbc-file', 'name': 'Unsorted.mkv', 'kind': 'video', 'parent': tbc},
]
raw = {
  'index': {'root': root, 'items': items},
  'imdb-genres': {'tt0066206': ['Biography', 'Drama', 'War']},
  'metadata': {'films': {'Q': {'imdb': 'tt0066206', 'genres': ['Fantasy']}}, 'map': {'patton': 'Q'}},
  'genres': {'ash': {'genres': ['Fantasy']}, 'ash-copy': {'genres': ['Fantasy']}},
}
m = catalog.build_model(raw)
assert catalog.imdb_app_genres(['Biography', 'Drama', 'War']) == ['Biography', 'Drama', 'War']
assert 'Fantasy' not in catalog.imdb_app_genres(['Biography', 'Drama', 'War'])
assert 'patton' in m['genre_videos'].get('Drama', [])
assert 'patton' in m['genre_videos'].get('War', [])
assert 'patton' in m['genre_videos'].get('Biography', [])
assert 'patton' not in m['genre_videos'].get('Fantasy', [])
assert 'ep' not in sum(m['genre_videos'].values(), [])
assert 'tbc-file' not in sum(m['genre_videos'].values(), [])
fantasy = m['genre_folders'].get('Fantasy', [])
assert fantasy.count('ash') + fantasy.count('ash-copy') == 1
# Clips for a genre come from its members. Patton's clips are not Fantasy's.
m['items']['patton-folder'] = ['Patton', root, 1, '']
m['sfx'] = {'Patton': ['assets/sfx/patton.mp3'], '_rules': []}
assert 'patton' not in m['genre_videos'].get('Fantasy', [])
print('ok')
`);
  assert.equal(out, 'ok');
});

test('folder grids stay on column 0 after the Back tile, and every folder offers Support Us and My List', () => {
  const router = fs.readFileSync(path.join(lib, 'router.py'), 'utf8');
  const skin = fs.readFileSync(path.join(root, 'kodi-src/skin-fefc/xml/Includes_FEFC.xml'), 'utf8');
  const nav = fs.readFileSync(path.join(root, 'kodi-src/skin-fefc/xml/MyVideoNav.xml'), 'utf8');
  assert.match(router, /def _add_listing_actions/);
  assert.match(router, /Support Us/);
  assert.match(router, /Add to My List/);
  assert.match(router, /leading=1/);
  assert.match(skin, /ListItem\.IsParentFolder/);
  assert.match(skin, /FefcTileLabel/);
  assert.match(skin, />Back</);
  assert.match(nav, /FEFC\.Genres/);
  assert.doesNotMatch(router, /ControlLabel\(\s*\n\s*x, y \+ icon/);
  const out = py(`
import sys
sys.path.insert(0, ${JSON.stringify(lib)})
import shapes
# Back is Kodi's parent row (leading=1). Four action tiles then six videos, as in Westworld.
kinds = ['action'] * 4 + ['video'] * 6
slots = shapes.pack(kinds, leading=1)
# The packed list starts after the parent cell. First video must be column 0.
videos = [i for i, k in enumerate(slots) if k == 'video']
assert videos[0] % 6 == 5 or (1 + videos[0]) % 6 == 0
# Container index of the first video is 1 (the Back tile) + packed offset.
assert (1 + videos[0]) % 6 == 0
# Parts 1 through 6 share one row, columns 0 through 5.
assert all((1 + videos[i]) // 6 == (1 + videos[0]) // 6 for i in range(6))
assert (1 + videos[5]) % 6 == 5
print('ok')
`);
  assert.equal(out, 'ok');
});
