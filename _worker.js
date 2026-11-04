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

  /* Stable device → list mapping. No TTL: an APK update must still be able to mint a fresh session for the same My List. */
  if (p === 'device/register') {
    const s = await authed(req, env); if (!s) return json({ error: 'unauthorized' }, 401);
    const id = String(body.deviceId || '');
    if (!/^[\w-]{20,80}$/.test(id)) return json({ error: 'bad_request' }, 400);
    await env.SYNC.put('device:' + id, JSON.stringify({ key: s.key, kind: s.kind, user: s.user || null, at: Date.now() }));
    return json({ ok: true });
  }
  if (p === 'device/forget') {
    const s = await authed(req, env); if (!s) return json({ error: 'unauthorized' }, 401);
    const id = String(body.deviceId || '');
    if (!/^[\w-]{20,80}$/.test(id)) return json({ error: 'bad_request' }, 400);
    const rec = await kget(env, 'device:' + id);
    if (rec && rec.key === s.key) await env.SYNC.delete('device:' + id);
    return json({ ok: true });
  }
  if (p === 'restore') {
    if (limited(req, 'rs', 30)) return json({ error: 'rate_limited' }, 429);
    const id = String(body.deviceId || '');
    if (!/^[\w-]{20,80}$/.test(id)) return json({ error: 'bad_request' }, 400);
    const rec = await kget(env, 'device:' + id);
    if (!rec || !rec.key) return json({ error: 'not_found' }, 404);
    return json({ token: await newSession(env, rec.key, rec.kind || 'code', rec.user), kind: rec.kind || 'code', user: publicUser(rec.user) });
  }
  return json({ error: 'not_found' }, 404);
}


