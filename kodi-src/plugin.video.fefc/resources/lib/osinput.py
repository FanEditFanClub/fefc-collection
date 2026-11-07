"""Text entry with the Android / Fire TV system keyboard (Gboard voice typing, Fire TV keyboard + remote mic)
via the injected com.fefc.kodi.FefcInputActivity. Falls back to Kodi's own keyboard off-Android or if it fails to open."""
import os, time, random, urllib.parse
import xbmc, xbmcgui, xbmcvfs


def _paths():
    out = []
    for sp in ('special://home/', 'special://temp/', 'special://xbmc/'):
        try:
            t = xbmcvfs.translatePath(sp)
        except Exception:
            t = ''
        if t:
            out.append(t)
    return out


def _pkg_and_dirs():
    from . import inputplan
    paths = _paths()
    dirs = inputplan.files_dirs(paths)
    pkg = ''
    for p in paths:
        for name in ('com.fefc.kodi', 'org.xbmc.kodi'):
            if ('/' + name + '/') in (p or '') or ('/Android/data/' + name + '/') in (p or ''):
                pkg = name
                break
        if pkg:
            break
    if not pkg and dirs:
        for name in ('com.fefc.kodi', 'org.xbmc.kodi'):
            if any(('/' + name + '/') in d for d in dirs):
                pkg = name
                break
    return pkg or 'com.fefc.kodi', dirs


def _kodi(heading, default, numeric):
    if numeric:
        return xbmcgui.Dialog().input(heading, default, type=xbmcgui.INPUT_NUMERIC) or None
    kb = xbmc.Keyboard(default, heading)
    kb.doModal()
    return kb.getText() if kb.isConfirmed() else None


def _find(dirs, name):
    for d in dirs:
        p = os.path.join(d, name)
        if os.path.exists(p):
            return p
    return ''


def get_text(heading, default='', numeric=False):
    """Returns the entered text, or None if cancelled.
    On Android this launches FefcInputActivity (system IME) before any catalogue work.
    If that activity never acks, the Kodi keyboard is used and that fallback is logged.
    Off Android the Kodi keyboard is the real keyboard, not a failed IME."""
    from . import inputplan
    android = bool(xbmc.getCondVisibility('System.Platform.Android'))
    pkg, dirs = _pkg_and_dirs()
    if inputplan.input_plan(android, dirs if android else [], False, 0) == 'kodi':
        return _kodi(heading, default, numeric)
    tok = '%x%04x' % (int(time.time()), random.randint(0, 0xffff))
    uri = 'fefcinput://input?' + urllib.parse.urlencode({'tok': tok, 'h': heading, 'd': default, 'num': '1' if numeric else '0'})
    xbmc.executebuiltin('StartAndroidActivity(%s,android.intent.action.VIEW,,"%s",,,,,"com.fefc.kodi.FefcInputActivity")' % (pkg, uri))
    mon = xbmc.Monitor()
    t0 = time.time()
    ack_name = 'fefc-input-%s.ack' % tok
    res_name = 'fefc-input-%s.txt' % tok
    try:
        while not mon.abortRequested():
            elapsed = time.time() - t0
            res = _find(dirs, res_name)
            ack = _find(dirs, ack_name)
            if res:
                with open(res, 'r', encoding='utf-8', errors='ignore') as f:
                    r = f.read()
                return r[3:] if r.startswith('OK\n') else None
            plan = inputplan.input_plan(True, dirs, bool(ack), elapsed)
            if plan == 'fallback_kodi':
                xbmc.log('[plugin.video.fefc] system keyboard did not open; using Kodi keyboard', xbmc.LOGINFO)
                try:
                    xbmcgui.Dialog().notification('FEFC', 'System keyboard did not open. Using the Kodi keyboard.', xbmcgui.NOTIFICATION_INFO, 4000, sound=False)
                except Exception:
                    pass
                return _kodi(heading, default, numeric)
            if elapsed > 600:
                return None
            mon.waitForAbort(0.1)
    finally:
        for d in dirs:
            for name in (res_name, ack_name):
                try:
                    os.remove(os.path.join(d, name))
                except Exception:
                    pass
    return None
