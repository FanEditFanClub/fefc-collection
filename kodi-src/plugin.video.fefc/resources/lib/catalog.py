"""FEFC catalogue loader. Pure Python (no Kodi imports) so it can be tested headless.

Reads the SAME live data files the FEFC web app and Fire TV app use (data/*.json on the site),
revalidates them with ETag / If-Modified-Since, and keeps one compact marshal cache on disk so each
Kodi route starts fast. Nothing here writes to Drive; it is read-only HTTP."""
import gzip
import json
import marshal
import os
import re
import time
import urllib.request
import urllib.error

SOURCES = ['drive-changes', 'index', 'video-genres', 'genres', 'posters', 'editinfo', 'metadata', 'fanedit-ratings',
           'folderthumbs', 'folder-sfx', 'added', 'people', 'genreart', 'fileinfo']
VIDEO_RX = re.compile(r'\.(mp4|m4v|mkv|mov|avi|webm|ts|m2ts|wmv|mpg|mpeg)$', re.I)
FOLDER = 'application/vnd.google-apps.folder'
MODEL_VERSION = 6
UA = 'plugin.video.fefc/1.0 (Kodi)'


def natkey(s):
    return [((0, int(t), '') if t.isdigit() else (1, 0, t)) for t in re.split(r'(\d+)', (s or '').lower().strip()) if t != ''] or [(1, 0, '')]


def _fetch(base, name, etag=None, lm=None, timeout=60):
    """Conditional GET -> (status, bytes|None, etag, last_modified). 304 -> (304, None, ...)."""
    req = urllib.request.Request(base.rstrip('/') + '/data/' + name + '.json?ts=1', headers={
        'User-Agent': UA, 'Accept-Encoding': 'gzip'})
    if etag:
        req.add_header('If-None-Match', etag)
    if lm:
        req.add_header('If-Modified-Since', lm)
    try:
        r = urllib.request.urlopen(req, timeout=timeout)
    except urllib.error.HTTPError as e:
        if e.code == 304:
            return 304, None, etag, lm
        raise
    raw = r.read()
    if r.headers.get('Content-Encoding', '').lower() == 'gzip':
        raw = gzip.decompress(raw)
    return r.status, raw, r.headers.get('ETag') or '', r.headers.get('Last-Modified') or ''


def _load_json(path):
    with open(path, 'rb') as f:
        return json.loads(f.read().decode('utf-8'))


