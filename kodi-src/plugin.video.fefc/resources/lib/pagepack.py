"""Random-access listing pages shipped with the add-on.

Every Kodi directory is a new process. Unmarshalling the full catalogue (about
14 MB, plus the art index) on each one is most of the wait, and a folder then
built a list item for every file in it. This file is one packed blob plus an
offset index: a folder, a genre, New Arrivals, or a search reads only its slice.
"""
import json
import os
import struct

MAGIC = b'FEFCPK01'
LIST_PAGE = 60
_CACHE = {}


def shipped_path():
    here = os.path.dirname(os.path.abspath(__file__))
    return os.path.normpath(os.path.join(here, '..', 'shipped', 'pages.pack'))


def available(path=None):
    return os.path.isfile(path or shipped_path())


def _open(path):
    slot = _CACHE.get(path)
    if slot:
        return slot
    f = open(path, 'rb')
    if f.read(8) != MAGIC:
        f.close()
        raise ValueError('not a page pack')
    n = struct.unpack('<I', f.read(4))[0]
    index = json.loads(f.read(n).decode('utf-8'))
    slot = (index, f, f.tell())
    _CACHE[path] = slot
    return slot


def _read(path, ref):
    _index, f, base = _open(path)
    off, length = ref
    f.seek(base + off)
    return json.loads(f.read(length).decode('utf-8'))


def root_id(path=None):
    path = path or shipped_path()
    index, _f, _base = _open(path)
    return index.get('root') or ''


def _art(row):
    """Art stored in the pack row, or '' when the pack has none.

    No Drive-thumbnail substitution here: poster_for() treats a Drive first
    frame as missing (those frames are often black, a title card, or the
    fan-edit WARNING slate), and the tile must agree with the details page.
    A video with only a Drive first frame therefore shows the skin's
    placeholder poster on its tile and no poster on its details page, in
    both places — instead of a thumbnail on the tile and a blank details page.
    """
    art = row[3] if len(row) > 3 else ''
    return art or ''


def _hydrate(row):
    row = list(row)
    if len(row) > 3:
        row[3] = _art(row)
    return row


def _slice(doc, page, size):
    rows = doc.get('rows') or []
    start = max(0, page) * size
    return {
        'name': doc.get('name') or '',
        'sfx': doc.get('sfx') or '',
        'total': len(rows),
        'rows': [_hydrate(r) for r in rows[start:start + size]],
    }


def folder_page(fid, page=0, path=None, size=LIST_PAGE):
    path = path or shipped_path()
    index, _f, _base = _open(path)
    ref = (index.get('folders') or {}).get(fid)
    if not ref:
        return None
    return _slice(_read(path, ref), page, size)


def _genre_doc(name, path):
    index, _f, _base = _open(path)
    ref = (index.get('genres') or {}).get(name)
    if not ref:
        return None
    return _read(path, ref)


def genre_page(name, page=0, path=None, size=LIST_PAGE):
    path = path or shipped_path()
    doc = _genre_doc(name, path)
    if doc is None:
        return None
    out = _slice(doc, page, size)
    pool = doc.get('sfx') or []
    if isinstance(pool, list):
        import random
        files = [p for p in pool if isinstance(p, str) and p]
        out['sfx'] = random.choice(files) if files else ''
    return out


def genre_all(name, path=None):
    """Every row in a genre, not one page. Used when the user changes the sort."""
    path = path or shipped_path()
    return _genre_doc(name, path)


def id_index(path=None):
    """id -> search row. One parse of the shipped search slice, not the whole model."""
    path = path or shipped_path()
    key = path + '::byid'
    hit = _CACHE.get(key)
    if hit is not None:
        return hit
    index, _f, _base = _open(path)
    ref = index.get('search')
    rows = _read(path, ref).get('rows') or [] if ref else []
    by = {r[0]: r for r in rows if r}
    _CACHE[key] = by
    return by


def people_page(page=0, path=None, size=LIST_PAGE):
    path = path or shipped_path()
    index, _f, _base = _open(path)
    ref = index.get('people')
    if not ref:
        return None
    return _slice(_read(path, ref), page, size)


def recent_page(page=0, path=None, size=LIST_PAGE):
    path = path or shipped_path()
    index, _f, _base = _open(path)
    ref = index.get('recent')
    if not ref:
        return None
    return _slice(_read(path, ref), page, size)


def search_page(query, page=0, path=None, size=LIST_PAGE, limit=300):
    """Name match over the shipped search slice. Does not load the full model."""
    path = path or shipped_path()
    index, _f, _base = _open(path)
    ref = index.get('search')
    if not ref:
        return None
    toks = [t for t in (query or '').lower().split() if t]
    if not toks:
        return {'name': 'Search', 'sfx': '', 'total': 0, 'rows': []}
    cache_key = path + '::search'
    rows = _CACHE.get(cache_key)
    if rows is None:
        rows = _read(path, ref).get('rows') or []
        _CACHE[cache_key] = rows
    hit = []
    for row in rows:
        extra = row[4] if len(row) > 4 and isinstance(row[4], str) else ''
        hay = ((row[1] or '') + ' ' + extra).lower()
        if all(t in hay for t in toks):
            hit.append(row)
            if len(hit) >= limit:
                break
    start = max(0, page) * size
    return {'name': 'Search', 'sfx': '', 'total': len(hit), 'rows': [_hydrate(r) for r in hit[start:start + size]]}


