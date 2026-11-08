#!/usr/bin/env python3
"""Build data/provider-testing.json from the read-only research exports. No network. No Drive writes."""
import hashlib, json, os, re, sys
from collections import OrderedDict
from urllib.parse import unquote, urlsplit, urlunsplit

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'data', 'provider-testing.json')
OPEN = {
    'Dropbox': 'Open in Dropbox', 'MEGA': 'Open in MEGA', 'GoFile': 'Open in GoFile',
    'MediaFire': 'Open in MediaFire', 'Yandex Disk': 'Open in Yandex Disk',
    'Open Matte HTTP': 'Open in Open Matte', 'Internet Archive': 'Open in Internet Archive',
    'YouTube': 'Open in YouTube', 'TeraBox': 'Open in TeraBox', 'Pixeldrain': 'Open in Pixeldrain',
    'Pixeldrain mirror (unverified)': 'Open in Pixeldrain', 'Koofr': 'Open in Koofr',
    'Dailymotion': 'Open in Dailymotion', 'Short link (unresolved)': 'Open short link',
    'Torrent magnet': 'Open magnet', 'Coverage limits': 'Open link',
    # 0.4.2: SwissTransfer provider registered. NOTE: no SwissTransfer source links exist in the
    # research exports yet, so the provider stays empty until links are supplied.
    'SwissTransfer': 'Open in SwissTransfer',
}
ORDER = ['Dropbox', 'MEGA', 'GoFile', 'MediaFire', 'Yandex Disk', 'Open Matte HTTP',
         'Internet Archive', 'YouTube', 'TeraBox', 'Pixeldrain', 'Pixeldrain mirror (unverified)',
         'Koofr', 'Dailymotion', 'Short link (unresolved)', 'Torrent magnet', 'Coverage limits',
         'SwissTransfer']


def slug(name):
    return re.sub(r'[^a-z0-9]+', '-', (name or '').lower()).strip('-') or 'unknown'


def canonical(url):
    raw = (url or '').strip()
    if not raw:
        return ''
    if raw.lower().startswith('magnet:'):
        return raw
    marked = raw.replace('%23', '#').replace('%23'.upper(), '#')
    p = urlsplit(marked)
    host = (p.hostname or '').lower()
    netloc = host + ((':%s' % p.port) if p.port else '')
    return urlunsplit((p.scheme.lower() or 'https', netloc, unquote(p.path or ''), p.query or '', p.fragment or ''))


def clean(text):
    s = (text or '').replace('\\', '')
    s = re.sub(r'\[(.*?)\]\([^)]*\)', r'\1', s)
    s = re.sub(r'https?://\S+', '', s)
    s = re.sub(r'[*_#>`]+', ' ', s)
    return re.sub(r'\s+', ' ', s).strip(' -\u2013\u2014|')[:180]


def kind_of(link_kind, title=''):
    k = (link_kind or '').lower()
    if k in ('folder', 'directory', 'channel'):
        return 'folder'
    if k == 'magnet':
        return 'magnet'
    if k == 'subtitle' or re.search(r'\.(srt|ass|vtt|sub)$', title or '', re.I):
        return 'subtitle'
    if k in ('coverage', 'note'):
        return 'note'
    if k == 'page_or_collection_unclassified':
        return 'page'
    return 'file'


def label_for(kind):
    return {'folder': 'FOLDER', 'file': 'UNVERIFIED FILE', 'magnet': 'MAGNET', 'subtitle': 'SUBTITLE', 'note': 'NOTE', 'page': 'LINK'}.get(kind, 'LINK')


def iid(url, salt):
    return 'pt:i:' + hashlib.sha1((canonical(url) + '|' + salt).encode()).hexdigest()[:12]