def build_model(raw):
    """raw: dict source-name -> parsed JSON. Returns a marshal-able dict."""
    idx = raw['index']
    root = idx.get('root')
    items = {}
    kids = {}
    docs = {}
    allit = {it['id']: it for it in idx.get('items', []) if it.get('id')}
    SUPRE = re.compile(r'support\s+(us|patreon)|patreon|paypal|venmo|donat(e|ion)', re.I)
    RFRE = re.compile(r'\bread (first|me)\b|^\s*\d{0,2}[A-Z]?\s*-\s*read first\b', re.I)

    def _isdir(it):
        # like the web app's isFolder(): real folders and Drive shortcuts that point at a folder
        if it.get('mimeType') == FOLDER or it.get('targetMime') == FOLDER:
            return True
        t = it.get('targetId')
        return bool(t and t != it['id'] and (allit.get(t) or {}).get('mimeType') == FOLDER)

    def _add(it, parent):
        iid = it['id']
        isdir = _isdir(it)
        name = it.get('name') or ''
        tname = (allit.get(it.get('targetId') or '') or {}).get('name') or ''
        isvid = (not isdir) and (it.get('kind') == 'video' or bool(VIDEO_RX.search(name)))
        if not isdir and not isvid:
            # Support Us / Read First docs are shown inside folders like the web app
            if not name.startswith('.') and (SUPRE.search(name) or SUPRE.search(tname)):
                docs.setdefault(parent, []).append([iid, name, 'support'])
            elif not name.startswith('.') and RFRE.search(name):
                docs.setdefault(parent, []).append([iid, name, 'readfirst'])
            elif (not name.startswith('.') and parent == '1fEaxNbFIrEwKRygETVm4jgtJGVAqKxGB'
                  and (it.get('mimeType') or it.get('targetMime') or '') == 'application/vnd.google-apps.document'):
                # 0.3.22: Google Docs inside Fan Edit Collections are listed (opened read-only as text)
                docs.setdefault(parent, []).append([it.get('targetId') or iid, name, 'gdoc'])
            return
        if iid == root:
            return
        if iid not in items:
            items[iid] = [name, it.get('parent') or '', 1 if isdir else 0, it.get('targetId') or '']
        a = kids.setdefault(parent, [])
        if iid not in a:
            a.append(iid)
    for it in idx.get('items', []):
        _add(it, it.get('parent') or '')
    # Drive shortcuts placed in other folders (index 'links': parent -> [item ids]), like the web app's applyLinks()
    for par, ids in (idx.get('links') or {}).items():
        for i in ids or []:
            if i in allit:
                _add(allit[i], par)
    for p in kids:
        kids[p].sort(key=lambda i: (0 if items[i][2] else 1, natkey(items[i][0])))
    try:
        from . import webcounts as _wc
    except ImportError:
        import webcounts as _wc
    try:
        web_counts = _wc.web_counts(idx, {'Main': None, 'Collections': _wc.FOLD['collections'], 'TBC': _wc.FOLD['tbc']})
    except Exception:
        web_counts = {}
    # recursive video counts
    cnt = {}

    def count(i, seen):
        if i in cnt:
            return cnt[i]
        if i in seen:
            return 0
        seen.add(i)
        n = 0
        t = items[i][3] if i in items and items[i][2] and items[i][3] else i
        for k in kids.get(t, []):
            n += count(k, seen) if items[k][2] else 1
        cnt[i] = n
        return n
    for i, v in items.items():
        if v[2]:
            count(i, set())
    # 0.3.22: the number SHOWN next to a folder = video files directly inside it (not recursive), like the web
    # Main Collection root count. The recursive total (rcnt) is only used to hide empty folders.
    rcnt = cnt
    _vx = re.compile(r'\.(mp4|mkv|mov|avi|m4v|webm|ts|wmv|mpg|mpeg)$', re.I)
    dcnt = {}
    for i, v in items.items():
        if v[2]:
            t = v[3] if v[3] else i
            dcnt[i] = sum(1 for k in kids.get(t, []) if k in items and not items[k][2] and _vx.search(items[k][0] or ''))
    cnt = dcnt
    count(root, set())

    # genres: video-genres sets + genres.json (collection folders), unioned along the ancestor chain
    vg = raw.get('video-genres') or {}
    sets = vg.get('sets') or []
    vids = vg.get('ids') or {}
    gmap = raw.get('genres') or {}
    own = {}
    for i in items:
        g = set()
        si = vids.get(i)
        if si is None and items[i][3]:
            si = vids.get(items[i][3])
        if si is not None and si < len(sets):
            g.update(sets[si])
        for key in (i, items[i][3]):
            e = gmap.get(key) if key else None
            if e:
                g.update(e.get('genres') or [])
        if g:
            own[i] = g
    genre_videos = {}
    genre_folders = {}
    vgenres = {}
    for i, v in items.items():
        g = set(own.get(i, ()))
        p = v[1]
        depth = 0
        while p and depth < 30:
            g.update(own.get(p, ()))
            p = items.get(p, [None, ''])[1]
            depth += 1
        if not g:
            g = {'Uncategorized'} if not v[2] else set()
        if 'Unsorted' in g:  # 0.3.22: no separate Unsorted, it folds into Uncategorized
            g.discard('Unsorted')
            g.add('Uncategorized')
        if g:
            vgenres[i] = sorted(g)
            for x in g:
                if v[2]:
                    if i in own and x in own[i] and cnt.get(i):
                        genre_folders.setdefault(x, []).append(i)
                else:
                    genre_videos.setdefault(x, []).append(i)
    for d in (genre_videos, genre_folders):
        for k in d:
            d[k].sort(key=lambda i: natkey(items[i][0]))

    # artwork / metadata (keep only what the add-on shows)
    posters = {k: v.get('url') for k, v in (raw.get('posters') or {}).items() if isinstance(v, dict) and v.get('url')}
    people = {k: v.get('url') for k, v in (raw.get('people') or {}).items() if isinstance(v, dict) and v.get('url')}
    ed = raw.get('editinfo') or {}
    md = raw.get('metadata') or {}

    def slim_film(f):
        return {'title': f.get('title'), 'year': f.get('year'), 'plot': f.get('plot'), 'director': (f.get('director') or [])[:4],
                'cast': (f.get('cast') or [])[:10], 'runtime': f.get('runtime'), 'imdb': f.get('imdb'),
                'imdbRating': f.get('imdbRating'), 'imdbVotes': f.get('imdbVotes'), 'trailer': f.get('trailer'),
                'genres': (f.get('genres') or [])[:6]}
    films = {}
    for src in (md.get('films') or {}, ed.get('films') or {}):
        for q, f in src.items():
            if isinstance(f, dict):
                cur = films.get(q) or {}
                new = slim_film(f)
                for k, v in new.items():
                    if v not in (None, '', [], {}) and (cur.get(k) in (None, '', [], {})):
                        cur[k] = v
                films[q] = cur
    fmap = {}
    for src in (md.get('map') or {}, ed.get('map') or {}):
        for k, q in src.items():
            if q in films:
                fmap[k] = q
    edits = {}
    for k, e in (ed.get('edits') or {}).items():
        if isinstance(e, dict):
            edits[k] = {x: e.get(x) for x in ('title', 'editor', 'description', 'type', 'origYear', 'runtime', 'year', 'synopsis', 'details', 'url', 'released', 'src') if e.get(x)}
            ds = e.get('descriptionSource')
            if isinstance(ds, dict) and ds.get('name'):
                edits[k]['source'] = ds['name']
    ratings = {}
    for k, r in ((raw.get('fanedit-ratings') or {}).get('items') or {}).items():
        out = {}
        for src in ('ifdb', 'mrdb'):
            s = r.get(src) if isinstance(r, dict) else None
            if isinstance(s, dict) and s.get('score') is not None and s.get('scale'):
                out[src] = (float(s['score']), float(s['scale']), int(s.get('votes') or 0))
        ch = r.get('changes') if isinstance(r, dict) else None
        if isinstance(ch, dict) and ch.get('label'):
            out['changes'] = ch['label']
        for src in ('ifdb', 'mrdb'):
            s2 = r.get(src) if isinstance(r, dict) else None
            if isinstance(s2, dict) and s2.get('url'):
                out[src + '_url'] = s2['url']
        if out:
            ratings[k] = out
    # fan edit change lists (Drive changelog / README, precomputed read-only by tools/drive_changes.py), like the web app
    changes = {}
    for k, v in ((raw.get('drive-changes') or {}).get('by_id') or {}).items():
        lines = [c.get('text') for c in (v or {}).get('changes') or [] if isinstance(c, dict) and c.get('text')]
        if lines:
            changes[k] = lines[:60]
    added = {k: v for k, v in (raw.get('added') or {}).items() if isinstance(v, str)}
    return {'v': MODEL_VERSION, 'web_counts': web_counts, 'docs': docs, 'changes': changes, 'root': root, 'generated': idx.get('generated') or '', 'built': int(time.time()),
            'items': items, 'kids': kids, 'cnt': cnt, 'rcnt': rcnt, 'vgenres': vgenres,
            'genre_videos': genre_videos, 'genre_folders': genre_folders,
            'posters': posters, 'people': people, 'films': films, 'fmap': fmap, 'edits': edits,
            'ratings': ratings, 'fthumbs': raw.get('folderthumbs') or {},
            'sfx': raw.get('folder-sfx') or {}, 'added': added,
            'genreart': raw.get('genreart') or {},
            'fileinfo': raw.get('fileinfo') or {},
            'people_meta': {k: (v.get('name') or '', v.get('role') or '') for k, v in (raw.get('people') or {}).items() if isinstance(v, dict)}}


