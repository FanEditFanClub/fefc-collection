"""Read-only loader for data/provider-testing.json."""
import json
import urllib.request

TBC = '1503Wl56hzRppaIFcQisvQksOaeYOEjnk'
UA = 'plugin.video.fefc/1.0 (Kodi)'


def load_bytes(raw):
    doc = json.loads(raw.decode('utf-8') if isinstance(raw, (bytes, bytearray)) else raw)
    if not isinstance(doc, dict) or not doc.get('providers'):
        raise ValueError('provider-testing manifest is empty')
    return doc


def fetch(base, timeout=60):
    root = base.rstrip('/')
    req = urllib.request.Request(root + '/data/provider-testing.json', headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        doc = load_bytes(r.read())
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
    return items or {}


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
        'password': 'This transfer asks for a password. In-app Play is off.',
        'expired': 'This transfer has expired. In-app Play is off.',
        'unsupported': 'The listed files are not a video Kodi can open from this page. In-app Play is off.',
    }
    base = lines.get(state, lines['unchecked'])
    return (detail + '\n' + base).strip() if detail else base


def _walk(items, parent):
    for it in items or []:
        yield parent, it
        for pair in _walk(it.get('children') or [], it.get('id')):
            yield pair


def index(doc):
    ver = verified_map(doc)
    out = {'pt:testing': {
        'id': 'pt:testing', 'name': doc.get('title') or '01 - Testing', 'kind': 'folder',
        'parent': TBC, 'status': doc.get('note') or '', 'open_label': '', 'url': '',
        'state': 'unchecked',
    }}
    for p in doc.get('providers') or []:
        out[p['id']] = {
            'id': p['id'], 'name': p.get('name') or p['id'], 'kind': 'folder', 'parent': 'pt:testing',
            'status': 'Catalog links. A row plays only after a public file check confirms a direct media URL.',
            'open_label': p.get('open_label') or 'Open link', 'url': '', 'state': 'unchecked',
        }
        for parent, it in _walk(p.get('items') or [], p['id']):
            hit = ver.get(it['id']) or {}
            state = hit.get('state') or it.get('state') or 'unchecked'
            kodi_play = bool(hit.get('kodi_play') and hit.get('play_url'))
            rec = {
                'id': it['id'], 'name': it.get('name') or 'Link', 'kind': it.get('kind') or 'file',
                'parent': parent, 'status': it.get('status') or '',
                'open_label': p.get('open_label') or 'Open link', 'url': it.get('url') or '',
                'catalog': it.get('catalog') or '', 'video': kodi_play,
                'playback_verified': kodi_play,
                'state': state, 'detail': hit.get('detail') or it.get('detail') or '',
                'play_url': hit.get('play_url') or '' if kodi_play else '',
                'kodi_play': kodi_play, 'mime': hit.get('mime') or '',
            }
            rec['status_line'] = status_line(rec)
            out[it['id']] = rec
    return out


def children(doc, fid):
    rows = [v for v in index(doc).values() if v.get('parent') == fid]
    rows.sort(key=lambda r: (0 if r.get('kind') == 'folder' else 1, (r.get('name') or '').lower()))
    return rows


def find(doc, iid):
    return index(doc).get(iid)