def build(direct_path, delta_path):
    direct = json.load(open(direct_path, encoding='utf-8'))
    delta = json.load(open(delta_path, encoding='utf-8'))
    by, order = OrderedDict(), []

    def add(rec):
        key = canonical(rec.get('url') or '') or ('name:' + rec['provider'] + ':' + rec['name'])
        prev = by.get(key)
        if prev is None:
            by[key] = rec
            order.append(key)
            return rec
        cat = rec.get('catalog')
        if cat and cat != prev.get('catalog') and cat not in prev.setdefault('also_in', []):
            prev['also_in'].append(cat)
        a, b = prev.get('url') or '', rec.get('url') or ''
        if (('%23' in b.lower()) or ('#' in b)) and not (('%23' in a.lower()) or ('#' in a)):
            prev['url'] = b
        return prev

    for src in direct.get('sources') or []:
        parent = add({
            'provider': src['provider'], 'url': (src.get('url') or '').strip(),
            'kind': kind_of(src.get('link_kind') or 'folder', src.get('title')),
            'name': clean(src.get('title')) or src['provider'],
            'catalog': 'Fan Edit Fan Club Master Links',
            'source_url': (direct.get('source') or {}).get('webViewLink') or '',
            'line': src.get('source_line'),
            'status': src.get('enumeration_note') or 'Destination listing not verified',
            'playback_verified': False,
        })
        parent['id'] = parent.get('id') or iid(parent['url'] or parent['name'], parent['provider'])
        for media in src.get('media') or []:
            mk = kind_of(media.get('link_kind') or 'file', media.get('title'))
            add({
                'id': iid(media.get('url') or media.get('title') or '', parent['id']),
                'provider': src['provider'], 'url': (media.get('url') or '').strip(),
                'kind': mk, 'name': clean(media.get('title')) or 'File',
                'parent_id': parent['id'], 'catalog': 'Fan Edit Fan Club Master Links',
                'source_url': src['url'],
                'status': 'Subtitle filename only. Not a video.' if mk == 'subtitle' else 'Filename listed from the public page. Not a verified stream.',
                'playback_verified': False,
            })
        seen = set()
        for sub in src.get('subfolders') or []:
            c = canonical(sub)
            if c in seen:
                continue
            seen.add(c)
            add({
                'id': iid(sub, parent['id']), 'provider': src['provider'], 'url': sub.strip(),
                'kind': 'folder', 'name': clean(unquote(urlsplit(sub).path).strip('/')) or 'Subfolder',
                'parent_id': parent['id'], 'catalog': 'Fan Edit Fan Club Master Links', 'source_url': src['url'],
                'status': 'Subfolder link only. Contents were not listed.', 'playback_verified': False,
            })
    for rec in delta.get('records') or []:
        kind = kind_of(rec.get('link_kind') or 'page', rec.get('title_or_context'))
        add({
            'provider': rec.get('provider') or 'Unknown', 'url': (rec.get('url') or '').strip(),
            'kind': kind, 'name': clean(rec.get('title_or_context')) or (rec.get('provider') or 'Link'),
            'catalog': rec.get('source_catalog') or '', 'source_url': rec.get('source_url') or '',
            'line': rec.get('source_row_or_line'),
            'status': rec.get('restriction') or 'Destination not verified', 'playback_verified': False,
        })
    for hand in delta.get('browser_handoff') or []:
        add({
            'provider': 'Coverage limits', 'url': hand.get('url') or '', 'kind': 'note',
            'name': clean(hand.get('source')) or 'Unread catalog', 'catalog': hand.get('source') or '',
            'source_url': hand.get('url') or '', 'status': hand.get('reason') or 'Not fully read',
            'playback_verified': False,
        })
    children = {}
    for rec in by.values():
        rec['id'] = rec.get('id') or iid(rec.get('url') or rec['name'], rec['provider'])
        rec['label'] = label_for(rec['kind'])
        rec['video'] = False
        rec['playback_verified'] = False
        if rec.get('parent_id'):
            children.setdefault(rec['parent_id'], []).append(rec)
    providers = OrderedDict()
    for key in order:
        rec = by[key]
        if not rec.get('parent_id'):
            providers.setdefault(rec['provider'], []).append(rec)

    def pack(rec):
        out = {k: rec.get(k) for k in ('id', 'name', 'url', 'kind', 'label', 'video', 'playback_verified', 'catalog', 'source_url', 'line', 'status')}
        out['artwork'] = None
        out['description'] = None
        if rec.get('also_in'):
            out['also_in'] = rec['also_in']
        kids = children.get(rec['id']) or []
        if kids:
            out['children'] = [pack(k) for k in kids]
        return out

    names = [n for n in ORDER if n in providers] + [n for n in providers if n not in ORDER]
    doc = {
        'v': 1, 'virtual': True, 'drive_write': False,
        'parent': '1503Wl56hzRppaIFcQisvQksOaeYOEjnk', 'title': '01 - Testing',
        'optimus_url': 'https://x.ai/bot/DR18SV4AEeeNRcKT1U-0P',
        'note': 'App-only links from the master document and the catalogs it points at. Folders are not films. Nothing here has a verified in-app stream.',
        'providers': [{'id': 'pt:p:' + slug(n), 'name': n, 'open_label': OPEN.get(n, 'Open link'), 'items': [pack(r) for r in providers[n]]} for n in names],
        'limits': delta.get('limitations') or [],
        'summary': delta.get('summary') or {},
        'browser_handoff': delta.get('browser_handoff') or [],
    }
    return _merge_manual(doc)


def _merge_manual(doc):
    """Keep hand-checked public links that are not in the research exports."""
    path = os.path.join(ROOT, 'data', 'provider-manual.json')
    if not os.path.isfile(path):
        return doc
    extra = json.load(open(path, encoding='utf-8'))
    have = {p.get('id') for p in doc.get('providers') or []}
    for p in extra.get('providers') or []:
        if p.get('id') and p['id'] not in have:
            doc['providers'].append(p)
            have.add(p['id'])
    return doc


if __name__ == '__main__':
    doc = build(sys.argv[1], sys.argv[2])
    json.dump(doc, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    open(OUT, 'a', encoding='utf-8').write('\n')
    n = 0
    def walk(items):
        global n
        for it in items:
            n += 1
            walk(it.get('children') or [])
    for p in doc['providers']:
        walk(p['items'])
    print('providers', len(doc['providers']), 'items', n)
