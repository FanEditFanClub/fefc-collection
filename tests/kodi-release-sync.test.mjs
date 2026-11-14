// Fire TV / Android, Mac and the Kodi add-on repo ship from one checkout, one label and one build number.
import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const py = code => { const r = spawnSync('python3', ['-c', code], { cwd: root, encoding: 'utf8' }); if (r.status !== 0) throw new Error(r.stderr || r.stdout); return r.stdout.trim(); };

test('kodi-repo in git is the current kodi-src add-ons (versions and zip contents)', () => {
  const out = py(`
import os, re, zipfile
root = '.'
xml = open('kodi-repo/addons.xml', encoding='utf-8').read()
for aid in sorted(os.listdir('kodi-src')):
    ax = os.path.join('kodi-src', aid, 'addon.xml')
    if not os.path.isfile(ax):
        continue
    ver = re.search(r'<addon[^>]*\\bversion="([^"]+)"', open(ax, encoding='utf-8').read()).group(1)
    got = re.search(r'<addon id="%s"[^>]*\\bversion="([^"]+)"' % re.escape(aid), xml)
    assert got and got.group(1) == ver, (aid, ver, got and got.group(1))
    z = zipfile.ZipFile('kodi-repo/%s/%s-%s.zip' % (aid, aid, ver))
    want = {}
    for dp, dn, fn in os.walk(os.path.join('kodi-src', aid)):
        dn[:] = [d for d in dn if d != '__pycache__']
        for f in fn:
            if f.endswith(('.pyc', '.pyo')) or f == '.DS_Store':
                continue
            full = os.path.join(dp, f)
            want[aid + '/' + os.path.relpath(full, os.path.join('kodi-src', aid)).replace(os.sep, '/')] = open(full, 'rb').read()
    have = {n: z.read(n) for n in z.namelist()}
    stale = sorted(set(want) ^ set(have)) + sorted(n for n in want if n in have and want[n] != have[n])
    assert not stale, 'kodi-repo is stale for %s (run python3 tools/build_kodi_repo.py): %s' % (aid, stale[:5])
    assert open('kodi-repo/%s.zip' % aid, 'rb').read() == open('kodi-repo/%s/%s-%s.zip' % (aid, aid, ver), 'rb').read()
import hashlib
assert open('kodi-repo/addons.xml.md5').read().strip() == hashlib.md5(xml.encode('utf-8')).hexdigest()
rep = open('kodi-src/repository.fefc/addon.xml', encoding='utf-8').read()
assert '<info compressed="false">https://fefc-collection.pages.dev/kodi-repo/addons.xml</info>' in rep
assert '<checksum>https://fefc-collection.pages.dev/kodi-repo/addons.xml.md5</checksum>' in rep
assert '<datadir zip="true">https://fefc-collection.pages.dev/kodi-repo/</datadir>' in rep
print('ok')
`);
  assert.equal(out, 'ok');
});

test('version.json gets platforms.macos only from images of this exact build', () => {
  const out = py(`
import json, os, sys, tempfile, hashlib
sys.path.insert(0, 'tools'); sys.path.insert(0, 'kodi-src/plugin.video.fefc/resources/lib')
import fefc_release_manifest as m, updateflow
base = m.android_manifest('21.3', 59, '0.6.6 Beta', 'abc', 'aa', 10, 'bb', 11, [{'version': '0.6.6 Beta'}], '2026-11-14T00:00:00Z')
base['platforms'] = {'tizen': {'url': 'https://fefc-collection.pages.dev/kodi-app/FEFC.wgt', 'build': 58},
                     'macos': {'build': 40, 'arch': {'arm64': {'url': 'https://fefc-collection.pages.dev/kodi-app/FEFC-macOS-arm64.dmg', 'sha256': 'old'}}}}
d = tempfile.mkdtemp()
imgs = {}
for arch, name in m.MAC_IMAGES:
    p = os.path.join(d, name); open(p, 'wb').write(name.encode() * 10)
    rep = {'platform': 'macos', 'fefc_build': 59, 'fefc_version': '0.6.6 Beta', 'signed': 'adhoc',
           'sha256': hashlib.sha256(open(p, 'rb').read()).hexdigest(), 'bytes': os.path.getsize(p)}
    json.dump(rep, open(p + '.report.json', 'w'))
    imgs[arch] = (p, rep)
    assert m.mac_release_errors(rep, p, 59, '0.6.6 Beta') == []
    assert m.mac_release_errors(rep, p, 58, '0.6.6 Beta')
    assert m.mac_release_errors(dict(rep, signed=False), p, 59, '0.6.6 Beta')
out = m.with_macos(base, imgs, 59, '0.6.6 Beta', '21.3')
assert m.android_fields_unchanged(base, out)
mac = out['platforms']['macos']
assert mac['build'] == 59 and mac['version'] == '0.6.6 Beta' and set(mac['arch']) == {'arm64', 'x86_64'}
assert mac['arch']['arm64']['url'] == 'https://fefc-collection.pages.dev/kodi-app/FEFC-Mac.dmg'
assert mac['arch']['x86_64']['url'] == 'https://fefc-collection.pages.dev/kodi-app/FEFC-Mac-Intel.dmg'
assert out['platforms']['tizen']['build'] == 58
dl = updateflow.platform_download(out, 'macos', 'arm64')
assert dl['available'] and dl['filename'] == 'FEFC-Mac.dmg'
assert updateflow.platform_download(out, 'macos', 'x86_64')['url'].endswith('/FEFC-Mac-Intel.dmg')
# The Mac updater compares the top-level label and build, which the images now carry.
assert not updateflow.release_is_newer(out['version'], out['build'], '0.6.6 Beta', 59)
gone = m.with_macos(base, {}, 59, '0.6.6 Beta', '21.3')
assert 'macos' not in gone['platforms'] and gone['platforms']['tizen']
print('ok')
`);
  assert.equal(out, 'ok');
});