/* ---------- Community feed: GET /api/feed (Reddit RSS live; X / Discord optional tokens; snapshot + Join items as fallback) ---------- */
const COMM = {
  reddit: { name: 'Reddit', url: 'https://www.reddit.com/r/FanEditFanClub', sub: 'FanEditFanClub' },
  x: { name: 'X', url: 'https://x.com/FanEditFanClub', uid: '2072539271450312704' },
  discord: { name: 'Discord', url: 'https://discord.gg/d8A9xHTey7', guild: '1529915531736383702' },
  facebook: { name: 'Facebook', url: 'https://www.facebook.com/groups/faneditfanclub' }
};
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const unent = t => String(t || '').replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e) => e[0] === '#' ? (() => { try { return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1)); } catch (_) { return ''; } })() : (ENT[e.toLowerCase()] || m));
const clip = (t, n) => { t = String(t || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t; };
async function tfetch(u, opt, ms) {
  const ac = new AbortController(), t = setTimeout(() => ac.abort(), ms || 4500);
  try { return await fetch(u, Object.assign({ signal: ac.signal }, opt || {})); } finally { clearTimeout(t); }
}
async function feedReddit() {
  const r = await tfetch('https://www.reddit.com/r/' + COMM.reddit.sub + '/new/.rss?limit=10', { headers: { 'user-agent': 'Mozilla/5.0 (compatible; FEFCCollection/1.0; +https://collection.faneditfanclub.com)', accept: 'application/atom+xml,application/xml;q=0.9,*/*;q=0.5' }, cf: { cacheTtl: 300, cacheEverything: true } });
  if (!r.ok) throw new Error('reddit ' + r.status);
  const x = await r.text(), out = [];
  for (const e of x.match(/<entry>[\s\S]*?<\/entry>/g) || []) {
    const t = (e.match(/<title>([\s\S]*?)<\/title>/) || [])[1], l = (e.match(/<link[^>]*href="([^"]+)"/) || [])[1], d = (e.match(/<(?:updated|published)>([^<]+)</) || [])[1];
    if (t && l && d) out.push({ src: 'reddit', title: clip(unent(t), 140), url: unent(l), ts: Date.parse(d) || 0 });
  }
  if (!out.length) throw new Error('reddit empty');
  return out;
}
function xClean(text) {
  let t = unent(text).replace(/https?:\/\/t\.co\/\w+/g, '').replace(/^\s*\d+\/\d+\s+/, '').trim(), lab = '';
  const m = t.match(/^New Post in The Fan Edit Fan Club Reddit Feed\s*-\s*/i);
  if (m) { t = t.slice(m[0].length); lab = 'Reddit Feed'; }
  return { title: clip(t.replace(/\.\s*$/, ''), 140), label: lab };
}
async function feedX(env) {
  if (!env.X_BEARER_TOKEN) throw new Error('no x token');
  const r = await tfetch('https://api.x.com/2/users/' + COMM.x.uid + '/tweets?max_results=30&exclude=retweets,replies&tweet.fields=created_at,referenced_tweets', { headers: { authorization: 'Bearer ' + env.X_BEARER_TOKEN } });
  if (!r.ok) throw new Error('x ' + r.status);
  const j = await r.json(), out = [];
  for (const p of j.data || []) {
    if ((p.referenced_tweets || []).some(q => q.type === 'replied_to')) continue;
    const c = xClean(p.text); if (c.title) out.push({ src: 'x', title: c.title, label: c.label, url: 'https://x.com/FanEditFanClub/status/' + p.id, ts: Date.parse(p.created_at) || 0 });
  }
  if (!out.length) throw new Error('x empty');
  return out;
}
async function feedDiscord(env) {
  // Public widget (no token): invite + online count. Optional bot token + channel: real newest messages.
  const out = { posts: [], online: 0 };
  try {
    const r = await tfetch('https://discord.com/api/guilds/' + COMM.discord.guild + '/widget.json', {}, 3500);
    if (r.ok) { const w = await r.json(); out.online = +w.presence_count || (w.members || []).length || 0; }
  } catch (_) {}
  if (env.DISCORD_BOT_TOKEN && env.DISCORD_FEED_CHANNEL_ID) {
    const r = await tfetch('https://discord.com/api/v10/channels/' + env.DISCORD_FEED_CHANNEL_ID + '/messages?limit=10', { headers: { authorization: 'Bot ' + env.DISCORD_BOT_TOKEN } });
    if (!r.ok) throw new Error('discord ' + r.status);
    for (const m of await r.json()) {
      const t = clip(m.content || (m.embeds && m.embeds[0] && (m.embeds[0].title || m.embeds[0].description)) || '', 140);
      if (t) out.posts.push({ src: 'discord', title: t, url: 'https://discord.com/channels/' + COMM.discord.guild + '/' + env.DISCORD_FEED_CHANNEL_ID + '/' + m.id, ts: Date.parse(m.timestamp) || 0 });
    }
  }
  return out;
}
const JOIN = {
  discord: n => ({ src: 'discord', join: 1, title: 'Join our Discord' + (n ? ' · ' + n + ' online now' : ' server'), url: COMM.discord.url }),
  x: () => ({ src: 'x', join: 1, title: 'Follow @FanEditFanClub on X', url: COMM.x.url }),
  facebook: () => ({ src: 'facebook', join: 1, title: 'Join our Facebook Group', url: COMM.facebook.url }),
  reddit: () => ({ src: 'reddit', join: 1, title: 'Join r/FanEditFanClub on Reddit', url: COMM.reddit.url })
};
function mergeFeed(posts, online) {
  const seen = {}, now = Date.now(), per = {};
  posts = posts.filter(p => p.ts && p.ts <= now + 3600e3 && now - p.ts < 180 * 864e5).sort((a, b) => b.ts - a.ts).filter(p => {
    const k = p.title.toLowerCase().replace(/\W+/g, '').slice(0, 60); if (seen[k]) return false; seen[k] = 1;
    per[p.src] = (per[p.src] || 0) + 1; return per[p.src] <= 4;
  }).slice(0, 14);
  const ctas = [JOIN.discord(online), JOIN.x(), JOIN.facebook(), JOIN.reddit()], out = [];
  posts.forEach((p, i) => { out.push(p); if ((i + 1) % 3 === 0 && ctas.length) out.push(ctas.shift()); });
  return out.concat(ctas);
}
let feedMem = null;
async function buildFeed(env, url) {
  const [rd, xx, dc] = await Promise.allSettled([feedReddit(), feedX(env), feedDiscord(env)]);
  let snap = { posts: [] };
  try { const r = await env.ASSETS.fetch(new URL('/data/community-feed.json', url)); if (r.ok) snap = await r.json(); } catch (_) {}
  const sp = (src) => (snap.posts || []).filter(p => p.src === src);
  const status = {}, posts = [];
  const take = (src, res) => { if (res.status === 'fulfilled' && res.value.length) { status[src] = 'live'; posts.push(...res.value); } else { const s = sp(src); status[src] = s.length ? 'snapshot' : 'none'; posts.push(...s); } };
  take('reddit', rd); take('x', xx);
  if (dc.status === 'fulfilled') { status.discord = dc.value.posts.length ? 'live' : 'join-only'; posts.push(...dc.value.posts); } else { status.discord = 'join-only'; posts.push(...sp('discord')); }
  status.facebook = 'join-only';
  return { updated: new Date().toISOString(), status, items: mergeFeed(posts, dc.status === 'fulfilled' ? dc.value.online : 0) };
}
async function feedApi(req, env, ctx, url) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return json({ error: 'method_not_allowed' }, 405);
  const H = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=300, s-maxage=600', 'access-control-allow-origin': '*' };
  const cache = typeof caches !== 'undefined' && caches.default, key = new Request(url.origin + '/api/feed');
  if (cache) { const hit = await cache.match(key); if (hit) return hit; }
  if (feedMem && Date.now() - feedMem.t < 600e3) return new Response(feedMem.b, { headers: H });
  const b = JSON.stringify(await buildFeed(env, url));
  feedMem = { t: Date.now(), b };
  const res = new Response(b, { headers: H });
  if (cache) ctx.waitUntil(cache.put(key, res.clone()));
  return res;
}