def load_model(base, cache_dir, refresh_minutes=180, log=None):
    log = log or (lambda m: None)
    os.makedirs(cache_dir, exist_ok=True)
    mpath = os.path.join(cache_dir, 'model.bin')
    meta_path = os.path.join(cache_dir, 'meta.json')
    meta = {}
    try:
        meta = _load_json(meta_path)
    except Exception:
        meta = {}
    have = None
    try:
        with open(mpath, 'rb') as f:
            have = marshal.load(f)
        if have.get('v') != MODEL_VERSION or meta.get('base') != base:
            have = None
    except Exception:
        have = None
    now = time.time()
    if have and now - meta.get('checked', 0) < refresh_minutes * 60:
        return have
    changed = have is None
    files = meta.get('files', {})
    if meta.get('base') != base:
        files = {}
    errors = []
    for name in SOURCES:
        p = os.path.join(cache_dir, name + '.json')
        st = files.get(name, {})
        try:
            status, raw, etag, lm = _fetch(base, name, st.get('etag') if os.path.exists(p) else None,
                                           st.get('lm') if os.path.exists(p) else None)
        except Exception as e:  # network failure: keep whatever we have
            errors.append('%s: %s' % (name, e))
            continue
        if status == 304:
            continue
        with open(p, 'wb') as f:
            f.write(raw)
        files[name] = {'etag': etag, 'lm': lm}
        changed = True
        log('updated %s' % name)
    if errors:
        log('fetch problems: ' + '; '.join(errors)[:300])
    if changed or have is None:
        raw = {}
        for name in SOURCES:
            p = os.path.join(cache_dir, name + '.json')
            if os.path.exists(p):
                try:
                    raw[name] = _load_json(p)
                except Exception:
                    pass
        if 'index' not in raw:
            if have:
                return have
            raise RuntimeError('catalogue unavailable: ' + '; '.join(errors)[:200])
        have = build_model(raw)
        tmp = mpath + '.tmp'
        with open(tmp, 'wb') as f:
            marshal.dump(have, f)
        os.replace(tmp, mpath)
    meta = {'checked': now, 'files': files, 'base': base}
    with open(meta_path, 'w') as f:
        json.dump(meta, f)
    return have


