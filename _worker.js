// Cloudflare Pages advanced-mode worker: POST /api/ai-search (Gemini), everything else -> static assets.
// Secret: set GEMINI_API_KEY (encrypted) in Pages > Settings > Variables and Secrets. Optional: GEMINI_MODEL.
const MAX_BODY = 4096, MAX_Q = 200, MAX_CAND = 200, MAX_OUT = 36;
const RL_WINDOW = 60000, RL_MAX = 12;               // per IP per isolate: 12 asks / minute
const rl = new Map();
let TITLES = null, TITLES_AT = 0;
const STOP = new Set('a an and the of to in on for with without from by is are be it its that this into than then very more less some any all just only my me i want find show give like movie movies film films edit edits fan cut cuts version versions one ones please about where which what who how'.split(' '));
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const norm = s => s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const toks = s => norm(s).split(' ').filter(w => w.length > 1 && !STOP.has(w)).map(w => w.length > 4 ? w.replace(/(ies|es|s)$/, '') : w);

async function titles(env, req) {
  if (TITLES && Date.now() - TITLES_AT < 6 * 3600e3) return TITLES;
  const r = await env.ASSETS.fetch(new Request(new URL('/data/ai-titles.json', req.url)));
  const j = await r.json();
  TITLES = j.items.map(([id, name, pi]) => { const folder = j.folders[pi] || ''; return { id, name, folder, t: ' ' + toks(name + ' ' + folder).join(' ') + ' ' }; });
  TITLES_AT = Date.now(); return TITLES;
}
function prefilter(all, words) {
  if (!words.length) return [];
  const sc = [];
  for (const x of all) { let s = 0; for (const w of words) { if (x.t.includes(' ' + w + ' ')) s += 2; else if (w.length > 3 && x.t.includes(' ' + w)) s += 1; } if (s) sc.push([s, x]); }
  sc.sort((a, b) => b[0] - a[0]); return sc.slice(0, MAX_CAND).map(a => a[1]);
}
async function gemini(env, prompt, schema) {
  const models = [...new Set([env.GEMINI_MODEL, 'gemini-1.5-flash', 'gemini-1.5-flash-latest', 'gemini-2.0-flash', 'gemini-1.5-pro'].filter(Boolean))];
  let last;
  for (const model of models) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(env.GEMINI_API_KEY)}`;
    const r = await fetch(url, {
      method: 'POST', signal: AbortSignal.timeout(20000), headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0.2, maxOutputTokens: 4096, responseMimeType: 'application/json', responseSchema: schema } })
    });
    if (r.status === 404 || r.status === 429 || r.status >= 500) { last = new Error('gemini ' + r.status); continue; }
    if (!r.ok) throw new Error('gemini ' + r.status);
    const j = await r.json(); const txt = j?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
    return JSON.parse(txt);
  }
  throw last || new Error('gemini unavailable');
}
async function aiSearch(req, env) {
  if (!env.GEMINI_API_KEY) return json({ error: 'not_configured' }, 503);
  const ip = req.headers.get('cf-connecting-ip') || 'x', now = Date.now();
  const h = (rl.get(ip) || []).filter(t => now - t < RL_WINDOW); if (h.length >= RL_MAX) return json({ error: 'rate_limited' }, 429);
  h.push(now); rl.set(ip, h); if (rl.size > 5000) rl.clear();
  const len = +req.headers.get('content-length') || 0; if (len > MAX_BODY) return json({ error: 'too_large' }, 413);
  const raw = await req.text(); if (raw.length > MAX_BODY) return json({ error: 'too_large' }, 413);
  let q = ''; try { q = String(JSON.parse(raw).q || ''); } catch { return json({ error: 'bad_request' }, 400); }
  q = q.replace(/\s+/g, ' ').trim().slice(0, MAX_Q); if (q.length < 2) return json({ error: 'bad_request' }, 400);
  const all = await titles(env, req);
  let words = toks(q);
  const SEM_EXP = {
    space: ['star', 'wars', 'trek', 'interstellar', '2001', 'alien', 'dune', 'spaceballs', 'guardians', 'galaxy', 'martian', 'apollo', 'serenity', 'battlestar'],
    superhero: ['batman', 'superman', 'spiderman', 'avengers', 'iron', 'man', 'captain', 'america', 'thor', 'xmen', 'justice', 'league', 'hulk'],
    horror: ['halloween', 'friday', 'elm', 'evil', 'dead', 'scream', 'shining', 'chucky', 'hellraiser', 'exorcist'],
    timetravel: ['future', 'terminator', 'donnie', 'darko', 'tenet', 'monkeys'],
    action: ['die', 'hard', 'matrix', 'wick', 'terminator', 'predator', 'mad', 'max', 'mission', 'impossible', 'bourne', 'robocop'],
    comedy: ['airplane', 'naked', 'gun', 'monty', 'python', 'austin', 'powers', 'spaceballs', 'ghostbusters', 'anchorman'],
    fantasy: ['rings', 'hobbit', 'potter', 'thrones', 'willow', 'conan']
  };
  for (const [k, exp] of Object.entries(SEM_EXP)) {
    if (words.includes(k) || norm(q).includes(k)) words.push(...exp);
  }
  words = [...new Set(words)];
  let cand = prefilter(all, words);
  if (cand.length < 12 || !cand.some(c => words.filter(w => c.t.includes(' ' + w + ' ')).length >= 2 || words.length === 1)) {
    // expand vague questions into franchise/title keywords (one cheap call)
    try {
      const ex = await gemini(env, `A visitor is searching a fan-edit film collection for: "${q}". List up to 8 short search keywords (franchise names, film titles, character names, common fan-edit words like "extended", "condensed", "supercut", "chronological") that would appear in matching file names. JSON only.`,
        { type: 'OBJECT', properties: { keywords: { type: 'ARRAY', items: { type: 'STRING' } } }, required: ['keywords'] });
      words = [...new Set([...words, ...(ex.keywords || []).slice(0, 8).flatMap(toks)])]; cand = prefilter(all, words);
    } catch { /* keep plain prefilter */ }
  }
  if (!cand.length) return json({ q, results: [] });
  const list = cand.map((c, i) => `${i}\t${c.name}${c.folder ? '  [in: ' + c.folder + ']' : ''}`).join('\n');
  const out = await gemini(env, `You are Fan Edit Optimus, the friendly, upbeat robot guide of the Fan Edit Fan Club collection, helping visitors find fan edits. Request: "${q}"
