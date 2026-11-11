const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {spawnSync} = require('child_process');

const root = path.join(__dirname, '..');
const lib = path.join(root, 'kodi-src/plugin.video.fefc/resources/lib');

function py(code) {
  const r = spawnSync('python3', ['-c', code], {encoding: 'utf8', cwd: root});
  if (r.status !== 0) throw new Error(r.stderr || r.stdout);
  return r.stdout.trim();
}

test('Android package selection ignores platforms and still rejects a phone fallback', () => {
  const out = py(`
import json, sys
sys.path.insert(0, ${JSON.stringify(lib)})
import updateflow
base = {'url': 'https://fefc-collection.pages.dev/kodi-app/FEFC-Kodi.apk', 'sha256': 'aaa', 'size': 9,
        'packages': {'com.fefc.kodi': {'url': 'https://fefc-collection.pages.dev/kodi-app/FEFC.apk', 'sha256': 'bbb', 'size': 3}},
        'platforms': {'macos': {'arch': {'arm64': {'url': 'https://fefc-collection.pages.dev/kodi-app/FEFC-macOS-arm64.dmg', 'sha256': 'ccc', 'size': 4}}}}}
url, size, sha = updateflow.package_download(base, 'org.xbmc.kodi')
assert url.endswith('FEFC-Kodi.apk') and sha == 'aaa' and size == 9
url, size, sha = updateflow.package_download(base, 'com.fefc.kodi')
assert url.endswith('FEFC.apk') and sha == 'bbb'
assert updateflow.package_download({'url': 'http://org', 'sha256': 'aaa'}, 'com.fefc.kodi')[0] == ''
mac = updateflow.platform_download(base, 'macos', 'arm64')
assert mac['available'] and mac['url'].endswith('.dmg')
assert updateflow.platform_download(base, 'macos', 'x86_64')['available'] is False
assert updateflow.platform_download(base, 'webos', 'arm')['url'] == ''
assert 'FEFC-Kodi.apk' not in updateflow.platform_download(base, 'tizen', '')['url']
assert updateflow.allowed_update_url('http://fefc-collection.pages.dev/kodi-app/FEFC.wgt') is False
assert updateflow.allowed_update_url('https://example.com/kodi-app/FEFC.wgt') is False
assert updateflow.classify_platform({'android': True, 'probed': True}) == 'android'
assert updateflow.classify_platform({'android': True, 'webos': True}) == 'webos'
assert updateflow.classify_platform({'darwin': True}) == 'macos'
assert updateflow.classify_platform({'xbmc_path': '/usr/palm/applications/org.xbmc.kodi'}) == 'webos'
assert updateflow.classify_platform({}) == 'other'
assert updateflow.platform_arch('macos', 'arm64') == 'arm64'
assert updateflow.platform_arch('macos', 'x86_64') == 'x86_64'
assert updateflow.platform_arch('webos', 'aarch64') == 'aarch64'
assert updateflow.platform_arch('webos', 'armv7l') == 'arm'
assert 'not on the server' in updateflow.platform_unavailable_message('macos', '0.6 Beta')
assert 'Developer Mode' in updateflow.platform_install_message('webos', '/tmp/FEFC.ipk', False, 'arm')
assert 'Developer ID' in updateflow.platform_install_message('macos', '/tmp/FEFC.dmg', True)
print('ok')
`);
  assert.equal(out, 'ok');
  const svc = fs.readFileSync(path.join(root, 'kodi-src/plugin.video.fefc/service.py'), 'utf8');
  const install = svc.slice(svc.indexOf('def _install_update'));
  assert.ok(install.indexOf("plat != 'android'") < install.indexOf('_for_my_package'));
  assert.match(svc, /Downloading %s: %d%% \(%d \/ %d MB\)/);
  assert.doesNotMatch(svc, /Dialog\.Close\(all,true\)/);
});

test('version.json keeps Android fields when platforms are attached', () => {
  const out = py(`
import json, sys
sys.path.insert(0, 'tools')
import fefc_release_manifest as m
base = m.android_manifest('21.3', 7, '0.6 Beta', 'abc', 'aa', 10, 'bb', 11, [{'version': '0.6 Beta'}], '2026-11-11T00:00:00Z')
assert base['url'].endswith('FEFC-Kodi.apk')
assert base['packages']['com.fefc.kodi']['sha256'] == 'bb'
assert 'platforms' not in base
kept = m.preserving_platforms(base, {'platforms': {'tizen': {'url': 'https://example.invalid/x'}}})
assert m.android_fields_unchanged(base, kept)
assert kept['platforms']['tizen']['url'].endswith('/x')
plain = m.preserving_platforms(base, {})
assert 'platforms' not in plain
added = m.attach_platform(base, 'macos', {'url': 'https://fefc-collection.pages.dev/kodi-app/FEFC-macOS-arm64.dmg', 'sha256': 'cc', 'size': 4, 'filename': 'FEFC-macOS-arm64.dmg'}, 'arm64')
assert m.android_fields_unchanged(base, added)
assert added['platforms']['macos']['version'] == '0.6 Beta'
assert added['platforms']['macos']['build'] == 7
assert added['packages'] == base['packages']
print('ok')
`);
  assert.equal(out, 'ok');
});