# ---- helpers used by the router -------------------------------------------------------------------
def abs_url(base, u):
    if not u:
        return ''
    if u.startswith(('http://', 'https://')):
        return u
    return base.rstrip('/') + '/' + u.lstrip('/')


def stream_url(base, vid, name):
    from urllib.parse import quote
    nm = re.sub(r'[^\w.\- ()\[\]]+', '_', (name or 'video.mp4').strip())
    if not VIDEO_RX.search(nm):
        nm += '.mp4'
    return base.rstrip('/') + '/api/stream/' + vid + '/' + quote(nm)


def poster_for(m, base, vid):
    it = m['items'].get(vid)
    u = m['posters'].get(vid) or (m['posters'].get(it[3]) if it and it[3] else None)
    return abs_url(base, u)


def folder_art(m, base, fid):
    it = m['items'].get(fid)
    tgt = (it[3] if it and it[3] else fid)
    u = m['people'].get(tgt) or m['people'].get(fid)
    if u:
        return abs_url(base, u)
    t = m['fthumbs'].get(tgt) or m['fthumbs'].get(fid)
    if not t:  # first video below (3 levels), like the web app
        q = [fid]
        for _ in range(3):
            nq = []
            for i in q:
                for k in m['kids'].get((m['items'].get(i) or [0, 0, 0, ''])[3] or i, []):
                    if m['items'][k][2]:
                        nq.append(k)
                    else:
                        u2 = poster_for(m, base, k)
                        if u2:
                            return u2
            q = nq[:40]
    if t:
        return abs_url(base, t) if t.startswith('assets/') else 'https://drive.google.com/thumbnail?sz=w500&id=' + t
    return ''


