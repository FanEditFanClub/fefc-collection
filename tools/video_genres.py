#!/usr/bin/env python3
"""Per-item genres for everything the top-folder genre map (data/genres.json) leaves unsorted -> data/video-genres.json.
An item can have SEVERAL genres (e.g. Back to the Future Part III = Adventure + Comedy + Sci-Fi + Western).
Sources, in order (genres are unioned, never one-only):
  1. data/genre-overrides.json  'titleRules' (regex on file name + ancestor names)  and 'edits' (file-name regex)  -- pinned, always win/add
  2. data/metadata.json  (file id -> film -> Wikidata P136 genres, already crawled)
  3. Wikidata P136 lookup of the title / series / collection folder name (cached in tools/genre_wikidata_cache.json)
  4. propagation: same normalised title key / same collection folder inherits what its resolved siblings have
Output: {"v":1,"sets":[[genres..],..],"ids":{id:setIndex}}  (ids = videos and collection folders).  Client unions these with genres.json along the ancestor chain.
Usage: python3 tools/video_genres.py [--no-net] [--report]"""
import json, os, re, sys, time, urllib.request, urllib.parse, collections, concurrent.futures as cf
HERE = os.path.dirname(os.path.abspath(__file__)); D = os.path.join(HERE, '..', 'data'); CACHE = os.path.join(HERE, 'genre_wikidata_cache.json')
NET = '--no-net' not in sys.argv
UA = {'User-Agent': 'FEFC-collection-app/1.0 (faneditfanclub@gmail.com)'}
BUCK = [('Action', r'action|martial arts|spy film|spy fiction|swashbuckler|kung fu|wuxia'), ('Sci-Fi', r'science fiction|cyberpunk|space opera|dystopi|time travel|space western|alien invasion|post-apocalyptic'),
 ('Horror', r'horror|slasher|zombie|monster|creature|splatter|ghost|vampire'), ('Comedy', r'comed|sitcom|parody|satire|sketch|talk show|mockumentary|slapstick|late-night|screwball|farce'),
 ('Animation', r'anim|cartoon|anime|stop[- ]motion|cgi'), ('Drama', r'drama|romance|romantic|biograph|historical|coming-of-age|sport|melodrama|legal|teen|medical|soap'),
 ('Fantasy', r'fantasy|fairy tale|sword and sorcery|supernatural fiction|magic'), ('Superhero', r'superhero'), ('Thriller', r'thriller|mystery|neo-noir|suspense|psychological|disaster|conspiracy'),
 ('Crime', r'crime|gangster|heist|detective|police|mafia|noir|legal drama|prison'), ('Adventure', r'adventure|survival|swashbuckler|treasure|expedition|road movie|quest'),
 ('War', r'war film|war drama|war television|military|world war|anti-war'), ('Western', r'(?<!contemporary )(?<!neo-)(?<!space )western'), ('Family', r'family|children|kids|young adult'),
 ('Musical', r'music(al)? (film|television)|musical|concert|rock opera'), ('Documentary', r'documentary|docuseries|reality|news|talk show')]
def bucket(labels):
    out = set()
    for l in labels:
        for b, rx in BUCK:
            if re.search(rx, l or '', re.I): out.add(b)
    if 'Documentary' in out and re.search(r'talk show|late-night', ' '.join(labels), re.I): out.discard('Documentary')
    return out
idx = json.load(open(os.path.join(D, 'index.json'))); items = idx['items']; ROOT = idx['root']; by = {f['id']: f for f in items}
G = json.load(open(os.path.join(D, 'genres.json'))); G.pop('__collections', None)
META = json.load(open(os.path.join(D, 'metadata.json'))); OV = json.load(open(os.path.join(D, 'genre-overrides.json')))
FOLD = 'application/vnd.google-apps.folder'
def chain(f):
    out, x, g = [], f, 0
    while x and g < 40: out.append(x); x = by.get(x.get('parent')); g += 1
    return out
def real(i): return i in G and [g for g in G[i].get('genres', []) if g != 'Uncategorized']
def covered(f):  # genre already coming from genres.json along the ancestor chain
    return any(real(x['id']) for x in chain(f))
vids = [f for f in items if f.get('kind') == 'video']
seen = set(); uv = []
for f in vids:
    if f['id'] in seen: continue
    seen.add(f['id']); uv.append(f)
