"""What a QR dialog shows, and what the picture encodes.

The picture always encodes the full URL. Link My List shows FanEditFanClub.com/MyList
under the code. That address does not carry the session id; the phone finishes
the link on the My List page with the code the TV is showing. Static links use
the is.gd addresses that already exist. No generated short codes.
"""
import re

FEEDBACK_FULL = 'https://docs.google.com/forms/d/e/1FAIpQLSe_MZOis6_4DFTkrbSu2SiP0bGTMuCRruUPeemutI4uZ7nIbA/viewform'
FEEDBACK_SHORT = 'https://is.gd/UVko0K'
APK_FULL = 'https://fefc-collection.pages.dev/kodi-app/FEFC.apk'
APK_SHORT = 'https://is.gd/8la6gb'
MYLIST_LABEL = 'FanEditFanClub.com/MyList'
MYLIST_OPEN = 'https://faneditfanclub.com/MyList'

STATIC = {
    FEEDBACK_FULL: FEEDBACK_SHORT,
    APK_FULL: APK_SHORT,
}

_LINK = re.compile(r'^https?://[^/?#]+/\?link=([\w-]{20,30})$')


def qr_payload(full):
    """The string that goes in the QR. Always the full URL."""
    return (full or '').strip()


def display(full):
    """The line under the QR."""
    full = (full or '').strip()
    if full in STATIC:
        return STATIC[full]
    if _LINK.match(full):
        return MYLIST_LABEL
    return full


def open_target(full):
    """The address selecting that line opens. The QR payload stays the full URL."""
    full = (full or '').strip()
    if _LINK.match(full):
        return MYLIST_OPEN
    shown = display(full)
    return shown if shown.startswith('http') else full


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