def video_info(m, vid):
    """Merge everything known about a video: title/plot/year/cast/ratings."""
    it = m['items'].get(vid)
    tgt = it[3] if it else ''
    e = m['edits'].get(vid) or (m['edits'].get(tgt) if tgt else None) or {}
    q = m['fmap'].get(vid) or (m['fmap'].get(tgt) if tgt else None)
    f = m['films'].get(q) if q else {}
    f = f or {}
    r = m['ratings'].get(vid) or (m['ratings'].get(tgt) if tgt else None) or {}
    plot = []
    # same sections as the web app's details page: FAN EDIT (synopsis, details, editor, ratings), CHANGES, SOURCE FILM
    syn = e.get('synopsis') or e.get('description')
    if syn:
        plot.append('[COLOR FFFF9C00]FAN EDIT[/COLOR]\n' + syn)
    if e.get('details'):
        plot.append('[COLOR FFCC99FF]ABOUT THIS EDIT[/COLOR]\n' + e['details'])
    facts = []
    if e.get('editor'):
        facts.append('Editor: %s' % e['editor'])
    if e.get('type'):
        facts.append('Type: %s' % e['type'])
    if e.get('runtime'):
        facts.append('Runtime: %s' % e['runtime'])
    if e.get('released'):
        facts.append('Released: %s' % e['released'])
    for src, label in (('ifdb', 'FanEdit.org IFDB'), ('mrdb', 'Movies Remastered')):
        if r.get(src):
            s0, sc, v = r[src]
            facts.append('%s: %.1f/10%s' % (label, s0 / sc * 10, (' (%d votes)' % v) if v else ''))
    if facts:
        plot.append('[COLOR FF99CCFF]' + '   |   '.join(facts) + '[/COLOR]')
    par = it[1] if it else ''
    ch = (m.get('changes') or {}).get(vid) or ((m.get('changes') or {}).get(tgt) if tgt else None) or (m.get('changes') or {}).get('folder:' + par)
    if ch:
        plot.append('[COLOR FFFF7AA2]CHANGES[/COLOR]\n' + '\n'.join('- ' + c for c in ch))
    elif r.get('changes'):
        plot.append('[COLOR FFFF7AA2]CHANGES[/COLOR]\n' + r['changes'] + ' (see FanEdit.org)')
    if f.get('plot'):
        plot.append('[COLOR FFFFCC66]SOURCE FILM%s[/COLOR]\n' % (': ' + f['title'] if f.get('title') else '') + f['plot'])
    links = [u for u in (e.get('url'), r.get('ifdb_url'), r.get('mrdb_url')) if u]
    if links:
        plot.append('[COLOR FF888888]' + '\n'.join(dict.fromkeys(links)) + '[/COLOR]')
    ratings = []
    for src, label in (('ifdb', 'FEFC-IFDb'), ('mrdb', 'MRDb')):
        if r.get(src):
            s, sc, v = r[src]
            ratings.append((label, round(s / sc * 10, 1), v))
    if f.get('imdbRating'):
        try:
            ratings.append(('imdb', float(f['imdbRating']), int(f.get('imdbVotes') or 0)))
        except ValueError:
            pass
    year = e.get('origYear') or f.get('year') or e.get('year')
    try:
        year = int(str(year)[:4]) if year else 0
    except ValueError:
        year = 0
    return {'plot': '\n\n'.join(plot), 'year': year, 'director': f.get('director') or [], 'cast': f.get('cast') or [],
            'runtime': f.get('runtime') or 0, 'ratings': ratings, 'trailer': f.get('trailer'),
            'editor': e.get('editor') or '', 'title': e.get('title') or '', 'film': f.get('title') or ''}


def display_title(name):
    # exactly like the web app's caption (parse(n).raw): the full file name, only the extension removed
    t = re.sub(r'\.[a-z0-9]{2,4}$', '', name or '', flags=re.I)
    return t.strip() or name


def _pick(v):
    import random
    if isinstance(v, dict):
        files = v.get('file') or v.get('files')
        rnd = v.get('random')
    else:
        files, rnd = v, False
    if not files:
        return ''
    if files and isinstance(files[0], list):
        files = random.choice(files) if rnd or len(files) > 1 else files[0]
    return files


