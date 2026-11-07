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

test('notification plan distinguishes Android 13, granted, and permanent deny', () => {
  py(`
import sys
sys.path.insert(0, ${JSON.stringify(lib)})
import notifyplan
assert notifyplan.plan(28, False, False, False) == 'not_required'
assert notifyplan.plan(32, True, True, True) == 'not_required'
assert notifyplan.plan(33, True, False, False) == 'already_granted'
assert notifyplan.plan(33, False, False, True) == 'request'
assert notifyplan.plan(33, False, True, False) == 'open_settings'
assert 'does not show an Allow notifications popup' in notifyplan.MESSAGES['not_required']
assert 'will not show the Allow popup again' in notifyplan.MESSAGES['open_settings']
print('ok')
`);
});

test('keyboard plan names the fallback and looks in both package dirs', () => {
  py(`
import sys
sys.path.insert(0, ${JSON.stringify(lib)})
import inputplan
assert inputplan.input_plan(False, [], False, 0) == 'kodi'
assert inputplan.input_plan(True, ['/x'], False, 0.2) == 'wait'
assert inputplan.input_plan(True, ['/x'], True, 9) == 'native'
assert inputplan.input_plan(True, ['/x'], False, 1.5) == 'fallback_kodi'
dirs = inputplan.files_dirs(['/storage/emulated/0/Android/data/org.xbmc.kodi/files/x'])
assert any('com.fefc.kodi' in d for d in dirs)
assert any('org.xbmc.kodi' in d for d in dirs)
print('ok')
`);
});

test('smali asks for the forced keyboard and does not treat old Android as granted', () => {
  const input = fs.readFileSync(path.join(root, 'tools/fefc_input/smali/com/fefc/kodi/FefcInputActivity$5.smali'), 'utf8');
  assert.match(input, /const\/4 v2, 0x2/);
  assert.match(input, /showSoftInput\(Landroid\/view\/View;I\)Z/);
  const notify = fs.readFileSync(path.join(root, 'tools/fefc_notify/smali/com/fefc/kodi/FefcNotifyActivity.smali'), 'utf8');
  assert.match(notify, /const\/16 v1, 0x21/);
  assert.match(notify, /const-string v0, "not_required"/);
  assert.match(notify, /openNotifySettings\(\)V/);
  const build = fs.readFileSync(path.join(root, 'tools/build_kodi_apk.py'), 'utf8');
  assert.match(build, /Both APK ids/);
  assert.doesNotMatch(build, /android:noHistory="true"/);
});

test('Optimus dialog uses the web cue and the provider states stay explicit', () => {
  const app = fs.readFileSync(path.join(root, 'src/app.js'), 'utf8');
  const cue = fs.readFileSync(path.join(lib, 'optimusplan.py'), 'utf8');
  assert.match(app, /Optimus is watching a fan edit\. Type to interrupt him\./);
  assert.match(cue, /Optimus is watching a fan edit\. Type to interrupt him\./);
  assert.match(app, /FEFCTesting\.mount/);
  assert.match(app, /playDirect/);
  py(`
import sys
sys.path.insert(0, ${JSON.stringify(lib)})
import providers
doc = {'title':'01 - Testing','providers':[{'id':'pt:p:x','name':'X','open_label':'Open in X','items':[
  {'id':'pt:i:a','name':'A page','kind':'page','url':'https://example.test/a'},
  {'id':'pt:i:b','name':'A file','kind':'file','url':'https://example.test/b.mp4'}
]}],'verified':{'items':{'pt:i:b':{'state':'playable','detail':'Range ok','kodi_play':True,'play_url':'https://example.test/b.mp4','browser_play':True,'mime':'video/mp4'}}}}
idx = providers.index(doc)
assert idx['pt:i:a']['state']=='unchecked' and idx['pt:i:a']['kodi_play'] is False
assert 'not a film' in providers.status_line(idx['pt:i:a'])
assert idx['pt:i:b']['kodi_play'] is True and idx['pt:i:b']['play_url'].endswith('.mp4')
assert 'can be played' in providers.status_line(idx['pt:i:b'])
print('ok')
`);
});

test('served bundles include the provider mount and the Fire TV ambience graph', () => {
  const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const audio = fs.readFileSync(path.join(root, 'audio.js'), 'utf8');
  assert.match(app, /FEFCTesting/);
  assert.match(app, /playDirect/);
  assert.match(audio, /850/);
  assert.match(audio, /0\.085|0.085/);
  assert.doesNotMatch(audio, /loadAmbFile/);
  assert.doesNotMatch(audio, /220\.5/);
});
