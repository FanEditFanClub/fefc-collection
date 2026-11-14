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
# Single source of truth for video extensions: the union of every list that
# used to disagree (catalog VIDEO_RX, build_model _vx, webcounts VEXT).
# webcounts.py imports this; do not add an extension in only one place.
VIDEO_EXTS = ('mkv', 'mp4', 'm4v', 'avi', 'mov', 'wmv', 'mpg', 'mpeg', 'ts', 'm2ts', 'webm', 'flv', 'vob', 'iso', 'divx', 'ogm', '3gp')
VIDEO_RX = re.compile(r'\.(?:' + '|'.join(VIDEO_EXTS) + r')$', re.I)
FOLDER = 'application/vnd.google-apps.folder'
MODEL_VERSION = 8
UA = 'plugin.video.fefc/1.0 (Kodi)'
# Newest files shown on New Arrivals. The web app caps at 500 and pages 60; the first
# page has to come back in a few seconds on a Fire Stick, so the plugin only builds one page.
RECENT_CAP = 180
RECENT_PAGE = 60
# In-process model so a second folder open in the same Kodi session skips the marshal read.
_MEM = {}


def natkey(s):
    return [((0, int(t), '') if t.isdigit() else (1, 0, t)) for t in re.split(r'(\d+)', (s or '').lower().strip()) if t != ''] or [(1, 0, '')]


# 04 - To Be Catalogued. Genre lists are the main catalogued tree only.
TBC_ID = '1503Wl56hzRppaIFcQisvQksOaeYOEjnk'


def tbc_members(items, kids, tbc=TBC_ID):
    """Ids that live in To Be Catalogued or any subfolder. Shortcuts to that tree count too.

    Parent links cycle between the collection root and Fan Edit Collections, so the walk
    stops when it repeats an id. Drive is never written.
    """
    members = set()
    stack = [tbc]
    while stack:
        i = stack.pop()
        if not i or i in members:
            continue
        members.add(i)
        for k in kids.get(i, ()):
            stack.append(k)
        v = items.get(i)
        if v and v[2] and v[3] and v[3] != i:
            for k in kids.get(v[3], ()):
                stack.append(k)
    memo = {}

    def hit(i, guard=0):
        if not i or guard > 40:
            return False
        if i in memo:
            return memo[i]
        if i in members:
            memo[i] = True
            return True
        v = items.get(i)
        if not v:
            memo[i] = False
            return False
        memo[i] = False
        parent = v[1]
        target = v[3] if v[3] and v[3] != i else ''
        found = hit(parent, guard + 1) or (hit(target, guard + 1) if target else False)
        memo[i] = found
        return found

    for i in list(items):
        if hit(i):
            members.add(i)
    return members


def _fetch(base, name, etag=None, lm=None, timeout=15):
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


def _fsync_dir(path):
    """fsync the directory containing path, so a rename survives a power pull."""
    try:
        fd = os.open(os.path.dirname(os.path.abspath(path)) or '.', os.O_RDONLY)
        try:
            os.fsync(fd)
        finally:
            os.close(fd)
    except Exception:
        pass


def _atomic_write(path, data):
    """Write bytes to a unique temp file, flush + fsync, then atomically replace path.

    The temp name is unique per write (uuid4), so two processes (plugin +
    service) writing at once cannot interleave on one fixed '.tmp' name.
    """
    import uuid
    tmp = '%s.%s.tmp' % (path, uuid.uuid4().hex)
    try:
        with open(tmp, 'wb') as f:
            f.write(data)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, path)
        _fsync_dir(path)
    except Exception:
        try:
            os.remove(tmp)
        except OSError:
            pass
        raise


IMDB_GENRE = {
    'Action': 'Action', 'Adventure': 'Adventure', 'Animation': 'Animation', 'Biography': 'Biography',
    'Comedy': 'Comedy', 'Crime': 'Crime', 'Documentary': 'Documentary', 'Drama': 'Drama',
    'Family': 'Family', 'Fantasy': 'Fantasy', 'History': 'History', 'Horror': 'Horror',
    'Music': 'Musical', 'Musical': 'Musical', 'Mystery': 'Mystery', 'Romance': 'Romance',
    'Sci-Fi': 'Sci-Fi', 'Sport': 'Sport', 'Thriller': 'Thriller', 'War': 'War', 'Western': 'Western',
}


def imdb_app_genres(labels):
    """IMDb title.basics genres, in IMDb's order, mapped onto the FEFC genre names.

    A label FEFC does not have a folder for (Film-Noir, Talk-Show, News) is dropped.
    Nothing is added that IMDb did not list.
    """
    out = []
    for label in labels or []:
        name = IMDB_GENRE.get(str(label))
        if name and name not in out:
            out.append(name)
    return out


def _imdb_ids(raw):
    """Drive file id -> IMDb tconst, via the metadata film the file is mapped to."""
    films = ((raw.get('metadata') or {}).get('films') or {})
    qid_tt = {}
    for q, film in films.items():
        if isinstance(film, dict) and film.get('imdb'):
            qid_tt[q] = film['imdb']
    out = {}
    for src in ((raw.get('metadata') or {}).get('map') or {}, (raw.get('edits') or {}).get('map') or {}):
        for key, q in src.items():
            if q in qid_tt:
                out[key] = qid_tt[q]
    return out


