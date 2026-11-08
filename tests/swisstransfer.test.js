const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const {spawnSync} = require('child_process');
const root = path.join(__dirname, '..');
const lib = path.join(root, 'kodi-src/plugin.video.fefc/resources/lib');
const SHARE = 'https://www.swisstransfer.com/dl/01a1b362-3c35-7224-8b85-faf0101e8e52';

function py(code) {
  const r = spawnSync('python3', ['-c', code], {encoding: 'utf8', cwd: root});
  assert.equal(r.status, 0, r.stderr || r.stdout);
  return r.stdout.trim();
}

test('the public SwissTransfer page is HTML and is not a Kodi media URL', () => {
  const out = py(`
import json, sys
sys.path.insert(0, ${JSON.stringify(lib)})
import swisstransfer
html = '''<script data-page="app" type="application/json">{"component":"link/show","props":{"transfer":{"title":"Avatar | Season One","total_size":21132457181,"expires_at":1795306922,"files":[{"path":"Avatar EP 101.mp4","size":4737037757,"mime_type":"video/mp4","mime_type_group":"video"},{"path":"Avatar EP 102.mp4","size":4624818513,"mime_type":"video/mp4","mime_type_group":"video"},{"path":"Avatar EP 103.mp4","size":5701759167,"mime_type":"video/mp4","mime_type_group":"video"},{"path":"Avatar EP 104.mp4","size":6068841744,"mime_type":"video/mp4","mime_type_group":"video"}]}}}</script>'''
from datetime import datetime, timezone
now = datetime(2026, 11, 8, tzinfo=timezone.utc)
info = swisstransfer.inspect_page(html, now)
assert info['kodi_play'] is False and info['play_url'] == ''
assert info['state'] == 'page_only'
assert info['title'] == 'Avatar | Season One'
assert info['expires'] == '2026-11-22'
assert [f['name'] for f in info['files']] == ['Avatar EP 101.mp4','Avatar EP 102.mp4','Avatar EP 103.mp4','Avatar EP 104.mp4']
assert all(f['mime']=='video/mp4' for f in info['files'])
assert 'web page' in info['message']
later = swisstransfer.inspect_page(html, datetime(2026, 11, 23, tzinfo=timezone.utc))
assert later['state'] == 'expired' and later['kodi_play'] is False
locked = swisstransfer.inspect_page('<script>{"component":"link/show","props":{"password":true}}</script>', now)
assert locked['state'] == 'password'
other = swisstransfer.inspect_page('<script>{"component":"link/show","props":{"transfer":{"title":"Notes","expires_at":1795306922,"files":[{"path":"notes.zip","size":10,"mime_type":"application/zip","mime_type_group":"archive"}]}}}</script>', now)
assert other['state'] == 'unsupported' and other['kodi_play'] is False
assert swisstransfer.share_id(${JSON.stringify(SHARE)}) == '01a1b362-3c35-7224-8b85-faf0101e8e52'
print('ok')
`);
  assert.equal(out, 'ok');
});

test('Testing lists the transfer files without marking them playable', () => {
  const doc = JSON.parse(fs.readFileSync(path.join(root, 'data/provider-testing.json'), 'utf8'));
  const p = doc.providers.find(x => x.name === 'SwissTransfer');
  assert.ok(p, 'SwissTransfer folder missing');
  assert.equal(p.open_label, 'Open in SwissTransfer');
  assert.equal(p.items.length, 1);
  const folder = p.items[0];
  assert.equal(folder.name, 'Avatar | Season One');
  assert.equal(folder.url, SHARE);
  assert.equal(folder.playback_verified, false);
  assert.equal(folder.children.length, 4);
  for (const f of folder.children) {
    assert.equal(f.playback_verified, false);
    assert.equal(f.video, false);
    assert.equal(f.state, 'page_only');
    assert.equal(f.url, SHARE);
    assert.match(f.name, /\.mp4$/);
  }
  const out = py(`
import json, sys
sys.path.insert(0, ${JSON.stringify(lib)})
import providers
doc = json.load(open('data/provider-testing.json'))
idx = providers.index(doc)
row = idx[${JSON.stringify(folder.children[0].id)}]
assert row['kodi_play'] is False
assert row['playback_verified'] is False
assert row['play_url'] == ''
assert row['state'] == 'page_only'
assert row['open_label'] == 'Open in SwissTransfer'
print('ok')
`);
  assert.equal(out, 'ok');
  const router = fs.readFileSync(path.join(lib, 'router.py'), 'utf8');
  assert.match(router, /swisstransfer\.fetch_page/);
});