test('stable Kodi package names prefer 21.3 and skip release candidates', () => {
  const out = py(`
import sys
sys.path.insert(0, 'tools')
import kodi_upstream as u
names = ['kodi-21.3-Omega-arm64.dmg', 'kodi-21.3-Omega-x86_64.dmg', 'kodi-22.0-Piers_rc1-arm64.dmg', 'kodi-21.0-Omega_rc2-arm64.dmg', 'kodi-21.2-Omega-arm64.dmg']
dmgs = u.stable_dmgs(names)
assert dmgs[('21.3', 'arm64')].endswith('21.3-Omega-arm64.dmg')
assert dmgs[('21.3', 'x86_64')].endswith('21.3-Omega-x86_64.dmg')
assert ('22.0', 'arm64') not in dmgs
web = u.stable_webos(['org.xbmc.kodi-webos_21.0.ipk', 'org.xbmc.kodi-webos_22.0~rc2.ipk', 'org.xbmc.kodi-webos_21.0~b1.ipk'])
assert u.choose_version(web, '21.3') == '21.0'
assert u.choose_version({'21.3': 'a', '21.2': 'b'}, '21.3') == '21.3'
assert u.newest(['21.0', '21.3', '21.2']) == '21.3'
print('ok')
`);
  assert.equal(out, 'ok');
});

test('settings defaults and a script-only bundle do not touch the intro bytes', () => {
  const out = py(`
import hashlib, os, shutil, sys, tempfile
from pathlib import Path
sys.path.insert(0, 'tools')
import fefc_kodi_bundle as b
xml = '''<?xml version="1.0" encoding="utf-8" ?>
<settings version="1">
  <section id="system">
    <category id="input"><group id="3"><setting id="input.appleremotealwayson"><level>1</level></setting></group></category>
  </section>
</settings>
'''
out = b.apply_fefc_defaults(xml)
assert '<default>skin.fefc</default>' in out
assert '<default>resource.uisounds.fefc</default>' in out
assert '<default>2</default>' in out
assert '<default>3</default>' in out
assert 'input.appleremotealwayson' in out
again = b.apply_fefc_defaults(out)
assert again.count('skin.fefc') == out.count('skin.fefc')
root = Path(tempfile.mkdtemp())
try:
    (root / 'addons' / 'skin.estuary').mkdir(parents=True)
    (root / 'system').mkdir()
    (root / 'system' / 'addon-manifest.xml').write_text('<addons>\\n</addons>\\n', encoding='utf-8')
    rec = b.stage_fefc(root, 'webos', 'arm', 'org.xbmc.kodi', '21.0', build=0, skin=False)
    assert rec['version']
    assert rec['platform'] == 'webos'
    assert (root / 'addons' / 'plugin.video.fefc' / 'addon.xml').is_file()
    assert 'skin.fefc' in (root / 'system' / 'settings' / 'linux.xml').read_text(encoding='utf-8')
    intro = root / 'media' / 'fefc-intro.mp4'
    src = Path('assets/intro-tv.mp4').read_bytes()
    assert hashlib.sha256(intro.read_bytes()).hexdigest() == hashlib.sha256(src).hexdigest()
    assert b.scripted_addon_problems(root / 'addons' / 'plugin.video.fefc') == []
finally:
    shutil.rmtree(root)
print('ok')
`);
  assert.equal(out, 'ok');
});

