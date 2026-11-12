"""What a QR dialog shows, and what the picture encodes.

The picture always encodes the full URL. The line under it is a short URL that
resolves to that full URL. Session links (the My List QR, ``/?link=<id>``) use
a path on our own site. Static links use the is.gd addresses that already exist.
No third-party shortener API, and no DNS change.
"""
import re

SITE = 'https://collection.faneditfanclub.com'
FEEDBACK_FULL = 'https://docs.google.com/forms/d/e/1FAIpQLSe_MZOis6_4DFTkrbSu2SiP0bGTMuCRruUPeemutI4uZ7nIbA/viewform'
FEEDBACK_SHORT = 'https://is.gd/UVko0K'
APK_FULL = 'https://fefc-collection.pages.dev/kodi-app/FEFC.apk'
APK_SHORT = 'https://is.gd/8la6gb'

# Full URL -> short URL. Only links that already exist.
STATIC = {
    FEEDBACK_FULL: FEEDBACK_SHORT,
    APK_FULL: APK_SHORT,
}

_LINK = re.compile(r'^https?://[^/?#]+/\?link=([\w-]{20,30})$')


def qr_payload(full):
    """The string that goes in the QR. Always the full URL."""
    return (full or '').strip()


def display(full):
    """The line under the QR. A short URL, or the full URL when it is already short."""
    full = (full or '').strip()
    if full in STATIC:
        return STATIC[full]
    m = _LINK.match(full)
    if m:
        return SITE + '/l/' + m.group(1)
    return full


def link_id(full):
    m = _LINK.match((full or '').strip())
    return m.group(1) if m else ''


def browser_builtins(url):
    """Kodi/Android: the VIEW intent. The caller also asks Python's webbrowser to open it."""
    safe = (url or '').replace('"', '%22').replace('\n', '').replace('\r', '')
    return ['StartAndroidActivity(,android.intent.action.VIEW,,%s)' % safe]


def open_browser(executebuiltin, url):
    for cmd in browser_builtins(url):
        executebuiltin(cmd)
    try:
        import webbrowser
        webbrowser.open(url)
    except Exception:
        pass