def strip_ext(n): return re.sub(r'\.(mkv|mp4|m4v|avi|mov|wmv|webm|mpg|ts)$', '', n, flags=re.I)
EDITORISH = re.compile(r"fan edits?\b|^\d+\s*[-.]\s|^z\s*-|\bcollection\b|^(abrams|nolan|ford|spielberg|cruise|scott|bay|tarantino|emmerich|cage|costner|willis|king|schwarzenegger|stallone|snyder|cameron|gibson|statham|carrey|sandler|ritchie|verhoeven|brooks|scorcese|scorsese)$|^(y2mate|copia|copy)|^untitled|^new folder", re.I)
def tkey(name):
    n = strip_ext(name)
    n = re.sub(r'^\s*[\d.]+\s*[-.)]\s*', '', n)
    n = re.split(r'\s+[-–|]\s+|:\s|\s\[', n)[0]
    n = re.sub(r'\((19|20)\d\d\)|\b(19|20)\d\d\b', ' ', n)
    n = re.sub(r'\b(part|pt|vol|volume|season|episode|ep|s\d+e?\d*)\b\s*\w*$', ' ', n.strip(), flags=re.I)
    return re.sub(r'\s+', ' ', re.sub(r'[^a-z0-9&\' ]+', ' ', n.lower())).strip()
TRAIL = re.compile(r'\s+(mini[- ]?series|series|saga|trilogy|collection|chronological|supercut|edition|fan edit|movie)\s*$', re.I)
def clean(n):
    n = strip_ext(n); n = re.sub(r'^\s*[\d.]+\s*[-.)]\s*', '', n)
    n = re.sub(r'\((19|20)\d\d\)|\b(19|20)\d\d\b', ' ', n)
    n = re.sub(r'\b(season|s)\s*\d+.*$|\bepisode\s*\d+.*$|\bpart\s*\d+.*$', ' ', n, flags=re.I)
    for _ in range(3): n = TRAIL.sub('', n.strip())
    return re.sub(r'\s+', ' ', re.sub(r'[^a-z0-9&\' ]+', ' ', n.lower())).strip()
def cand_keys(name):
    n = strip_ext(name); segs = [x for x in re.split(r'\s+[-–|/]\s+|:\s', n) if x.strip()]
    out = []
    for sgm in segs[:3] + [n]:
        k = clean(sgm)
        if len(k) >= 3 and k not in out and not EDITORISH.search(sgm): out.append(k)
    return out
# ---------- 1. pinned rules ----------
TR = [(re.compile(r['match'], re.I), r['genres']) for r in OV.get('titleRules', [])]
EDITS = [(re.compile(e['match'], re.I), e['genre']) for e in OV.get('edits', [])]
def pinned(f):
    path = ' / '.join(x['name'] for x in chain(f))
    gs = set()
    for rx, g in TR:
        if rx.search(strip_ext(f['name'])) or rx.search(path): gs |= set(g); 
    return gs
res = {}        # id -> set(genres)
how = {}
def put(i, gs, h):
    if gs:
        res.setdefault(i, set()).update(gs); how.setdefault(i, h)
for f in uv:
    p = pinned(f)
    if p: put(f['id'], p, 'rule')
    for rx, g in EDITS:
        if rx.search(f['name']): put(f['id'], {g}, 'edit')
# ---------- 2. metadata.json ----------
mp, films = META['map'], META['films']
def meta_genres(f):
    for k in (f['id'], f.get('targetId')):
        q = mp.get(k) if k else None
        if q and films.get(q, {}).get('genres'): return bucket(films[q]['genres'])
    return set()
for f in uv:
    if covered(f) and f['id'] not in res: continue
    m = meta_genres(f)
    if m: put(f['id'], m, 'meta')
# ---------- 3. Wikidata ----------
cache = json.load(open(CACHE)) if os.path.exists(CACHE) else {}
def j(u):
    for i in range(3):
        try: return json.load(urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=30))
        except Exception: time.sleep(1.5 * (i + 1))
    return None
def norm(s): return re.sub(r'\W', '', (s or '').lower())
def wd(q):
    if q in cache: return cache[q]
    out = None
    s = j('https://www.wikidata.org/w/api.php?' + urllib.parse.urlencode({'action': 'wbsearchentities', 'search': q, 'language': 'en', 'limit': 6, 'type': 'item', 'format': 'json'}))
    if s is None: return None   # network failure: don't cache
    for c in s.get('search', []):
        d = (c.get('description') or '').lower()
        if not re.search(r'film|series|franchise|television|movie|anim|show|video game|miniseries', d) or re.search(r'actor|actress|director|filmmaker|person|human|album|song|novel|book', d): continue
        if norm(c.get('label'))[:14] != norm(q)[:14]: continue
        e = j(f"https://www.wikidata.org/wiki/Special:EntityData/{c['id']}.json")
        if not e: continue
        e = e.get('entities', {}).get(c['id'], {})
        gids = [x['mainsnak'].get('datavalue', {}).get('value', {}).get('id') for x in e.get('claims', {}).get('P136', [])]
        gids = [g for g in gids if g]
        if not gids: continue
        L = j('https://www.wikidata.org/w/api.php?' + urllib.parse.urlencode({'action': 'wbgetentities', 'ids': '|'.join(gids[:40]), 'props': 'labels', 'languages': 'en', 'format': 'json'})) or {}
        labels = [v.get('labels', {}).get('en', {}).get('value', '') for v in L.get('entities', {}).values()]
        gs = sorted(bucket(labels))
        if gs: out = {'qid': c['id'], 'genres': gs}; break
    cache[q] = out or {'qid': None, 'genres': []}
    return cache[q]