test('Tizen widget is unsigned, versioned with the FEFC label, and the page bridge stays off unless tizen=1', () => {
  const version = require(path.join(root, 'tizen/app/js/version.js'));
  assert.deepEqual(version.versionKey('0.6 Beta'), [0, 6, 0]);
  assert.equal(version.versionKey('0.6').join(), version.versionKey('0.6.0').join());
  assert.equal(version.releaseIsNewer('0.6 Beta', 1, '0.5.5 Beta', 99), true);
  assert.equal(version.releaseIsNewer('0.6 Beta', 4, '0.6.0', 4), false);
  assert.equal(version.releaseIsNewer('0.6.0', 5, '0.6', 4), true);
  const bridge = fs.readFileSync(path.join(root, 'tizen-bridge.js'), 'utf8');
  assert.match(bridge, /tizen=1/);
  assert.match(bridge, /return;/);
  assert.doesNotMatch(bridge, /intro-tv/);
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(html, /id="iskip"/);
  assert.match(html, /tizen-bridge\.js/);
  const out = py(`
import sys, zipfile
sys.path.insert(0, 'tools')
import build_tizen_wgt as t
assert t.widget_version('0.6 Beta', 0) == '0.6.0'
assert t.widget_version('0.6 Beta', 4) == '0.6.4'
t.build('dist/FEFC.wgt', 0)
z = zipfile.ZipFile('dist/FEFC.wgt')
names = z.namelist()
assert 'config.xml' in names and 'author-signature.xml' not in names and 'signature1.xml' not in names
cfg = z.read('config.xml').decode()
assert 'version="0.6.0"' in cfg
assert 'avplay' in cfg and 'tv.inputdevice' in cfg
assert 'tizen=1' in z.read('index.html').decode()
print('ok')
`);
  assert.match(out, /"signed": false/);
  assert.match(out, /\nok$/);
});

test('LG update guide is the Dev Manager steps, on the TV skin and on /lg-update', () => {
  const out = py(`
import sys
sys.path.insert(0, ${JSON.stringify(lib)})
import webosguide
steps = webosguide.tv_steps('https://fefc-collection.pages.dev/kodi-app/FEFC-webOS.ipk')
text = '\\n'.join(steps)
assert steps[0].startswith('1. ')
assert 'same Wi-Fi' in text
assert 'webOS Dev Manager' in text
assert 'FEFC-webOS.ipk' in text
assert 'fefc-collection.pages.dev/kodi-app/FEFC-webOS.ipk' in text
assert 'Key Server' in text
assert '6-character passphrase' in text
assert 'Press Install' in text
assert 'extend the session' in text
missing = webosguide.tv_steps('')
assert 'not on the server yet' in '\\n'.join(missing)
assert webosguide.GUIDE_URL == 'https://collection.faneditfanclub.com/lg-update'
assert 'real LG TV' not in webosguide.tv_text('https://fefc-collection.pages.dev/kodi-app/FEFC-webOS.ipk')
print('ok')
`);
  assert.equal(out, 'ok');
  const xml = fs.readFileSync(path.join(root, 'kodi-src/skin-fefc/xml/DialogFEFCWebOSUpdate.xml'), 'utf8');
  assert.match(xml, /id="7001"/);
  assert.match(xml, /id="7002"/);
  assert.match(xml, /font_title_big/);
  assert.match(xml, /collection\.faneditfanclub\.com\/lg-update/);
  const page = fs.readFileSync(path.join(root, 'lg-update.html'), 'utf8');
  assert.match(page, /webOS Dev Manager/);
  assert.match(page, /Key Server/);
  assert.match(page, /6-character passphrase/);
  assert.match(page, /Renew session/);
  assert.match(page, /platforms\.webos/);
  assert.match(page, /FEFC-webOS\.ipk/);
  assert.match(page, /not been tried on a real LG TV/);
  assert.match(page, /Homebrew Channel/);
  const worker = fs.readFileSync(path.join(root, '_worker.js'), 'utf8');
  assert.match(worker, /\/lg-update/);
  const svc = fs.readFileSync(path.join(root, 'kodi-src/plugin.video.fefc/service.py'), 'utf8');
  assert.match(svc, /DialogFEFCWebOSUpdate\.xml/);
  assert.match(svc, /plat == 'webos' and avail/);
  const readme = fs.readFileSync(path.join(root, 'platforms/README.md'), 'utf8');
  assert.match(readme, /collection\.faneditfanclub\.com\/lg-update/);
  assert.match(readme, /webOS Dev Manager/);
  assert.match(readme, /1000 hours/);
});

test('publish script stays closed unless Carson turns the gate on', () => {
  const r = spawnSync('python3', ['tools/publish_kodi_platforms.py', '--help'], {
    encoding: 'utf8', cwd: root, env: {...process.env, FEFC_PUBLISH_NEW_PLATFORMS: ''}
  });
  assert.notEqual(r.status, 0);
  const workflow = fs.readFileSync(path.join(root, '.github/workflows/kodi-platforms.yml'), 'utf8');
  assert.match(workflow, /FEFC_PUBLISH_NEW_PLATFORMS == 'true'/);
  assert.match(workflow, /runs-on: macos-latest/);
  const apk = fs.readFileSync(path.join(root, '.github/workflows/kodi-apk.yml'), 'utf8');
  assert.match(apk, /write-android --out version.json/);
  assert.match(apk, /fan-edit-media\/kodi\/FEFC-Kodi.apk/);
  assert.match(apk, /fan-edit-media\/kodi\/FEFC.apk/);
});
