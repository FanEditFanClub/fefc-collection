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
  const MEDIA = { async get(k) { if (!objs.has(k)) return null; const b = objs.get(k); return { body: b, size: b.length, httpEtag: '"e"', range: { offset: 0, length: b.length } }; } };  // R2 reports a range even without a Range header
  const ASSETS = { async fetch(r) { return new Response('static:' + new URL(r.url).pathname, { status: 200 }); } };
  const env = { MEDIA, ASSETS };
  const get = (p, init) => w.fetch(new Request('https://fefc-collection.pages.dev' + p, init), env, {});
  let r = await get('/kodi-app/FEFC-Mac.dmg');
  assert.equal(r.status, 200); assert.equal(await r.text(), 'DMG');
  r = await get('/kodi-app/FEFC-Mac.dmg', { headers: { range: 'bytes=0-1' } });
  assert.equal(r.status, 206); assert.match(r.headers.get('content-range'), /^bytes 0-2\/3$/);
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

test('Mac app icon and drag-install window: FEFC artwork, every size, Applications shortcut, verified in CI', () => {
  const out = py(`
import sys, os, tempfile, plistlib
sys.path.insert(0, 'tools')
import kodi_brand as k, build_kodi_macos as m
from pathlib import Path
from PIL import Image
d = Path(tempfile.mkdtemp())
names = k.write_iconset(d / 'FEFC.iconset')
assert len(names) == 10, names
for n in names:
    im = Image.open(d / 'FEFC.iconset' / n)
    base = int(n.split('_')[1].split('x')[0]); want = base * (2 if '@2x' in n else 1)
    assert im.size == (want, want) and im.mode == 'RGBA', (n, im.size, im.mode)
big = k.mac_icon(1024)
assert big.getpixel((0, 0))[3] == 0 and big.getpixel((512, 512))[3] == 255   # rounded square, not full-bleed
# same artwork as the Android launcher icon: the centre matches icon() closely
a = k.icon(256).convert('RGB'); b = k.mac_icon(1024).crop((100, 100, 924, 924)).resize((256, 256)).convert('RGB')
diff = sum(abs(x - y) for p, q in zip(a.getdata(), b.getdata()) for x, y in zip(p, q)) / (256 * 256 * 3)
assert diff < 12, diff
# icns parser on a Pillow-written icns
Image.open(d / 'FEFC.iconset' / 'icon_512x512@2x.png').save(d / 't.icns')
assert 'ic10' in m.icns_types(d / 't.icns')
# window layout: icons inside the window, background drawn at 1x and 2x of the window size
w, h = k.DMG_WINDOW
for name, (x, y) in k.DMG_ICONS.items():
    s = k.DMG_ICON_SIZE // 2
    assert s <= x <= w - s and s <= y and y + s + 26 <= h, name
assert k.dmg_background(1).size == (w, h) and k.dmg_background(2).size == (2 * w, 2 * h)
# brand_icon rewrites the plist even off a Mac when an icns tool exists; here check the plist logic directly
app = d / 'FEFC.app' / 'Contents'; (app / 'Resources').mkdir(parents=True)
plistlib.dump({'CFBundleIconFile': 'kodi.icns', 'CFBundleIconName': 'AppIcon', 'CFBundleName': 'FEFC'}, open(app / 'Info.plist', 'wb'))
(app / 'Resources' / 'kodi.icns').write_bytes(b'old')
import shutil
if shutil.which('iconutil') or shutil.which('png2icns'):
    r = m.brand_icon(d / 'FEFC.app', d)
    info = plistlib.load(open(app / 'Info.plist', 'rb'))
    assert info['CFBundleIconFile'] == 'FEFC' and 'CFBundleIconName' not in info, info
print('ok')
`);
  assert.equal(out, 'ok');
  const tool = fs.readFileSync(path.join(root, 'tools/build_kodi_macos.py'), 'utf8');
  assert.match(tool, /info\.pop\('CFBundleIconName', None\)/);
  assert.match(tool, /'symlinks': \{'Applications': '\/Applications'\}/);
  assert.match(tool, /FEFC_REQUIRE_DMG_LAYOUT/);
  // the icon change happens before the ad-hoc signature
  const b = tool.indexOf('branded_icon = brand_icon(app, work)'), s = tool.indexOf('signed = adhoc_sign(fefc_app)');
  assert.ok(b > 0 && s > b);
  const wf = fs.readFileSync(path.join(root, '.github/workflows/kodi-apk.yml'), 'utf8');
  assert.match(wf, /pip install pillow numpy scipy dmgbuild/);
  assert.match(wf, /FEFC_REQUIRE_DMG_LAYOUT: "1"/);
  assert.match(wf, /test -L "\$mnt\/Applications"/);
  assert.match(wf, /Print :CFBundleIconFile/);
  assert.match(wf, /iconutil -c iconset/);
  assert.match(wf, /icon_512x512@2x/);
  assert.match(wf, /sips -s format png/);
});
