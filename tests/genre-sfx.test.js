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
