const test = require('node:test');
const assert = require('node:assert');
const attrs = require('../search-attrs.js');
const { spawnSync } = require('child_process');
const path = require('path');

test('black & white Mel Brooks matches only when both clauses hit', () => {
  const records = [
    { id: 'a', blob: 'Young Frankenstein - Black and White Fan Edit', people: 'Mel Brooks director' },
    { id: 'b', blob: 'Spaceballs', people: 'Mel Brooks' },
    { id: 'c', blob: 'Psycho Black & White', people: 'Alfred Hitchcock' },
    { id: 'd', blob: 'Some comedy', people: '' }
  ];
  const hit = attrs.search('black & white Mel Brooks', records);
  assert.equal(hit.handled, true);
  assert.deepStrictEqual(hit.results.map(r => r.id), ['a']);
});

test('one loose word is left to the older search instead of a genre guess', () => {
  const hit = attrs.search('funny', [{ id: 'a', blob: 'Airplane', people: '' }]);
  assert.equal(hit.handled, false);
});

test('ticker keeps real titles under the Kodi length cap and does not invent one', () => {
  const py = `
import sys
sys.path.insert(0, ${JSON.stringify(path.join(__dirname, '../kodi-src/plugin.video.fefc/resources/lib'))})
import ticker
text = ticker.build_text([{'src':'new','title':'A'*500}], [{'src':'x','title':'Real post'}], limit=900)
assert len(text) <= 900
assert 'Real post' in text or 'A'*20 in text
empty = ticker.items_from_new_files({})
assert empty == []
print('ok')
`;
  const r = spawnSync('python3', ['-c', py], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /ok/);
});

test('keyboard plan waits, then names the Kodi fallback', () => {
  const py = `
import sys
sys.path.insert(0, ${JSON.stringify(path.join(__dirname, '../kodi-src/plugin.video.fefc/resources/lib'))})
import inputplan
assert inputplan.input_plan(False, [], False, 0) == 'kodi'
assert inputplan.input_plan(True, ['/x'], False, 0.2) == 'wait'
assert inputplan.input_plan(True, ['/x'], True, 9) == 'native'
# A cold Fire TV can take longer than 1.5 s to open the input activity (0.4.2): wait until FAIL_AFTER.
assert inputplan.FAIL_AFTER >= 3.0
assert inputplan.input_plan(True, ['/x'], False, 2) == 'wait'
assert inputplan.input_plan(True, ['/x'], False, inputplan.FAIL_AFTER - 0.1) == 'wait'
assert inputplan.input_plan(True, ['/x'], False, inputplan.FAIL_AFTER) == 'fallback_kodi'
assert inputplan.input_plan(True, ['/x'], False, 1.5, fail_after=1.5) == 'fallback_kodi'
print('ok')
`;
  const r = spawnSync('python3', ['-c', py], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
});
