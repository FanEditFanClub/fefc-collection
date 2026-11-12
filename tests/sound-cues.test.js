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

test('UI select, back, home, search and title/genre clips resolve, and Sound off silences them', () => {
  const skin = fs.readFileSync(path.join(root, 'kodi-src/skin-fefc/xml/Includes_FEFC.xml'), 'utf8');
  const router = fs.readFileSync(path.join(lib, 'router.py'), 'utf8');
  const service = fs.readFileSync(path.join(root, 'kodi-src/plugin.video.fefc/service.py'), 'utf8');
  const navsfx = fs.readFileSync(path.join(root, 'tools/kodi_navsfx.py'), 'utf8');
  const builder = fs.readFileSync(path.join(root, 'tools/build_kodi_apk.py'), 'utf8');
  assert.match(navsfx, /cues\.sounds_xml\(\)/);
  const workflow = fs.readFileSync(path.join(root, '.github/workflows/kodi-apk.yml'), 'utf8');
  assert.match(skin, /action=cue&amp;kind=home/);
  assert.match(router, /'cue': 'cue'/);
  assert.match(router, /ui_file\('search'/);
  assert.match(service, /def details_sfx/);
  assert.match(service, /details_ready/);
  assert.match(service, /FEFC\.FocusSfx/);
  assert.match(service, /next_nav_sound/);
  assert.match(service, /def transport_cues/);
  const seek = fs.readFileSync(path.join(root, 'kodi-src/skin-fefc/xml/DialogSeekBar.xml'), 'utf8');
  const keymap = fs.readFileSync(path.join(root, 'kodi-src/plugin.video.fefc/resources/keymaps/fefc-nav.xml'), 'utf8');
  assert.match(seek, /<top>866<\/top>/);
  assert.match(seek, /<left>96<\/left>/);
  assert.match(seek, /<height>160<\/height>/);
  assert.match(seek, /SeekLabel/);
  assert.match(seek, /SeekTimeLabelVar/);
  assert.match(seek, /id="401"/);
  assert.doesNotMatch(seek, /effect="zoom"/);
  assert.match(keymap, /FullscreenVideo/);
  assert.match(keymap, /PlayerControl\(Play\)/);
  assert.match(navsfx, /TRANSPORT_QUIET = 0\.4/);
  assert.match(builder, /apply_fefc_defaults/);
  assert.match(workflow, /sound-cues\.test\.js/);
  assert.match(workflow, /verify_apk_cues\.py FEFC-Kodi\.apk FEFC\.apk/);
  const out = py(`
import json, sys
sys.path.insert(0, ${JSON.stringify(lib)})
import cues, catalog
assert cues.ui_file('select', False) == 'click.wav'
assert cues.ui_file('back', False) == 'back.wav'
assert cues.ui_file('home', False) == 'back.wav'
assert cues.ui_file('search', False) == 'click.wav'
assert cues.ui_file('pause', False) == 'pause.wav'
assert cues.ui_file('resume', False) == 'resume.wav'
assert cues.ui_file('forward', False) == 'forward.wav'
assert cues.ui_file('rewind', False) == 'rewind.wav'
for event in ('select', 'back', 'home', 'search', 'pause', 'resume', 'forward', 'rewind'):
    assert cues.ui_file(event, True) == ''
# A video tile opens details via the info action. That must be the click, not silence.
actions = dict(cues.SKIN_ACTIONS)
assert actions['select'] == 'click.wav'
assert actions['info'] == 'click.wav'
assert actions['back'] == 'back.wav'
assert actions['previousmenu'] == 'back.wav'
assert actions['parentdir'] == 'back.wav'
assert actions['pause'] == 'pause.wav'
assert actions['play'] == 'resume.wav'
assert actions['playpause'] == 'resume.wav'
assert actions['fastforward'] == 'forward.wav'
assert actions['rewind'] == 'rewind.wav'
assert actions['stepforward'] == 'forward.wav'
assert actions['stepback'] == 'rewind.wav'
assert actions['skipplus'] == 'forward.wav'
assert actions['skipminus'] == 'rewind.wav'
for name in ('pause.wav', 'resume.wav', 'forward.wav', 'rewind.wav'):
    assert name in cues.REQUIRED_WAVS
    assert any(p.endswith(name) for p in cues.apk_asset_paths())
idle = {'playing': True, 'paused': False, 'forwarding': False, 'rewinding': False, 'wall': False}
paused = dict(idle, paused=True, playing=True)
assert cues.transport_event(idle, paused, False) == 'pause'
assert cues.transport_event(paused, idle, False) == 'resume'
assert cues.transport_event(idle, dict(idle, forwarding=True), False) == 'forward'
assert cues.transport_event(idle, dict(idle, rewinding=True), False) == 'rewind'
assert cues.transport_event(idle, paused, True) == ''
assert cues.transport_event(idle, dict(paused, wall=True), False) == ''
xml = cues.sounds_xml()
assert '<name>info</name>' in xml and '<file>click.wav</file>' in xml
assert '<name>select</name>' in xml
file_on = cues.opening_plan('file', False, ['assets/sfx/westworld-theme.mp3'])
assert file_on['click'] == 'click.wav' and file_on['clip'].endswith('westworld-theme.mp3')
assert cues.opening_plan('file', True, ['assets/sfx/westworld-theme.mp3']) == {'click': '', 'clip': ''}
assert cues.opening_plan('folder', False, ['assets/sfx/westworld-violent.mp3'])['clip'].endswith('westworld-violent.mp3')
assert cues.opening_plan('genre', False, ['assets/sfx/harry-potter.mp3'])['click'] == 'click.wav'
assert cues.opening_plan('search', False, [])['click'] == 'click.wav'
assert cues.opening_plan('home', False, [])['click'] == 'back.wav'
assert cues.opening_plan('back', False, [])['click'] == 'back.wav'
# Empty property must not latch, or the details page never retries.
play, latched = cues.details_ready('ww-1', '', False, '')
assert play is False and latched == ''
play, latched = cues.details_ready('ww-1', 'https://example/kodi-sfx/westworld-theme.wav', False, '')
assert play is True and latched == 'ww-1'
play, latched = cues.details_ready('ww-1', 'https://example/kodi-sfx/westworld-theme.wav', True, '')
assert play is False and latched == ''
sfx = json.load(open('data/folder-sfx.json'))
m = {'items': {
    'ww': ['Westworld', 'root', 1, ''],
    'part': ['Part 6.mkv', 'ww', 0, ''],
    'bare': ['notes.mkv', 'sub', 0, ''],
    'sub': ['Extras', 'ww', 1, ''],
}, 'sfx': sfx}
clips = catalog.sfx_for(m, 'part')
bases = {c.split('/')[-1].split('.')[0] for c in clips}
assert bases == {'westworld-violent', 'westworld-paint', 'westworld-theme', 'westworld-welcome'}
assert set(catalog.sfx_up(m, 'bare')) == set(clips)
plan = cues.opening_plan('file', False, clips)
assert plan['click'] == 'click.wav' and 'westworld-' in plan['clip']
assert catalog.play_choice(clips, True) == ''
assert catalog.sfx_wav(clips).startswith('kodi-sfx/westworld-')
# Genre open uses the genre's own clip, not another title's.
genre = cues.opening_plan('genre', False, ['assets/sfx/harry-potter.mp3'])
assert 'harry-potter' in genre['clip'] and 'westworld' not in genre['clip']
print('ok')
`);
  assert.equal(out, 'ok');
});
