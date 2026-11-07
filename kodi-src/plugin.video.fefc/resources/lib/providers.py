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
    req = urllib.request.Request(base.rstrip('/') + '/data/provider-testing.json', headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return load_bytes(r.read())


def _walk(items, parent):
    for it in items or []:
        yield parent, it
        for pair in _walk(it.get('children') or [], it.get('id')):
            yield pair


def index(doc):
    out = {'pt:testing': {
        'id': 'pt:testing', 'name': doc.get('title') or '01 - Testing', 'kind': 'folder',
        'parent': TBC, 'status': doc.get('note') or '', 'open_label': '', 'url': '',
    }}
    for p in doc.get('providers') or []:
        out[p['id']] = {
            'id': p['id'], 'name': p.get('name') or p['id'], 'kind': 'folder', 'parent': 'pt:testing',
            'status': 'Links only. In-app playback has not been verified.',
            'open_label': p.get('open_label') or 'Open link', 'url': '',
        }
        for parent, it in _walk(p.get('items') or [], p['id']):
            out[it['id']] = {
                'id': it['id'], 'name': it.get('name') or 'Link', 'kind': it.get('kind') or 'file',
                'parent': parent, 'status': it.get('status') or '',
                'open_label': p.get('open_label') or 'Open link', 'url': it.get('url') or '',
                'catalog': it.get('catalog') or '', 'video': False, 'playback_verified': False,
            }
    return out


def children(doc, fid):
    rows = [v for v in index(doc).values() if v.get('parent') == fid]
    rows.sort(key=lambda r: (0 if r.get('kind') == 'folder' else 1, (r.get('name') or '').lower()))
    return rows


def find(doc, iid):
    return index(doc).get(iid)