def title_key(name):
    text = re.sub(r'\.[A-Za-z0-9]{2,4}$', '', name or '')
    text = re.sub(r'[^a-z0-9]+', ' ', text.lower())
    return re.sub(r'\s+', ' ', text).strip()


def dedupe_titles(items, ids):
    """One row per Drive file and per normalized title. The hosted original wins over a shortcut."""
    by_file = {}
    for i in ids:
        v = items.get(i)
        if not v:
            continue
        key = v[3] or i
        prev = by_file.get(key)
        if prev is None or (not v[3] and items[prev][3]):
            by_file[key] = i
    by_name = {}
    for i in by_file.values():
        key = title_key(items[i][0]) or i
        prev = by_name.get(key)
        if prev is None or (not items[i][3] and items[prev][3]):
            by_name[key] = i
    keep = set(by_name.values())
    return [i for i in ids if i in keep]


def build_model(raw):
    """raw: dict source-name -> parsed JSON. Returns a marshal-able dict."""
    idx = raw['index']
    root = idx.get('root')
    root_name = ''
    for it in idx.get('items') or []:
        if it.get('id') == root:
            root_name = it.get('name') or ''
            break
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
    rcnt = {}

    def count(i, seen):
        if i in rcnt:
            return rcnt[i]
        if i in seen:
            return 0
        # Path set, not a shared visited set: add on entry, remove on exit.
        # A folder reached by two paths is then counted in full on each path
        # (and cached in full), while a genuine shortcut cycle still stops
        # at the back-edge instead of recursing forever.
        seen.add(i)
        try:
            n = 0
            t = items[i][3] if i in items and items[i][2] and items[i][3] else i
            for k in kids.get(t, []):
                n += count(k, seen) if items[k][2] else 1
            rcnt[i] = n
            return n
        finally:
            seen.remove(i)
    for i, v in items.items():
        if v[2]:
            count(i, set())
    # 0.3.22: the number SHOWN next to a folder = video files directly inside it (not recursive), like the web
    # Main Collection root count. The recursive total (rcnt) is only used to hide empty folders.
    dcnt = {}
    for i, v in items.items():
        if v[2]:
            t = v[3] if v[3] else i
            dcnt[i] = sum(1 for k in kids.get(t, []) if k in items and not items[k][2] and VIDEO_RX.search(items[k][0] or ''))
    cnt = dcnt
    # Root uses the same direct-child count as every other folder. The old
    # count(root, set()) stored the recursive total in cnt[root] while every
    # other entry was a direct count. Root is not in items (see _add), so
    # count it directly from its kids.
    cnt[root] = sum(1 for k in kids.get(root, []) if k in items and not items[k][2] and VIDEO_RX.search(items[k][0] or ''))

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
    imdb_by_tt = raw.get('imdb-genres') or {}
    id_tt = _imdb_ids(raw)
    genre_videos = {}
    genre_folders = {}
    vgenres = {}
    tbc_ids = tbc_members(items, kids)
    for i, v in items.items():
        tt = id_tt.get(i) or (id_tt.get(v[3]) if v[3] else '')
        # Curated genres are the base; IMDb genres are added to them, not a
        # replacement for them. A film with IMDb genres keeps its FEFC genres.
        g = set(own.get(i, ()))
        if tt and imdb_by_tt.get(tt):
            g.update(imdb_app_genres(imdb_by_tt[tt]))
        if not g:
            g = {'Uncategorized'} if not v[2] else set()
        if 'Unsorted' in g:  # 0.3.22: no separate Unsorted, it folds into Uncategorized
            g.discard('Unsorted')
            g.add('Uncategorized')
        if g:
            vgenres[i] = sorted(g)
        # Only a file or collection folder that sits directly in the Drive root.
        # Nested episodes and To Be Catalogued stay out, even when the genre matches.
        if v[1] != root or i in tbc_ids or (v[3] and v[3] in tbc_ids):
            continue
        for x in g:
            if v[2]:
                if cnt.get(i):
                    genre_folders.setdefault(x, []).append(i)
            else:
                genre_videos.setdefault(x, []).append(i)
    for d in (genre_videos, genre_folders):
        for k in d:
            d[k] = dedupe_titles(items, d[k])
            d[k].sort(key=lambda i: natkey(items[i][0]))

    # artwork / metadata (keep only what the add-on shows)
    posters = {k: v.get('url') for k, v in (raw.get('posters') or {}).items() if isinstance(v, dict) and v.get('url')}
    poster_titles = {k: v.get('matchedTitle') for k, v in (raw.get('posters') or {}).items()
                     if isinstance(v, dict) and v.get('matchedTitle') and v.get('url')}
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
            # First wins, like films above: metadata maps first, editinfo only
            # fills keys metadata did not set. The old code let editinfo
            # overwrite metadata here, the opposite of the films merge.
            if q in films and k not in fmap:
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
                try:
                    out[src] = (float(s['score']), float(s['scale']), int(s.get('votes') or 0))
                except (TypeError, ValueError):
                    # One bad score/scale/votes value must not abort the whole
                    # build: skip this source for this entry, keep the other.
                    continue
        ch = r.get('changes') if isinstance(r, dict) else None
        if isinstance(ch, dict) and ch.get('label'):
            out['changes'] = ch['label']
            # 0.4.2: carry the actual IFDb change lines so the details page can show them inline
            if isinstance(ch.get('lines'), list):
                out['changes_lines'] = [str(c) for c in ch['lines'][:60] if c]
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
    model = {'v': MODEL_VERSION, 'web_counts': web_counts, 'docs': docs, 'changes': changes, 'root': root, 'root_name': root_name, 'generated': idx.get('generated') or '', 'built': int(time.time()),
            'items': items, 'kids': kids, 'cnt': cnt, 'rcnt': rcnt, 'vgenres': vgenres,
            'genre_videos': genre_videos, 'genre_folders': genre_folders,
            'posters': posters, 'poster_titles': poster_titles, 'people': people, 'films': films, 'fmap': fmap, 'edits': edits,
            'ratings': ratings, 'fthumbs': raw.get('folderthumbs') or {},
            'sfx': raw.get('folder-sfx') or {}, 'added': added,
            'genreart': raw.get('genreart') or {},
            'fileinfo': raw.get('fileinfo') or {},
            'people_meta': {k: (v.get('name') or '', v.get('role') or '') for k, v in (raw.get('people') or {}).items() if isinstance(v, dict)}}
    # Persist the art index in the model instead of rebuilding it on every
    # cold load (_decorate used to do that because 'art' was never stored).
    # _build_art_index is defined later in this module, but this runs after
    # the module is fully loaded, so the call is valid here. On failure the
    # index stays empty and _decorate rebuilds it on load, as before.
    try:
        model['art'] = _build_art_index(model)
    except Exception:
        model['art'] = {}
    return model