def build_pack(model, base):
    """Bytes of a pack built from an in-memory catalogue model."""
    import catalog
    try:
        from . import namesort
        from .webcounts import FOLD
    except ImportError:
        import namesort
        from webcounts import FOLD

    people = set((model.get('people_meta') or {}))
    actors, directors = FOLD['actors'], FOLD['directors']

    def display(fid, name, parent, is_dir):
        if is_dir and (fid in people or parent in (actors, directors)):
            return namesort.original_folder_name(name)
        if not is_dir:
            return catalog.display_title(name)
        return name

    drive = 'https://drive.google.com/thumbnail?sz=w320&id='

    def art_of(fid, is_dir):
        if is_dir:
            url = catalog.folder_art(model, base, fid) or ''
        else:
            url = catalog.poster_for(model, base, fid) or ''
        if url == drive + fid:
            return ''
        return url

    def row_for(fid, parent):
        item = model['items'][fid]
        is_dir = 1 if item[2] else 0
        if is_dir and not (model.get('rcnt') or model['cnt']).get(fid):
            return None
        name = display(fid, item[0], parent, is_dir)
        row = [fid, name, is_dir, art_of(fid, is_dir)]
        if not is_dir:
            try:
                info = catalog.video_info(model, fid)
            except Exception:
                info = {'plot': '', 'editor': '', 'year': 0, 'rating_text': '', 'rating_src': '', 'runtime': 0}
            try:
                runtime = int(info.get('runtime') or 0)
            except (TypeError, ValueError):
                runtime = 0
            # [id, name, is_dir, art, search extra, details]
            # details: plot, editor, year, rating text, rating source, runtime minutes
            row.append('')
            row.append([
                info.get('plot') or '',
                info.get('editor') or '',
                info.get('year') or 0,
                info.get('rating_text') or '',
                info.get('rating_src') or '',
                runtime,
            ])
            # Full parent set. The listing picks one clip when the row is shown.
            try:
                row.append(catalog.sfx_up(model, fid) or [])
            except Exception:
                row.append([])
        return row

    parts = []
    offset = 0

    def add(blob):
        nonlocal offset
        raw = json.dumps(blob, separators=(',', ':'), ensure_ascii=False).encode('utf-8')
        ref = [offset, len(raw)]
        parts.append(raw)
        offset += len(raw)
        return ref

    index = {'v': 1, 'root': model.get('root') or '', 'folders': {}, 'genres': {}}
    items = model['items']
    for fid, kids in (model.get('kids') or {}).items():
        rows = []
        for kid in kids:
            if kid not in items:
                continue
            row = row_for(kid, fid)
            if row:
                rows.append(row)
        if fid in (actors, directors):
            rows.sort(key=lambda r: namesort.folder_sort_key(r[1]))
        name = (items.get(fid) or [''])[0]
        sfx = ''
        try:
            sfx = catalog.sfx_for(model, fid) or ''
        except Exception:
            sfx = ''
        index['folders'][fid] = add({'name': name, 'sfx': sfx, 'rows': rows})

    for genre, folders in (model.get('genre_folders') or {}).items():
        vids = (model.get('genre_videos') or {}).get(genre) or []
        ids = catalog.dedupe(model, list(folders) + list(vids))
        ids.sort(key=lambda i: (0 if items.get(i, [0, 0, 0])[2] else 1, catalog.natkey(items.get(i, [''])[0])))
        rows = []
        for i in ids:
            row = row_for(i, '')
            if row:
                rows.append(row)
        pool = []
        seen = set()
        for i in ids:
            rel = catalog.sfx_up(model, i)
            files = rel if isinstance(rel, list) else ([rel] if rel else [])
            for one in files:
                if isinstance(one, str) and one not in seen:
                    seen.add(one)
                    pool.append(one)
                    if len(pool) >= 24:
                        break
            if len(pool) >= 24:
                break
        index['genres'][genre] = add({'name': genre, 'sfx': pool, 'rows': rows})

    recent_rows = []
    for i in catalog.dedupe(model, list(catalog.recent_ids(model))):
        row = row_for(i, '')
        if row:
            recent_rows.append(row)
    index['recent'] = add({'name': 'New Arrivals', 'sfx': '', 'rows': recent_rows})

    tbc_ids = catalog.tbc_members(items, model.get('kids') or {})
    search_ids = []
    for i, item in items.items():
        if i in tbc_ids or (item[3] and item[3] in tbc_ids):
            continue
        if item[2] and not (model.get('rcnt') or model['cnt']).get(i):
            continue
        search_ids.append(i)
    search_rows = []
    for i in catalog.dedupe(model, search_ids):
        item = items[i]
        is_dir = 1 if item[2] else 0
        row = row_for(i, item[1])
        if not row:
            continue
        edit = (model.get('edits') or {}).get(i) or (model.get('edits') or {}).get(item[3] or '') or {}
        extra = edit.get('title') or ''
        if extra and extra.lower() not in (row[1] or '').lower():
            if len(row) < 5:
                row.append(extra)
            else:
                row[4] = extra
        search_rows.append(row)
    search_rows.sort(key=lambda r: (0 if r[2] else 1, catalog.natkey(r[1])))
    index['search'] = add({'rows': search_rows})

    people_ids = []
    for fid, meta in (model.get('people_meta') or {}).items():
        if fid not in items:
            continue
        if not (model.get('rcnt') or model['cnt']).get(fid):
            continue
        people_ids.append(fid)
    people_rows = []
    for fid in catalog.dedupe(model, people_ids):
        row = row_for(fid, items[fid][1])
        if row:
            people_rows.append(row)
    people_rows.sort(key=lambda r: namesort.folder_sort_key(r[1]))
    index['people'] = add({'name': 'Actors & Directors', 'sfx': '', 'rows': people_rows})

    head = json.dumps(index, separators=(',', ':'), ensure_ascii=False).encode('utf-8')
    return MAGIC + struct.pack('<I', len(head)) + head + b''.join(parts)
