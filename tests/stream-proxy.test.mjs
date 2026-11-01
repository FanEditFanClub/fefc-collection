// node --test tests/ : /api/stream/:id in _worker.js against a mocked Drive API
import test from 'node:test';
import assert from 'node:assert';
import worker from '../_worker.js';
const ID = 'A'.repeat(33), TID = 'B'.repeat(33);
function mock(handler) { globalThis.fetch = async (u, init) => handler(new URL(u), init || {}); }
const call = (path, env, headers = {}) => worker.fetch(new Request('https://x.test' + path, { headers }), env, { waitUntil() {} });
const meta = (mime) => new Response(JSON.stringify({ id: ID, mimeType: mime, shortcutDetails: { targetId: TID } }));

test('503 not_configured without GOOGLE_API_KEY', async () => {
  const r = await call('/api/stream/' + ID, {}); assert.equal(r.status, 503); assert.equal((await r.json()).error, 'not_configured');
});
test('rejects bad ids', async () => { const r = await call('/api/stream/x', { GOOGLE_API_KEY: 'k' }); assert.equal(r.status, 400); });
test('resolves shortcut, forwards Range, returns 206', async () => {
  const seen = [];
  mock((u, init) => {
    seen.push(u.pathname + u.search + '|' + (init.headers && init.headers.get && init.headers.get('range')));
    if (u.searchParams.get('alt') !== 'media') return meta('application/vnd.google-apps.shortcut');
    return new Response('abc', { status: 206, headers: { 'content-type': 'application/octet-stream', 'content-range': 'bytes 10-12/1000', 'content-length': '3' } });
  });
  const r = await call('/api/stream/' + ID, { GOOGLE_API_KEY: 'k' }, { range: 'bytes=10-12' });
  assert.equal(r.status, 206); assert.equal(r.headers.get('content-range'), 'bytes 10-12/1000'); assert.equal(r.headers.get('accept-ranges'), 'bytes'); assert.equal(r.headers.get('content-type'), 'video/mp4');
  assert.ok(seen[1].includes('/files/' + TID + '?alt=media') && seen[1].endsWith('bytes=10-12'));
  assert.equal(await r.text(), 'abc');
});
test('maps 403 quota -> 429 and 403 private -> 403', async () => {
  mock((u) => u.searchParams.get('alt') !== 'media' ? meta('video/mp4') : new Response(JSON.stringify({ error: { errors: [{ reason: 'downloadQuotaExceeded' }] } }), { status: 403 }));
  let r = await call('/api/stream/' + 'C'.repeat(33), { GOOGLE_API_KEY: 'k' }); assert.equal(r.status, 429); assert.equal((await r.json()).error, 'quota_exceeded');
  mock((u) => u.searchParams.get('alt') !== 'media' ? meta('video/mp4') : new Response(JSON.stringify({ error: { errors: [{ reason: 'forbidden' }] } }), { status: 403 }));
  r = await call('/api/stream/' + 'D'.repeat(33), { GOOGLE_API_KEY: 'k' }); assert.equal(r.status, 403); assert.equal((await r.json()).error, 'not_shared');
});
