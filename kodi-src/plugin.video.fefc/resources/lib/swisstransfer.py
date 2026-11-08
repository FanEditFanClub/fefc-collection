"""Public SwissTransfer share pages. No download tokens and no file bodies.

The share URL is an HTML page. Kodi's player cannot open that page as a video.
The page lists file names, sizes, and types. It does not include a stable media URL.
A short-lived download token is not requested here.
"""
import json
import re
from datetime import datetime, timezone
from urllib.parse import urlsplit

SHARE_HOSTS = ('swisstransfer.com', 'www.swisstransfer.com')
_ID_RE = re.compile(r'/d[l]?/([0-9a-f-]{16,})', re.I)


def share_id(url):
    parts = urlsplit(url or '')
    host = (parts.hostname or '').lower()
    if host not in SHARE_HOSTS:
        return ''
    m = _ID_RE.search(parts.path or '')
    return m.group(1) if m else ''


def _page_props(html):
    text = html or ''
    i = text.find('{"component"')
    if i < 0:
        return None
    end = text.find('</script>', i)
    blob = text[i:end if end > i else None]
    try:
        data = json.loads(blob)
    except Exception:
        return None
    if not isinstance(data, dict):
        return None
    return data.get('props') if isinstance(data.get('props'), dict) else None


def inspect_page(html, now=None):
    """Classify one public share page. `html` is the page body, not a media file."""
    now = now or datetime.now(timezone.utc)
    props = _page_props(html)
    if props is None:
        return {'state': 'unavailable', 'kodi_play': False, 'play_url': '',
                'message': 'The SwissTransfer page did not include a file list, so nothing was opened in the player.'}
    if props.get('password') or (props.get('link') or {}).get('password'):
        return {'state': 'password', 'kodi_play': False, 'play_url': '',
                'message': 'This SwissTransfer link asks for a password. In-app Play is off.'}
    transfer = props.get('transfer') if isinstance(props.get('transfer'), dict) else None
    if not transfer:
        return {'state': 'unavailable', 'kodi_play': False, 'play_url': '',
                'message': 'The SwissTransfer page has no transfer. In-app Play is off.'}
    expires = None
    raw_exp = transfer.get('expires_at')
    if isinstance(raw_exp, (int, float)) and raw_exp > 0:
        expires = datetime.fromtimestamp(raw_exp, timezone.utc)
    if expires and expires <= now:
        return {'state': 'expired', 'kodi_play': False, 'play_url': '', 'expires': expires.strftime('%Y-%m-%d'),
                'message': 'This SwissTransfer link expired on %s. In-app Play is off.' % expires.strftime('%Y-%m-%d')}
    files = []
    for f in transfer.get('files') or []:
        if not isinstance(f, dict):
            continue
        files.append({
            'name': f.get('path') or f.get('name') or 'File',
            'size': int(f.get('size') or 0),
            'mime': f.get('mime_type') or '',
            'group': f.get('mime_type_group') or '',
        })
    videos = [f for f in files if (f['group'] == 'video' or f['mime'].startswith('video/'))]
    others = [f for f in files if f not in videos]
    title = transfer.get('title') or 'SwissTransfer'
    when = expires.strftime('%Y-%m-%d') if expires else 'an unknown date'
    gb = (int(transfer.get('total_size') or 0) or sum(f['size'] for f in files)) / 1e9
    if not files:
        msg = 'The SwissTransfer page "%s" lists no files. In-app Play is off.' % title
        state = 'unavailable'
    elif others and not videos:
        msg = 'The SwissTransfer page "%s" lists %d file(s) that are not video. In-app Play is off. The link is available until %s.' % (title, len(files), when)
        state = 'unsupported'
    else:
        msg = ('The SwissTransfer address is a web page, not a video file, so Kodi cannot play it. '
               '"%s" lists %d MP4 file(s), about %.1f GB, until %s. '
               'There is no stable media address on the page. In-app Play is off.'
               ) % (title, len(videos), gb, when)
        if others:
            msg += ' %d other file(s) are not video.' % len(others)
        state = 'page_only'
    return {
        'state': state, 'kodi_play': False, 'play_url': '', 'title': title,
        'expires': expires.strftime('%Y-%m-%d') if expires else '',
        'files': files, 'message': msg,
    }


def fetch_page(url, timeout=20, limit=120000):
    """Read the public HTML page only, capped, and classify it. Never downloads a listed file."""
    import urllib.request
    if not share_id(url):
        return {'state': 'unsupported', 'kodi_play': False, 'play_url': '',
                'message': 'That address is not a SwissTransfer share link. In-app Play is off.'}
    req = urllib.request.Request(url, headers={'User-Agent': 'plugin.video.fefc/1.0 (Kodi)', 'Accept': 'text/html'})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            ctype = (r.headers.get('Content-Type') or '').split(';', 1)[0].strip().lower()
            body = r.read(limit)
    except Exception as e:
        return {'state': 'unavailable', 'kodi_play': False, 'play_url': '',
                'message': 'The SwissTransfer page could not be read (%s). In-app Play is off.' % type(e).__name__}
    if ctype and ctype != 'text/html':
        return {'state': 'unsupported', 'kodi_play': False, 'play_url': '',
                'message': 'SwissTransfer answered with %s, not a listed video. In-app Play is off.' % (ctype or 'an unknown type')}
    return inspect_page(body.decode('utf-8', 'replace'))
