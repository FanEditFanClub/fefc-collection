// node --test tests/ : /api/stream/:id in _worker.js against a mocked Drive API
import test from 'node:test';
import assert from 'node:assert';
import worker from '../_worker.js';
const ID = 'A'.repeat(33), TID = 'B'.repeat(33);
function mock(handler) { globalThis.fetch = async (u, init) => handler(new URL(String(u)), init || {}); }
const call = (path, env, headers = {}) => worker.fetch(new Request('https://x.test' + path, { headers }), env, { waitUntil() {} });
const meta = (mime) => new Response(JSON.stringify({ id: ID, mimeType: mime, shortcutDetails: { targetId: TID } }));

test('without GOOGLE_API_KEY resolves shortcut via view redirect then proxies usercontent', async () => {
  const seen = [];
  mock((u, init) => {
    seen.push(u.host + u.pathname + '|' + (init.headers && init.headers.get && init.headers.get('range')));
    if (u.host === 'drive.google.com') {
      return new Response(null, { status: 302, headers: { location: 'https://drive.google.com/file/d/' + TID + '/view' } });
    }
    assert.equal(u.host, 'drive.usercontent.google.com');
    assert.ok(u.searchParams.get('id') === TID);
    return new Response('abc', { status: 206, headers: { 'content-type': 'video/mp4', 'content-range': 'bytes 0-2/1000', 'content-length': '3' } });
  });
  const r = await call('/api/stream/' + ID + '/clip.mp4', {});
  assert.equal(r.status, 206);
  assert.equal(r.headers.get('content-type'), 'video/mp4');
  assert.equal(r.headers.get('accept-ranges'), 'bytes');
  assert.ok(seen.some(s => s.includes('drive.usercontent.google.com') && s.includes('bytes=0-')));
  assert.equal(await r.text(), 'abc');
});
test('rejects bad ids', async () => { const r = await call('/api/stream/x', { GOOGLE_API_KEY: 'k' }); assert.equal(r.status, 400); });
test('rejects a malformed percent-encoded path with 400', async () => { const r = await call('/api/stream/' + ID + '/%E0%A4%A', { GOOGLE_API_KEY: 'k' }); assert.equal(r.status, 400); });
test('resolves shortcut, forwards Range, returns 206', async () => {
  const seen = [];
  mock((u, init) => {
    seen.push(u.pathname + u.search + '|' + (init.headers && init.headers.get && init.headers.get('range')));
    if (u.searchParams.get('alt') !== 'media') return meta('application/vnd.google-apps.shortcut');
    return new Response('abc', { status: 206, headers: { 'content-type': 'application/octet-stream', 'content-range': 'bytes 10-12/1000', 'content-length': '3' } });
  });
  const SID = 'E'.repeat(33);
  const r = await call('/api/stream/' + SID, { GOOGLE_API_KEY: 'k' }, { range: 'bytes=10-12' });
  assert.equal(r.status, 206); assert.equal(r.headers.get('content-range'), 'bytes 10-12/1000'); assert.equal(r.headers.get('accept-ranges'), 'bytes'); assert.equal(r.headers.get('content-type'), 'video/mp4');
  const media = seen.find(x => x.includes('alt=media')); assert.ok(media && media.includes('/files/' + TID + '?alt=media') && media.includes('acknowledgeAbuse=true') && media.endsWith('bytes=10-12'), seen.join(' || '));
  assert.equal(await r.text(), 'abc');
});
test('maps 403 quota -> 429 and 403 private -> 403', async () => {
  mock((u) => {
    if (u.host === 'drive.usercontent.google.com') return new Response('quota', { status: 403 });
    if (u.searchParams.get('alt') !== 'media') return meta('video/mp4');
    return new Response(JSON.stringify({ error: { errors: [{ reason: 'downloadQuotaExceeded' }] } }), { status: 403 });
  });
  let r = await call('/api/stream/' + 'C'.repeat(33), { GOOGLE_API_KEY: 'k' }); assert.equal(r.status, 429); assert.equal((await r.json()).error, 'quota_exceeded');
  mock((u) => {
    if (u.host === 'drive.usercontent.google.com') return new Response('no', { status: 403 });
    if (u.searchParams.get('alt') !== 'media') return meta('video/mp4');
    return new Response(JSON.stringify({ error: { errors: [{ reason: 'forbidden' }] } }), { status: 403 });
  });
  r = await call('/api/stream/' + 'D'.repeat(33), { GOOGLE_API_KEY: 'k' }); assert.equal(r.status, 403); assert.equal((await r.json()).error, 'not_shared');
});
test('?b= query is forwarded as Range when the Range header is absent', async () => {
  const seen = [];
  mock((u, init) => {
    seen.push((init.headers && init.headers.get && init.headers.get('range')) || '');
    if (u.searchParams.get('alt') !== 'media') return meta('video/mp4');
    return new Response('abcdefghij', { status: 206, headers: { 'content-type': 'video/mp4', 'content-range': 'bytes 5-8/100', 'content-length': '4' } });
  });
  const r = await call('/api/stream/' + 'F'.repeat(33) + '/clip.mp4?b=5-8', { GOOGLE_API_KEY: 'k' });
  assert.equal(r.status, 206);
  assert.ok(seen.some(s => s === 'bytes=5-8'), seen.join(' | '));
});
test('closed bytes=0-N is clipped when upstream returns the whole object', async () => {
  const whole = '0123456789'.repeat(10);
  mock((u) => {
    if (u.searchParams.get('alt') !== 'media') return meta('video/mp4');
    return new Response(whole, { status: 206, headers: { 'content-type': 'video/mp4', 'content-range': 'bytes 0-99/100', 'content-length': '100' } });
  });
  const r = await call('/api/stream/' + 'G'.repeat(33) + '/clip.mp4', { GOOGLE_API_KEY: 'k' }, { range: 'bytes=0-3' });
  assert.equal(r.status, 206);
  assert.equal(r.headers.get('content-range'), 'bytes 0-3/100');
  assert.equal(r.headers.get('content-length'), '4');
  assert.equal(await r.text(), '0123');
});
test('rejects HTML interstitial from usercontent', async () => {
  mock((u) => {
    if (u.host === 'drive.google.com') return new Response(null, { status: 200 });
    return new Response('<!DOCTYPE html><title>Google Drive - Quota exceeded</title>', { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
  });
  const r = await call('/api/stream/' + ID, {});
  assert.equal(r.status, 429);
  assert.equal((await r.json()).error, 'quota_exceeded');
});
