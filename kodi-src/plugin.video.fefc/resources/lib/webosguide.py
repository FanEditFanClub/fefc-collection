"""Couch-readable LG update steps. No xbmc import, so tests can read the same words the TV shows.

The install path is webOS Dev Manager on a computer. Homebrew Channel can install an IPK from a
URL on the TV only after the set is rooted. Rooting is a separate exploit and is not the path
for a normal Developer Mode install of org.xbmc.kodi.
"""
import logging
import re

GUIDE_URL = 'https://collection.faneditfanclub.com/lg-update'
GUIDE_LABEL = 'collection.faneditfanclub.com/lg-update'
DEV_MANAGER_URL = 'https://github.com/webosbrew/dev-manager-desktop/releases/latest'
DIALOG_XML = 'DialogFEFCWebOSUpdate.xml'
TITLE = 'A new FEFC is ready'
LEAD = 'This TV cannot install it alone. Use a computer on the same Wi-Fi.'

_LOG = logging.getLogger('plugin.video.fefc.webosguide')


def _log(message):
    """Kodi's log inside Kodi, the standard logger anywhere else (tests). xbmc is imported
    only here, when something has to be logged, so the module itself stays xbmc-free."""
    try:
        import xbmc
        xbmc.log('[plugin.video.fefc] webosguide: ' + message, xbmc.LOGWARNING)
    except Exception:
        _LOG.warning(message)


def _clean_link(url):
    """One line, one token. Control characters (including line breaks and tabs) are dropped,
    because they would split the numbered step across lines or hide part of the address; any
    other whitespace left inside the address becomes %20 so it still works when typed."""
    if not isinstance(url, str):
        return ''
    url = re.sub(r'[\x00-\x1f\x7f]+', '', url.strip())
    return re.sub(r'\s+', '%20', url.strip())


def download_line(url):
    url = _clean_link(url)
    if url:
        return 'Download FEFC-webOS.ipk from: ' + url
    return 'The LG file is not on the server yet. Open the guide page and check again.'


def tv_steps(download_url):
    """Short numbered lines for the on-TV dialog. One thought per line."""
    link = download_line(download_url)
    return [
        '1. On a computer on the same Wi-Fi, install webOS Dev Manager. The guide page has it.',
        '2. ' + link,
        '3. On this TV, open Developer Mode. Turn Key Server on. Write down the IP and the 6-character passphrase.',
        '4. In Dev Manager, add this TV. Press Install and choose the file you downloaded.',
        '5. Fully close FEFC and open it again.',
        '6. Before the Developer Mode clock runs out, open Developer Mode and extend the session.',
    ]


def tv_text(download_url):
    lines = [TITLE, '', LEAD, '']
    lines.extend(tv_steps(download_url))
    lines.extend(['', 'Full guide: ' + GUIDE_LABEL, 'If Install fails, turn Key Server off and on, then check the passphrase.'])
    return '\n'.join(lines)


def write_qr(path, url=GUIDE_URL):
    """PNG of the guide URL, with the FEFC mark baked in. Returns the path, or '' when the
    picture could not be made. Every failure, including qrdraw not being importable, is
    logged and gives ''; the caller shows the steps without a picture."""
    if not path or not isinstance(path, str):
        _log('guide QR: no output path')
        return ''
    try:
        try:
            from . import qrdraw
        except ImportError as first:
            try:
                import qrdraw
            except ImportError:
                raise first         # report the original import problem, not the fallback's
        qrdraw.write_qr_png(path, url, size=600, quiet=4)
        return path
    except Exception as exc:
        _log('guide QR not written to %s: %r' % (path, exc))
        return ''