def _mark_refresh_due(cache_dir):
    try:
        open(os.path.join(cache_dir, 'refresh.due'), 'a').close()
    except Exception:
        pass


def refresh_due(cache_dir):
    return os.path.exists(os.path.join(cache_dir, 'refresh.due'))


def clear_refresh_due(cache_dir):
    try:
        os.remove(os.path.join(cache_dir, 'refresh.due'))
    except OSError:
        pass


def _decorate(model):
    """Fill derived lists that old on-disk models do not have yet."""
    if not isinstance(model.get('recent'), list) or not model.get('recent'):
        model['recent'] = _compute_recent(model)
    if not isinstance(model.get('art'), dict) or not model.get('art'):
        model['art'] = _build_art_index(model)
    return model


def load_model(base, cache_dir, refresh_minutes=180, log=None, force=False):
    """Return the catalogue. A model already on disk is returned immediately, even if it
    is older than refresh_minutes (stale-while-revalidate). The service refreshes it in
    the background. `force=True` does the network check on this call."""
    log = log or (lambda m: None)
    os.makedirs(cache_dir, exist_ok=True)
    mpath = os.path.join(cache_dir, 'model.bin')
    meta_path = os.path.join(cache_dir, 'meta.json')
    key = (os.path.abspath(cache_dir), base or '')
    now = time.time()
    try:
        mtime = os.path.getmtime(mpath)
    except OSError:
        mtime = 0
    slot = _MEM.get(key)
    if slot and not force and slot.get('mtime') == mtime and slot.get('model'):
        if now - float(slot.get('checked') or 0) >= refresh_minutes * 60:
            _mark_refresh_due(cache_dir)
        return slot['model']
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
    if have and not force:
        have = _decorate(have)
        _MEM[key] = {'model': have, 'mtime': mtime, 'checked': meta.get('checked') or 0}
        if now - float(meta.get('checked') or 0) >= refresh_minutes * 60:
            _mark_refresh_due(cache_dir)
        return have
    changed = have is None
    files = meta.get('files', {})
    if meta.get('base') != base:
        files = {}
    errors = []
    # A cold open (nothing on disk) must not sit on fourteen slow downloads. The service
    # refresh (force=True, cache already present) may take longer because the UI is not waiting.
    deadline = time.time() + (90 if have else 20)
    for name in SOURCES:
        if time.time() > deadline and name != 'index':
            errors.append('%s: skipped (time budget)' % name)
            continue
        p = os.path.join(cache_dir, name + '.json')
        st = files.get(name, {})
        etag = st.get('etag') if os.path.exists(p) else None
        lm = st.get('lm') if os.path.exists(p) else None
        if etag or lm:
            try:
                _load_json(p)
            except Exception as e:
                # Corrupt cached file: do not trust its etag. Sending it would
                # let the server 304 and keep the corrupt file forever.
                log('corrupt cached %s, re-fetching: %s' % (name, e))
                etag = None
                lm = None
                files[name] = {}
        try:
            status, raw, etag, lm = _fetch(base, name, etag, lm,
                                           timeout=20 if have else 8)
        except Exception as e:  # network failure: keep whatever we have
            errors.append('%s: %s' % (name, e))
            continue
        if status == 304:
            continue
        _atomic_write(p, raw)
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
                except Exception as e:
                    log('cached %s unreadable, skipping: %s' % (name, e))
        if 'index' not in raw:
            if have:
                return _decorate(have)
            raise RuntimeError('catalogue unavailable: ' + '; '.join(errors)[:200])
        try:
            have = build_model(raw)
        except Exception as e:
            log('build_model failed: %s' % e)
            if have:
                return _decorate(have)
            raise
        _atomic_write(mpath, marshal.dumps(have))
    try:
        mtime = os.path.getmtime(mpath)
    except OSError:
        mtime = 0
    have = _decorate(have)
    meta = {'checked': now, 'files': files, 'base': base}
    _atomic_write(meta_path, json.dumps(meta).encode('utf-8'))
    clear_refresh_due(cache_dir)
    _MEM[key] = {'model': have, 'mtime': mtime, 'checked': now}
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