test('kodi-apk.yml builds Android, Mac and the add-on repo from one plan and publishes version.json last', () => {
  const wf = fs.readFileSync(path.join(root, '.github/workflows/kodi-apk.yml'), 'utf8');
  for (const job of ['\n  build:', '\n  mac:', '\n  publish:']) assert.ok(wf.includes(job), job);
  const mac = wf.slice(wf.indexOf('\n  mac:'), wf.indexOf('\n  publish:'));
  assert.match(mac, /runs-on: macos-latest/);
  assert.match(mac, /needs: build/);
  assert.match(mac, /--build "\$NEXT_BUILD"/);
  assert.match(mac, /--kodi-version "\$KODI_VER"/);
  assert.match(mac, /codesign --verify --deep --strict/);
  const pub = wf.slice(wf.indexOf('\n  publish:'));
  assert.match(pub, /needs: \[build, mac\]/);
  assert.match(pub, /write-android --out version.json/);
  assert.match(pub, /attach-macos/);
  assert.match(pub, /tools\/build_kodi_repo.py/);
  const order = ['put kodi/FEFC-Kodi.apk', 'put kodi/FEFC.apk', 'put kodi/FEFC-Mac.dmg', 'put kodi/FEFC-Mac-Intel.dmg', 'put kodi-repo/addons.xml ', 'put kodi-repo/addons.xml.md5', 'put kodi/version.json'];
  let at = -1;
  for (const step of order) { const i = pub.indexOf(step); assert.ok(i > at, step); at = i; }
  // The APK signing step and its certificate check are untouched.
  assert.match(wf, /FEFC_KODI_KEYSTORE_B64/);
  assert.match(wf, /EXPECT_CERT_PREFIX: "e3890a8c"/);
  assert.match(wf, /NEXT=\$\(\( PREV_BUILD \+ 1 \)\)/);
  assert.match(wf, /'tools\/build_kodi_macos.py', 'tools\/fefc_kodi_bundle.py', 'tools\/build_kodi_repo.py'/);
});

test('worker serves FEFC-Mac.dmg and the R2 add-on repo, with the static repo as fallback', async () => {
  const { default: w } = await import('../_worker.js');
  const objs = new Map([['kodi/FEFC-Mac.dmg', 'DMG'], ['kodi-repo/addons.xml', '<addons r2="1"/>']]);
  const MEDIA = { async get(k) { if (!objs.has(k)) return null; const b = objs.get(k); return { body: b, size: b.length, httpEtag: '"e"' }; } };
  const ASSETS = { async fetch(r) { return new Response('static:' + new URL(r.url).pathname, { status: 200 }); } };
  const env = { MEDIA, ASSETS };
  const get = p => w.fetch(new Request('https://fefc-collection.pages.dev' + p), env, {});
  let r = await get('/kodi-app/FEFC-Mac.dmg');
  assert.equal(r.status, 200); assert.equal(await r.text(), 'DMG');
  assert.equal(r.headers.get('content-type'), 'application/x-apple-diskimage');
  assert.match(r.headers.get('content-disposition'), /FEFC-Mac\.dmg/);
  r = await get('/kodi-app/FEFC-Mac-Intel.dmg'); assert.equal(r.status, 404);
  r = await get('/kodi-repo/addons.xml');
  assert.equal(await r.text(), '<addons r2="1"/>'); assert.equal(r.headers.get('cache-control'), 'no-cache');
  r = await get('/kodi-repo/addons.xml.md5');
  assert.equal(await r.text(), 'static:/kodi-repo/addons.xml.md5');
  r = await get('/kodi-repo/../_worker.js');
  assert.notEqual(await r.text(), '<addons r2="1"/>');
});
