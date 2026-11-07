#!/usr/bin/env python3
"""Check a few public catalog links with documented APIs. Does not download films."""
import json, os, re, sys, urllib.request
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UA = 'FEFC-provider-check/1.0'


def get(url, method='GET', timeout=25, read=2000000, ranged=False):
    headers = {'User-Agent': UA}
    if ranged:
        headers['Range'] = 'bytes=0-1023'
    req = urllib.request.Request(url, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            body = r.read(read) if method != 'HEAD' else b''
            return r.status, r.headers, body, None
    except urllib.error.HTTPError as e:
        body = e.read(read) if method != 'HEAD' else b''
        return e.code, e.headers, body, None
    except Exception as e:
        return 0, {}, b'', str(e)


def walk(items):
    for it in items or []:
        yield it
        yield from walk(it.get('children') or [])


def first(items, pred):
    for it in items:
        if pred(it):
            return it
    return None


def archive_id(url):
    m = re.search(r'archive\.org/(?:details|download)/([^/?#]+)', url or '')
    return urllib.parse.unquote(m.group(1)) if m else ''


def youtube_id(url):
    m = re.search(r'youtu\.be/([\w-]{6,})', url or '') or re.search(r'[?&]v=([\w-]{6,})', url or '')
    return m.group(1) if m else ''


def pixel_id(url):
    m = re.search(r'pixeldrain\.com/(?:u|d|api/file)/([\w-]+)', url or '')
    return m.group(1) if m else ''


def dm_id(url):
    m = re.search(r'dai\.ly/([\w]+)', url or '') or re.search(r'dailymotion\.com/video/([\w]+)', url or '')
    return m.group(1) if m else ''


import urllib.parse, urllib.error


def head_ok(url):
    status, headers, body, err = get(url, method='GET', read=16, ranged=True)
    mime = (headers.get('Content-Type') or '').split(';')[0].strip().lower() if headers else ''
    return status, mime, err


def check_archive(it):
    ident = archive_id(it.get('url') or '')
    status, headers, body, err = get('https://archive.org/metadata/' + urllib.parse.quote(ident))
    if err or status != 200:
        return dict(state='unavailable', detail='Internet Archive metadata API did not return this item (%s).' % (err or status),
                    browser_play=False, kodi_play=False, play_url='', mime='', http=status, checked_via='archive.org metadata API')
    try:
        meta = json.loads(body.decode('utf-8', 'replace'))
    except Exception:
        return dict(state='unavailable', detail='Internet Archive metadata was not JSON.', browser_play=False, kodi_play=False, play_url='', mime='', http=status, checked_via='archive.org metadata API')
    files = meta.get('files') or []
    pick = None
    for f in files:
        name = f.get('name') or ''
        if name.lower().endswith('.mp4'):
            pick = f
            break
    if not pick:
        for f in files:
            name = (f.get('name') or '').lower()
            if name.endswith(('.mkv', '.webm', '.ogv')):
                pick = f
                break
    if not pick:
        return dict(state='page_only', detail='Metadata exists and lists no mp4, mkv, or webm file.', browser_play=False, kodi_play=False, play_url='', mime='', http=status, checked_via='archive.org metadata API')
    name = pick['name']
    play = 'https://archive.org/download/%s/%s' % (urllib.parse.quote(ident), urllib.parse.quote(name))
    st, mime, herr = head_ok(play) if play else (0, '', 'no file')
    ext = name.lower().rsplit('.', 1)[-1]
    # mp4/webm can play in the browser. mkv is a direct file Kodi can open.
    browser = st in (200, 206) and ext in ('mp4', 'webm') and (not mime or mime.startswith('video/') or mime == 'application/octet-stream')
    kodi = st in (200, 206) and ext in ('mp4', 'mkv', 'webm', 'ogv')
    state = 'playable' if browser else ('direct_file_not_browser' if kodi else 'unavailable')
    return dict(state=state, detail='Metadata lists %s (%s). Range request HTTP %s.' % (name, mime or 'no content-type', st or herr),
                browser_play=browser, kodi_play=kodi and not browser or browser, play_url=play if kodi else '', mime=mime, http=st, checked_via='archive.org metadata API + Range GET')


def check_youtube(it):
    vid = youtube_id(it.get('url') or '')
    page = 'https://www.youtube.com/watch?v=' + vid
    status, headers, body, err = get('https://www.youtube.com/oembed?format=json&url=' + urllib.parse.quote(page, safe=''))
    if status == 200:
        return dict(state='page_only', detail='YouTube oEmbed confirms the page. There is no direct media file for the in-app player.',
                    browser_play=False, kodi_play=False, play_url='', mime='', http=status, checked_via='YouTube oEmbed')
    return dict(state='unavailable', detail='YouTube oEmbed did not confirm this page (%s).' % (err or status),
                browser_play=False, kodi_play=False, play_url='', mime='', http=status, checked_via='YouTube oEmbed')


def check_pixel(it):
    fid = pixel_id(it.get('url') or '')
    status, headers, body, err = get('https://pixeldrain.com/api/file/%s/info' % fid)
    if status != 200:
        return dict(state='unavailable', detail='Pixeldrain file info API did not return this id (%s).' % (err or status),
                    browser_play=False, kodi_play=False, play_url='', mime='', http=status, checked_via='pixeldrain /api/file/{id}/info')
    try:
        info = json.loads(body.decode('utf-8', 'replace'))
    except Exception:
        info = {}
    mime = (info.get('mime_type') or '').lower()
    name = info.get('name') or ''
    play = 'https://pixeldrain.com/api/file/' + fid
    browser = mime.startswith('video/mp4') or mime == 'video/webm'
    kodi = mime.startswith('video/')
    state = 'playable' if browser else ('direct_file_not_browser' if kodi else 'page_only')
    return dict(state=state, detail='Pixeldrain info: %s (%s).' % (name or fid, mime or 'unknown type'),
                browser_play=browser, kodi_play=kodi, play_url=play if kodi else '', mime=mime, http=status,
                checked_via='pixeldrain /api/file/{id}/info')


def check_open_matte(it):
    url = it.get('url') or ''
    st, mime, err = head_ok(url)
    ext = urllib.parse.urlparse(url).path.lower().rsplit('.', 1)[-1]
    exists = st in (200, 206)
    if mime.startswith('text/html'):
        return dict(state='page_only', detail='The URL returned HTML, not a media file.', browser_play=False, kodi_play=False, play_url='', mime=mime, http=st, checked_via='HTTP Range GET of the published file URL')
    browser = exists and ext in ('mp4', 'webm')
    kodi = exists and ext in ('mp4', 'webm', 'mkv', 'm2ts', 'ts')
    if not exists:
        state = 'unavailable'
    elif browser:
        state = 'playable'
    elif kodi:
        state = 'direct_file_not_browser'
    else:
        state = 'unavailable'
    return dict(state=state, detail='Direct HEAD/Range HTTP %s, type %s, extension .%s.' % (st or err, mime or 'none', ext),
                browser_play=browser, kodi_play=kodi, play_url=url if kodi else '', mime=mime, http=st,
                checked_via='HTTP Range GET of the published file URL')


def check_dm(it):
    vid = dm_id(it.get('url') or '')
    status, headers, body, err = get('https://api.dailymotion.com/video/%s?fields=id,title,private' % vid)
    if status != 200:
        return dict(state='unavailable', detail='Dailymotion API did not return this video (%s).' % (err or status),
                    browser_play=False, kodi_play=False, play_url='', mime='', http=status, checked_via='api.dailymotion.com/video')
    return dict(state='page_only', detail='Dailymotion API confirms the video id. No direct file URL is published by that call.',
                browser_play=False, kodi_play=False, play_url='', mime='', http=status, checked_via='api.dailymotion.com/video')


def main():
    doc = json.load(open(os.path.join(ROOT, 'data/provider-testing.json'), encoding='utf-8'))
    items = []
    for p in doc.get('providers') or []:
        items.extend(walk(p.get('items') or []))
    picks = [
        ('archive', first(items, lambda it: (it.get('url') or '').lower().find('.torrent') < 0 and archive_id(it.get('url') or '') and not archive_id(it.get('url') or '').startswith('@') and '/details/' in (it.get('url') or '')), check_archive),
        ('youtube', first(items, lambda it: youtube_id(it.get('url') or '')), check_youtube),
        ('pixeldrain', first(items, lambda it: '/u/' in (it.get('url') or '') and pixel_id(it.get('url') or '')), check_pixel),
        ('open-matte', first(items, lambda it: 'storage.open-matte.ru' in (it.get('url') or '') and re.search(r'\.(mkv|mp4|m2ts|webm)(\?|$)', it.get('url') or '', re.I)), check_open_matte),
        ('dailymotion', first(items, lambda it: dm_id(it.get('url') or '')), check_dm),
    ]
    out_items = {}
    for name, it, fn in picks:
        if not it:
            print(name, 'NO SAMPLE')
            continue
        rec = fn(it)
        rec['id'] = it['id']
        rec['name'] = it.get('name') or ''
        rec['source_url'] = it.get('url') or ''
        out_items[it['id']] = rec
        print(name, rec['state'], rec['http'], (rec.get('name') or '')[:60])
    doc_out = {
        'v': 1,
        'checked_at': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
        'note': 'Representative public checks only. Every other testing-folder link stays unchecked and is not a film.',
        'items': out_items,
    }
    path = os.path.join(ROOT, 'data/provider-verified.json')
    json.dump(doc_out, open(path, 'w', encoding='utf-8'), indent=2)
    print('wrote', path, 'count', len(out_items))


if __name__ == '__main__':
    main()