def _show_key(name):
    """Title used to borrow artwork: drop the extension, a leading episode number,
    season/episode marks, a year, and a trailing 'Fan Edit'."""
    base = re.sub(r'\.[a-z0-9]{2,4}$', '', name or '', flags=re.I)
    base = re.sub(r'^\s*\d{1,4}[A-Za-z]?\s+', '', base)
    base = re.sub(r'\bS\d{1,2}\s*E\d{1,3}\b.*$', '', base, flags=re.I)
    base = re.sub(r'\b(?:Ep|Episode)\s*\d+\b.*$', '', base, flags=re.I)
    base = re.sub(r'\s*\(\d{4}\)\s*.*$', '', base)
    base = re.sub(r'\s*-\s*Fan Edit\s*$', '', base, flags=re.I)
    return re.sub(r'\s+', ' ', base).strip().lower()


def _compute_recent(m):
    added = m.get('added') or {}
    items = m.get('items') or {}
    vids = [i for i in added if i in items and not items[i][2]]
    vids = dedupe(m, vids)
    vids.sort(key=lambda i: added.get(i) or '', reverse=True)
    return vids[:RECENT_CAP]


def recent_ids(m, limit=None):
    limit = RECENT_CAP if limit is None else int(limit)
    cached = m.get('recent')
    if not isinstance(cached, list) or not cached:
        cached = _compute_recent(m)
        m['recent'] = cached
    return cached[:limit]


def _poster_url(m, vid):
    it = m['items'].get(vid)
    posters = m.get('posters') or {}
    u = posters.get(vid) or (posters.get(it[3]) if it and it[3] else None)
    return u or ''


def _is_drive_art(url):
    """A Drive first-frame thumbnail. Those frames are often black, a title card, or the
    fan-edit WARNING slate. They are not show art. Drive itself is never written."""
    s = url or ''
    return s.startswith('drive:') or 'drive.google.com/thumbnail' in s or 'drive.google.com/uc' in s


_ART_YEAR = re.compile(r'\b(19[2-9]\d|20[0-3]\d)\b')
_ART_DASH = re.compile(r'\s+[-–—]\s+')
_ART_LEAD = re.compile(r'^\d{1,3}[A-Za-z]?[\.)]\s+')
_ART_NOISE = re.compile(r'\b(?:movie\s+)?fan\s*edit\b|\bfan\s*cut\b|\bsensical\s+cut\b|\bck\s+cut\b', re.I)
_ART_STOP = {'video', 'movie', 'edit', 'fan edit', 'sample', 'trailer', 'clip'}



def _title_keys(name):
    """(year_key, bare_key) for borrowing show art that is already in the catalogue."""
    t = re.sub(r'\.[a-z0-9]{2,4}$', '', name or '', flags=re.I)
    t = re.sub(r'^[.\s_]+', '', t)
    t = _ART_LEAD.sub('', t)
    # A leading 1-3 digit number is stripped below, so "01 Gumby - Moon Trip"
    # loses its episode index and matches on the show name alone.
    # A 4-digit year is stripped from `head`, so the year key can
    # only come from the original `t`, not from `head`.
    t = re.sub(r'^\d{1,3}\s+', '', t)
    year = ''
    ym = _ART_YEAR.search(t)
    if ym:
        year = ym.group(1)
    head = _ART_DASH.split(t, 1)[0]
    head = re.sub(r'\s*\([^)]*\)', '', head)
    head = _ART_YEAR.sub('', head)
    head = _ART_NOISE.sub('', head)
    bare = _norm_title(head)
    if len(bare) < 4 or bare in _ART_STOP:
        return '', ''
    return (bare + '|' + year if year else ''), bare


def _own_poster(m, vid):
    u = _poster_url(m, vid)
    if u and not _is_drive_art(u):
        return u
    return ''


def _parent_folder_art(m, vid):
    """Curated folder art (an assets image or a non-Drive URL), walking up to the collection.
    A Drive id stored as a folder thumb is another first frame, so it is not used."""
    items = m.get('items') or {}
    thumbs = m.get('fthumbs') or {}
    seen = set()
    p = (items.get(vid) or [None, ''])[1]
    while p and p not in seen and len(seen) < 12:
        seen.add(p)
        it = items.get(p)
        for key in (p, (it[3] if it and it[3] else '')):
            if not key:
                continue
            t = thumbs.get(key)
            if isinstance(t, str) and not _is_drive_art(t) and (t.startswith('assets/') or t.startswith('http')):
                return t
        p = it[1] if it else ''
    return ''