def sfx_genre(m, genre):
    """Genre sound clip (data/folder-sfx.json -> _genres), like the web app. -> list of relative paths or ''."""
    g = (m['sfx'].get('_genres') or {})
    v = g.get(genre)
    if v is None:
        for k, x in g.items():
            if k.lower() == (genre or '').lower():
                v = x
                break
    return _pick(v) if v else ''


def _depth(m, i):
    c = m.setdefault('_depth', {})
    if i in c:
        return c[i]
    d = 0
    p = m['items'][i][1]
    while p and d < 40:
        d += 1
        p = m['items'].get(p, [None, ''])[1]
    c[i] = d
    return d


def dedupe(m, ids):
    """One entry per underlying file. A Drive shortcut (named as shown in the FEFC collection) wins over its original
    file (which carries the uploader's own file name); among shortcuts the one nearest the top of the tree wins."""
    best = {}
    for i in ids:
        v = m['items'].get(i)
        if not v:
            continue
        key = v[3] or i
        sc = (0 if v[3] else 1, _depth(m, i))
        if key not in best or sc < best[key][0]:
            best[key] = (sc, i)
    keep = set(b[1] for b in best.values())
    seen = set()
    out = []
    for i in ids:
        if i in keep and i not in seen:
            seen.add(i)
            out.append(i)
    return out


def sfx_wav(rel):
    import random
    files = rel if isinstance(rel, list) else [rel]
    if files and isinstance(files[0], list):
        files = random.choice(files)
    files = [x for x in files if isinstance(x, str) and os.path.basename(x)]
    if not files:
        return ''
    f = files[0]
    return 'kodi-sfx/' + os.path.splitext(os.path.basename(f))[0] + '.wav'


def sfx_up(m, vid):
    """Clip set of the nearest ancestor folder with clips (e.g. any Terminator file -> the Terminator folder's clips)."""
    it = m['items'].get(vid)
    p = it[1] if it else ''
    n = 0
    while p and n < 30:
        r = sfx_for(m, p)
        if r:
            return r
        p = (m['items'].get(p) or ['', ''])[1]
        n += 1
    return ''


def sfx_for(m, fid):
    """Resolve a folder's sound clip per data/folder-sfx.json (id / exact name / rules). -> relative asset path or ''."""
    import random
    sfx = m['sfx']
    it = m['items'].get(fid)
    name = it[0] if it else ''

    def pick(v):
        if isinstance(v, dict):
            files = v.get('file') or v.get('files')
            rnd = v.get('random')
        else:
            files, rnd = v, False
        if not files:
            return ''
        if files and isinstance(files[0], list):
            files = random.choice(files) if rnd or len(files) > 1 else files[0]
        return files
    for key in (fid, name):
        if key and key in sfx and not key.startswith('_'):
            r = pick(sfx[key])
            if r:
                return r
    anc = []
    p = it[1] if it else ''
    while p and len(anc) < 30:
        anc.append(m['items'].get(p, ['', ''])[0])
        p = m['items'].get(p, ['', ''])[1]
    for rule in sfx.get('_rules') or []:
        try:
            hit = False
            names = [name] + (anc if rule.get('path') else [])
            if rule.get('ids') and fid in rule['ids']:
                hit = True
            if rule.get('match'):
                hit = hit or any(rule['match'].lower() in n.lower() for n in names)
            if rule.get('regex'):
                rx = re.compile(rule['regex'], re.I)
                hit = hit or any(rx.search(n) for n in names)
            if hit:
                r = pick(rule)
                if r:
                    return r
        except Exception:
            continue
    return ''


def search(m, query, limit=300):
    toks = [t for t in re.split(r'\s+', query.lower().strip()) if t]
    if not toks:
        return []
    out = []
    for i, v in m['items'].items():
        hay = v[0].lower()
        e = m['edits'].get(i)
        if e and e.get('title'):
            hay += ' ' + e['title'].lower()
        if all(t in hay for t in toks):
            if v[2] and not (m.get('rcnt') or m['cnt']).get(i):
                continue
            out.append(i)
    out = dedupe(m, out)
    out.sort(key=lambda i: (0 if m['items'][i][2] else 1, natkey(m['items'][i][0])))
    return out[:limit]
