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

// ---- /api/stream/:id[/file.ext]  -> Drive file bytes via the Drive API (API key), Range-aware. Secret: GOOGLE_API_KEY (Drive API enabled).
const DRIVE = 'https://www.googleapis.com/drive/v3/files/';
const sidCache = new Map();                       // shortcut/file id -> { id, t }
async function resolveDriveId(id, key) {
  const c = sidCache.get(id); if (c && Date.now() - c.t < 6 * 3600e3) return c.id;
  let out = id;
  if (key) {
    const r = await fetch(DRIVE + id + '?fields=id,mimeType,shortcutDetails&supportsAllDrives=true&key=' + encodeURIComponent(key), { signal: AbortSignal.timeout(8000) });
    if (!r.ok) { const e = new Error('meta ' + r.status); e.status = r.status; e.body = await r.text().catch(() => ''); throw e; }
    const m = await r.json();
    out = m.mimeType === 'application/vnd.google-apps.shortcut' && m.shortcutDetails && m.shortcutDetails.targetId ? m.shortcutDetails.targetId : m.id;
  } else {
    // Catalog IDs are often Drive shortcuts; usercontent fails on the shortcut id ("Can't download file" HTML).
    // Resolve via the public file-view redirect without needing GOOGLE_API_KEY.
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
  if (status === 403 || status === 401) return json({ error: 'not_shared', hint: 'The file owner has not shared this file with "anyone with the link".' }, 403);
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
function rangeHeaders(req) {
  const h = new Headers();
  const rg = req.headers.get('range');
  // Always send a Range so Drive usercontent skips the virus-scan / quota HTML interstitial for large files.
  // HEAD probes use a 1-byte range so Drive does not treat the request as a full multi-GB download.
  if (rg && /^bytes=\d*-\d*(,.*)?$/.test(rg)) h.set('range', rg.split(',')[0]);
  else if (req.method === 'HEAD') h.set('range', 'bytes=0-0');
  else h.set('range', 'bytes=0-');
  const ir = req.headers.get('if-range'); if (ir && h.has('range')) h.set('if-range', ir);
  h.set('user-agent', 'FEFC-Stream-Proxy/0.8.13');
  return h;
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
  const cr = up.headers.get('content-range') || '';
  const o = streamOutHeaders(CORS, fileName, up, 'video/mp4');
  if (!req.headers.get('range') && /^bytes 0-\d+\/\d+$/.test(cr)) {
    // Keep 206 + Content-Range — VLC and ExoPlayer both accept it for open-ended plays.
  }
  return new Response(req.method === 'HEAD' ? null : up.body, { status, headers: o });
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
  let tid = id;
  if (key) {
    try { tid = await resolveDriveId(id, key); } catch (e) {
      // Fall through to usercontent with the raw id when meta fails (still useful for public files).
      console.log('stream meta fail', e.status || 0);
    }
    const h = rangeHeaders(req);
    // Prefer Drive API alt=media + acknowledgeAbuse (bypasses virus-scan HTML for large files).
    const up = await fetch(DRIVE + tid + '?alt=media&supportsAllDrives=true&acknowledgeAbuse=true&key=' + encodeURIComponent(key), { method: 'GET', headers: h });
    if (up.status === 416) return new Response(null, { status: 416, headers: { ...CORS, 'content-range': up.headers.get('content-range') || '' } });
    if (up.ok) {
      const o = streamOutHeaders(CORS, fileName, up, 'video/mp4');
      return new Response(req.method === 'HEAD' ? null : up.body, { status: up.status, headers: o });
    }
    const b = await up.text().catch(() => '');
    // API key present but Drive refused — try usercontent before surfacing the error.
    console.log('stream api fail', up.status, String(b).slice(0, 80));
    try {
      const fb = await streamViaUsercontent(tid, req, fileName, CORS);
      if (fb.status < 400) return fb;
    } catch (_) {}
    return driveErr(up.status, b);
  }
  // No GOOGLE_API_KEY: resolve shortcuts via Drive view redirect, then proxy usercontent (Range forced).
  // Set Pages secret GOOGLE_API_KEY for Drive API alt=media + acknowledgeAbuse (more reliable on huge files).
  try { tid = await resolveDriveId(id, null); } catch (_) {}
  return streamViaUsercontent(tid, req, fileName, CORS);
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
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
        const gh = 'https://github.com/FanEditFanClub/fefc-collection/releases/download/firetv-v0.8.16/FEFC-Collection.apk';
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
