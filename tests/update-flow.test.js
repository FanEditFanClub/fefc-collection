const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const lib = path.join(root, 'kodi-src/plugin.video.fefc/resources/lib');

function py(code) {
  const r = spawnSync('python3', ['-c', code], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr || r.stdout);
  return r.stdout;
}

test('each package gets its own APK and a no-update is not an install', () => {
  py(`
import sys
sys.path.insert(0, ${JSON.stringify(lib)})
import updateplan
doc = {'version':'0.4.1 Beta','build':38,'url':'https://example/FEFC-Kodi.apk','size':10,'sha256':'aaa',
  'packages':{
    'org.xbmc.kodi':{'url':'https://example/FEFC-Kodi.apk','size':11,'sha256':'legacy'},
    'com.fefc.kodi':{'url':'https://example/FEFC.apk','size':22,'sha256':'phone'}}}
assert updateplan.select_apk(doc, 'org.xbmc.kodi') == ('https://example/FEFC-Kodi.apk', 11, 'legacy')
assert updateplan.select_apk(doc, 'com.fefc.kodi') == ('https://example/FEFC.apk', 22, 'phone')
legacy_only = {'url':'https://example/FEFC-Kodi.apk','size':10,'sha256':'aaa'}
assert updateplan.select_apk(legacy_only, 'org.xbmc.kodi')[0].endswith('FEFC-Kodi.apk')
assert updateplan.select_apk(legacy_only, 'com.fefc.kodi') == ('', 0, '')
assert updateplan.next_step(38, 38) == 'up_to_date'
assert updateplan.next_step(36, 38) == 'install'
assert updateplan.next_step(None, 38) == 'not_fefc_build'
assert updateplan.next_step(36, None) == 'check_failed'
assert updateplan.download_status(5, 10, 'abc', 'abc') == 'short'
assert updateplan.download_status(10, 10, 'bad', 'abc') == 'checksum'
assert updateplan.download_status(10, 10, 'abc', 'abc') == 'ok'
assert 'org.xbmc.kodi.fefcupdate' in updateplan.content_uri('org.xbmc.kodi', 'ext', 'FEFC-update.apk')
assert 'com.fefc.kodi.fefcupdate' in updateplan.content_uri('com.fefc.kodi', 'ext', 'FEFC-update.apk')
assert 'No newer app is published' in updateplan.MESSAGES['up_to_date']
assert 'not changed' in updateplan.MESSAGES['download_failed']
print('ok')
`);
});

test('updater does not blank the screen or launch the installer with an empty package', () => {
  const svc = fs.readFileSync(path.join(root, 'kodi-src/plugin.video.fefc/service.py'), 'utf8');
  assert.doesNotMatch(svc, /Dialog\.Close\(all/);
  assert.doesNotMatch(svc, /StartAndroidActivity\(,/);
  assert.match(svc, /FefcUpdateActivity/);
  assert.match(svc, /fefcupdate:\/\/install/);
  const smali = fs.readFileSync(path.join(root, 'tools/fefc_update/smali/com/fefc/kodi/FefcUpdateActivity.smali'), 'utf8');
  assert.match(smali, /android.intent.action.INSTALL_PACKAGE/);
  assert.match(smali, /android.settings.MANAGE_UNKNOWN_APP_SOURCES/);
  assert.match(smali, /FLAG|0x10000001/);
  assert.match(smali, /did not open an installer/);
  assert.match(smali, /not a valid update for this app/);
  assert.match(smali, /\.fefcupdate/);
  const build = fs.readFileSync(path.join(root, 'tools/build_kodi_apk.py'), 'utf8');
  assert.match(build, /FefcUpdateActivity/);
  assert.match(build, /fefcupdate/);
  assert.doesNotMatch(build, /FefcUpdateActivity[\s\S]{0,400}android:noHistory="true"/);
});