def _pick_url(urls):
    if not urls:
        return ''
    counts = {}
    for u in urls:
        counts[u] = counts.get(u, 0) + 1
    return max(counts, key=lambda u: (counts[u], -len(u)))


def _legacy_art_index(m):
    """Previous rule: own poster, same-folder sibling, else the Drive first frame.
    Kept so a release can report how many WARNING thumbs this pass removed."""
    items = m.get('items') or {}
    by_parent = {}
    for i, v in items.items():
        if v[2]:
            continue
        by_parent.setdefault(v[1] or '', []).append(i)
    sibling = {}
    for group in by_parent.values():
        have = {}
        for i in group:
            u = _poster_url(m, i)
            if not u or _is_drive_art(u):
                continue
            key = _show_key(items[i][0])
            if key and key not in have:
                have[key] = u
        for i in group:
            if _poster_url(m, i) and not _is_drive_art(_poster_url(m, i)):
                continue
            key = _show_key(items[i][0])
            if key and key in have:
                sibling[i] = have[key]
    art = {}
    for i, v in items.items():
        if v[2]:
            continue
        u = _own_poster(m, i) or sibling.get(i) or ''
        if u:
            art[i] = u
        else:
            art[i] = 'drive:' + (v[3] or i)
    return art


# Titles the catalogue still has no poster for. config.js leaves TMDB_API_KEY blank,
# so these are the public poster images the repo's poster tools already resolve
# (Wikipedia -> Wikidata -> the TMDB page image). They are not an API key.
_EXTRA_SHOW = (
    ('home alone 2', '', 'https://media.themoviedb.org/t/p/w500/uuitWHpJwxD1wruFl2nZHIb4UGN.jpg'),
    ('gumby', '', 'https://media.themoviedb.org/t/p/w500/ycC23EiA1VZ3DWx0v2GwCNycps1.jpg'),
    ('godzilla', '1954', 'https://media.themoviedb.org/t/p/w500/2W0Yw0qrgVMgdsSCZRKtfvaAh0i.jpg'),
    ('godzilla', '2000', 'https://media.themoviedb.org/t/p/w500/7BrjFxV0j5VzZRfVYeYbFXMUweB.jpg'),
    # Public page images for shows that the newest files name, resolved the same
    # way tools/poster_fix.py does (Wikipedia, then the public poster page). No API key.
    ('millennium', '', 'https://media.themoviedb.org/t/p/w500/vGEPm7vDTGbYNkDodLnsJyl6QIc.jpg'),
    ('beverly hills 90210', '', 'https://media.themoviedb.org/t/p/w500/b7BYfkhu653D894krwGO1ysIKTf.jpg'),
    ('bh90210', '', 'https://media.themoviedb.org/t/p/w500/z6Sj4dqUc5AVe66HddTN5wj7zYw.jpg'),
    ('godzilla final wars', '', 'https://media.themoviedb.org/t/p/w500/21lWA4YyYppVnwAPOiBkGrt2FGr.jpg'),
    ('godzilla against mechagodzilla', '', 'https://media.themoviedb.org/t/p/w500/Kg6J3qyf80cwnKkv1YorSjkNaK.jpg'),
    ('godzilla 2000', '', 'https://media.themoviedb.org/t/p/w500/7BrjFxV0j5VzZRfVYeYbFXMUweB.jpg'),
    ('ghidorah the three headed monster', '', 'https://media.themoviedb.org/t/p/w500/qkI5nhvxx3233gQmoQvv0W3MB7A.jpg'),
    ('hollywood hot tubs', '', 'https://media.themoviedb.org/t/p/w500/ozJ4uhGtHPqByzS2o3CjKIWPFhh.jpg'),
    ('exorcist 3', '', 'https://media.themoviedb.org/t/p/w500/275gw2JA5YCk10o6n84rZdZBycM.jpg'),
    ('exorcist iii', '', 'https://media.themoviedb.org/t/p/w500/275gw2JA5YCk10o6n84rZdZBycM.jpg'),
)


def _art_from_folders(items, parent, year_art, bare_art):
    """A show poster already in the catalogue, matched on a parent folder name.

    Episode files often do not repeat the series title. The folder does.
    Only a specific folder name is used, and only when that name has one poster.
    """
    seen = set()
    p = parent
    while p and p not in seen and len(seen) < 8:
        seen.add(p)
        it = items.get(p)
        if not it:
            break
        yk, bare = _title_keys(it[0])
        u = (year_art.get(yk) if yk else '') or ''
        if not u and bare and len(bare) >= 8 and len(bare.split()) >= 2:
            u = bare_art.get(bare) or ''
        if not u:
            u = _extra_show(yk, bare)
        if u and not _is_drive_art(u):
            return u
        p = it[1]
    return ''


def _extra_show(year_key, bare):
    padded = ' ' + (bare or '') + ' '
    hit = ''
    best = -1
    for key, year, url in _EXTRA_SHOW:
        if year:
            ok = year_key == key + '|' + year or (
                year_key.endswith('|' + year) and (bare == key or bare.startswith(key + ' ')))
        else:
            ok = bare == key or bare.startswith(key + ' ') or (' ' + key + ' ') in padded
        # Longer keys win, so "godzilla final wars" beats "godzilla".
        if ok and len(key) > best:
            hit, best = url, len(key)
    return hit


