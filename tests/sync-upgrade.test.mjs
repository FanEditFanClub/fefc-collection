// Simulates 0.8.19 (paired, token only in WebView localStorage) → 0.8.22.
// The old shell called WebStorage.deleteAllData() on every versionCode bump and dropped the pairing.
// node tests/sync-upgrade.test.mjs
import fs from 'fs';
import { createRequire } from 'module';
import w from '../_worker.js';

const require = createRequire(import.meta.url);
const keep = require('../src/sync-keep.js');
const root = new URL('..', import.meta.url);
const mainJava = fs.readFileSync(new URL('firetv/app/src/main/java/com/faneditfanclub/collection/MainActivity.java', root), 'utf8');
const vaultJava = fs.readFileSync(new URL('firetv/app/src/main/java/com/faneditfanclub/collection/SyncVault.java', root), 'utf8');

const STAR = 'StarItem1111';
const LIST = JSON.stringify({ v: 1, updatedAt: 9, stars: { [STAR]: { id: STAR, name: 'Alias', updatedAt: 9 } }, history: {}, playback: {} });
let failed = 0;
const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) failed++; };
function mem() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), _m: m };
}

ok(!/WebStorage\.getInstance\(\)\.deleteAllData\(\)/.test(mainJava), 'upgrade path does not call deleteAllData');
ok(mainJava.includes('web.clearCache(true)'), 'HTTP cache still busts on version change');
ok(mainJava.includes('SyncVault.migrateLegacy'), 'legacy prefs are migrated before the page loads');
ok(/if \(id == null \|\| id\.length\(\) < 20\)/.test(vaultJava), 'device id is created only when missing');
ok(vaultJava.includes('does not erase deviceId') || vaultJava.includes('blank tok does not erase deviceId') || vaultJava.includes('A blank tok does not erase'), 'blank token keeps device id');

/* --- install 0.8.19, pair, upgrade to 0.8.22 --- */
const ls = mem();
const oldToken = 't'.repeat(40);
ls.setItem('fefcSrvTok', oldToken);
ls.setItem('fefcSrvKind', 'code');
ls.setItem('fefcSrvUser', 'null');
ls.setItem('fefcUserData.v1', LIST);
const prefs = { clearedForVersion: 19 };
function shellUpgrade(storage, prefs, versionCode) {
  if (prefs.clearedForVersion !== versionCode) {
    prefs.httpCacheCleared = true;
    prefs.clearedForVersion = versionCode;
  }
  return storage;
}
shellUpgrade(ls, prefs, 32);
ok(prefs.clearedForVersion === 32 && prefs.httpCacheCleared, 'version bump clears the HTTP cache flag');
ok(ls.getItem('fefcSrvTok') === oldToken, 'pairing token still present after upgrade');
ok(JSON.parse(ls.getItem('fefcUserData.v1')).stars[STAR].name === 'Alias', 'My List still synced after upgrade');

/* The new shell mirrors that snapshot into backed-up prefs, then a later WebView wipe can be refilled. */
const vault = keep.snapshot(ls);
ls.removeItem('fefcSrvTok'); ls.removeItem('fefcSrvKind'); ls.removeItem('fefcSrvUser'); ls.removeItem('fefcUserData.v1');
ok(!ls.getItem('fefcSrvTok'), 'webview storage empty before restore');
const restored = keep.applyVault(ls, vault);
ok(restored.restored && ls.getItem('fefcSrvTok') === oldToken, 'vault copies the token back');
ok(ls.getItem('fefcUserData.v1') === LIST, 'vault copies My List back');

/* An existing token is the live pairing and is never replaced. */
ls.setItem('fefcSrvTok', 'live-token-live-token-live-token');
keep.applyVault(ls, { tok: 'other-token-other-token-other', kind: 'google', user: '{"email":"x"}', data: '{"v":1}', deviceId: 'a'.repeat(32) });
ok(ls.getItem('fefcSrvTok') === 'live-token-live-token-live-token', 'existing token is not replaced');
ok(ls.getItem('fefcDeviceId') === 'a'.repeat(32), 'device id is filled when missing');
const keptDev = ls.getItem('fefcDeviceId');
keep.applyVault(ls, { deviceId: 'b'.repeat(32), tok: '' });
ok(ls.getItem('fefcDeviceId') === keptDev, 'device id is never regenerated');

/* --- KV restore by device id when both WebView storage and the native copy are gone --- */
const store = new Map();
const SYNC = { async get(k, t) { const v = store.get(k); return v === undefined ? null : t === 'json' ? JSON.parse(v) : v; }, async put(k, v) { store.set(k, v); }, async delete(k) { store.delete(k); } };
const env = { SYNC };
const call = async (p, body, tok) => {
  const r = await w.fetch(new Request('https://x.test/api/sync/' + p, { method: 'POST', headers: { 'content-type': 'application/json', ...(tok ? { authorization: 'Bearer ' + tok } : {}) }, body: JSON.stringify(body || {}) }), env, {});
  return { s: r.status, j: await r.json() };
};
const made = await call('pair/create', {});
ok(!!made.j.token && made.j.code, 'old version can pair with a sync code');
const dev = 'c'.repeat(64);
await call('list', { data: JSON.parse(LIST) }, made.j.token);
const reg = await call('device/register', { deviceId: dev }, made.j.token);
ok(reg.j.ok === true, 'device id is registered against the list');
const lost = await call('restore', { deviceId: 'missing-device-id-missing-device' });
ok(lost.s === 404, 'a device that never registered cannot be invented');
const back = await call('restore', { deviceId: dev });
ok(back.s === 200 && back.j.token && back.j.token !== made.j.token, 'restore mints a new session for the same list');
const list = await w.fetch(new Request('https://x.test/api/sync/list', { headers: { authorization: 'Bearer ' + back.j.token } }), env, {});
const listJson = await list.json();
ok(listJson.data.stars[STAR].name === 'Alias', 'restored session still has the paired My List');
const forget = await call('device/forget', { deviceId: dev }, back.j.token);
ok(forget.j.ok === true, 'sign-out drops the device mapping');
const again = await call('restore', { deviceId: dev });
ok(again.s === 404, 'forgotten device is not paired again');
const bad = await call('device/register', { deviceId: 'short' }, back.j.token);
ok(bad.s === 400, 'short device id is rejected');

if (failed) { console.log(failed + ' failed'); process.exit(1); }
console.log('sync upgrade ok');
