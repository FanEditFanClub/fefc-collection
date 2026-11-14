"""Read-only loader for data/provider-testing.json."""
import json
import urllib.request

TBC = '1503Wl56hzRppaIFcQisvQksOaeYOEjnk'
UA = 'plugin.video.fefc/1.0 (Kodi)'


def load_bytes(raw):
    doc = json.loads(raw.decode('utf-8') if isinstance(raw, (bytes, bytearray)) else raw)
    if not isinstance(doc, dict) or not isinstance(doc.get('providers'), list) or not doc.get('providers'):
        raise ValueError('provider-testing manifest is empty')
    return doc


def fetch(base, timeout=60):
    root = base.rstrip('/')
    try:
        req = urllib.request.Request(root + '/data/provider-testing.json', headers={'User-Agent': UA})
        with urllib.request.urlopen(req, timeout=timeout) as r:
            doc = load_bytes(r.read())
    except Exception:
        # Minimal doc, not a raw urllib error: the Testing section then shows
        # its root with no providers, instead of the caller crashing. The
        # trade-off is that a network failure looks like an empty list rather
        # than an error dialog; the router's testing_folder try/except is
        # therefore no longer the place that reports it.
        return {'title': '', 'note': '', 'providers': [], 'verified': {'items': {}}}
    try:
        vreq = urllib.request.Request(root + '/data/provider-verified.json', headers={'User-Agent': UA})
        with urllib.request.urlopen(vreq, timeout=timeout) as r:
            doc['verified'] = json.loads(r.read().decode('utf-8'))
    except Exception:
        doc.setdefault('verified', {'items': {}})
    return doc


def verified_map(doc):
    v = doc.get('verified') if isinstance(doc, dict) else None
    items = v.get('items') if isinstance(v, dict) else None
    return items if isinstance(items, dict) else {}


def status_line(rec):
    state = (rec or {}).get('state') or 'unchecked'
    detail = (rec or {}).get('detail') or ''
    lines = {
        'unchecked': 'Not checked. This is a catalog link, not a film, and in-app play is off.',
        'page_only': 'A public page exists. It is not a media file, so there is no in-app player.',
        'unavailable': 'The public check did not find a file to play.',
        'direct_file_not_browser': 'A public file answered. The browser cannot play this format. Kodi can open the file when a direct URL was confirmed.',
        'playable': 'A public media file answered and can be played.',
        'unresolved_short_link': 'Short link left unresolved. Not a verified film.',
    }
    base = lines.get(state, lines['unchecked'])
    return (detail + '\n' + base).strip() if detail else base


def _walk(items, parent):
    for it in items or []:
        if not isinstance(it, dict):
            continue
        yield parent, it
        for pair in _walk(it.get('children') or [], it.get('id')):
            yield pair


def _http_url(value):
    """An http(s) URL, or '' — a bad scheme must never reach the player or the browser."""
    return value if isinstance(value, str) and value.startswith(('http://', 'https://')) else ''


def index(doc):
    ver = verified_map(doc)
    out = {'pt:testing': {
        'id': 'pt:testing', 'name': doc.get('title') or '01 - Testing', 'kind': 'folder',
        'parent': TBC, 'status': doc.get('note') or '', 'open_label': '', 'url': '',
        'state': 'unchecked',
    }}
    providers = doc.get('providers') if isinstance(doc, dict) else None
    if not isinstance(providers, list):
        providers = []
    for p in providers:
        if not isinstance(p, dict):
            continue
        pid = p.get('id')
        if not pid or pid in out:
            continue  # no id: skip; duplicate id: first wins, never overwrite
        out[pid] = {
            'id': pid, 'name': p.get('name') or pid, 'kind': 'folder', 'parent': 'pt:testing',
            'status': 'Catalog links. A row plays only after a public file check confirms a direct media URL.',
            'open_label': p.get('open_label') or 'Open link', 'url': '', 'state': 'unchecked',
        }
        for parent, it in _walk(p.get('items') or [], pid):
            iid = it.get('id')
            if not iid or iid in out:
                continue  # no id: skip; duplicate id: first wins, never overwrite
            hit = ver.get(iid) or {}
            if not isinstance(hit, dict):
                hit = {}
            state = hit.get('state') or 'unchecked'
            play_url = _http_url(hit.get('play_url'))
            kodi_play = bool(hit.get('kodi_play') and play_url)
            rec = {
                'id': iid, 'name': it.get('name') or 'Link', 'kind': it.get('kind') or 'file',
                'parent': parent, 'status': it.get('status') or '',
                'open_label': p.get('open_label') or 'Open link', 'url': _http_url(it.get('url')),
                'catalog': it.get('catalog') or '', 'video': kodi_play,
                'playback_verified': kodi_play,
                'state': state, 'detail': hit.get('detail') or '',
                'play_url': play_url if kodi_play else '',
                'kodi_play': kodi_play, 'mime': hit.get('mime') or '',
            }
            rec['status_line'] = status_line(rec)
            out[iid] = rec
    return out


def children(doc, fid):
    rows = [v for v in index(doc).values() if v.get('parent') == fid]
    rows.sort(key=lambda r: (0 if r.get('kind') == 'folder' else 1, (r.get('name') or '').lower()))
    return rows


def find(doc, iid):
    return index(doc).get(iid)