def _build_art_index(m):
    """id -> artwork url. Own poster, a same-year sibling, show art already in the
    catalogue for that title, curated parent-folder art, then a few known show
    posters. A Drive first frame is missing. Nothing here writes to Drive."""
    items = m.get('items') or {}
    by_parent = {}
    own = {}
    for i, v in items.items():
        if v[2]:
            continue
        u = _own_poster(m, i)
        if u:
            own[i] = u
        by_parent.setdefault(v[1] or '', []).append(i)
    sibling = {}
    for group in by_parent.values():
        have_year = {}
        have_bare = {}
        for i in group:
            u = own.get(i)
            if not u:
                continue
            yk, bare = _title_keys(items[i][0])
            if yk and yk not in have_year:
                have_year[yk] = u
            if bare and not yk and bare not in have_bare:
                have_bare[bare] = u
        for i in group:
            if i in own:
                continue
            yk, bare = _title_keys(items[i][0])
            if yk and yk in have_year:
                sibling[i] = have_year[yk]
            elif bare and not yk and bare in have_bare:
                sibling[i] = have_bare[bare]
    by_year = {}
    by_bare = {}

    def add_keys(name, url):
        yk, bare = _title_keys(name)
        if yk:
            by_year.setdefault(yk, []).append(url)
        if bare:
            by_bare.setdefault(bare, []).append(url)

    for i, u in own.items():
        add_keys(items[i][0], u)
    posters = m.get('posters') or {}
    for i, title in (m.get('poster_titles') or {}).items():
        u = posters.get(i)
        if u and not _is_drive_art(u):
            add_keys(title, u)
    year_art = {k: _pick_url(v) for k, v in by_year.items()}
    bare_art = {}
    for k, urls in by_bare.items():
        uniq = set(urls)
        if len(uniq) == 1:
            bare_art[k] = next(iter(uniq))
    art = {}
    why = {}
    for i, v in items.items():
        if v[2]:
            continue
        if i in own:
            art[i] = own[i]
            why[i] = 'own'
            continue
        if i in sibling:
            art[i] = sibling[i]
            why[i] = 'sibling'
            continue
        yk, bare = _title_keys(v[0])
        u = (year_art.get(yk) if yk else '') or ''
        src = 'show'
        if not u and bare:
            u = bare_art.get(bare) or ''
        if not u:
            u = _art_from_folders(items, v[1], year_art, bare_art)
        if not u:
            u = _extra_show(yk, bare)
        if not u:
            u = _parent_folder_art(m, i)
            src = 'folder'
        if u and not _is_drive_art(u):
            art[i] = u
            why[i] = src
        else:
            why[i] = 'missing'
    m['art_why'] = why
    return art


def art_report(m):
    """Before/after counts for Drive first-frame posters. before uses the old rule."""
    items = m.get('items') or {}
    vids = [i for i, v in items.items() if not v[2]]
    old = _legacy_art_index(m)
    new = _build_art_index(m)
    m['art'] = new
    before = sum(1 for i in vids if str(old.get(i) or '').startswith('drive:'))
    missing = sum(1 for i in vids if not new.get(i))
    gained = {'sibling': 0, 'show': 0, 'folder': 0}
    why = m.get('art_why') or {}
    for i in vids:
        if str(old.get(i) or '').startswith('drive:') and new.get(i):
            gained[why.get(i) or 'show'] = gained.get(why.get(i) or 'show', 0) + 1
    return {'videos': len(vids), 'drive_before': before, 'missing_after': missing,
            'replaced': sum(gained.values()), 'by': gained}


