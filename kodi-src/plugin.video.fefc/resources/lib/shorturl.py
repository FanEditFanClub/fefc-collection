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

_DISPLAY_MAX = 80


def _norm_url(url):
    """Lookup key for a URL: trailing slash and query/fragment stripped,
    then casefolded. Used for STATIC matching only — never for display
    or for opening, where the original URL is kept."""
    s = (url or '').strip()
    s = s.split('#', 1)[0].split('?', 1)[0].rstrip('/')
    return s.casefold()


# Casefolded keys too: FEEDBACK_FULL contains uppercase characters, so a
# casefold lookup against the raw keys would never match it.
_STATIC_BY_NORM = {_norm_url(k): v for k, v in STATIC.items()}


def _display_truncate(url):
    if len(url) <= _DISPLAY_MAX:
        return url
    return url[:_DISPLAY_MAX - 3] + '...'

_LINK = re.compile(r'^https?://[^/?#]+/\?link=([\w-]{20,30})$')


def qr_payload(full):
    """The string that goes in the QR. Always the full URL.

    Intended asymmetry with open_target(): the QR encodes the FULL url
    (it keeps working if is.gd is down), while selecting the line opens
    the SHORT is.gd address for STATIC entries (the browser path depends
    on is.gd being up). Do not "fix" one to match the other.

    Trust boundary: callers must only pass project URLs. A foreign
    ?link= URL that ever reached here would be encoded as-is; that is
    latent and out of scope for this chunk — a comment, not code.
    """
    return (full or '').strip()


def display(full):
    """The line under the QR. A STATIC short link, the My List label, or
    the full URL truncated to 80 characters so a very long URL cannot
    blow out the dialog line."""
    full = (full or '').strip()
    short = _STATIC_BY_NORM.get(_norm_url(full))
    if short:
        return short
    if _LINK.match(full):
        return MYLIST_LABEL
    return _display_truncate(full)


def open_target(full):
    """The address selecting that line opens. The QR payload stays the full URL.

    Computed independently of display(): display() truncates long URLs,
    and a truncated string must never be opened as a URL. STATIC entries
    return their short (is.gd) address here — see item 226.
    """
    full = (full or '').strip()
    if _LINK.match(full):
        return MYLIST_OPEN
    short = _STATIC_BY_NORM.get(_norm_url(full))
    if short:
        return short
    return full


def browser_builtins(url):
    """Kodi/Android: the VIEW intent. The caller also asks Python's webbrowser to open it.

    ',' and ')' inside the URL are percent-encoded (%2C / %29): Kodi splits
    builtin arguments on ',' and ends the call on ')', so an unescaped one
    breaks the builtin parsing. '"' is encoded as %22 for the same reason.
    """
    safe = (url or '').replace('"', '%22').replace(',', '%2C').replace(')', '%29').replace('\n', '').replace('\r', '')
    return ['StartAndroidActivity(,android.intent.action.VIEW,,%s)' % safe]


def open_browser(executebuiltin, url):
    for cmd in browser_builtins(url):
        try:
            executebuiltin(cmd)
        except Exception:
            pass
    try:
        import webbrowser
        webbrowser.open(url)
    except Exception:
        pass
