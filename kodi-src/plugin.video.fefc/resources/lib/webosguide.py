"""Couch-readable LG update steps. No xbmc import, so tests can read the same words the TV shows.

The install path is webOS Dev Manager on a computer. Homebrew Channel can install an IPK from a
URL on the TV only after the set is rooted. Rooting is a separate exploit and is not the path
for a normal Developer Mode install of org.xbmc.kodi.
"""
GUIDE_URL = 'https://collection.faneditfanclub.com/lg-update'
GUIDE_LABEL = 'collection.faneditfanclub.com/lg-update'
DEV_MANAGER_URL = 'https://github.com/webosbrew/dev-manager-desktop/releases/latest'
DIALOG_XML = 'DialogFEFCWebOSUpdate.xml'
TITLE = 'A new FEFC is ready'
LEAD = 'This TV cannot install it alone. Use a computer on the same Wi-Fi.'


def download_line(url):
    url = (url or '').strip()
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
    """PNG of the guide URL, with the FEFC mark baked in. Returns the path, or ''."""
    try:
        from . import qrdraw
    except ImportError:
        import qrdraw
    try:
        qrdraw.write_qr_png(path, url, size=600, quiet=4)
        return path
    except Exception:
        return ''