def poster_for(m, base, vid):
    """Poster for a video. Own art, a sibling, show art already in the catalogue, then
    parent folder art. A Drive first frame is treated as missing (no Drive request)."""
    art = m.get('art')
    if not isinstance(art, dict):
        art = _build_art_index(m)
        m['art'] = art
    u = art.get(vid) or ''
    if not u or _is_drive_art(u):
        return ''
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
                        # 0.4.2: use the video file's own Drive thumbnail (a landscape frame from the video)
                        # instead of its portrait poster, so folder cards stay landscape. (Only 369/1803
                        # folders have a curated fthumb; the rest hit this fallback.)
                        vk = (m['items'].get(k) or [0, 0, 0, ''])[3] or k
                        return 'https://drive.google.com/thumbnail?sz=w320&id=' + vk
            q = nq[:40]
    if t:
        return abs_url(base, t) if t.startswith('assets/') else 'https://drive.google.com/thumbnail?sz=w320&id=' + t
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
    elif r.get('changes_lines'):
        # 0.4.2: IFDb change lines, shown inline. No "(see FanEdit.org)" pointer — the changes are right here.
        plot.append('[COLOR FFFF7AA2]CHANGES[/COLOR]\n' + '\n'.join('- ' + c for c in r['changes_lines']))
    # 0.4.0: FILE INFO (web parity) from data/fileinfo.json - read-only Drive metadata (size, owner, length, resolution)
    fi = (m.get('fileinfo') or {}).get(tgt or vid) or (m.get('fileinfo') or {}).get(vid) or {}
    nm = (m['items'].get(tgt) or it or [''])[0] if (tgt or it) else ''
    xm = re.search(r'\.([a-z0-9]{2,4})$', nm or '', re.I)
    fl = []
    if fi.get('d'):
        d = int(fi['d'])
        fl.append('Length: ' + ('%dh %dm' % (d // 3600, round(d % 3600 / 60)) if d >= 3600 else '%dm' % max(1, round(d / 60))))
    if fi.get('s'):
        sz = float(fi['s'])
        fl.append('Size: ' + ('%.1f GB' % (sz / 1e9) if sz >= 1e9 else '%d MB' % round(sz / 1e6)))
    if fi.get('r'):
        fl.append('Resolution: ' + fi['r'])
    if xm:
        fl.append('Format: ' + xm.group(1).upper())
    if fi.get('o'):
        fl.append('Host: ' + fi['o'].split('@')[0])
    par_name = (m['items'].get(par) or [''])[0] if par else ''
    if not par_name and par and par == m.get('root'):
        par_name = m.get('root_name') or ''
    if par_name:
        fl.append('Folder: ' + par_name)
    if fl:
        plot.append('[COLOR FF99FFCC]FILE INFO[/COLOR]\n' + '   |   '.join(fl))
    elif not plot:
        plot.append('No editorial notes for this file.' + ((' Folder: ' + par_name) if par_name else ''))
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
    rating_text = ''
    rating_src = ''
    if ratings:
        shown = {'FEFC-IFDb': ('ifdb', 'FanEdit.org'), 'MRDb': ('mrdb', 'MRDb'), 'imdb': ('imdb', 'IMDb')}
        lab, sc, _votes = ratings[0]
        rating_src, rating_name = shown.get(lab, ('imdb', lab))
        rating_text = '%s %s/10' % (rating_name, sc)
    return {'plot': '\n\n'.join(plot), 'year': year, 'director': f.get('director') or [], 'cast': f.get('cast') or [],
            'runtime': (round(int(fi['d']) / 60) if fi.get('d') else f.get('runtime') or 0), 'ratings': ratings, 'trailer': f.get('trailer'),
            'editor': e.get('editor') or '', 'title': e.get('title') or '', 'film': f.get('title') or '',
            'rating_text': rating_text, 'rating_src': rating_src}


def display_title(name):
    # exactly like the web app's caption (parse(n).raw): the full file name, only the extension removed
    t = re.sub(r'\.[a-z0-9]{2,4}$', '', name or '', flags=re.I)
    return t.strip() or name


def _bag(files):
    """0.3.22 shuffle-bag (web parity): shuffled order, never the same clip twice in a row, persisted per rotation."""
    import random, json, os
    if len(files) == 1:
        return files[0]
    try:
        import xbmcvfs
        d = xbmcvfs.translatePath('special://profile/addon_data/plugin.video.fefc/')
    except Exception:
        d = '/tmp/'
    fn = os.path.join(d, 'sfxbag.json')
    key = '|'.join(str(f[0] if isinstance(f, list) else f) for f in files)
    try:
        st = json.load(open(fn))
    except Exception:
        st = {}
    b = st.get(key) or {'o': [], 'l': -1}
    if not b.get('o') or any(i >= len(files) for i in b['o']):
        o = list(range(len(files)))
        random.shuffle(o)
        if o[0] == b.get('l'):
            o[0], o[1] = o[1], o[0]
        b['o'] = o
    i = b['o'].pop(0)
    b['l'] = i
    st[key] = b
    try:
        os.makedirs(d, exist_ok=True)
        json.dump(st, open(fn, 'w'))
    except Exception:
        pass
    return files[i]


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
        files = _bag(files)
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


def _norm_title(name):
    text = display_title(name).lower()
    text = re.sub(r'[^a-z0-9]+', ' ', text)
    return re.sub(r'\s+', ' ', text).strip()


def dedupe(m, ids):
    """One row per underlying file in an aggregated list.

    A shortcut and its original share the target id. The original file (no
    target id) is the FEFC-hosted copy and is the one shown. A shortcut is
    kept only when that original is not in the list. Separate uploads of the
    same title still collapse when the normalized title and the size or the
    duration match. A single folder's own children are not passed through here,
    so a shortcut stays visible in the folder it was filed in.
    """
    items = m.get('items') or {}
    fileinfo = m.get('fileinfo') or {}

    def target_of(i):
        v = items.get(i)
        if not v:
            return i
        return v[3] or i

    def hosted(i):
        v = items.get(i)
        return bool(v) and not v[3]

    def rank(i):
        return (0 if hosted(i) else 1, _depth(m, i))

    def signature(i):
        v = items.get(i)
        if not v or v[2]:
            return None
        key = target_of(i)
        fi = fileinfo.get(key) or fileinfo.get(i) or {}
        size = int(fi.get('s') or 0)
        dur = int(fi.get('d') or 0)
        if not size and not dur:
            return None
        return (_norm_title(v[0]), size, dur)

    best = {}
    for i in ids:
        if i not in items:
            continue
        key = target_of(i)
        sc = rank(i)
        if key not in best or sc < best[key][0]:
            best[key] = (sc, i)
    keep = set(pair[1] for pair in best.values())
    chosen = []
    seen = set()
    for i in ids:
        if i in keep and i not in seen:
            seen.add(i)
            chosen.append(i)
    best_sig = {}
    for i in chosen:
        sig = signature(i)
        if sig is None:
            continue
        sc = rank(i)
        if sig not in best_sig or sc < best_sig[sig][0]:
            best_sig[sig] = (sc, i)
    drop = set()
    winners = set(pair[1] for pair in best_sig.values())
    for i in chosen:
        if signature(i) is not None and i not in winners:
            drop.add(i)
    return [i for i in chosen if i not in drop]


def clip_list(value):
    """Every clip in a sound entry, one path each. An m4a/mp3 pair is one clip."""
    if isinstance(value, dict):
        files = value.get('file') or value.get('files') or []
    elif isinstance(value, str):
        files = [value]
    else:
        files = list(value or [])
    if files and isinstance(files[0], list):
        groups = files
    else:
        groups = [[p] for p in files]
    out = []
    seen = set()
    for group in groups:
        paths = [p for p in group if isinstance(p, str) and os.path.basename(p)]
        if not paths:
            continue
        chosen = next((p for p in paths if p.lower().endswith('.mp3')), paths[0])
        base = os.path.splitext(os.path.basename(chosen))[0].lower()
        if base in seen:
            continue
        seen.add(base)
        out.append(chosen)
    return out


def sfx_wav(rel):
    """Wav path for one clip. A list is a full set: one clip is chosen now, not when the pack was built."""
    import random
    paths = [rel] if isinstance(rel, str) else clip_list(rel)
    paths = [p for p in paths if isinstance(p, str) and os.path.basename(p)]
    if not paths:
        return ''
    f = random.choice(paths) if len(paths) > 1 else paths[0]
    return 'kodi-sfx/' + os.path.splitext(os.path.basename(f))[0] + '.wav'


def play_choice(rel, sound_off=False):
    """The clip to play for this open. Sound Off returns nothing for every set."""
    if sound_off or not rel:
        return ''
    return sfx_wav(rel)


def sfx_up(m, vid):
    """Full clip set for this item: its own set, or the nearest ancestor folder's set.
    The set is cached. The clip is chosen later, once per open."""
    cache = m.get('_sfxup')
    if isinstance(cache, dict) and vid in cache:
        return cache[vid]
    r = sfx_for(m, vid)
    m.setdefault('_sfxup', {})[vid] = r or []
    return r or []


def _sfx_direct(m, fid):
    """Set pinned to this item, or the first rule that names it. Ancestors are not consulted."""
    sfx = m['sfx']
    it = m['items'].get(fid)
    name = it[0] if it else ''

    def pick(v):
        return clip_list(v) or ''

    for key in (fid, name):
        if key and key in sfx and not str(key).startswith('_'):
            r = pick(sfx[key])
            if r:
                return r
    for rule, rx in _compiled_rules(sfx):
        try:
            hit = False
            if rule.get('ids') and fid in rule['ids']:
                hit = True
            if name and rule.get('match') and rule['match'].lower() in name.lower():
                hit = True
            if name and rx is not None and rx.search(name):
                hit = True
            if hit:
                r = pick(rule)
                if r:
                    return r
        except Exception:
            continue
    return ''


def sfx_for(m, fid):
    """Full clip set for an item or its nearest sounding ancestor. A list, or '' when silent."""
    seen = set()
    cur = fid
    for _ in range(30):
        if not cur or cur in seen:
            break
        seen.add(cur)
        r = _sfx_direct(m, cur)
        if r:
            return r
        cur = (m['items'].get(cur) or ['', ''])[1]
    return ''


_RULE_CACHE = {}
_RULE_CACHE_MAX = 4


def _compiled_rules(sfx):
    """Compile folder-sfx regexes once per catalogue. Compiling them per video made large folders stall.

    Identity is a token stored on the sfx dict itself, not id(sfx): a new
    dict can reuse a freed id, which used to serve the old catalogue's rules.
    The compiled patterns are kept out of the model dict (a compiled regex is
    not marshalable) and only in this bounded cache, keyed by that token.
    """
    if not isinstance(sfx, dict):
        return []
    token = sfx.get('_compiled_rules_token')
    if not isinstance(token, str) or not token:
        import uuid
        token = uuid.uuid4().hex
        try:
            sfx['_compiled_rules_token'] = token
        except Exception:
            pass
    hit = _RULE_CACHE.get(token)
    if hit is not None:
        return hit
    out = []
    for rule in sfx.get('_rules') or []:
        rx = None
        if isinstance(rule, dict):
            regex = rule.get('regex')
            if isinstance(regex, str) and regex:
                try:
                    rx = re.compile(regex, re.I)
                except (re.error, TypeError):
                    rx = None
            out.append((rule, rx))
    _RULE_CACHE[token] = out
    while len(_RULE_CACHE) > _RULE_CACHE_MAX:
        _RULE_CACHE.pop(next(iter(_RULE_CACHE)))
    return out


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