Candidates (index<TAB>file name [folder]):
${list}

Pick up to ${MAX_OUT} candidates that best match the request (franchise, title, and the kind of edit asked for, e.g. shorter/condensed, extended, chronological, no filler). Best first. Skip weak matches. For each give the index and a one-line reason (max 90 chars) written in your own first-person voice as Fan Edit Optimus, naming what in the title matches (e.g. "I picked this one because it trims the slow parts of Fellowship."). Also give "intro": one short, warm sentence (max 120 chars) introducing your picks. JSON only.`,
    { type: 'OBJECT', properties: { intro: { type: 'STRING' }, results: { type: 'ARRAY', items: { type: 'OBJECT', properties: { i: { type: 'INTEGER' }, reason: { type: 'STRING' } }, required: ['i', 'reason'] } } }, required: ['results'] });
  const seen = new Set(), results = [];
  for (const r of (out.results || [])) { const c = cand[r.i]; if (!c || seen.has(c.id)) continue; seen.add(c.id); results.push({ id: c.id, name: c.name, reason: String(r.reason || '').slice(0, 140) }); if (results.length >= MAX_OUT) break; }
  return json({ q, intro: String(out.intro || '').slice(0, 160), results });
}
// ---------------- My List sync (KV "SYNC") ----------------
// Bindings/secrets (see firetv/../SYNC-SETUP.md): KV namespace binding SYNC; optional secrets GOOGLE_TV_CLIENT_ID and
// GOOGLE_TV_CLIENT_SECRET (OAuth client of type "TVs and Limited Input devices") for the Google TV-code sign-in.
const WEB_CLIENT_ID = '965770773324-i20msn4q01isddkunrcg4o30s5pju0bk.apps.googleusercontent.com';
const SESS_TTL = 365 * 86400, QR_TTL = 300, PAIR_TTL = 600, MAX_LIST = 900000;
const b64u = u8 => btoa(String.fromCharCode(...u8)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const rnd = n => b64u(crypto.getRandomValues(new Uint8Array(n)));
const digits = n => { const a = crypto.getRandomValues(new Uint32Array(n)); return [...a].map(x => x % 10).join(''); };
const sha = async s => b64u(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))));
const syncRl = new Map();
function limited(req, bucket, max, win = 60000) {
  const k = bucket + ':' + (req.headers.get('cf-connecting-ip') || 'x'), now = Date.now();
  const h = (syncRl.get(k) || []).filter(t => now - t < win); if (h.length >= max) return true;
  h.push(now); syncRl.set(k, h); if (syncRl.size > 5000) syncRl.clear(); return false;
}
const kget = (env, k) => env.SYNC.get(k, 'json');
const kput = (env, k, v, ttl) => env.SYNC.put(k, JSON.stringify(v), { expirationTtl: Math.max(60, ttl) });
async function newSession(env, key, kind, user) {
  const token = rnd(32);
  await kput(env, 'sess:' + await sha(token), { key, kind, user: user || null, at: Date.now() }, SESS_TTL);
  return token;
}
async function authed(req, env) {
  const m = /^Bearer ([\w-]{20,80})$/.exec(req.headers.get('authorization') || ''); if (!m) return null;
  const s = await kget(env, 'sess:' + await sha(m[1])); return s ? { ...s, hash: await sha(m[1]) } : null;
}
const COLS = ['stars', 'history', 'playback'];
function cleanList(j) {
  if (!j || typeof j !== 'object' || j.v !== 1) return null;
  const o = { v: 1, updatedAt: +j.updatedAt || 0 }; let n = 0;
  for (const c of COLS) {
    o[c] = {}; const src = j[c]; if (!src || typeof src !== 'object') continue;
    for (const [id, r] of Object.entries(src)) {
      if (!/^[\w-]{10,80}$/.test(id) || !r || typeof r !== 'object' || ++n > 20000) continue;
      o[c][id] = r;
    }
  }
  return o;
}
function mergeList(a, b) {
  const o = { v: 1, updatedAt: Math.max(a.updatedAt || 0, b.updatedAt || 0) };
  for (const c of COLS) { o[c] = { ...(a[c] || {}) }; for (const [k, r] of Object.entries(b[c] || {})) if (!o[c][k] || (r.updatedAt || 0) > (o[c][k].updatedAt || 0)) o[c][k] = r; }
  return o;
}
const publicUser = u => u ? { email: u.email || '', name: u.name || '', picture: u.picture || '' } : null;
const jwtPayload = t => { try { return JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); } catch { return null; } };
async function readBody(req, max = 20000) {
  const raw = await req.text(); if (raw.length > max) throw Object.assign(new Error('too_large'), { status: 413 });
  try { return raw ? JSON.parse(raw) : {}; } catch { throw Object.assign(new Error('bad_request'), { status: 400 }); }
}
async function syncApi(req, env, url) {
  const p = url.pathname.slice('/api/sync/'.length);
  if (p === 'status') return json({ configured: !!env.SYNC, tv: !!(env.SYNC && env.GOOGLE_TV_CLIENT_ID && env.GOOGLE_TV_CLIENT_SECRET) });
  if (!env.SYNC) return json({ error: 'not_configured' }, 503);
  if (limited(req, 'any', 180)) return json({ error: 'rate_limited' }, 429);
  const GET = req.method === 'GET';
  if (!GET && req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const body = GET ? {} : await readBody(req, p === 'list' ? MAX_LIST + 1000 : 20000);

  if (p === 'me') { const s = await authed(req, env); return s ? json({ kind: s.kind, user: publicUser(s.user) }) : json({ error: 'unauthorized' }, 401); }
  if (p === 'logout') { const s = await authed(req, env); if (s) await env.SYNC.delete('sess:' + s.hash); return json({ ok: true }); }

  if (p === 'list') {
    const s = await authed(req, env); if (!s) return json({ error: 'unauthorized' }, 401);
    const cur = (await kget(env, 'list:' + s.key)) || { v: 1, updatedAt: 0, stars: {}, history: {}, playback: {} };
    if (GET) return json({ data: cur });
    const inc = cleanList(body.data); if (!inc) return json({ error: 'bad_request' }, 400);
    const merged = mergeList(cur, inc); const txt = JSON.stringify(merged);
    if (txt.length > MAX_LIST) return json({ error: 'too_large' }, 413);
    const sig = o => JSON.stringify([o.stars, o.history, o.playback]);
    if (sig(merged) !== sig(cur)) await env.SYNC.put('list:' + s.key, txt);
    return json({ data: merged });
  }

  // Web Google sign-in (GIS access token) -> server session for the same Google user as the TV-code flow.
  if (p === 'google/session') {
    if (limited(req, 'gs', 20)) return json({ error: 'rate_limited' }, 429);
    const tok = String(body.access_token || ''); if (tok.length < 20 || tok.length > 4096) return json({ error: 'bad_request' }, 400);
    const r = await fetch('https://oauth2.googleapis.com/tokeninfo?access_token=' + encodeURIComponent(tok));
    const t = r.ok ? await r.json() : null;
    if (!t || !t.sub || (t.aud || t.azp) !== (env.GOOGLE_WEB_CLIENT_ID || WEB_CLIENT_ID)) return json({ error: 'invalid_token' }, 401);
    const user = { email: t.email || '', name: String(body.name || '').slice(0, 80), picture: String(body.picture || '').slice(0, 300) };
    return json({ token: await newSession(env, 'g:' + t.sub, 'google', user), kind: 'google', user: publicUser(user) });
  }

  // Google TV-code (OAuth device flow). Needs GOOGLE_TV_CLIENT_ID / GOOGLE_TV_CLIENT_SECRET.
  if (p === 'device/start') {
    if (!env.GOOGLE_TV_CLIENT_ID || !env.GOOGLE_TV_CLIENT_SECRET) return json({ error: 'not_configured' }, 503);
    if (limited(req, 'ds', 10)) return json({ error: 'rate_limited' }, 429);
    const r = await fetch('https://oauth2.googleapis.com/device/code', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: env.GOOGLE_TV_CLIENT_ID, scope: 'openid email profile' }) });
    const d = await r.json().catch(() => null);
    if (!r.ok || !d || !d.device_code) return json({ error: 'upstream', detail: String(d && (d.error || d.error_code) || r.status).slice(0, 60) }, 502);
    const id = rnd(16), exp = Math.min(+d.expires_in || 900, 900);
    await kput(env, 'dev:' + id, { dc: d.device_code, next: Date.now() + (+d.interval || 5) * 1000, iv: +d.interval || 5 }, exp);
    return json({ id, user_code: d.user_code, verification_url: d.verification_url || 'https://www.google.com/device', interval: +d.interval || 5, expires_in: exp });
  }
  if (p === 'device/poll') {
    if (!env.GOOGLE_TV_CLIENT_ID || !env.GOOGLE_TV_CLIENT_SECRET) return json({ error: 'not_configured' }, 503);
    const id = String(body.id || ''); if (!/^[\w-]{20,30}$/.test(id)) return json({ error: 'bad_request' }, 400);
    const rec = await kget(env, 'dev:' + id); if (!rec) return json({ status: 'expired' });
    if (Date.now() < rec.next) return json({ status: 'pending' });
    rec.next = Date.now() + rec.iv * 1000; await kput(env, 'dev:' + id, rec, 900);
    const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: env.GOOGLE_TV_CLIENT_ID, client_secret: env.GOOGLE_TV_CLIENT_SECRET, device_code: rec.dc, grant_type: 'urn:ietf:params:oauth:grant-type:device_code' }) });
    const d = await r.json().catch(() => ({}));
    if (d.error === 'authorization_pending') return json({ status: 'pending' });
    if (d.error === 'slow_down') { rec.iv += 5; await kput(env, 'dev:' + id, rec, 900); return json({ status: 'pending' }); }
    if (d.error === 'access_denied') { await env.SYNC.delete('dev:' + id); return json({ status: 'denied' }); }
    if (d.error || !d.id_token) { await env.SYNC.delete('dev:' + id); return json({ status: 'expired' }); }
    const c = jwtPayload(d.id_token);
    if (!c || !c.sub || c.aud !== env.GOOGLE_TV_CLIENT_ID) return json({ status: 'expired' });
    await env.SYNC.delete('dev:' + id);
    const user = { email: c.email || '', name: c.name || '', picture: c.picture || '' };
    return json({ status: 'ok', token: await newSession(env, 'g:' + c.sub, 'google', user), kind: 'google', user: publicUser(user) });
  }

  // QR link: TV shows a one-time link; a signed-in phone approves it.
  if (p === 'qr/start') {
    if (limited(req, 'qs', 10)) return json({ error: 'rate_limited' }, 429);
    const id = rnd(16), secret = rnd(24), verify = digits(4);
    await kput(env, 'qr:' + id, { sh: await sha(secret), verify, status: 'pending' }, QR_TTL);
    return json({ id, secret, verify, url: url.origin + '/?link=' + id, expires_in: QR_TTL });
  }
  if (p === 'qr/info') {
    const id = String(body.id || ''); if (!/^[\w-]{20,30}$/.test(id)) return json({ error: 'bad_request' }, 400);
    const q = await kget(env, 'qr:' + id); return q && q.status === 'pending' ? json({ verify: q.verify }) : json({ error: 'expired' }, 410);
  }
  if (p === 'qr/approve') {
    const s = await authed(req, env); if (!s) return json({ error: 'unauthorized' }, 401);
    const id = String(body.id || ''); if (!/^[\w-]{20,30}$/.test(id)) return json({ error: 'bad_request' }, 400);
    const q = await kget(env, 'qr:' + id); if (!q || q.status !== 'pending') return json({ error: 'expired' }, 410);
    await kput(env, 'qr:' + id, { ...q, status: 'approved', key: s.key, kind: s.kind, user: s.user || null }, 120);
    return json({ ok: true });
  }
  if (p === 'qr/poll') {
    const id = String(body.id || ''), secret = String(body.secret || ''); if (!/^[\w-]{20,30}$/.test(id) || secret.length < 20) return json({ error: 'bad_request' }, 400);
    const q = await kget(env, 'qr:' + id); if (!q) return json({ status: 'expired' });
    if (q.sh !== await sha(secret)) return json({ error: 'unauthorized' }, 401);
    if (q.status !== 'approved') return json({ status: 'pending' });
    await env.SYNC.delete('qr:' + id);
    return json({ status: 'ok', token: await newSession(env, q.key, q.kind, q.user), kind: q.kind, user: publicUser(q.user) });
  }

  // 6-digit pair code: valid 10 minutes, at most 8 devices; redeeming gives the device its own long-lived token.
  if (p === 'pair/create') {
    if (limited(req, 'pc', 10)) return json({ error: 'rate_limited' }, 429);
    let s = await authed(req, env), token = null, key, kind, user = null;
    if (s) { key = s.key; kind = s.kind; user = s.user; } else { key = 'c:' + rnd(16); kind = 'code'; token = await newSession(env, key, kind, null); }
    for (let i = 0; i < 8; i++) {
      const code = digits(6);
      if (await env.SYNC.get('code:' + code)) continue;
      await kput(env, 'code:' + code, { key, kind, user, uses: 0 }, PAIR_TTL);
      return json({ code, expires_in: PAIR_TTL, kind, user: publicUser(user), token });
    }
    return json({ error: 'busy' }, 503);
  }
  if (p === 'pair/redeem') {
    const ip = req.headers.get('cf-connecting-ip') || 'x', fk = 'rl:pf:' + ip, gk = 'rl:pg:' + Math.floor(Date.now() / 60000);
    const fails = +(await env.SYNC.get(fk)) || 0, gfails = +(await env.SYNC.get(gk)) || 0;
    if (fails >= 8 || gfails >= 300) return json({ error: 'rate_limited' }, 429);
    const code = String(body.code || '').replace(/\D/g, '');
    const rec = code.length === 6 ? await kget(env, 'code:' + code) : null;
    if (!rec || rec.uses >= 8) {
      await env.SYNC.put(fk, String(fails + 1), { expirationTtl: 600 }); await env.SYNC.put(gk, String(gfails + 1), { expirationTtl: 120 });
      return json({ error: 'invalid_code' }, 404);
    }
    rec.uses++; await kput(env, 'code:' + code, rec, PAIR_TTL);
    return json({ token: await newSession(env, rec.key, rec.kind, rec.user), kind: rec.kind, user: publicUser(rec.user) });
  }
  return json({ error: 'not_found' }, 404);
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (url.pathname === '/api/ai-search') {
      if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
      try { return await aiSearch(req, env); } catch (e) { console.log('ai-search error:', String(e && e.message || e).slice(0, 120)); return json({ error: 'upstream' }, 502); }
    }
    if (url.pathname.startsWith('/api/sync/')) {
      try { return await syncApi(req, env, url); } catch (e) { const st = e && e.status || 500; if (st >= 500) console.log('sync error:', String(e && e.message || e).slice(0, 120)); return json({ error: st === 500 ? 'server' : e.message }, st); }
    }
    return env.ASSETS.fetch(req);
  }
};