// ---- /api/stream/:id[/file.ext]  -> Drive file bytes via Drive API alt=media, Range-aware.
// Auth preference: faneditfanclub@gmail.com OAuth (secrets GOOGLE_DRIVE_CLIENT_ID / GOOGLE_DRIVE_CLIENT_SECRET /
// GOOGLE_DRIVE_REFRESH_TOKEN, scope drive.readonly) so restricted files play without viewer sign-in.
// Fallback: GOOGLE_API_KEY (public/"anyone with the link" only), then Drive usercontent.
// Never change Drive sharing or content. Never log token values.
const DRIVE = 'https://www.googleapis.com/drive/v3/files/';
const sidCache = new Map();                       // shortcut/file id -> { id, t }
let driveTok = null;                              // { access, exp }
async function driveAccessToken(env) {
  const rt = env.GOOGLE_DRIVE_REFRESH_TOKEN, cid = env.GOOGLE_DRIVE_CLIENT_ID, sec = env.GOOGLE_DRIVE_CLIENT_SECRET;
  if (!rt || !cid || !sec) return null;
  if (driveTok && driveTok.exp > Date.now() + 60e3) return driveTok.access;
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: cid, client_secret: sec, refresh_token: rt, grant_type: 'refresh_token' }),
    signal: AbortSignal.timeout(12000)
  });
  if (!r.ok) { console.log('drive oauth refresh fail', r.status); driveTok = null; return null; }
  const j = await r.json();
  if (!j.access_token) { driveTok = null; return null; }
  driveTok = { access: j.access_token, exp: Date.now() + Math.max(60, (+j.expires_in || 3600) - 120) * 1000 };
  return driveTok.access;
}
async function resolveDriveId(id, auth) {
  // auth: { bearer } or { key } or null (public view redirect)
  const c = sidCache.get(id); if (c && Date.now() - c.t < 6 * 3600e3) return c.id;
  let out = id;
  if (auth && (auth.bearer || auth.key)) {
    const q = DRIVE + id + '?fields=id,mimeType,shortcutDetails&supportsAllDrives=true' + (auth.key ? ('&key=' + encodeURIComponent(auth.key)) : '');
    const headers = auth.bearer ? { Authorization: 'Bearer ' + auth.bearer } : {};
    const r = await fetch(q, { headers, signal: AbortSignal.timeout(8000) });
    if (!r.ok) { const e = new Error('meta ' + r.status); e.status = r.status; e.body = await r.text().catch(() => ''); throw e; }
    const m = await r.json();
    out = m.mimeType === 'application/vnd.google-apps.shortcut' && m.shortcutDetails && m.shortcutDetails.targetId ? m.shortcutDetails.targetId : m.id;
  } else {
    // Catalog IDs are often Drive shortcuts; usercontent fails on the shortcut id ("Can't download file" HTML).
    try {
      const r = await fetch('https://drive.google.com/file/d/' + encodeURIComponent(id) + '/view', { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(8000) });
      const loc = r.headers.get('location') || '';
      const m = loc.match(/\/file\/d\/([\w-]{10,80})(?:\/|$)/);
      if (m) out = m[1];
    } catch (_) { /* keep raw id */ }
  }
  if (sidCache.size > 5000) sidCache.clear(); sidCache.set(id, { id: out, t: Date.now() });
  return out;
}
function driveErr(status, body) {
  let reason = ''; try { reason = JSON.parse(body).error.errors[0].reason; } catch (_) {}
  if (status === 403 && /quota|rateLimit|download/i.test(reason + body.slice(0, 400))) return json({ error: 'quota_exceeded', hint: 'Drive download quota for this file is used up; use the Drive preview player.' }, 429);
  if (status === 403 || status === 401) return json({ error: 'not_shared', hint: 'Drive denied access. If this file is only shared with faneditfanclub@gmail.com, set Worker OAuth secrets (GOOGLE_DRIVE_*). Do not change Drive sharing.' }, 403);
  if (status === 404) return json({ error: 'not_found' }, 404);
  if (status === 429) return json({ error: 'quota_exceeded' }, 429);
  return json({ error: 'upstream', status }, 502);
}
function streamMimeFromName(name) {
  const m = String(name || '').toLowerCase().match(/\.([a-z0-9]{1,8})$/);
  const ext = m ? m[1] : '';
  const map = { mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', mkv: 'video/x-matroska', avi: 'video/x-msvideo', mpg: 'video/mpeg', mpeg: 'video/mpeg', ts: 'video/mp2t', m2ts: 'video/mp2t', vtt: 'text/vtt', srt: 'application/x-subrip', ass: 'text/plain', ssa: 'text/plain' };
  return map[ext] || '';
}
function streamOutHeaders(CORS, fileName, up, ctFallback) {
  const o = new Headers(CORS);
  for (const k of ['content-length', 'content-range', 'etag', 'last-modified']) { const v = up.headers.get(k); if (v) o.set(k, v); }
  let ct = streamMimeFromName(fileName) || up.headers.get('content-type') || '';
  // VLC rejects non-media Content-Types; coerce generic octet-stream to video.
  if (!/^(video|audio|text)\//.test(ct) && !/^application\/x-subrip/.test(ct)) ct = ctFallback || 'video/mp4';
  o.set('content-type', ct); o.set('accept-ranges', 'bytes'); o.set('cache-control', 'private, max-age=3600');
  if (fileName) o.set('content-disposition', 'inline; filename="' + fileName.replace(/"/g, '') + '"');
  return o;
}
function wantedRange(req) {
  // Header first. Also accept ?b=START-END — some edges hide Range before the Worker,
  // and a query value still arrives. Either form is forwarded to Drive as Range.
  let rg = (req.headers.get('range') || '').split(',')[0].trim();
  if (!/^bytes=\d*-\d*$/i.test(rg)) {
    let b = '';
    try { b = new URL(req.url).searchParams.get('b') || ''; } catch (_) {}
    b = String(b).trim();
    if (/^\d*-\d*$/.test(b) && b !== '-') rg = 'bytes=' + b;
    else rg = '';
  }
  return rg;
}
function rangeHeaders(req) {
  const h = new Headers();
  const rg = wantedRange(req);
  // Always send a Range so Drive usercontent skips the virus-scan / quota HTML interstitial for large files.
  // HEAD probes use a 1-byte range so Drive does not treat the request as a full multi-GB download.
  if (rg) h.set('range', rg);
  else if (req.method === 'HEAD') h.set('range', 'bytes=0-0');
  else h.set('range', 'bytes=0-');
  const ir = req.headers.get('if-range'); if (ir && h.has('range')) h.set('if-range', ir);
  h.set('user-agent', 'FEFC-Stream-Proxy/0.8.20');
  h.set('accept-encoding', 'identity');
  return h;
}
function clipStartRange(up, rg) {
  // Drive sometimes answers a closed Range: bytes=0-N with the whole object (206 + full Content-Length).
  // Hand back only the requested prefix so a player probe cannot download a multi-GB file.
  const m = /^bytes=(\d+)-(\d+)$/i.exec(rg || '');
  if (!m || !up || !up.body || !up.ok) return null;
  const start = +m[1], end = +m[2];
  if (start !== 0 || !(end >= start)) return null;
  const want = end - start + 1;
  const cl = +(up.headers.get('content-length') || 0);
  if (!(cl > want + 32)) return null;
  const total = ((up.headers.get('content-range') || '').match(/\/(\d+)\s*$/) || [])[1] || String(cl);
  const reader = up.body.getReader();
  let left = want;
  const stream = new ReadableStream({
    async pull(ctrl) {
      if (left <= 0) { ctrl.close(); try { reader.cancel(); } catch (_) {} return; }
      const { done, value } = await reader.read();
      if (done) { ctrl.close(); return; }
      if (value.byteLength <= left) { left -= value.byteLength; ctrl.enqueue(value); if (left === 0) { ctrl.close(); try { reader.cancel(); } catch (_) {} } }
      else { ctrl.enqueue(value.subarray(0, left)); left = 0; ctrl.close(); try { reader.cancel(); } catch (_) {} }
    }
  });
  return { stream, want, total, end };
}
async function streamViaUsercontent(tid, req, fileName, CORS) {
  const u = 'https://drive.usercontent.google.com/download?id=' + encodeURIComponent(tid) + '&export=download&confirm=t';
  let up, lastB = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    up = await fetch(u, { method: 'GET', headers: rangeHeaders(req), redirect: 'follow' });
    if (up.status !== 429 && up.status !== 503) break;
    lastB = await up.text().catch(() => '');
    await new Promise(r => setTimeout(r, 400 * (attempt + 1) * (attempt + 1)));
  }
  if (up.status === 416) return new Response(null, { status: 416, headers: { ...CORS, 'content-range': up.headers.get('content-range') || '' } });
  const ct0 = (up.headers.get('content-type') || '').toLowerCase();
  if (!up.ok) {
    const b = lastB || await up.text().catch(() => '');
    if (up.status === 429 || /quota|rate.?limit|download.?quota/i.test(b + ct0)) return json({ error: 'quota_exceeded', hint: 'Drive download quota for this file is used up; try again later or set Pages secret GOOGLE_API_KEY.' }, 429);
    return driveErr(up.status, b);
  }
  // HTML body = virus-scan / login / quota page — never hand that to VLC.
  if (ct0.includes('text/html') || ct0.includes('text/plain')) {
    const b = await up.text().catch(() => '');
    if (/quota exceeded|too many users|downloadQuotaExceeded/i.test(b)) return json({ error: 'quota_exceeded', hint: 'Drive download quota for this file is used up; try again later or use Open in Drive.' }, 429);
    return json({ error: 'upstream_html', hint: 'Drive returned an HTML interstitial instead of media. Set Pages secret GOOGLE_API_KEY (Drive API + acknowledgeAbuse) for reliable large-file proxying.' }, 502);
  }
  // If client omitted Range we forced bytes=0- → 206; rewrite to 200 when spanning whole file for picky clients.
  let status = up.status;
  const o = streamOutHeaders(CORS, fileName, up, 'video/mp4');
  const clip = clipStartRange(up, wantedRange(req) || (req.method === 'HEAD' ? 'bytes=0-0' : ''));
  if (clip) {
    o.set('content-length', String(clip.want));
    o.set('content-range', 'bytes 0-' + clip.end + '/' + clip.total);
    status = 206;
    return new Response(req.method === 'HEAD' ? null : clip.stream, { status, headers: o });
  }
  return new Response(req.method === 'HEAD' ? null : up.body, { status, headers: o });
}
async function streamViaDriveApi(tid, req, fileName, CORS, auth) {
  // auth: { bearer } and/or { key }. Prefer Bearer (faneditfanclub OAuth) so restricted files stream without viewer login.
  const h = rangeHeaders(req);
  let url = DRIVE + tid + '?alt=media&supportsAllDrives=true&acknowledgeAbuse=true';
  if (auth.bearer) h.set('Authorization', 'Bearer ' + auth.bearer);
  else if (auth.key) url += '&key=' + encodeURIComponent(auth.key);
  else return null;
  const up = await fetch(url, { method: 'GET', headers: h });
  if (up.status === 416) return new Response(null, { status: 416, headers: { ...CORS, 'content-range': up.headers.get('content-range') || '' } });
  if (up.ok) {
    const o = streamOutHeaders(CORS, fileName, up, 'video/mp4');
    const clip = clipStartRange(up, wantedRange(req) || '');
    if (clip) {
      o.set('content-length', String(clip.want));
      o.set('content-range', 'bytes 0-' + clip.end + '/' + clip.total);
      return new Response(req.method === 'HEAD' ? null : clip.stream, { status: 206, headers: o });
    }
    return new Response(req.method === 'HEAD' ? null : up.body, { status: up.status, headers: o });
  }
  const b = await up.text().catch(() => '');
  console.log('stream api fail', up.status, String(b).slice(0, 80));
  return { __err: true, status: up.status, body: b };
}
async function streamApi(req, env, url) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return json({ error: 'method_not_allowed' }, 405);
  const CORS = { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-range,accept-ranges,content-length,content-type,content-disposition' };
  // Accept /api/stream/{id} or /api/stream/{id}/file.ext (extension helps VLC / clients pick a demuxer).
  const rest = decodeURIComponent(url.pathname.slice('/api/stream/'.length)).replace(/^\/+|\/+$/g, '');
  const slash = rest.indexOf('/');
  const id = (slash < 0 ? rest : rest.slice(0, slash)).trim();
  const fileName = (slash < 0 ? '' : rest.slice(slash + 1).split('/').pop() || '').replace(/[^\w.\- ()\[\]]+/g, '_') || '';
  if (!/^[\w-]{10,80}$/.test(id)) return json({ error: 'bad_id' }, 400);
  const key = env.GOOGLE_API_KEY;
  const bearer = await driveAccessToken(env);
  const auth = bearer ? { bearer } : (key ? { key } : null);
  let tid = id;
  if (auth) {
    try { tid = await resolveDriveId(id, auth); } catch (e) {
      console.log('stream meta fail', e.status || 0);
    }
    const res = await streamViaDriveApi(tid, req, fileName, CORS, auth);
    if (res && !res.__err) return res;
    // Bearer failed: if we also have an API key and did not already use it, try key once.
    if (bearer && key) {
      try { tid = await resolveDriveId(id, { key }); } catch (_) {}
      const res2 = await streamViaDriveApi(tid, req, fileName, CORS, { key });
      if (res2 && !res2.__err) return res2;
    }
    try {
      const fb = await streamViaUsercontent(tid, req, fileName, CORS);
      if (fb.status < 400) return fb;
    } catch (_) {}
    if (res && res.__err) return driveErr(res.status, res.body);
    return json({ error: 'upstream' }, 502);
  }
  // No OAuth / API key: public view redirect + usercontent (Range forced).
  try { tid = await resolveDriveId(id, null); } catch (_) {}
  return streamViaUsercontent(tid, req, fileName, CORS);
}

// ---- VLC playlists: /vlc.m3u (index), /vlc/all.m3u, /vlc/genre/<Genre>.m3u, /vlc/<folderId>.m3u[/all], /vlc/<folderId>.xspf (nested subtree).
// Generated at request time from the live /data/index.json (+ /data/video-genres.json); cached ~10 min in-isolate and at the edge.
// Entries point at the existing /api/stream/<id>/<name> proxy. Read-only; no Drive changes.
const VLC_TTL = 600;
const VLC_VID = /\.(mp4|m4v|mkv|mov|avi|webm|ts|m2ts|wmv|mpg|mpeg)$/i;
let vlcModel = null;                              // { t, root, byId, kids, vids, genres, gset }
async function vlcLoad(env, url) {
  if (vlcModel && Date.now() - vlcModel.t < VLC_TTL * 1000) return vlcModel;
  const get = async p => { const r = await env.ASSETS.fetch(new Request(new URL(p, url).toString())); if (!r.ok) throw new Error(p + ' ' + r.status); return r.json(); };
  const [idx, vg] = await Promise.all([get('/data/index.json'), get('/data/video-genres.json').catch(() => ({ ids: {}, sets: [] }))]);
  const byId = new Map(), kids = new Map();
  for (const it of idx.items || []) {
    if (it.id === idx.root) continue;
    const isDir = /folder$/.test(it.mimeType || '');
    const isVid = !isDir && (it.kind === 'video' || VLC_VID.test(it.name || ''));
    if (!isDir && !isVid) continue;
    it.dir = isDir; byId.set(it.id, it);
    let a = kids.get(it.parent); if (!a) kids.set(it.parent, a = []); a.push(it);
  }
  const cnt = new Map();                          // folder id -> recursive video count
  const count = (id, seen) => {
    if (cnt.has(id)) return cnt.get(id);
    if (seen.has(id)) return 0; seen.add(id);
    let n = 0; for (const k of kids.get(id) || []) n += k.dir ? count(k.id, seen) : 1;
    cnt.set(id, n); return n;
  };
  const genres = new Map();                       // genre -> [video items]
  const unsorted = [];
  for (const it of byId.values()) {
    if (it.dir) { count(it.id, new Set()); continue; }
    const si = vg.ids && (vg.ids[it.id] != null ? vg.ids[it.id] : (it.targetId ? vg.ids[it.targetId] : null));
    const set = si != null && vg.sets ? vg.sets[si] : null;
    if (set && set.length) for (const g of set) { let a = genres.get(g); if (!a) genres.set(g, a = []); a.push(it); }
    else unsorted.push(it);
  }
  if (unsorted.length) genres.set('Unsorted', unsorted);
  if (idx.root) byId.set(idx.root, { id: idx.root, name: 'Fan Edit Fan Club (top level)', dir: true, parent: '' });
  vlcModel = { t: Date.now(), root: idx.root, generated: idx.generated, byId, kids, cnt, genres };
  return vlcModel;
}
function vlcTitle(it) {
  return String(it.name || '').replace(/\.(mp4|m4v|mkv|mov|avi|webm|ts|m2ts|wmv|mpg|mpeg)$/i, '').replace(/\s+-\s+(Movie\s+)?Fan\s*Edit\s*$/i, '').replace(/[\r\n,]+/g, ' ').trim() || it.id;
}
function vlcStreamUrl(origin, it) {
  const nm = String(it.name || 'video.mp4').trim().replace(/[^\w.\- ()\[\]]+/g, '_');
  return origin + '/api/stream/' + it.id + '/' + encodeURIComponent(nm);
}
const sortByName = (a, b) => String(a.name).localeCompare(String(b.name), 'en', { numeric: true, sensitivity: 'base' });
function m3uEntry(origin, it, grp) {
  return '#EXTINF:-1' + (grp ? ' group-title="' + grp.replace(/"/g, "'") + '"' : '') + ',' + vlcTitle(it) + '\n' + (grp ? '#EXTGRP:' + grp + '\n' : '') + vlcStreamUrl(origin, it) + '\n';
}
function m3uFolderEntry(origin, id, title, n) {
  return '#EXTINF:-1,' + title.replace(/[\r\n,]+/g, ' ') + (n != null ? ' (' + n + ')' : '') + '\n' + origin + '/vlc/' + id + '.m3u\n';
}
const xe = s => String(s).replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]));
function vlcXspf(origin, m, f) {
  const tracks = [], tid = new Map();
  const track = it => { let t = tid.get(it.id); if (t == null) { t = tracks.length; tid.set(it.id, t); tracks.push(it); } return t; };
  const folderNode = (id, title, depth, seen) => {
    const ks = (m.kids.get(id) || []).slice().sort(sortByName); let o = '';
    for (const k of ks) if (k.dir && m.cnt.get(k.id) && depth < 8 && !seen.has(k.id)) { seen.add(k.id); o += folderNode(k.id, k.name, depth + 1, seen); seen.delete(k.id); }
    for (const k of ks) if (!k.dir) o += '<vlc:item tid="' + track(k) + '"/>';
    return '<vlc:node title="' + xe(title) + '">' + o + '</vlc:node>';
  };
  const tree = folderNode(f.id, f.name, 0, new Set([f.id]));
  const tl = tracks.map((it, i) => '<track><location>' + xe(vlcStreamUrl(origin, it)) + '</location><title>' + xe(vlcTitle(it)) + '</title><extension application="http://www.videolan.org/vlc/playlist/0"><vlc:id>' + i + '</vlc:id></extension></track>').join('');
  return '<?xml version="1.0" encoding="UTF-8"?>\n<playlist xmlns="http://xspf.org/ns/0/" xmlns:vlc="http://www.videolan.org/vlc/playlist/ns/0/" version="1"><title>' + xe(f.name) + '</title><trackList>' + tl + '</trackList><extension application="http://www.videolan.org/vlc/playlist/0">' + tree + '</extension></playlist>';
}
async function vlcApi(req, env, ctx, url) {
  const origin = url.origin, p = decodeURIComponent(url.pathname);
  const text = (body, type) => new Response(req.method === 'HEAD' ? null : body, { headers: { 'content-type': type, 'cache-control': 'public, max-age=' + VLC_TTL, 'access-control-allow-origin': '*', 'content-disposition': 'inline' } });
  const M3U = 'audio/x-mpegurl; charset=utf-8';
  if (req.method !== 'GET' && req.method !== 'HEAD') return json({ error: 'method_not_allowed' }, 405);
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  const key = new Request(origin + url.pathname + '?v=4', { method: 'GET' });
  if (cache) { const hit = await cache.match(key); if (hit) return req.method === 'HEAD' ? new Response(null, hit) : hit; }
  const m = await vlcLoad(env, url);
  let body, type = M3U, hdr = '#EXTM3U\n#PLAYLIST:';
  let mm;
  if (p === '/vlc.m3u' || p === '/vlc/index.m3u') {
    body = hdr + 'Fan Edit Fan Club Collection\n#EXTINF:-1,All Fan Edits (' + [...m.byId.values()].filter(i => !i.dir).length + ')\n' + origin + '/vlc/all.m3u\n';
    for (const g of [...m.genres.keys()].sort()) body += '#EXTINF:-1,Genre: ' + g + ' (' + m.genres.get(g).length + ')\n' + origin + '/vlc/genre/' + encodeURIComponent(g) + '.m3u\n';
    for (const k of (m.kids.get(m.root) || []).slice().sort(sortByName)) if (k.dir && m.cnt.get(k.id)) body += m3uFolderEntry(origin, k.id, k.name, m.cnt.get(k.id));
    body += m3uFolderEntry(origin, m.root, 'Loose top-level edits', (m.kids.get(m.root) || []).filter(k => !k.dir).length);
  } else if (p === '/vlc/all.m3u') {
    body = hdr + 'All Fan Edits\n';
    for (const it of [...m.byId.values()].filter(i => !i.dir).sort(sortByName)) body += m3uEntry(origin, it, null);
  } else if ((mm = p.match(/^\/vlc\/genre\/(.+)\.m3u$/))) {
    const g = mm[1], a = m.genres.get(g); if (!a) return json({ error: 'not_found' }, 404);
    body = hdr + g + '\n' + a.slice().sort(sortByName).map(it => m3uEntry(origin, it, g)).join('');
  } else if ((mm = p.match(/^\/vlc\/([\w-]{10,80})(\/all)?\.m3u$/))) {
    const f = m.byId.get(mm[1]); if (!f || !f.dir) return json({ error: 'not_found' }, 404);
    body = hdr + f.name + '\n';
    if (mm[2]) {                                   // flat: every video below this folder, grouped by subfolder path
      const walk = (id, path, seen) => { for (const k of (m.kids.get(id) || []).slice().sort(sortByName)) { if (k.dir) { if (!seen.has(k.id)) { seen.add(k.id); walk(k.id, path ? path + ' / ' + k.name : k.name, seen); } } else body += m3uEntry(origin, k, path || f.name); } };
      walk(f.id, '', new Set([f.id]));
    } else {
      const ks = (m.kids.get(f.id) || []).slice().sort(sortByName);
      for (const k of ks) if (k.dir && m.cnt.get(k.id)) body += m3uFolderEntry(origin, k.id, k.name, m.cnt.get(k.id));
      for (const k of ks) if (!k.dir) body += m3uEntry(origin, k, f.name);
    }
  } else if ((mm = p.match(/^\/vlc\/([\w-]{10,80})\.xspf$/))) {
    const f = m.byId.get(mm[1]); if (!f || !f.dir || f.id === m.root) return json({ error: 'not_found' }, 404);
    body = vlcXspf(origin, m, f); type = 'application/xspf+xml; charset=utf-8';
  } else return json({ error: 'not_found' }, 404);
  const res = text(body, type);
  if (cache) ctx.waitUntil(cache.put(key, res.clone()));
  return res;
}

// ---- Kodi "HTTP directory" source: /kodi/ (Apache-style autoindex). Tree mirrors the Drive folder structure from the live index.
// Also /kodi/Genres/<Genre>/ , /kodi/All/<Letter>/ . File links are /kodi/<path>/<name.ext>, served through streamApi (Range-aware, 206).
const kodiNameCache = new WeakMap();              // model -> Map(folderKey -> {list:[{name,it,dir}], byName:Map})
const kodiClean = s => String(s || '').replace(/[\/\\\r\n\t]+/g, '-').replace(/\s+/g, ' ').trim() || '_';
const kodiFileName = it => { const n = kodiClean(it.name); return VLC_VID.test(n) ? n : n + '.mp4'; };
function kodiEntries(m, key, items) {            // unique, sorted names for one listing
  let c = kodiNameCache.get(m); if (!c) kodiNameCache.set(m, c = new Map());
  let e = c.get(key); if (e) return e;
  const used = new Set(), list = [], byName = new Map();
  for (const it of items.slice().sort(sortByName)) {
    let nm = it.dir ? kodiClean(it.name) : kodiFileName(it), n = nm, i = 2;
    while (used.has(n.toLowerCase())) { n = it.dir ? nm + ' (' + i + ')' : nm.replace(/(\.[A-Za-z0-9]{2,5})$/, ' (' + i + ')$1'); i++; }
    used.add(n.toLowerCase()); const o = { name: n, it, dir: !!it.dir }; list.push(o); byName.set(n, o);
  }
  e = { list, byName }; c.set(key, e); return e;
}
const kodiLetter = it => { const c = kodiClean(it.name).charAt(0).toUpperCase(); return /[A-Z]/.test(c) ? c : '0-9'; };
function kodiKids(m, cur) {                       // cur: {id, items}
  if (cur.items) return kodiEntries(m, 'f:' + cur.id, cur.items);
  if (cur.id === m.root) {
    const all = m.kids.get(m.root) || [], loose = all.filter(k => !k.dir);
    return kodiEntries(m, 'root', all.filter(k => k.dir && m.cnt.get(k.id)).concat(loose.length ? [{ id: '_loose', name: 'Loose Edits', dir: true, _items: loose }] : []));
  }
  return kodiEntries(m, 'f:' + cur.id, (m.kids.get(cur.id) || []).filter(k => !k.dir || m.cnt.get(k.id)));
}
function kodiChildren(m, segs) {                 // -> {kind:'dir', entries} | {kind:'file', it} | null
  if (!segs.length) return { kind: 'dir', entries: ['Genres', 'All'].map(n => ({ name: n, dir: true })).concat(kodiKids(m, { id: m.root }).list) };
  const head = segs[0];
  if (head === 'Genres') {
    if (segs.length === 1) return { kind: 'dir', entries: kodiEntries(m, 'genres', [...m.genres.keys()].map(g => ({ id: 'g:' + g, name: g, dir: true }))).list };
    const g = segs[1]; const a = m.genres.get(g); if (!a) return null;
    const e = kodiEntries(m, 'g:' + g, a);
    if (segs.length === 2) return { kind: 'dir', entries: e.list };
    if (segs.length === 3) { const f = e.byName.get(segs[2]); return f && !f.dir ? { kind: 'file', it: f.it } : null; }
    return null;
  }
  if (head === 'All') {
    const all = [...m.byId.values()].filter(i => !i.dir);
    if (segs.length === 1) { const ls = [...new Set(all.map(kodiLetter))].sort(); return { kind: 'dir', entries: ls.map(n => ({ name: n, dir: true })) }; }
    const L = segs[1]; const items = all.filter(i => kodiLetter(i) === L); if (!items.length) return null;
    const e = kodiEntries(m, 'a:' + L, items);
    if (segs.length === 2) return { kind: 'dir', entries: e.list };
    if (segs.length === 3) { const f = e.byName.get(segs[2]); return f && !f.dir ? { kind: 'file', it: f.it } : null; }
    return null;
  }
  // Drive tree
  let cur = { id: m.root, items: null };
  for (let i = 0; i < segs.length; i++) {
    const f = kodiKids(m, cur).byName.get(segs[i]); if (!f) return null;
    if (!f.dir) return i === segs.length - 1 ? { kind: 'file', it: f.it } : null;
    cur = f.it._items ? { id: f.it.id, items: f.it._items } : { id: f.it.id, items: null };
  }
  return { kind: 'dir', entries: kodiKids(m, cur).list };
}
function kodiHtml(path, entries) {
  const T = '/kodi/' + path.map(s => s).join('/') + (path.length ? '/' : '');
  let o = '<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 3.2 Final//EN">\n<html>\n <head>\n  <title>Index of ' + xe(T) + '</title>\n </head>\n <body>\n<h1>Index of ' + xe(T) + '</h1>\n<pre>';
  for (const e of entries) o += '<a href="' + encodeURIComponent(e.name).replace(/'/g, '%27') + (e.dir ? '/' : '') + '">' + xe(e.name) + (e.dir ? '/' : '') + '</a>' + (e.dir ? '  -\n' : '  -\n');
  return o + '</pre>\n</body></html>\n';
}
async function kodiApi(req, env, ctx, url) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return json({ error: 'method_not_allowed' }, 405);
  let segs;
  try { segs = url.pathname.slice('/kodi/'.length).split('/').map(decodeURIComponent).filter((s, i, a) => s !== '' || false); } catch (_) { return json({ error: 'bad_path' }, 400); }
  const dirReq = url.pathname.endsWith('/');
  const m = await vlcLoad(env, url);
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  const key = new Request(url.origin + url.pathname + '?k=1', { method: 'GET' });
  if (dirReq && cache) { const hit = await cache.match(key); if (hit) return req.method === 'HEAD' ? new Response(null, hit) : hit; }
  const r = kodiChildren(m, segs);
  if (!r) return new Response('Not Found', { status: 404, headers: { 'content-type': 'text/plain' } });
  if (r.kind === 'file') {
    const su = new URL(url.origin + '/api/stream/' + r.it.id + '/' + encodeURIComponent(kodiFileName(r.it).replace(/[^\w.\- ()\[\]]+/g, '_')));
    su.search = url.search;
    return streamApi(req, env, su);
  }
  if (!dirReq) return Response.redirect(url.origin + url.pathname + '/', 301);
  const res = new Response(req.method === 'HEAD' ? null : kodiHtml(segs, r.entries), { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=' + VLC_TTL } });
  if (cache) ctx.waitUntil(cache.put(key, new Response(kodiHtml(segs, r.entries), { headers: res.headers })));
  return res;
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (url.pathname === '/kodi') return Response.redirect(url.origin + '/kodi/', 301);
    if (url.pathname.startsWith('/kodi/')) {
      try { return await kodiApi(req, env, ctx, url); } catch (e) { console.log('kodi error:', String(e && e.message || e).slice(0, 120)); return json({ error: 'upstream' }, 502); }
    }
    if (url.pathname === '/vlc.m3u' || url.pathname.startsWith('/vlc/')) {
      try { return await vlcApi(req, env, ctx, url); } catch (e) { console.log('vlc error:', String(e && e.message || e).slice(0, 120)); return json({ error: 'upstream' }, 502); }
    }
    if (url.pathname === '/api/feed') {
      try { return await feedApi(req, env, ctx, url); } catch (e) { console.log('feed error:', String(e && e.message || e).slice(0, 120)); return json({ updated: new Date().toISOString(), status: {}, items: mergeFeed([], 0) }); }
    }
    if (url.pathname.startsWith('/api/stream/')) {
      try { return await streamApi(req, env, url); } catch (e) { console.log('stream error:', String(e && e.message || e).slice(0, 120)); return json({ error: 'upstream' }, 502); }
    }
    if (url.pathname === '/api/ai-search') {
      if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
      try { return await aiSearch(req, env); } catch (e) { console.log('ai-search error:', String(e && e.message || e).slice(0, 120)); return json({ error: 'upstream' }, 502); }
    }
    if (url.pathname.startsWith('/api/sync/')) {
      try { return await syncApi(req, env, url); } catch (e) { const st = e && e.status || 500; if (st >= 500) console.log('sync error:', String(e && e.message || e).slice(0, 120)); return json({ error: st === 500 ? 'server' : e.message }, st); }
    }
    // Fire TV APK: tolerate typed aliases; body may live in R2 (MEDIA) or GitHub Releases when >25MiB Pages limit.
    {
      const lp = url.pathname.toLowerCase().replace(/\/+$/, '');
      const wantApk = (/^\/(firetv\/fefc[-_ ]?collection(\.apk)?|firetv\/app(\.apk)?|firetv|tv\.apk|tv|fefc\.apk|fefc|apk|app\.apk)$/.test(lp) && !/^\/firetv$/.test(lp)) || lp === '/firetv/fefc-collection.apk' || url.pathname === '/firetv/FEFC-Collection.apk';
      if (wantApk) {
        const apkPath = '/firetv/FEFC-Collection.apk';
        const headers = { 'content-type': 'application/vnd.android.package-archive', 'cache-control': 'public, max-age=60, must-revalidate', 'content-disposition': 'attachment; filename="FEFC-Collection.apk"', 'cdn-cache-control': 'max-age=60' };
        // Prefer R2 binding when configured (wrangler.toml [[r2_buckets]] MEDIA).
        if (env.MEDIA) {
          const obj = await env.MEDIA.get('firetv/FEFC-Collection.apk');
          if (obj) {
            const h = new Headers(headers);
            if (obj.httpEtag) h.set('etag', obj.httpEtag);
            if (obj.size != null) h.set('content-length', String(obj.size));
            return new Response(obj.body, { status: 200, headers: h });
          }
        }
        // Pages static asset (legacy thin APKs under 25MiB).
        const asset = await env.ASSETS.fetch(new Request(new URL(apkPath, url), req));
        if (asset.ok) {
          const h = new Headers(asset.headers);
          h.set('content-type', headers['content-type']);
          h.set('cache-control', headers['cache-control']);
          return new Response(asset.body, { status: asset.status, headers: h });
        }
        // Fallback: proxy GitHub Release asset (same host URL for in-app updater allowlist).
        const gh = 'https://github.com/FanEditFanClub/fefc-collection/releases/download/firetv-v0.8.17/FEFC-Collection.apk';
        const up = await fetch(gh, { redirect: 'follow', headers: { 'user-agent': 'FEFC-Pages-APK-Proxy' } });
        if (!up.ok) return new Response('APK unavailable', { status: 502, headers: { 'content-type': 'text/plain', 'cache-control': 'no-store' } });
        const h = new Headers(headers);
        const cl = up.headers.get('content-length'); if (cl) h.set('content-length', cl);
        return new Response(up.body, { status: 200, headers: h });
      } else if (lp.endsWith('.apk')) {
        return new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain', 'cache-control': 'no-store' } });
      }
    }
    const res = await env.ASSETS.fetch(req);
    const path = url.pathname;
    // Pages advanced-mode (_worker) can ignore _headers; pin no-cache on install-critical assets so Pixel/Chrome PWA can update.
    if (path === '/sw.js' || path === '/manifest.json' || path === '/' || path === '/index.html' || /\.(?:js|css)$/.test(path)) {
      const h = new Headers(res.headers);
      h.set('cache-control', 'no-cache, must-revalidate');
      // Cloudflare edge can keep an older max-age for sw.js; force edge bypass.
      h.set('cdn-cache-control', 'no-store');
      h.set('cloudflare-cdn-cache-control', 'no-store');
      if (path === '/sw.js') h.set('service-worker-allowed', '/');
      if (path === '/manifest.json') h.set('content-type', 'application/manifest+json');
      return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
    }
    return res;
  }
};
