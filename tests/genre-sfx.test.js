// 0.6.6: a genre page plays only that genre's own clips (root members, never To Be Catalogued),
// and a cross-genre title cannot leak its franchise sound (Alien played on Comedy).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const {spawnSync} = require('child_process');
const root = path.join(__dirname, '..');
function py(code) {
  const r = spawnSync('python3', ['-c', code], {encoding: 'utf8', cwd: root});
  if (r.status !== 0) throw new Error(r.stderr || r.stdout);
  return r.stdout.trim();
}

test('genre sfx pool: members only, majority rule, no global pool', () => {
  const out = py(`
import sys
sys.path.insert(0, 'kodi-src/plugin.video.fefc/resources/lib')
import catalog
R = 'ROOT'
items = {R: ['Root', '', 1, ''],
  'alien': ['Alien', R, 1, ''], 'aliens2': ['Aliens Redux', R, 1, ''], 'mash': ['Alien & Aliens - Bobson Dugnutt Cut', R, 0, ''],
  'office': ['The Office', R, 1, ''], 'tbc': ['To Be Catalogued', R, 1, ''], 'tbcf': ['Seinfeld Thing', 'tbc', 0, ''],
  'plain': ['Plain Comedy', R, 0, '']}
m = {'items': items, 'root': R,
  'genre_folders': {'Sci-Fi': ['alien', 'aliens2'], 'Horror': ['alien'], 'Comedy': ['office']},
  'genre_videos': {'Sci-Fi': ['mash'], 'Comedy': ['mash', 'plain']},
  'sfx': {'_rules': [{'match': 'alien', 'files': ['assets/sfx/alien-hiss.m4a', 'assets/sfx/alien-hiss.mp3']}],
          'office': ['assets/sfx/office-she-said.mp3'], 'tbcf': ['assets/sfx/global-leak.mp3'],
          '_genres': {'Comedy': ['assets/sfx/rimshot.mp3']}}}
comedy = catalog.genre_sfx_pool(m, 'Comedy')
assert not any('alien' in c for c in comedy), comedy
assert 'assets/sfx/office-she-said.mp3' in comedy and 'assets/sfx/rimshot.mp3' in comedy, comedy
assert not any('global-leak' in c for c in comedy), comedy
scifi = catalog.genre_sfx_pool(m, 'Sci-Fi')
assert any('alien-hiss' in c for c in scifi) and not any('office' in c for c in scifi), scifi
assert catalog.genre_sfx_pool(m, 'Western') == []
print('ok')
`);
  assert.equal(out, 'ok');
});

test('genre sfx with the real catalogue: Comedy never plays Alien; every pool is genre members only', () => {
  if (!fs.existsSync(path.join(root, 'data', 'index.json'))) return;
  const out = py(`
import sys, os, json
sys.path.insert(0, 'kodi-src/plugin.video.fefc/resources/lib')
import catalog
raw = {}
for n in catalog.SOURCES:
    p = 'data/%s.json' % n
    if os.path.exists(p):
        raw[n] = json.load(open(p))
m = catalog.build_model(raw)
comedy = catalog.genre_sfx_pool(m, 'Comedy')
assert comedy and not any('alien' in c for c in comedy), comedy
allowed = {}
for d in ('genre_folders', 'genre_videos'):
    for g, ids in m[d].items():
        s = allowed.setdefault(g, set())
        for i in ids:
            s.update(catalog.sfx_up(m, i) or [])
        own = catalog.sfx_genre(m, g)
        if isinstance(own, list):
            s.update(own)
for g in allowed:
    pool = catalog.genre_sfx_pool(m, g)
    assert set(pool) <= allowed[g], (g, set(pool) - allowed[g])
print('ok')
`);
  assert.equal(out, 'ok');
});

test('router and pagepack use the genre pool; the web app mirrors the rule', () => {
  const router = fs.readFileSync(path.join(root, 'kodi-src/plugin.video.fefc/resources/lib/router.py'), 'utf8');
  const pack = fs.readFileSync(path.join(root, 'kodi-src/plugin.video.fefc/resources/lib/pagepack.py'), 'utf8');
  assert.match(router, /_maybe_sfx\(catalog\.genre_sfx_pool\(m, g\)\)/);
  assert.match(pack, /catalog\.genre_sfx_pool\(model, genre\)/);
  for (const f of ['src/app.js', 'app.js']) {
    const s = fs.readFileSync(path.join(root, f), 'utf8');
    assert.match(s, /function _gsfxIndex/, f);
    assert.match(s, /\(f\.parent ?\|\| ?ROOT\) ?!== ?ROOT/, f);
    assert.match(s, /n ?\* ?2 ?>= ?u\.length/, f);
  }
});

test('New Arrivals: files directly in the main collection root only (web rootVids parity), never To Be Catalogued', () => {
  const out = py(`
import sys
sys.path.insert(0, 'kodi-src/plugin.video.fefc/resources/lib')
import catalog
R = 'ROOT'; T = catalog.TBC_ID; FEC = '1fEaxNbFIrEwKRygETVm4jgtJGVAqKxGB'
items = {T: ['04 - To Be Catalogued', R, 1, ''], FEC: ['03 - Fan Edit Collections', R, 1, ''],
  'coll': ['Evil Dead', R, 1, ''], 'sub': ['Sub', 'coll', 1, ''],
  'a': ['Root File.mp4', R, 0, ''], 'b': ['In Collection.mp4', 'coll', 0, ''], 'c': ['Deep.mp4', 'sub', 0, ''],
  't1': ['TBC File.mp4', T, 0, ''], 'tsub': ['TBC Sub', T, 1, ''], 't2': ['TBC Deep.mp4', 'tsub', 0, ''],
  'f1': ['Editor File.mp4', FEC, 0, ''], 'cyc1': ['Cycle', 'cyc2', 1, ''], 'cyc2': ['Cycle2', 'cyc1', 1, ''], 'x': ['Lost.mp4', 'cyc1', 0, '']}
kids = {}
for k, v in items.items():
    kids.setdefault(v[1], []).append(k)
added = {k: '2026-11-%02d' % (n + 1) for n, k in enumerate(['a', 'b', 'c', 't1', 't2', 'f1', 'x'])}
m = {'items': items, 'kids': kids, 'root': R, 'added': added}
got = set(catalog._compute_recent(m))
assert got == {'a'}, got
web = open('src/app.js').read()
assert "f.parent===ROOT" in web.split('function rootVids')[1][:300]
print('ok')
`);
  assert.equal(out, 'ok');
});

test('Home hub entries always open the hub on its first page (fresh path each press)', () => {
  const home = fs.readFileSync(path.join(root, 'kodi-src/skin-fefc/xml/Home.xml'), 'utf8');
  // Kodi resumes the last deep folder when ActivateWindow gets the same start path again; a time nonce
  // makes every Home press a new path, while Back inside the session still walks the history.
  for (const a of ['recent', 'genres', 'mylist', 'search', 'people']) {
    assert.match(home, new RegExp('ActivateWindow\\(Videos,plugin://plugin\\.video\\.fefc/\\?action=' + a +
      '(?:&amp;[^,]*)?&amp;hub=\\$INFO\\[System\\.Time\\(hh:mm:ss\\)\\],return\\)'), a);
  }
  assert.ok(!/ActivateWindow\(Videos,plugin:\/\/plugin\.video\.fefc\/\?action=(?:recent|genres|mylist|search|people),return\)/.test(home));
});
