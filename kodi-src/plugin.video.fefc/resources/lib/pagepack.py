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
    art = row[3] if len(row) > 3 else ''
    if art:
        return art
    # Empty art in the pack is the standard Drive thumbnail for that file id.
    return 'https://drive.google.com/thumbnail?sz=w320&id=' + row[0]


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


def genre_page(name, page=0, path=None, size=LIST_PAGE):
    path = path or shipped_path()
    index, _f, _base = _open(path)
    ref = (index.get('genres') or {}).get(name)
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
        hay = ((row[1] or '') + ' ' + (row[4] if len(row) > 4 else '')).lower()
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
        return [fid, name, is_dir, art_of(fid, is_dir)]

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
        index['genres'][genre] = add({'name': genre, 'sfx': '', 'rows': rows})

    recent_rows = []
    for i in catalog.recent_ids(model):
        row = row_for(i, '')
        if row:
            recent_rows.append(row)
    index['recent'] = add({'name': 'New Arrivals', 'sfx': '', 'rows': recent_rows})

    search_rows = []
    for i, item in items.items():
        if item[2] and not (model.get('rcnt') or model['cnt']).get(i):
            continue
        is_dir = 1 if item[2] else 0
        name = display(i, item[0], item[1], is_dir)
        edit = (model.get('edits') or {}).get(i) or {}
        extra = edit.get('title') or ''
        row = [i, name, is_dir, art_of(i, is_dir)]
        if extra and extra.lower() not in (name or '').lower():
            row.append(extra)
        search_rows.append(row)
    search_rows.sort(key=lambda r: (0 if r[2] else 1, catalog.natkey(r[1])))
    index['search'] = add({'rows': search_rows})

    head = json.dumps(index, separators=(',', ':'), ensure_ascii=False).encode('utf-8')
    return MAGIC + struct.pack('<I', len(head)) + head + b''.join(parts)
