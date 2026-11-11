"""Ticker text from real feed items only. Capped so Kodi can draw it."""
import re

MAX_LEN = 900
ICONS = {
    'discord': ('\ue001', 'FF5865F2'),
    'facebook': ('\ue002', 'FF1877F2'),
    'x': ('\ue003', 'FFFFFFFF'),
    'reddit': ('\ue004', 'FFFF4500'),
}
CTA = (
    ('discord', 'Join the FEFC Discord'),
    ('x', 'Follow @FanEditFanClub on X'),
    ('facebook', 'Join the FEFC Facebook Group'),
    ('reddit', 'Join r/FanEditFanClub on Reddit'),
)


_MD_LINK = re.compile(r'\[([^\]]*)\]\((?:https?://|www\.)[^)\s]+\)', re.I)
_URL_RE = re.compile(
    r'https?://\S+'
    r'|www\.\S+'
    # Bare domains left in feed titles (discord.gg/…, x.com/…, faneditfanclub.com, bit.ly/…).
    r'|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|net|org|gg|io|co|me|ly|be|fm|to|cc|tv|link|site|club|live|app|info|us|uk|ca|au|de|fr|es|it|nl|ru|br|jp|kr|cn|in|dev|xyz|online)\b(?:/\S*)?',
    re.I)
_EMPTY_WRAP = re.compile(r'[\(\[\{]\s*[\)\]\}]')
_MULTI_PUNCT = re.compile(r'([:;,])(?:\s*[:;,])+')
_SPACE_PUNCT = re.compile(r'\s+([,.;:!?])')


def _clean(text):
    """Ticker line with post text kept and visible URLs removed."""
    s = _MD_LINK.sub(lambda m: m.group(1), str(text or ''))
    s = _URL_RE.sub(' ', s)
    s = _EMPTY_WRAP.sub(' ', s)
    s = _MULTI_PUNCT.sub(r'\1', s)
    s = _SPACE_PUNCT.sub(r'\1', s)
    s = ' '.join(s.split())
    return s.strip(' \t-–—|•')


def items_from_new_files(feed):
    out = []
    if not isinstance(feed, dict):
        return out
    title = _clean(feed.get('title'))
    try:
        count = int(feed.get('count') or 0)
    except (TypeError, ValueError):
        count = 0
    if not title and count:
        label = 'New File' if count == 1 else 'New Files'
        verb = 'has been added' if count == 1 else 'have been added'
        title = '%s %s %s to The Fan Edit Fan Club Collection' % (count, label, verb)
    if title:
        out.append({'src': 'new', 'title': title})
    recent = feed.get('recent') if isinstance(feed.get('recent'), list) else []
    for name in recent[:12]:
        t = _clean(name)
        if t:
            out.append({'src': 'new', 'title': t})
    return out


def items_from_api(payload):
    if not isinstance(payload, dict):
        return []
    out = []
    for it in payload.get('items') or []:
        if not isinstance(it, dict):
            continue
        t = _clean(it.get('title'))
        if t:
            out.append({'src': _clean(it.get('src')).lower(), 'title': t})
    return out


def items_from_snapshot(payload):
    if not isinstance(payload, dict):
        return []
    out = []
    for p in payload.get('posts') or []:
        if not isinstance(p, dict):
            continue
        t = _clean(p.get('title'))
        if t:
            out.append({'src': _clean(p.get('src') or p.get('label')).lower(), 'title': t})
    return out


def _piece(it):
    t = _clean(it.get('title'))
    if not t:
        return ''
    src = _clean(it.get('src')).lower().replace('twitter', 'x')
    if src == 'new':
        return '[COLOR FFFFB02E]NEW[/COLOR]  %s' % t
    ic = ICONS.get(src)
    if ic:
        return '[COLOR %s]%s[/COLOR]  %s' % (ic[1], ic[0], t)
    return ('%s: %s' % (src.upper(), t)) if src else t


_BADGE = {'discord': 'DISCORD', 'x': 'X', 'facebook': 'FACEBOOK', 'reddit': 'REDDIT'}


def _cta(i):
    """Network name plus the sentence. The sentence already says Join or Follow,
    and the private-use glyph does not draw, so a JOIN prefix read as 'JOIN Join'."""
    src, text = CTA[i % len(CTA)]
    return '%s  %s' % (_BADGE.get(src, src.upper()), text)


def build_text(new_items, community, limit=MAX_LEN):
    items = list(new_items or []) + list(community or [])
    parts = []
    k = 0
    for it in items:
        piece = _piece(it)
        if not piece:
            continue
        k += 1
        nxt = parts + [piece]
        if k % 3 == 0:
            nxt = nxt + [_cta(k // 3 - 1)]
        candidate = '   •   '.join(nxt) + '   •   '
        if len(candidate) > limit and parts:
            break
        parts = nxt
        if len(candidate) > limit:
            break
    if not parts:
        text = '   •   '.join(_cta(i) for i in range(len(CTA))) + '   •   '
    else:
        text = '   •   '.join(parts) + '   •   '
    # Kodi only scrolls a label that is wider than its box. Repeat a short line.
    while len(text) < 280 and len(text) * 2 <= limit:
        text += text
    return text[:limit]
