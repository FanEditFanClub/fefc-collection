"""Text entry with the Android / Fire TV system keyboard (Gboard voice typing, Fire TV keyboard + remote mic)
via the injected com.fefc.kodi.FefcInputActivity. Falls back to Kodi's own keyboard off-Android or if it fails to open."""
import os, time, random, urllib.parse
import xbmc, xbmcgui, xbmcvfs


def _pkg_dir():
    for sp in ('special://home/', 'special://temp/', 'special://xbmc/'):
        try:
            t = xbmcvfs.translatePath(sp)
        except Exception:
            t = ''
        for pkg in ('com.fefc.kodi', 'org.xbmc.kodi'):
            m = '/Android/data/%s/files' % pkg
            i = t.find(m)
            if i >= 0:
                return pkg, t[:i + len(m)]
    return '', ''


def _kodi(heading, default, numeric):
    if numeric:
        return xbmcgui.Dialog().input(heading, default, type=xbmcgui.INPUT_NUMERIC) or None
    kb = xbmc.Keyboard(default, heading)
    kb.doModal()
    return kb.getText() if kb.isConfirmed() else None


def get_text(heading, default='', numeric=False):
    """Returns the entered text, or None if cancelled."""
    pkg, d = _pkg_dir()
    if not pkg or not xbmc.getCondVisibility('System.Platform.Android'):
        return _kodi(heading, default, numeric)
    tok = '%x%04x' % (int(time.time()), random.randint(0, 0xffff))
    res, ack = os.path.join(d, 'fefc-input-%s.txt' % tok), os.path.join(d, 'fefc-input-%s.ack' % tok)
    uri = 'fefcinput://input?' + urllib.parse.urlencode({'tok': tok, 'h': heading, 'd': default, 'num': '1' if numeric else '0'})
    xbmc.executebuiltin('StartAndroidActivity(%s,android.intent.action.VIEW,,%s,,,,com.fefc.kodi.FefcInputActivity)' % (pkg, uri))
    mon = xbmc.Monitor()
    t0, out = time.time(), None
    try:
        while not mon.abortRequested():
            if os.path.exists(res):
                with open(res, 'r', encoding='utf-8', errors='ignore') as f:
                    r = f.read()
                out = r[3:] if r.startswith('OK\n') else None
                return out
            if not os.path.exists(ack) and time.time() - t0 > 4:
                return _kodi(heading, default, numeric)   # activity missing (older build) -> Kodi keyboard
            if time.time() - t0 > 600:
                return None
            mon.waitForAbort(0.2)
    finally:
        for p in (res, ack):
            try:
                os.remove(p)
            except Exception:
                pass
    return None
