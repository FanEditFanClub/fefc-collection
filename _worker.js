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
export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (url.pathname === '/api/ai-search') {
      if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
      try { return await aiSearch(req, env); } catch (e) { console.log('ai-search error:', String(e && e.message || e).slice(0, 120)); return json({ error: 'upstream' }, 502); }
    }
    return env.ASSETS.fetch(req);
  }
};