def ancestor_series(f):
    """nearest non-editor ancestor folder name (series / collection) below the top folder, else top folder if it is a real collection"""
    ch = chain(f)[1:]
    for x in ch:
        if x.get('parent') == ROOT or x['id'] == ROOT:
            return None if EDITORISH.search(x['name']) else x
        if x['mimeType'] == FOLD and not EDITORISH.search(x['name']) and not re.match(r'^(season|series|disc|part|vol)', x['name'], re.I): return x
    return None
unres = [f for f in uv if f['id'] not in res and not covered(f)]
queries = collections.OrderedDict()
for f in unres:
    for k in cand_keys(f['name']): queries[k] = 1
    a = ancestor_series(f)
    if a:
        for k in cand_keys(a['name']): queries[k] = 1
todo = [q for q in queries if q not in cache]
print('unresolved before Wikidata:', len(unres), 'unique queries:', len(queries), 'to fetch:', len(todo), file=sys.stderr)
if NET and todo:
    done = 0
    with cf.ThreadPoolExecutor(32) as ex:
        for q, r in zip(todo, ex.map(wd, todo)):
            done += 1
            if done % 200 == 0:
                print('  fetched', done, '/', len(todo), file=sys.stderr); json.dump(dict(cache), open(CACHE, "w"))
    json.dump(dict(cache), open(CACHE, "w"))
def cached(q):
    r = cache.get(q); return set(r['genres']) if r and r.get('genres') else set()
for f in unres:
    gs = next((cached(k) for k in cand_keys(f['name']) if cached(k)), set())
    if gs: put(f['id'], gs, 'wikidata'); continue
    a = ancestor_series(f)
    if a:
        gs = next((cached(k) for k in cand_keys(a['name']) if cached(k)), set())
        if gs: put(f['id'], gs, 'series')
# ---------- 4. propagation by title key / by collection folder ----------
bykey = collections.defaultdict(set); byfold = collections.defaultdict(set)
for f in uv:
    if f['id'] in res:
        bykey[tkey(f['name'])] |= res[f['id']]
        a = ancestor_series(f)
        if a: byfold[a['id']] |= res[f['id']]
for f in uv:
    if f['id'] in res or covered(f): continue
    k = tkey(f['name']); gs = bykey.get(k)
    if gs and len(k) >= 3: put(f['id'], gs, 'sibling'); continue
    a = ancestor_series(f)
    if a and byfold.get(a['id']): put(f['id'], byfold[a['id']], 'folder')
# fallback rules for leftovers (OV['fallback'] = [{match, genres}]) -- last resort, pinned by hand
FB = [(re.compile(r['match'], re.I), r['genres']) for r in OV.get('fallbackRules', [])]
for f in uv:
    if f['id'] in res or covered(f): continue
    path = ' / '.join(x['name'] for x in chain(f))
    hit = set()
    for rx, g in FB:
        if rx.search(path): hit |= set(g)
    if hit: put(f['id'], hit, 'fallback')
# collection folders (non-editor, uncovered) get the union of their videos
fold = collections.defaultdict(set)
for f in uv:
    if f['id'] in res:
        for x in chain(f)[1:]:
            if x['mimeType'] == FOLD and x['id'] != ROOT and not EDITORISH.search(x['name']) and not covered(x): fold[x['id']] |= res[f['id']]
for fid, gs in fold.items(): res.setdefault(fid, set()).update(gs)
ORDER = ['Action', 'Sci-Fi', 'Horror', 'Comedy', 'Animation', 'Drama', 'Fantasy', 'Superhero', 'Thriller', 'Crime', 'Adventure', 'War', 'Western', 'Family', 'Musical', 'Documentary']
sets, ids, sidx = [], {}, {}
for i, gs in res.items():
    t = tuple(g for g in ORDER if g in gs)
    if not t: continue
    if t not in sidx: sidx[t] = len(sets); sets.append(list(t))
    ids[i] = sidx[t]
json.dump({'v': 1, 'sets': sets, 'ids': ids}, open(os.path.join(D, 'video-genres.json'), 'w'), separators=(',', ':'))
c = collections.Counter(how.get(i, '?') for i in ids if i in by and by[i].get('kind') == 'video')
print('items with genres: %d (videos by source: %s)' % (len(ids), dict(c)))
left = [f for f in uv if f['id'] not in ids and not covered(f)]
print('still unsorted videos:', len(left))
if '--report' in sys.argv:
    lk = collections.Counter(tkey(f['name']) or f['name'] for f in left)
    for k, n in lk.most_common(int(os.environ.get("REPORT_N","60"))): print('%4d %s' % (n, k))
