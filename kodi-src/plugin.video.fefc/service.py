# -*- coding: utf-8 -*-
"""FEFC startup service. Only acts inside the branded FEFC app (detected by the bundled intro video); on plain Kodi it does nothing.
 - adds the "Fan Edit Fan Club" file source (sources.xml) when missing (read by Kodi at its next start)
 - plays the FEFC intro once per launch, then opens the FEFC add-on as the home screen
"""
import json
import os
import re
import threading
import time
import urllib.request
import xbmc
import xbmcaddon
import xbmcgui
import xbmcvfs

ADDON = xbmcaddon.Addon()
INTRO = 'special://xbmc/media/fefc-intro.mp4'
SRC_URL = 'https://fefc-collection.pages.dev/kodi/'
SRC_XML = '''<sources>
    <programs><default pathversion="1"></default></programs>
    <video><default pathversion="1"></default><source><name>Fan Edit Fan Club</name><path pathversion="1">%(u)s</path><allowsharing>true</allowsharing></source></video>
    <music><default pathversion="1"></default></music>
    <pictures><default pathversion="1"></default></pictures>
    <files><default pathversion="1"></default><source><name>Fan Edit Fan Club</name><path pathversion="1">%(u)s</path><allowsharing>true</allowsharing></source></files>
</sources>
''' % {'u': SRC_URL}


def log(msg):
    xbmc.log('[plugin.video.fefc/service] %s' % msg, xbmc.LOGINFO)


def ensure_source():
    try:
        p = xbmcvfs.translatePath('special://profile/sources.xml')
        cur = ''
        if os.path.exists(p):
            with open(p, 'r', encoding='utf-8', errors='ignore') as f:
                cur = f.read()
        if 'fefc-collection.pages.dev/kodi' in cur:
            return
        if '<source>' in cur:  # the user already has sources of their own: leave them alone
            return
        with open(p, 'w', encoding='utf-8') as f:
            f.write(SRC_XML)
        log('wrote default FEFC file source')
    except Exception as e:  # never break startup
        log('sources.xml: %s' % e)


VERSION_URL = 'https://fefc-collection.pages.dev/kodi-app/version.json'
BUILD_FILE = 'special://xbmc/fefc-build.json'


def installed_build():
    """fefc-build.json from the APK this process was started from.

    A record written before the user confirms install is not the installed build.
    After an update, Android can keep this process alive, so this file can still
    be the previous build. read_installed_identity() reads the package on disk.
    """
    try:
        with xbmcvfs.File(BUILD_FILE) as f:
            return json.loads(f.read())
    except Exception:
        return None


def read_installed_identity(pkg):
    """fefc-build.json inside the APK PackageManager has installed for pkg.

    `pm path` points at the new base.apk even while this process is still the old
    one. dumpsys versionCode is the fallback (stock Kodi code plus the FEFC build).
    """
    import subprocess
    from resources.lib.updateflow import (
        build_from_version_code, parse_dumpsys_version_code, parse_pm_path, read_apk_identity)
    # Fast path: the APK path is cached, and its mtime has not changed,
    # so the installed build cannot have changed either. This avoids
    # the `pm path` subprocess (up to 4 s) on every tick.
    cached = _installed_cache.get('path')
    if cached and os.path.exists(cached):
        try:
            mtime = os.path.getmtime(cached)
        except OSError:
            mtime = None
        if mtime is not None and mtime == _installed_cache.get('mtime') and _installed_cache.get('ident'):
            return dict(_installed_cache['ident'])
    text = ''
    try:
        text = subprocess.check_output(['pm', 'path', pkg], stderr=subprocess.DEVNULL, timeout=4, text=True)
    except Exception:
        text = ''
    path = parse_pm_path(text)
    if path:
        ident = read_apk_identity(path)
        if ident and int(ident.get('build') or 0):
            if not ident.get('pkg'):
                ident['pkg'] = pkg
            try:
                _installed_cache['path'] = path
                _installed_cache['mtime'] = os.path.getmtime(path)
                _installed_cache['ident'] = dict(ident)
            except OSError:
                pass
            return ident
    dump = ''
    try:
        dump = subprocess.check_output(['dumpsys', 'package', pkg], stderr=subprocess.DEVNULL, timeout=4, text=True)
    except Exception:
        dump = ''
    code = parse_dumpsys_version_code(dump)
    build = build_from_version_code(code)
    if not build:
        return None
    running = installed_build() or {}
    return {'pkg': pkg, 'build': build, 'version': str(running.get('version') or '')}


# One shared busy flag for background work that must never overlap
# itself or stall the tick loop (install check, background update
# check, nav-sound reapply). They all touch home-window properties,
# so one flag — not one per job — is what serialises them.
_bg_lock = threading.Lock()
_bg_busy = False
# Cached installed-APK identity: path + mtime + identity. Re-checked
# only when the APK file's mtime changes (see read_installed_identity).
_installed_cache = {'path': None, 'mtime': None, 'ident': None}


_restarted_for_build = {'build': 0}


def maybe_refresh_installed():
    """If the installed APK is newer than this process, clear the update badge and restart.

    The Home button otherwise keeps 'Update available' until the user force-quits,
    because the check keeps reading the build baked into the running process.
    """
    from resources.lib.updateflow import resume_plan
    running = installed_build()
    if not running:
        return
    try:
        live = read_installed_identity(my_package())
    except Exception as e:
        log('installed identity: %s' % e)
        return
    try:
        live_build = int((live or {}).get('build') or 0)
        running_build = int(running.get('build') or 0)
    except (TypeError, ValueError):
        return
    if not live or live_build <= running_build:
        return
    published = None
    try:
        req = urllib.request.Request(VERSION_URL + '?t=%d' % int(time.time()), headers={'User-Agent': 'FEFC-Kodi'})
        published = json.loads(urllib.request.urlopen(req, timeout=15).read().decode('utf-8'))
    except Exception as e:
        log('resume update check: %s' % e)
    plan = resume_plan(running, live, published)
    home = xbmcgui.Window(10000)
    if plan.get('clear_available'):
        home.clearProperty('FEFC.UpdateAvail')
        home.clearProperty('FEFC.UpdatePrompt')
    if plan.get('label') == 'up_to_date':
        set_update_state(plan.get('installed'), published, False)
    elif plan.get('label') == 'available':
        set_update_state(plan.get('installed'), published, True)
    if plan.get('restart') and _restarted_for_build['build'] != live_build:
        _restarted_for_build['build'] = live_build
        log('installed build %s is newer than running %s; restarting' % (live_build, running_build))
        xbmc.executebuiltin('RestartApp')


def version_label(b):
    """'0.3 Beta (build 4)' for the installed / published FEFC app."""
    if not b:
        return ''
    v = str(b.get('version') or '').strip()
    return ('%s (build %s)' % (v, b.get('build'))) if v else 'build %s' % b.get('build')


def whats_new(new, cur=None, limit=14):
    """'What's new' text for the versions between the installed one (exclusive) and the new one, from version.json's changelog."""
    cl = [v for v in (new.get('changelog') or []) if isinstance(v, dict) and v.get('notes')]
    if not cl:
        return ''
    have = str((cur or {}).get('version') or '').strip()
    names = [str(v.get('version') or '') for v in cl]
    upto = names.index(have) if have in names else 1   # unknown/older install: show the newest version
    if upto == 0:
        upto = 1                                       # same version, newer build: show its notes again
    out = []
    for v in cl[:upto]:
        out.append("What's new in %s:" % v.get('version'))
        out.extend(u'\u2022 ' + str(n) for n in v['notes'])
        out.append('')
    lines = out[:limit * 3]
    return '\n'.join(lines).strip()


def _updating():
    return bool(xbmcgui.Window(10000).getProperty('FEFC.Updating'))


def _run_in_background(fn, *args, **kwargs):
    """Run fn on a daemon thread unless background work is already running.

    Returns True when the thread was started, False when the work was
    skipped because the flag was busy. The flag is cleared in a finally
    so a raising job can never wedge the loop. Callers that need a GUI
    dialog must NOT use this — xbmcgui calls stay on the main thread
    (see Item 66); background check_update() calls are prompt=False only.
    """
    global _bg_busy
    with _bg_lock:
        if _bg_busy:
            log('background work already running; skipping %s' % fn.__name__)
            return False
        _bg_busy = True

    def _wrap():
        global _bg_busy
        try:
            fn(*args, **kwargs)
        except Exception as e:
            log('background %s: %s' % (fn.__name__, e))
        finally:
            with _bg_lock:
                _bg_busy = False

    threading.Thread(target=_wrap, daemon=True).start()
    return True


def install_update(new, monitor=None):
    """One non-interruptible flow: close every dialog, download with resume + automatic retries (one flow at a time,
    guarded by FEFC.Updating so no update popup or second download can start meanwhile), verify size + sha256,
    then hand the APK to Android's package installer."""
    import hashlib
    home = xbmcgui.Window(10000)
    if _updating():
        log('update already in progress')
        return
    if threading.current_thread() is not threading.main_thread():
        # The install popup is modal xbmcgui work and must stay on the
        # main thread. Background checks must never reach here — they
        # call check_update(prompt=False), which returns before install.
        log('install_update called off the main thread; refusing')
        return
    home.setProperty('FEFC.Updating', '1')
    try:
        _install_update(new, monitor)
    finally:
        home.clearProperty('FEFC.Updating')


# The package and the external-files dir never change during a process
# lifetime, but my_package() runs translatePath on three special://
# paths plus string scans on every call. Cache both, lazily, on first use.
_package_cache = None
_ext_files_dir_cache = None
_ext_files_dir_computed = False



def my_package():
    """Android package of this install: the app's own data paths name it (com.fefc.kodi vs org.xbmc.kodi), so the
    updater always downloads the APK for the package that is actually running; fefc-build.json is the fallback."""
    global _package_cache
    if _package_cache is not None:
        return _package_cache
    for sp in ('special://xbmc/', 'special://home/', 'special://temp/'):
        try:
            t = xbmcvfs.translatePath(sp)
        except Exception:
            t = ''
        for pkg in ('com.fefc.kodi', 'org.xbmc.kodi'):
            if '/%s/' % pkg in t:
                _package_cache = pkg
                return pkg
    _package_cache = str((installed_build() or {}).get('pkg') or 'org.xbmc.kodi')
    return _package_cache


def _for_my_package(new):
    """version.json lists one APK per package id. com.fefc.kodi never falls back to the org.xbmc.kodi APK."""
    from resources.lib.updateflow import package_download
    return package_download(new, my_package())


NEW_FILES_FEED = 'https://fefc-collection.pages.dev/kodi-app/new-files.json'


def is_phone_pkg():
    """com.fefc.kodi = phones/tablets (OS notifications). org.xbmc.kodi = Fire TV (keeps the in-app popup)."""
    return my_package() == 'com.fefc.kodi'


def _android_ext_files_dir():
    """Android/data/<pkg>/files — same folder Java FefcNotifyActivity uses via getExternalFilesDir(null)."""
    global _ext_files_dir_cache, _ext_files_dir_computed
    if _ext_files_dir_computed:
        return _ext_files_dir_cache
    result = ''
    for sp in ('special://home/', 'special://temp/', 'special://xbmc/'):
        try:
            t = xbmcvfs.translatePath(sp)
        except Exception:
            t = ''
        if not t:
            continue
        for pkg in (my_package(), 'com.fefc.kodi', 'org.xbmc.kodi'):
            marker = '/Android/data/%s/files' % pkg
            i = t.find(marker)
            if i >= 0:
                result = t[:i + len(marker)]
                break
        if result:
            break
    _ext_files_dir_cache = result
    _ext_files_dir_computed = True
    return result


def sync_notify_prefs():
    """Mirror Settings toggles into a JSON file (defaults ON). Addon settings already persist across APK updates."""
    if not is_phone_pkg():
        return
    d = _android_ext_files_dir()
    if not d:
        return
    try:
        os.makedirs(d, exist_ok=True)
        prefs = {
            'notify_app_update': ADDON.getSetting('notify_app_update') != 'false',
            'notify_new_files': ADDON.getSetting('notify_new_files') != 'false',
        }
        with open(os.path.join(d, 'fefc-notify-prefs.json'), 'w', encoding='utf-8') as f:
            json.dump(prefs, f)
    except Exception as e:
        log('notify prefs: %s' % e)


def android_os_notify(kind, title, text, nid):
    """Post a true Android shade notification via the branded APK's FefcNotifyActivity (com.fefc.kodi only)."""
    if not is_phone_pkg():
        return
    try:
        from urllib.parse import quote
        data = 'fefcnotify://notify?kind=%s&title=%s&text=%s&nid=%s' % (
            quote(str(kind), safe=''), quote(str(title), safe=''),
            quote(str(text), safe=''), quote(str(nid), safe=''))
        # package, intent, dataType, dataURI, flags, extras, action, category, className
        xbmc.executebuiltin(
            'StartAndroidActivity(com.fefc.kodi,android.intent.action.VIEW,,%s,,,,com.fefc.kodi.FefcNotifyActivity)'
            % data)
        log('os notify %s: %s' % (kind, title))
    except Exception as e:
        log('os notify failed: %s' % e)


def notify_perm_state():
    d = _android_ext_files_dir()
    try:
        with open(os.path.join(d, 'fefc-notify-perm.txt'), 'r') as f:
            return f.read().strip()
    except Exception:
        return ''


def maybe_ask_notify_perm(asked):
    """0.3.22: ask for POST_NOTIFICATIONS once per launch until granted, but only after the intro, on Home
    (0.3.21 asked at service start while the intro played, and the no-history activity dropped the dialog)."""
    if asked[0] or not is_phone_pkg():
        return
    if xbmcgui.Window(10000).getProperty('FEFC.Ready') != '1' or not xbmc.getCondVisibility('Window.IsActive(home)'):
        return
    asked[0] = True
    if notify_perm_state() == 'granted':
        return
    if ADDON.getSetting('notify_app_update') != 'true' and ADDON.getSetting('notify_new_files') != 'true':
        return
    xbmc.executebuiltin('StartAndroidActivity(%s,android.intent.action.VIEW,,"fefcnotify://perm",,,,,"com.fefc.kodi.FefcNotifyActivity")' % my_package())


def consume_pending_nav(monitor=None):
    """Notification tap writes fefc-pending-nav.txt; open New Arrivals or the updater."""
    if not is_phone_pkg():
        return
    d = _android_ext_files_dir()
    if not d:
        return
    path = os.path.join(d, 'fefc-pending-nav.txt')
    if not os.path.exists(path):
        return
    try:
        with open(path, 'r', encoding='utf-8', errors='ignore') as f:
            kind = (f.read() or '').strip().lower()
        try:
            os.remove(path)
        except OSError:
            pass
    except Exception as e:
        log('pending nav read: %s' % e)
        return
    if kind in ('files', 'recent', 'newfiles', 'new_files'):
        xbmc.executebuiltin('ActivateWindow(Videos,plugin://plugin.video.fefc/?action=recent,return)')
    elif kind in ('update', 'updater', 'app_update'):
        # Tap means "open the updater", not "install now": show the
        # what's-new + Install / Later prompt and install only on Install.
        check_update(manual=True, prompt=True, from_tap=True, monitor=monitor)


def poll_new_files_feed():
    """When the fan-edit notifier posts, it publishes new-files.json; show one OS notification per new id."""
    if not is_phone_pkg():
        return
    if ADDON.getSetting('notify_new_files') == 'false':
        return
    try:
        feed = _get_json(NEW_FILES_FEED + '?t=%d' % int(time.time()), timeout=12)
    except Exception as e:
        log('new-files feed: %s' % e)
        return
    fid = str((feed or {}).get('id') or '').strip()
    if not fid:
        return
    prev = ADDON.getSetting('last_new_files_id')
    if prev == fid:
        return
    if not prev:
        # First poll after install/update: remember the current feed id without blasting a stale notification.
        ADDON.setSetting('last_new_files_id', fid)
        return
    count = int(feed.get('count') or 0)
    title = str(feed.get('title') or '').strip()
    if not title:
        label = 'New File' if count == 1 else 'New Files'
        verb = 'has been added' if count == 1 else 'have been added'
        title = '%s %s %s to The Fan Edit Fan Club Collection' % (count or '', label, verb)
        title = title.strip()
    android_os_notify('files', title, 'Tap to open New Arrivals', fid)
    ADDON.setSetting('last_new_files_id', fid)




def _host_flags():
    """Visibility labels from this Kodi. probed stays false when the labels cannot be read,
    and the installer then stays on the Android path."""
    flags = {'android': False, 'darwin': False, 'osx': False, 'webos': False,
             'machine': '', 'build': '', 'os': '', 'xbmc_path': '', 'probed': False}
    try:
        flags['android'] = bool(xbmc.getCondVisibility('System.Platform.Android'))
        flags['darwin'] = bool(xbmc.getCondVisibility('System.Platform.Darwin'))
        flags['osx'] = bool(xbmc.getCondVisibility('System.Platform.OSX'))
        flags['webos'] = bool(xbmc.getCondVisibility('System.Platform.WebOS'))
        flags['probed'] = True
    except Exception:
        return flags
    try:
        flags['build'] = xbmc.getInfoLabel('System.BuildVersion') or ''
        flags['os'] = xbmc.getInfoLabel('System.OsVersionInfo') or ''
    except Exception:
        pass
    try:
        flags['xbmc_path'] = xbmcvfs.translatePath('special://xbmc/') or ''
    except Exception:
        pass
    try:
        import platform as _py
        flags['machine'] = _py.machine()
    except Exception:
        pass
    return flags


def _host_platform():
    from resources.lib.updateflow import classify_platform
    flags = _host_flags()
    if not flags.get('probed'):
        return 'android'
    return classify_platform(flags)


def _host_arch(platform):
    from resources.lib.updateflow import platform_arch
    machine = ''
    try:
        import platform as _py
        machine = _py.machine()
    except Exception:
        pass
    return platform_arch(platform, machine)


def _show_webos_guide(new, rec):
    """Full-screen skin dialog with the Dev Manager steps. A text page is the fallback."""
    try:
        from resources.lib import webosguide
    except Exception as e:
        log('webos guide: %s' % e)
        return
    url = rec.get('url') if rec and rec.get('available') else ''
    body = '\n\n'.join(webosguide.tv_steps(url))
    foot = 'If Install fails, turn Key Server off and on, then check the passphrase.'
    skin = xbmcvfs.translatePath('special://skin')
    qr = ''
    try:
        qr = webosguide.write_qr(xbmcvfs.translatePath('special://temp/fefc-lg-qr.png')) or ''
    except Exception as e:
        log('webos guide qr: %s' % e)
        qr = ''
    try:
        dlg = _WebOSGuide(webosguide.DIALOG_XML, skin, 'default', '1080i')
        dlg.step_text = body
        dlg.foot_text = foot
        dlg.qr_path = qr
        dlg.doModal()
        del dlg
        return
    except Exception as e:
        log('webos guide dialog: %s' % e)
    xbmcgui.Dialog().textviewer(webosguide.TITLE, webosguide.tv_text(url))


class _WebOSGuide(xbmcgui.WindowXMLDialog):
    """DialogFEFCWebOSUpdate.xml in skin.fefc. Close on the button or Back."""

    def onInit(self):
        try:
            self.getControl(7000).setLabel(self._line(getattr(self, 'title_text', '') or 'A new FEFC is ready'))
        except Exception:
            pass
        try:
            self.getControl(7001).setText(getattr(self, 'step_text', '') or '')
        except Exception:
            pass
        try:
            self.getControl(7004).setLabel(getattr(self, 'foot_text', '') or '')
        except Exception:
            pass
        qr = getattr(self, 'qr_path', '') or ''
        try:
            if qr:
                self.getControl(7002).setImage(qr)
        except Exception:
            pass
        try:
            self.getControl(7003).setLabel('https://collection.faneditfanclub.com/lg-update')
        except Exception:
            pass
        try:
            self.setFocusId(7003)
        except Exception:
            pass

    def _line(self, text):
        return text

    def onClick(self, controlId):
        if controlId == 7003:
            from resources.lib import shorturl
            shorturl.open_browser(xbmc.executebuiltin, 'https://collection.faneditfanclub.com/lg-update')
            return
        if controlId == 9000:
            self.close()

    def onAction(self, action):
        aid = action.getId()
        if aid in (10, 92, 110):
            self.close()


def _install_platform_update(new, plat, monitor=None):
    """Download the macOS package named in version.json and hand it to the OS.
    webOS shows the Dev Manager guide instead of trying to install from inside the app.
    Android never reaches this. A missing platforms entry does not download the APK."""
    if plat == 'webos':
        from resources.lib.updateflow import platform_download
        _show_webos_guide(new, platform_download(new, plat, _host_arch(plat)))
        return
    import hashlib
    import subprocess
    from resources.lib.updateflow import (platform_download, platform_install_message,
                                           platform_unavailable_message, allowed_update_url)
    rec = platform_download(new, plat, _host_arch(plat))
    if not rec.get('available') or not allowed_update_url(rec.get('url')):
        _cue('error')
        xbmcgui.Dialog().ok('FEFC update', platform_unavailable_message(plat, version_label(new)))
        return
    # Sanitise the manifest filename before joining it to the temp dir: a
    # '/' or '..' in it must not escape special://temp/.
    _default_name = 'FEFC-macOS-update.dmg' if plat == 'macos' else 'FEFC-webOS-update.ipk'
    _raw_name = rec.get('filename') or _default_name
    name = ''.join(c for c in os.path.basename(str(_raw_name)) if c.isalnum() or c in ('.', '-', '_'))
    if not name or name in ('.', '..') or name.startswith('.'):
        name = _default_name
    dst = xbmcvfs.translatePath('special://temp/' + name)
    part = dst + '.part'
    url, want, sha = rec['url'], rec.get('size') or 0, rec.get('sha256') or ''
    ok = False
    _cue('start')
    log('downloading %s' % version_label(new))
    mon = monitor if monitor is not None else xbmc.Monitor()
    # Same centered UpdatePopup as Android (progress, Back hides it, Retry,
    # manual download links), not the old corner background progress bar.
    from resources.lib.updatepopup import UpdatePopup
    from resources.lib.updateflow import manual_downloads
    popup = UpdatePopup(version_label(new), manual_downloads(new))
    popup.render('downloading', 0, 0, want or 0)
    finished = {'done': False}

    def work():
        nonlocal ok
        tries = 0
        while tries < 8 and not ok and not mon.abortRequested():
            tries += 1
            try:
                # Keep the partial download across retries and resume it.
                # Only a checksum failure deletes it (corrupt data cannot
                # be resumed); a short download is retried from where it stopped.
                have = os.path.getsize(part) if os.path.exists(part) else 0
                if want and have >= want:
                    have = 0
                hdr = {'User-Agent': 'FEFC-Kodi'}
                if have:
                    hdr['Range'] = 'bytes=%d-' % have
                req = urllib.request.Request(url, headers=hdr)
                with urllib.request.urlopen(req, timeout=60) as r:
                    if have and r.status != 206:
                        have = 0
                    total = want or (have + int(r.headers.get('Content-Length') or 0))
                    with open(part, 'ab' if have else 'wb') as f:
                        done = have
                        while True:
                            if mon.abortRequested():
                                raise RuntimeError('aborted')
                            chunk = r.read(256 * 1024)
                            if not chunk:
                                break
                            f.write(chunk)
                            done += len(chunk)
                            if total:
                                popup.render('downloading', min(99, int(done * 100 / total)), done, total)
                size = os.path.getsize(part)
                if want and size < want:
                    raise RuntimeError('short download')
                log('checking the download')
                popup.render('verifying', 100, size, want or size)
                h = hashlib.sha256()
                with open(part, 'rb') as f:
                    for c in iter(lambda: f.read(1 << 20), b''):
                        h.update(c)
                if h.hexdigest() != sha:
                    try:
                        os.remove(part)
                    except OSError:
                        pass
                    raise RuntimeError('checksum mismatch')
                os.replace(part, dst)
                ok = True
            except Exception as e:
                log('platform update attempt %d failed: %s' % (tries, e))
                if mon.abortRequested():
                    break
                popup.render('downloading', 0, 0, want or 0, 'Connection problem, retrying (%d/8)...' % tries)
                if mon.waitForAbort(min(30, 3 * tries)):
                    break
        finished['done'] = True
        try:
            popup.close()
        except Exception:
            pass

    threading.Thread(target=work, daemon=True).start()
    while not finished['done'] and not mon.abortRequested():
        if popup.dismissed:
            if xbmcgui.Window(10000).getProperty('FEFC.UpdateReveal') == '1':
                xbmcgui.Window(10000).clearProperty('FEFC.UpdateReveal')
                popup.dismissed = False
            else:
                if mon.waitForAbort(0.2):
                    break
                continue
        popup.doModal()
    if mon.abortRequested():
        try:
            popup.close()
        except Exception:
            pass
        return
    if not ok:
        _cue('error')
        popup.render('failed', 0, 0, want or 0, 'The download did not finish after several tries. Check the connection and pick Retry. It continues where it stopped.')
        popup.doModal()
        if popup.retry:
            _install_platform_update(new, plat, mon)
        return
    try:
        popup.render('ready', 100, os.path.getsize(dst), want or os.path.getsize(dst))
        popup.show()
        xbmc.sleep(700)
        popup.close()
    except Exception:
        pass
    opened = False
    if plat == 'macos':
        try:
            opened = subprocess.call(['open', dst]) == 0
        except Exception as e:
            log('open dmg: %s' % e)
    # webOS: no luna-send call. The TV installs from a URL it can fetch, not
    # from this device's local path, so a local-path install could never work.
    # platform_install_message tells the user the Dev Manager steps instead.
    _cue('verified')
    xbmcgui.Dialog().ok('FEFC update', platform_install_message(plat, dst, opened, rec.get('abi') or '', url=rec.get('url') or ''))


def _install_update(new, monitor=None):
    mon = monitor if monitor is not None else xbmc.Monitor()
    plat = _host_platform()
    if plat != 'android':
        _install_platform_update(new, plat, mon)
        return
    import hashlib
    url, want, sha = _for_my_package(new)
    if not url:
        _cue('error')
        xbmcgui.Dialog().ok('FEFC update', 'No update package is published for this app.')
        return
    dst = xbmcvfs.translatePath('special://temp/FEFC-Kodi-update.apk')
    part = dst + '.part'
    ok = False
    # already downloaded and verified earlier?
    if os.path.exists(dst) and sha:
        h = hashlib.sha256()
        with open(dst, 'rb') as f:
            for c in iter(lambda: f.read(1 << 20), b''):
                h.update(c)
        ok = h.hexdigest() == sha
    if not ok:
        try:
            os.remove(dst)
        except OSError:
            pass
        _cue('start')
        from resources.lib.updatepopup import UpdatePopup
        from resources.lib.updateflow import manual_downloads
        popup = UpdatePopup(version_label(new), manual_downloads(new))
        popup.render('downloading', 0, 0, want or 0)
        finished = {'done': False}

        def work():
            nonlocal ok
            tries = 0
            while tries < 8 and not ok and not mon.abortRequested():
                tries += 1
                try:
                    have = os.path.getsize(part) if os.path.exists(part) else 0
                    if want and have >= want:
                        have = 0
                    hdr = {'User-Agent': 'FEFC-Kodi'}
                    if have:
                        hdr['Range'] = 'bytes=%d-' % have
                    with urllib.request.urlopen(urllib.request.Request(url, headers=hdr), timeout=30) as r:
                        if have and r.status != 206:
                            have = 0
                        total = want or (have + int(r.headers.get('Content-Length') or 0))
                        with open(part, 'ab' if have else 'wb') as f:
                            done = have
                            while True:
                                if mon.abortRequested():
                                    raise RuntimeError('aborted')
                                chunk = r.read(256 * 1024)
                                if not chunk:
                                    break
                                f.write(chunk)
                                done += len(chunk)
                                if total:
                                    pct = min(99, int(done * 100 / total))
                                    popup.render('downloading', pct, done, total)
                    size = os.path.getsize(part)
                    if want and size < want:
                        raise RuntimeError('short download %d/%d' % (size, want))
                    if sha:
                        popup.render('verifying', 100, size, want or size)
                        h = hashlib.sha256()
                        with open(part, 'rb') as f:
                            for c in iter(lambda: f.read(1 << 20), b''):
                                h.update(c)
                        if h.hexdigest() != sha:
                            os.remove(part)
                            raise RuntimeError('checksum mismatch')
                    os.replace(part, dst)
                    ok = True
                except Exception as e:
                    log('update download attempt %d failed: %s' % (tries, e))
                    if mon.abortRequested():
                        break
                    popup.render('downloading', 0, 0, want or 0, 'Connection problem, retrying (%d/8)...' % tries)
                    # Abort-aware sleep: wakes at once on shutdown instead
                    # of sleeping out the full back-off.
                    if mon.waitForAbort(min(30, 3 * tries)):
                        break
            finished['done'] = True
            try:
                popup.close()
            except Exception:
                pass

        threading.Thread(target=work, daemon=True).start()
        while not finished['done'] and not mon.abortRequested():
            if popup.dismissed:
                if xbmcgui.Window(10000).getProperty('FEFC.UpdateReveal') == '1':
                    xbmcgui.Window(10000).clearProperty('FEFC.UpdateReveal')
                    popup.dismissed = False
                else:
                    if mon.waitForAbort(0.2):
                        break
                    continue
            popup.doModal()
        if mon.abortRequested():
            # Shutting down: no 'failed' render, no Retry offer, no
            # installer. install_update()'s finally clears FEFC.Updating.
            try:
                popup.close()
            except Exception:
                pass
            return
    if not ok:
        _cue('error')
        popup.render('failed', 0, 0, want or 0, 'The download did not finish after several tries. Check the connection and pick Retry. It continues where it stopped.')
        popup.doModal()
        if popup.retry:
            _install_update(new, monitor)
        return
    from resources.lib.updateflow import read_apk_identity, handoff_ok, installer_builtin, installer_package_for
    identity = read_apk_identity(dst)
    cur = installed_build() or {}
    pkg = my_package()
    if not handoff_ok(identity, pkg, cur.get('build'), True):
        _cue('error')
        xbmcgui.Dialog().ok('FEFC update', 'The downloaded package does not match this app, so it was not opened. Nothing was installed.')
        return
    uri = None
    for marker, name in (('/files/', 'ext'), ('/cache/', 'extcache')):
        if '/Android/data/' in dst and marker in dst:
            uri = 'content://%s.fefcupdate/%s/%s' % (pkg, name, dst.split(marker, 1)[1]); break
    if uri is None:
        for marker, name in (('/files/', 'int'), ('/cache/', 'cache')):
            if '/%s/' % pkg in dst and marker in dst:
                uri = 'content://%s.fefcupdate/%s/%s' % (pkg, name, dst.split(marker, 1)[1]); break
    if uri is None:
        # No '#' here: '#' starts the URI fragment under Uri.parse, so the
        # old 'content://%s.file/#' % pkg + dst put the whole path in the
        # fragment and FileProvider could never resolve it.
        uri = 'content://%s.file%s' % (pkg, dst)
    builtin = installer_builtin(uri, installer_package_for(pkg))
    if not builtin:
        _cue('error')
        xbmcgui.Dialog().ok('FEFC update', 'The installer could not be opened.')
        return
    _cue('verified')
    try:
        popup.render('ready', 100, os.path.getsize(dst), want or os.path.getsize(dst))
        popup.show()
        xbmc.sleep(700)
        popup.close()
    except Exception:
        pass
    log('launching installer: %s' % builtin)
    # Do not close every dialog (that flashed the screen black) and do not record success
    # before Android's own confirmation. The running process stays the old build until a full restart.
    xbmc.executebuiltin(builtin)
    xbmcgui.Dialog().ok('FEFC update', 'Android will ask you to confirm the install. When it finishes, fully close FEFC and open it again. This screen does not switch to the new version by itself.')


def set_select_action():
    """Selecting a video opens its details page (Play is a button there) instead of starting playback: Kodi's
    'Select action' for videos = Show information (3). Also set as the build default; this covers updated installs."""
    try:
        r = json.loads(xbmc.executeJSONRPC(json.dumps({'jsonrpc': '2.0', 'id': 1, 'method': 'Settings.GetSettingValue',
                                                       'params': {'setting': 'myvideos.selectaction'}})))
        if (r.get('result') or {}).get('value') != 3:
            xbmc.executeJSONRPC(json.dumps({'jsonrpc': '2.0', 'id': 2, 'method': 'Settings.SetSettingValue',
                                            'params': {'setting': 'myvideos.selectaction', 'value': 3}}))
            log('select action set to details page')
    except Exception as e:
        log('select action: %s' % e)


def _cue(kind):
    """One short packaged UI sound. Sound Off and a missing file both stay silent. Never loops."""
    if xbmcgui.Window(10000).getProperty('FEFC.SoundOff') == '1':
        return
    name = {'start': 'click.wav', 'verified': 'open.wav', 'error': 'back.wav'}.get(kind)
    if not name:
        return
    paths = [xbmcvfs.translatePath('special://xbmc/addons/resource.uisounds.fefc/resources/' + name),
             xbmcvfs.translatePath('special://home/addons/resource.uisounds.fefc/resources/' + name)]
    if kind == 'error':
        paths.append(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'resources', 'ui-back.wav'))
    for p in paths:
        try:
            if p and os.path.exists(p):
                xbmc.playSFX(p, False)
                return
        except Exception:
            return


def set_update_state(cur, new=None, avail=False, state=None):
    """Home Update tile. A failed check is never labelled Up to date."""
    from resources.lib.updateflow import label_for
    home = xbmcgui.Window(10000)
    if state in ('checking', 'failed'):
        home.clearProperty('FEFC.UpdateAvail')
        home.setProperty('FEFC.UpdateLabel', label_for(state))
        return
    if avail and new:
        home.setProperty('FEFC.UpdateAvail', '1')
        home.setProperty('FEFC.UpdateLabel', label_for('available'))
        return
    home.clearProperty('FEFC.UpdateAvail')
    home.setProperty('FEFC.UpdateLabel', label_for('up_to_date'))


def check_update(manual=False, prompt=True, from_tap=False, monitor=None):
    """Compare the installed FEFC app build with the latest published one (the GitHub Action publishes version.json).
    Always refreshes the home Update tile; shows the what's-new + Install / Later popup when prompt is true."""
    cur = installed_build()
    if not cur:
        set_update_state(None, state='failed')
        if manual:
            xbmcgui.Dialog().ok('FEFC', 'This is not the FEFC app build, so there is no app update to check. Add-on updates arrive automatically.')
        return
    set_update_state(cur, state='checking')
    # The Home button already reads Checking for updates. The background progress
    # dialog is the top-left line and the corner notification, so the check skips it.
    try:
        req = urllib.request.Request(VERSION_URL + '?t=%d' % int(time.time()), headers={'User-Agent': 'FEFC-Kodi'})
        new = json.loads(urllib.request.urlopen(req, timeout=15).read().decode('utf-8'))
    except Exception as e:
        log('update check failed: %s' % e)
        set_update_state(cur, state='failed')
        if manual:
            xbmcgui.Dialog().ok('FEFC', 'Unable to check for updates right now.')
        return
    try:
        if not isinstance(new, dict):
            raise ValueError('update manifest is not a JSON object: %r' % (type(new).__name__,))
        from resources.lib.updateflow import release_is_newer, platform_download, platform_unavailable_message
        avail = release_is_newer(new.get('version'), new.get('build'), cur.get('version'), cur.get('build'))
        set_update_state(cur, new, avail)
    except Exception as e:
        log('update check failed after fetch: %s' % e)
        try:
            set_update_state(cur, state='failed')
        except Exception:
            pass
        if manual:
            xbmcgui.Dialog().ok('FEFC', 'Unable to check for updates right now.')
        return
    plat = _host_platform()
    if plat == 'webos' and avail and (manual or prompt):
        _show_webos_guide(new, platform_download(new, plat, _host_arch(plat)))
        return
    if plat != 'android' and avail:
        rec = platform_download(new, plat, _host_arch(plat))
        if not rec.get('available'):
            if manual or prompt:
                xbmcgui.Dialog().ok('FEFC update', platform_unavailable_message(plat, version_label(new)))
            return
    if _updating():
        if manual:
            xbmcgui.Window(10000).setProperty('FEFC.UpdateReveal', '1')
        return
    if avail and manual and not from_tap:   # the Home update button: always a fresh check, then install straight away
        install_update(new, monitor)
        return
    if avail:
        if is_phone_pkg() and not from_tap:
            # Android phone/tablet: OS notification (gated by Settings); Fire TV keeps the in-app popup below.
            if ADDON.getSetting('notify_app_update') != 'false':
                nb = str(new.get('build') or '')
                if nb and ADDON.getSetting('last_update_notify_build') != nb:
                    nv = (str(new.get('version') or '').strip() or ('build %s' % nb))
                    label = 'Update v%s' % re.sub(r'(?i)\s*beta$', '', nv)
                    android_os_notify('update', label, 'Tap to open the updater', 'update-%s' % nb)
                    ADDON.setSetting('last_update_notify_build', nb)
            return
        if not prompt:
            return
        home = xbmcgui.Window(10000)
        if home.getProperty('FEFC.UpdatePrompt'):   # the other process already shows the update popup
            return
        home.setProperty('FEFC.UpdatePrompt', '1')
        try:
            go = _prompt(new, cur)
        finally:
            home.clearProperty('FEFC.UpdatePrompt')
        if go:
            install_update(new, monitor)
        return
    if manual:
        xbmcgui.Dialog().notification('FEFC', 'Up to date', time=2000, sound=False)


def _prompt(new, cur):
    """What's new first, then Install / Later. Returns True for Install."""
    msg = 'A new FEFC app is available: %s. You have %s.' % (version_label(new), version_label(cur))
    wn = whats_new(new, cur)
    if wn:   # full-size scrollable notes first, then the short Install / Later question
        xbmcgui.Dialog().textviewer('FEFC app update: %s' % version_label(new), msg + '\n\n' + wn)
    msg += ' Download and install it now?'
    return xbmcgui.Dialog().yesno('FEFC update', msg, nolabel='Later', yeslabel='Install', defaultbutton=xbmcgui.DLG_YESNO_YES_BTN)

BASE = 'https://fefc-collection.pages.dev'

def _get_json(url, timeout=15):
    req = urllib.request.Request(url, headers={'User-Agent': 'FEFC-Kodi'})
    return json.loads(urllib.request.urlopen(req, timeout=timeout).read().decode('utf-8'))





def _ticker_mod():
    from resources.lib import ticker
    return ticker


# Serialises every service-side catalog.load_model() call (refresh
# thread, ticker thread, home-counts path). A caller that arrives
# while a load is running waits on the lock; load_model() then returns
# the just-loaded model from its _MEM cache instead of re-fetching.
_catalog_lock = threading.Lock()


def _load_model_guarded(base, cache, mins, force=False):
    """catalog.load_model() under the service-side lock. Never call
    catalog.load_model() directly from service.py — always go through
    this helper, or through the same lock in refresh_home_counts()."""
    from resources.lib import catalog
    with _catalog_lock:
        return catalog.load_model(base, cache, mins, log, force=force)


def _model_recent_items(limit=12):
    """Most recently-added collection files from the live model (refreshes every 180 min = the 3h resync),
    so the ticker's 'new files' items update on the same cycle as the database, not just the daily feed."""
    try:
        base = (ADDON.getSetting('base_url') or BASE).rstrip('/') or BASE
        prof = xbmcvfs.translatePath(ADDON.getAddonInfo('profile'))
        try:
            mins = int(ADDON.getSetting('refresh_minutes') or 180)
        except ValueError:
            mins = 180
        m = _load_model_guarded(base, os.path.join(prof, 'cache'), mins)
        added = m.get('added') or {}
        items = m.get('items') or {}
        # newest first by added timestamp; skip folders and anything without a title
        rows = sorted(added.items(), key=lambda kv: kv[1], reverse=True)
        out = []
        for fid, _ts in rows:
            it = items.get(fid)
            if not it or it[2]:
                continue
            t = ' '.join(str(it[0] or '').split())
            if t:
                out.append({'src': 'new', 'title': t})
            if len(out) >= limit:
                break
        return out
    except Exception as e:
        log('model ticker: %s' % e)
        return []


def build_ticker():
    """Real posts only. '' means every fetch failed; caller keeps the previous line."""
    tk = _ticker_mod()
    base = (ADDON.getSetting('base_url') or BASE).rstrip('/')
    new_items, community, any_ok = [], [], False
    try:
        new_items = tk.items_from_new_files(_get_json(NEW_FILES_FEED + '?t=%d' % int(time.time()), timeout=8) or {})
        any_ok = True
    except Exception as e:
        log('new-files ticker: %s' % e)
    # 0.5.3: the daily feed only changes once a day — also pull the newest files from the live model,
    # which resyncs every 3h, so the ticker updates on the same cycle as the database.
    try:
        model_items = _model_recent_items()
        if model_items:
            seen = set()
            merged = []
            for it in list(new_items) + model_items:
                t = (it.get('title') or '').lower()
                if t and t not in seen:
                    seen.add(t)
                    merged.append(it)
            new_items = merged
            any_ok = True
    except Exception as e:
        log('model ticker: %s' % e)
    try:
        community = tk.items_from_api(_get_json(base + '/api/feed', timeout=8))
        any_ok = True
    except Exception as e:
        log('feed: %s' % e)
    if not community:
        try:
            community = tk.items_from_snapshot(_get_json(base + '/data/community-feed.json', timeout=8))
            any_ok = True
        except Exception as e:
            log('community-feed: %s' % e)
    if not any_ok:
        return ''
    return tk.build_text(new_items, community)



NOT_PLAYER_SCREENS = ('fullscreenvideo', 'videoosd', 'seekbar', 'osdvideosettings', 'osdaudiosettings', 'osdsubtitlesettings',
                      'videobookmarks', 'subtitlesearch', 'playerprocessinfo', 'busydialog', 'busydialognocancel',
                      'extendedprogressdialog', 'progressdialog', 'yesnodialog', 'okdialog', 'selectdialog', 'numericinput',
                      'virtualkeyboard', 'contextmenu', 'visualisation')


class Watcher(object):
    """Pause playback when the user leaves the video screen with Back (so the video is not playing unseen behind the menu)."""

    def __init__(self):
        self.mine = False      # we paused it
        self.t_pause = 0.0
        self.seen_full = False
        self.last_title = ''
        self.last_list = ''     # the FEFC list the user started the video from
        self.restore_until = 0.0
        self.restore_tries = 0  # capped: a deliberate move away is not fought forever
        self._playing_file = ''

    @staticmethod
    def in_player_screens():
        return xbmc.getCondVisibility('|'.join('Window.IsActive(%s)' % w for w in NOT_PLAYER_SCREENS))

    def tick(self):
        if ADDON.getSetting('pause_on_back') == 'false':
            return
        pl = xbmc.Player()
        try:
            if pl.isPlaying() and 'home-wall' in (pl.getPlayingFile() or ''):
                return
        except Exception:
            pass
        if not xbmc.getCondVisibility('Player.HasVideo'):
            self.mine = False
            self.seen_full = False
            self.restore_until = 0.0
            self.restore_tries = 0
            self.last_list = ''
            self._playing_file = ''
            xbmcgui.Window(10000).clearProperty('FEFC.PausedTitle')
            return
        # Capture the starting folder when playback starts, whatever
        # window started it — not only when the user is on a videos
        # window at that moment. The playing file is the trigger.
        try:
            cur_file = pl.getPlayingFile() or ''
        except Exception:
            cur_file = ''
        if cur_file and cur_file != self._playing_file:
            self._playing_file = cur_file
            self.restore_tries = 0
            self.restore_until = 0.0
            p = xbmc.getInfoLabel('Container.FolderPath') or ''
            if p.startswith('plugin://plugin.video.fefc/'):
                self.last_list = p
        full = xbmc.getCondVisibility('Window.IsActive(fullscreenvideo)')
        if not self.seen_full and not full and xbmc.getCondVisibility('Window.IsActive(videos)'):
            p = xbmc.getInfoLabel('Container.FolderPath') or ''
            if p.startswith('plugin://plugin.video.fefc/'):
                self.last_list = p
        if full:
            self.seen_full = True
            self.restore_until = 0.0
            self.restore_tries = 0
            if self.mine:  # back on the video screen: carry on playing
                self.mine = False
                if xbmc.getCondVisibility('Player.Paused'):
                    pl.pause()
            xbmcgui.Window(10000).clearProperty('FEFC.PausedTitle')
            return
        if not self.seen_full or self.in_player_screens():
            return
        if self.restore_until and time.time() < self.restore_until and self.last_list and xbmc.getCondVisibility('Window.IsActive(videos)'):
            # one Back press can leave the video AND go up a folder: put the user back on the list they started from
            if (xbmc.getInfoLabel('Container.FolderPath') or '') != self.last_list:
                if self.restore_tries < 3:
                    xbmc.executebuiltin('Container.Update(%s,replace)' % self.last_list)
                    self.restore_tries += 1
                    self.restore_until = time.time() + 2.5
                else:
                    # Deliberate navigation: stop fighting it.
                    self.restore_until = 0.0
                    self.restore_tries = 0
            else:
                self.restore_until = 0.0
                self.restore_tries = 0
        elif self.restore_until and time.time() >= self.restore_until:
            self.restore_tries = 0
        paused = xbmc.getCondVisibility('Player.Paused')
        if not paused:
            if self.mine and time.time() - self.t_pause > 1.5:
                # the user pressed Play on the remote while browsing: go back to the video screen
                self.mine = False
                xbmc.executebuiltin('ActivateWindow(fullscreenvideo)')
                return
            if not self.mine:
                pl.pause()
                self.mine = True
                self.t_pause = time.time()
                self.restore_until = time.time() + 4.0
                self.restore_tries = 0
                try:
                    t = xbmc.getInfoLabel('VideoPlayer.Title') or xbmc.getInfoLabel('Player.Title')
                except Exception:
                    t = ''
                xbmcgui.Window(10000).setProperty('FEFC.PausedTitle', t or 'Video')
                xbmcgui.Dialog().notification('FEFC', 'Paused. Choose RESUME on the home screen to carry on.', xbmcgui.NOTIFICATION_INFO, 3500)
        elif not xbmcgui.Window(10000).getProperty('FEFC.PausedTitle'):
            t = xbmc.getInfoLabel('VideoPlayer.Title') or xbmc.getInfoLabel('Player.Title')
            xbmcgui.Window(10000).setProperty('FEFC.PausedTitle', t or 'Video')


class Tracker(object):
    """Continue watching: saves the position of FEFC streams (same 'playback' / 'history' records as the web app) and syncs them."""
    STREAM = re.compile(r'/api/stream/([\w-]{10,80})/')

    def __init__(self):
        self.vid = None
        self.name = ''
        self.last_save = 0.0
        self.pos = 0.0
        self.total = 0.0
        self.ml = None

    def _ml(self):
        if self.ml is None:
            from resources.lib import mylist
            prof = xbmcvfs.translatePath(ADDON.getAddonInfo('profile'))
            self.ml = mylist.MyList(os.path.join(prof, 'mylist'), (ADDON.getSetting('base_url') or BASE))
        return self.ml

    def tick(self):
        pl = xbmc.Player()
        try:
            playing = pl.isPlayingVideo()
        except Exception:
            playing = False
        if not playing:
            if self.vid:
                self.finish()
            return
        try:
            url = pl.getPlayingFile()
        except Exception:
            return
        mo = self.STREAM.search(url or '')
        if not mo:
            if self.vid:
                self.finish()
            return
        vid = mo.group(1)
        if vid != self.vid:
            if self.vid:
                self.finish()
            # New video: start from a clean slate, even if finish()
            # was not called (no previous video). The old last_save
            # must not gate the new video's first save, and the old
            # pos/total must not be saved for it.
            self.vid = vid
            self.name = ''
            self.pos = 0.0
            self.total = 0.0
            self.last_save = 0.0
            self.name = xbmc.getInfoLabel('VideoPlayer.Title') or xbmc.getInfoLabel('Player.Title') or ''
            try:
                self._ml().opened(vid, self.name)
            except Exception as e:
                log('history: %s' % e)
        try:
            self.pos = pl.getTime()
            self.total = pl.getTotalTime()
        except Exception:
            return
        if time.time() - self.last_save > 15 and self.pos > 5:
            self.last_save = time.time()
            try:
                self._ml().set_playback(self.vid, self.pos, self.name, self.total)
            except Exception as e:
                log('playback: %s' % e)

    def finish(self):
        # Capture the outgoing video's state, then reset everything
        # before saving, so a later save can never use stale values.
        vid = self.vid
        name = self.name
        pos = self.pos
        total = self.total
        self.vid = None
        self.name = ''
        self.pos = 0.0
        self.total = 0.0
        self.last_save = 0.0
        try:
            ml = self._ml()
            if total and pos >= total * 0.95:
                ml.clear_playback(vid)       # finished: no longer "continue watching"
            elif pos > 5:
                ml.set_playback(vid, pos, name, total)
            if ml.linked:
                threading.Thread(target=ml.sync, daemon=True).start()
        except Exception as e:
            log('finish: %s' % e)


def refresh_home_counts():
    try:
        from resources.lib import router
        home = xbmcgui.Window(10000)
        # Same lock as _load_model_guarded(): home_counts() loads the
        # catalogue via router, so it must not run concurrently with
        # a service-side load.
        with _catalog_lock:
            counts = router.home_counts()
        for k, v in counts.items():
            home.setProperty('FEFC.Cnt.' + k, v)
    except Exception as e:
        log('home counts: %s' % e)


_last_info = ['']


class HomeWall(object):
    """OnLive-style Home background. One bundled 75 s loop (instant start; the still first frame is the skin
    background). Sound On plays home-wall.mp4, which carries the original FEFC ambience. Sound Off plays the
    silent twin. The same player stays up on every browsing screen: Home shows the picture, other screens keep
    an off-screen videowindow so only the picture hides and the ambience does not restart. A real film,
    trailer, or the intro replaces this player; browsing again resumes the loop from the saved position."""
    URL = BASE + '/assets/home-wall.mp4'
    LOOP = 75.0

    def __init__(self):
        self.path = os.path.join(xbmcvfs.translatePath('special://profile/addon_data/plugin.video.fefc/'), 'home-wall-v2.mp4')
        self.fetching = False
        self.fails = 0
        self.t_next = 0.0
        self.cur_sound = None
        self.pos = 0.0
        self._dialog = False
        self._win = ''
        self._repeat = False
        self._duration = 0.0   # real loop length once known; LOOP is the fallback
        self._started_at = 0.0
        self._stop_counted = False

    def _wall_url(self):
        base = (ADDON.getSetting('base_url') or BASE).rstrip('/') or BASE
        return base + '/assets/home-wall.mp4'

    def _loop_len(self):
        return self._duration if self._duration > 10 else self.LOOP

    def _bundled(self, sound):
        f = xbmcvfs.translatePath('special://xbmc/media/fefc-home-wall%s.mp4' % ('' if sound else '-silent'))
        return f if xbmcvfs.exists(f) or os.path.exists(f) else ''

    def _fetch(self):
        try:
            os.makedirs(os.path.dirname(self.path), exist_ok=True)
            req = urllib.request.Request(self._wall_url(), headers={'User-Agent': 'FEFC-Kodi'})
            with urllib.request.urlopen(req, timeout=30) as r:
                clen = r.headers.get('Content-Length')
                data = r.read(20 * 1024 * 1024)
            if clen is not None:
                try:
                    want_len = int(clen)
                except (TypeError, ValueError):
                    want_len = 0
                if want_len and len(data) < want_len:
                    log('home wall download: truncated %d/%d bytes' % (len(data), want_len))
                    return
                if want_len > 20 * 1024 * 1024:
                    log('home wall download: advertised %d bytes exceeds the 20 MB cap' % want_len)
                    return
            elif len(data) >= 20 * 1024 * 1024:
                log('home wall download: hit the 20 MB cap with no Content-Length; treating as truncated')
                return
            if len(data) > 100000 and data[4:8] == b'ftyp':
                with open(self.path + '.tmp', 'wb') as f:
                    f.write(data)
                os.replace(self.path + '.tmp', self.path)
            else:
                log('home wall download: %d bytes, not a usable mp4' % len(data))
        except Exception as e:
            log('home wall download: %s' % e)
        finally:
            self.fetching = False

    def playing(self):
        return xbmcgui.Window(10000).getProperty('FEFC.Wall') == '1'

    def switch_sound(self, sound):
        """Swap the audible and silent loops now. Does not touch a real film or the intro."""
        pl = xbmc.Player()
        try:
            if pl.isPlaying():
                cur = pl.getPlayingFile() or ''
                if cur and 'home-wall' not in cur:
                    # A real film, a trailer, or the intro: leave it alone.
                    self.cur_sound = sound
                    return
                try:
                    self.pos = pl.getTime()
                except Exception:
                    pass
        except Exception:
            pass
        self._start(pl, bool(sound), self.pos)

    def stop(self):
        home = xbmcgui.Window(10000)
        home.clearProperty('FEFC.WallSeam')
        if self.playing():
            home.clearProperty('FEFC.Wall')
            try:
                pl = xbmc.Player()
                if pl.isPlaying() and 'home-wall' in (pl.getPlayingFile() or ''):
                    pl.stop()
            except Exception:
                pass

    def _start(self, pl, sound, at=0.0):
        home = xbmcgui.Window(10000)
        src = self._bundled(sound)
        if not src:
            if not sound:
                # No silent bundled file: do not play the audible loop
                # (bundled or downloaded) as a substitute for silence.
                return
            if not os.path.exists(self.path):
                if not self.fetching:
                    self.fetching = True
                    self.t_next = time.time() + 60
                    threading.Thread(target=self._fetch, daemon=True).start()
                return
            src = self.path
        li = xbmcgui.ListItem('FEFC', offscreen=True)
        li.setProperty('fefc_wall', '1')
        loop = self._loop_len()
        if at > loop - 3:
            at = 0.0
        if at > 0.5:
            li.setProperty('StartOffset', '%.2f' % at)
        home.setProperty('FEFC.Wall', '1')
        self.cur_sound = sound
        try:
            log('wall OpenFile at=%.2f sound=%s' % (at, sound))
            self._repeat = False
            self._started_at = time.time()
            self._stop_counted = False
            pl.play(src, li, windowed=True)
            xbmc.executebuiltin('PlayerControl(RepeatOne)')
        except Exception as e:
            log('home wall play: %s' % e)
            self.fails += 1
            home.clearProperty('FEFC.Wall')
        self.t_next = time.time() + 2

    def _busy_with_real_video(self, pl, home):
        if home.getProperty('FEFC.PausedTitle'):
            return True
        try:
            if not pl.isPlaying():
                return False
            cur = pl.getPlayingFile() or ''
        except Exception:
            return False
        return bool(cur) and 'home-wall' not in cur and 'fefc-intro' not in cur

    def tick(self):
        """Keep one wall player alive across Home and folder screens. Home shows the picture; other
        screens keep an off-screen videowindow so the same playback continues and only the picture
        hides. A real edit suspends the wall. If Kodi still drops the player when a window closes,
        resume seeks back into the same loop instead of starting a second copy."""
        home = xbmcgui.Window(10000)
        pl = xbmc.Player()
        sound = home.getProperty('FEFC.SoundOff') != '1'
        if self._dialog and not xbmc.getCondVisibility('Window.IsVisible(11191)'):
            # The off-screen videowindow was closed: re-arm it below.
            self._dialog = False
        if not self._dialog and home.getProperty('FEFC.Ready') == '1':
            # One off-screen videowindow that outlives Home, so window changes do not drop the player.
            xbmc.executebuiltin('ActivateWindow(11191)')
            self._dialog = True
        at_home = xbmc.getCondVisibility('Window.IsActive(home) + !Window.IsActive(fullscreenvideo)') and home.getProperty('FEFC.Ready') == '1'
        if xbmc.getCondVisibility('Window.IsActive(fullscreenvideo)'):
            return
        if self._busy_with_real_video(pl, home):
            if self.playing():
                home.clearProperty('FEFC.Wall')
                home.clearProperty('FEFC.WallSeam')
            return
        cur = ''
        try:
            cur = pl.getPlayingFile() if pl.isPlaying() else ''
        except Exception:
            cur = ''
        win = xbmc.getInfoLabel('System.CurrentWindow') or ''
        if win != self._win:
            self._win = win
            try:
                pos = pl.getTime() if pl.isPlaying() else -1.0
            except Exception:
                pos = -1.0
            log('wall at window=%s pos=%.2f file=%s' % (win, pos, (cur or '')[-48:]))
        if cur and 'home-wall' in cur:
            if not self.playing():
                home.setProperty('FEFC.Wall', '1')
            try:
                self.pos = pl.getTime()
                total = pl.getTotalTime()
                if total and total > 10:
                    self._duration = total
            except Exception:
                pass
            # Sustained good play resets the failure count.
            if self._started_at and time.time() - self._started_at > 10:
                self.fails = 0
            if not self._repeat:
                try:
                    xbmc.executeJSONRPC('{"jsonrpc":"2.0","id":1,"method":"Player.SetRepeat","params":{"playerid":1,"repeat":"one"}}')
                    self._repeat = True
                except Exception:
                    pass
            if sound != self.cur_sound:
                self.switch_sound(sound)
                return
            # RepeatOne does not loop a file that is not in a playlist, so the player hits EOF and
            # the next start is a new OpenFile. Seek the same player back to the start instead.
            loop = self._loop_len()
            if self.pos > loop - 1.2 and time.time() - getattr(self, '_seeked', 0) > 2:
                self._seeked = time.time()
                try:
                    pl.seekTime(0)
                except Exception:
                    pass
            if at_home:
                if self.pos > loop - 0.6 or self.pos < 0.35:
                    home.setProperty('FEFC.WallSeam', '1')
                else:
                    home.clearProperty('FEFC.WallSeam')
            return
        if cur:
            return
        # Player stopped while browsing or on Home. Resume the same loop; do not stack a second one.
        if home.getProperty('FEFC.Ready') != '1' or time.time() < self.t_next or self.fails >= 3:
            return
        if not self._stop_counted:
            # Count this stop once. A stop after < 10 s of play is a
            # failed play, not a clean EOF; back off before retrying.
            self._stop_counted = True
            if self._started_at and time.time() - self._started_at < 10:
                self.fails += 1
                self.t_next = time.time() + min(60, 5 * (2 ** (self.fails - 1)))
                if self.fails >= 3:
                    log('home wall: giving up after %d short-lived plays' % self.fails)
                    return
                return
            self.fails = 0
        self._start(pl, sound, self.pos if self.pos > 0.5 else 0.0)



def _play_local_wav(filename):
    """Play one packaged UI wav. filename is click.wav or back.wav. Sound off is the caller's check."""
    name = os.path.basename(filename or '')
    if not name:
        return
    paths = [xbmcvfs.translatePath('special://xbmc/addons/resource.uisounds.fefc/resources/' + name),
             xbmcvfs.translatePath('special://home/addons/resource.uisounds.fefc/resources/' + name),
             os.path.join(os.path.dirname(os.path.abspath(__file__)), 'resources', 'ui-back.wav' if name == 'back.wav' else name)]
    for p in paths:
        try:
            if p and os.path.exists(p) and os.path.getsize(p) > 100:
                xbmc.playSFX(p, False)
                return
        except Exception:
            return


def _remember_focused_clip():
    """Keep the focused row's clip on the home window.

    The details dialog often does not see ListItem properties on its first poll.
    0.6.3 latched the item id at that moment and then never played the clip.
    """
    if not xbmc.getCondVisibility('Window.IsActive(videos)'):
        return
    url = xbmc.getInfoLabel('Container.ListItem.Property(fefc_sfx)') or ''
    key = xbmc.getInfoLabel('Container.ListItem.Property(fefc_id)') or ''
    if url and key:
        home = xbmcgui.Window(10000)
        home.setProperty('FEFC.FocusSfx', url)
        home.setProperty('FEFC.FocusId', key)


_transport_state = {'playing': False, 'paused': False, 'forwarding': False, 'rewinding': False, 'wall': False}


def _playing_path():
    return (xbmc.getInfoLabel('Player.Filenameandpath') or '').lower()


def transport_cues():
    """Pause, resume, fast-forward and rewind cues while a title is on screen.

    Kodi's action sounds do play during video on Android: GUIAudioManager stays
    enabled (playback only disables it on non-POSIX) and xbmc.playSFX uses that
    same mixer. OSD buttons never send the action, they call PlayerControl, so
    this watches the player instead. The fullscreen keymap does the same for
    the remote, which keeps the skin from playing a second copy.
    """
    path = _playing_path()
    wall = ('home-wall' in path) or ('fefc-intro' in path) or ('fefc-home-wall' in path)
    now = {
        'playing': bool(xbmc.getCondVisibility('Player.HasVideo')) and not wall,
        'paused': bool(xbmc.getCondVisibility('Player.Paused')),
        'forwarding': bool(xbmc.getCondVisibility('Player.Forwarding')),
        'rewinding': bool(xbmc.getCondVisibility('Player.Rewinding')),
        'wall': wall,
    }
    from resources.lib.cues import transport_event, ui_file
    off = xbmcgui.Window(10000).getProperty('FEFC.SoundOff') == '1'
    event = transport_event(_transport_state, now, off)
    _transport_state.clear()
    _transport_state.update(now)
    name = ui_file(event, off) if event else ''
    if name:
        _play_local_wav(name)


def details_sfx():
    """Play the select click and the file's clip once when its details page opens.

    The click is the same cue as every other tile. The clip is one file from that
    title's own set (fefc_sfx), remembered from the folder row if the dialog has
    not copied the property yet. Sound off and a real film stay silent.
    """
    if not xbmc.getCondVisibility('Window.IsActive(movieinformation)'):
        _last_info[0] = ''
        return
    if _foreground_video():
        return
    home = xbmcgui.Window(10000)
    url = xbmc.getInfoLabel('ListItem.Property(fefc_sfx)') or home.getProperty('FEFC.FocusSfx') or ''
    key = xbmc.getInfoLabel('ListItem.Property(fefc_id)') or home.getProperty('FEFC.FocusId') or ''
    off = home.getProperty('FEFC.SoundOff') == '1'
    from resources.lib.cues import details_ready, opening_plan, ui_file
    ready, latched = details_ready(key, url, off, _last_info[0])
    _last_info[0] = latched
    if not ready:
        return
    plan = opening_plan('file', False, [url])
    # The sound skin plays click.wav for the info action when guisoundmode is 2.
    # Python plays it only when that setting did not stick, so the two do not stack.
    if home.getProperty('FEFC.GuiSound') != 'always':
        _play_local_wav(ui_file('select', False))
    clip = plan['clip']
    if not clip:
        return

    def go():
        try:
            d = xbmcvfs.translatePath('special://profile/addon_data/plugin.video.fefc/sfx/')
            os.makedirs(d, exist_ok=True)
            dst = os.path.join(d, os.path.basename(clip.split('?')[0]))
            if not os.path.exists(dst) or os.path.getsize(dst) < 1000:
                req = urllib.request.Request(clip, headers={'User-Agent': 'FEFC-Kodi'})
                with urllib.request.urlopen(req, timeout=8) as r:
                    data = r.read(8 * 1024 * 1024)
                if len(data) < 1000 or data[:4] != b'RIFF':
                    log('details sfx: clip is not a wav (%s)' % clip)
                    return
                with open(dst + '.tmp', 'wb') as f:
                    f.write(data)
                os.replace(dst + '.tmp', dst)
            if xbmc.getCondVisibility('Window.IsActive(movieinformation)'):
                xbmc.playSFX(dst, False)
        except Exception as e:
            log('details sfx: %s' % e)
    threading.Thread(target=go, daemon=True).start()


def _foreground_video():
    """True when the player is a film or trailer, not the home-wall loop or the intro."""
    try:
        pl = xbmc.Player()
        if not pl.isPlaying():
            return False
        cur = pl.getPlayingFile() or ''
    except Exception:
        return False
    if not cur or 'home-wall' in cur or 'fefc-intro' in cur:
        return False
    return True


def _drop_stale_back_keymap():
    """An older build copied a keymap into the profile that ran a plugin on Back
    and then the Back action. That file still swallows the Fire TV key after the
    add-on keymap was corrected. Remove it on every start."""
    try:
        d = xbmcvfs.translatePath('special://profile/keymaps')
        dst = os.path.join(d, 'fefc-nav.xml')
        if os.path.exists(dst):
            os.remove(dst)
            xbmc.executebuiltin('ReloadKeymaps')
            log('removed profile keymap that swallowed Back')
    except Exception as e:
        log('nav keymap: %s' % e)


_wall = None


def apply_sound_now(on):
    """Flip the live mute and the wall audio. No settings write and no keymap reload.

    FEFC.GuiSound here is intentionally an optimistic LIVE flag for the
    requested state, not the persisted Kodi setting: the persist thread
    (sound_toggle) writes the setting and then calls apply_nav_sound(),
    which reads the setting back and corrects this property. Do not add a
    read-back here — it would read the old value before the persist
    thread has written the new one.
    """
    home = xbmcgui.Window(10000)
    home.setProperty('FEFC.SoundOff', '' if on else '1')
    home.setProperty('FEFC.GuiSound', 'always' if on else 'off')
    if not on:
        try:
            stop = getattr(xbmc, 'stopSFX', None)
            if stop:
                stop()
        except Exception:
            pass
    if _wall is not None:
        try:
            _wall.switch_sound(bool(on))
        except Exception as e:
            log('sound now: %s' % e)


def apply_nav_sound(on):
    """Sound On: GUI sounds play during the wall video (mode 2) and the FEFC sound skin stays selected.
    Sound Off: GUI sounds off so Back does not ignore the mute. Does not stop the wall player.

    FEFC.GuiSound is set from a read-back of audiooutput.guisoundmode, not
    from the requested value: the startup JSON-RPC set often runs before
    guisettings is loaded, so the mode falls back and the property used to
    say 'always' while the real setting was not 2 (silent Back) or 'off'
    while it was 2 (double cue). The optimistic value is still set first
    so the UI does not wait, then corrected from the read-back.
    """
    from resources.lib.backcue import gui_sound_mode
    home = xbmcgui.Window(10000)
    home.setProperty('FEFC.GuiSound', 'always' if on else 'off')
    mode = gui_sound_mode(bool(on))

    def _set(setting, value):
        xbmc.executeJSONRPC(json.dumps({'jsonrpc': '2.0', 'id': 1, 'method': 'Settings.SetSettingValue',
                                        'params': {'setting': setting, 'value': value}}))

    def _get(setting):
        try:
            r = json.loads(xbmc.executeJSONRPC(json.dumps({'jsonrpc': '2.0', 'id': 1, 'method': 'Settings.GetSettingValue',
                                                           'params': {'setting': setting}})))
            return (r.get('result') or {}).get('value')
        except Exception as e:
            log('nav sound read-back: %s' % e)
            return None

    try:
        _set('audiooutput.guisoundmode', mode)
        if on:
            _set('lookandfeel.soundskin', 'resource.uisounds.fefc')
    except Exception as e:
        log('nav sound: %s' % e)
    actual = _get('audiooutput.guisoundmode')
    if actual is None:
        # Read-back failed (e.g. too early at startup): keep the optimistic
        # property as before, and let the 45 s reapply correct it later.
        log('nav sound: could not read back guisoundmode; keeping optimistic FEFC.GuiSound')
    else:
        try:
            actual_mode = int(actual)
        except (TypeError, ValueError):
            actual_mode = None
        if actual_mode is not None:
            home.setProperty('FEFC.GuiSound', 'always' if actual_mode == 2 else 'off')
            if actual_mode != mode:
                log('nav sound: guisoundmode read back %s, wanted %s; FEFC.GuiSound set from read-back' % (actual_mode, mode))
    _drop_stale_back_keymap()


def _grid_pad_loop(monitor):
    """Move focus off a cell reserved under a portrait poster.

    The panel cannot skip an item by itself. This only runs while that cell is
    focused, and it never touches playback."""
    from resources.lib.shapes import skip_delta
    origin = None
    while not monitor.abortRequested():
        try:
            cid = xbmc.getInfoLabel('System.CurrentControlId') or ''
            on_grid = cid in ('500', '501') and xbmc.getCondVisibility('Window.IsActive(videos)')
            if not on_grid:
                origin = None
                if monitor.waitForAbort(0.25):
                    return
                continue
            path = xbmc.getInfoLabel('Container.FolderPath') or ''
            total = int(xbmc.getInfoLabel('Container.NumItems') or '0')
            try:
                _remember_focused_clip()
            except Exception:
                pass
            cur = int(xbmc.getInfoLabel('Container.CurrentItem') or '0')
            pos = cur - 1 if cur else 0

            def lookup(i, pos=pos):
                if i == 0:
                    # Absolute index 0 is Kodi's ".." parent row. It carries
                    # no fefc_kind property (Kodi builds it, not the plugin;
                    # the router adds no ".." ListItem), and it is a folder
                    # row, so skip_delta() can target it. pos = cur - 1 and
                    # end() passes leading=1, so i == 0 is the parent.
                    return 'folder'
                off = i - pos
                if off == 0:
                    k = xbmc.getInfoLabel('Container.ListItem.Property(fefc_kind)')
                else:
                    k = xbmc.getInfoLabel('Container.ListItem(%d).Property(fefc_kind)' % off)
                return k or None

            home = xbmcgui.Window(10000)
            from_menu = home.getProperty('FEFC.GridFromMenu') == '1'
            step = skip_delta(pos, origin, lookup, from_menu=from_menu)
            if from_menu:
                home.clearProperty('FEFC.GridFromMenu')
            if step is None:
                origin = pos
                if monitor.waitForAbort(0.2):
                    return
                continue
            if step == 'menu':
                home.setProperty('FEFC.GridFromMenu', '1')
                xbmc.executebuiltin('SetFocus(9290)')
                origin = None
            else:
                xbmc.executebuiltin('SetFocus(%s,%d)' % (cid, pos + step))
                origin = pos
        except Exception as e:
            _log_tick('grid pad', e)
        if monitor.waitForAbort(0.05):
            return


# Per-site, per-message last-log time for tick errors. A persistent
# error in a 20 Hz loop must not write the same line hundreds of
# times a minute; the first occurrence still logs at once.
_tick_log_last = {}


def _log_tick(site, exc):
    """Log a tick-loop exception, at most once per 60 s for the same site + message."""
    try:
        key = (site, str(exc))
        now = time.time()
        last = _tick_log_last.get(key, 0.0)
        if now - last >= 60:
            _tick_log_last[key] = now
            log('%s: %s' % (site, exc))
    except Exception:
        pass



def _setting_bool(setting_id, default=False):
    """ADDON.getSettingBool() raises if the setting id does not exist
    (e.g. after a settings.xml change). Never let that kill startup."""
    try:
        return bool(ADDON.getSettingBool(setting_id))
    except Exception:
        return default


def main():
    home = xbmcgui.Window(10000)
    if not xbmcvfs.exists(INTRO):
        home.setProperty('FEFC.Ready', '1')
        return  # plain Kodi: nothing to do
    monitor = xbmc.Monitor()
    # Warm the package / external-files-dir caches (Item 68) so the
    # first tick does not pay for the translatePath scans.
    my_package()
    _android_ext_files_dir()
    ensure_source()
    set_select_action()
    _drop_stale_back_keymap()
    cb = installed_build()
    if cb:
        xbmcgui.Window(10000).setProperty('FEFC.Version', 'FEFC app ' + version_label(cb))
        set_update_state(cb, state='checking')
    if _setting_bool('open_on_start') or _setting_bool('play_intro'):
        # wait for the home screen to be up
        for _ in range(60):
            if monitor.waitForAbort(0.5):
                return
            if xbmc.getCondVisibility('Window.IsActive(home)'):
                break
        if _setting_bool('play_intro'):
            # Fullscreen. A dialog cannot draw above it; the video OSD can, so SKIP is a control on that OSD.
            xbmc.executebuiltin('PlayMedia(%s,noresume)' % INTRO)
            started = False
            t_play = None
            show_skip = False
            for n in range(160):
                if monitor.waitForAbort(0.25):
                    return
                pl = xbmc.Player()
                playing = pl.isPlaying()
                if playing:
                    started = True
                    if t_play is None:
                        t_play = time.time()
                    try:
                        pos = pl.getTime()
                    except Exception:
                        pos = time.time() - t_play
                    if pos >= 3.0:
                        show_skip = True
                        break
                elif started:
                    break
                elif n > 24:
                    break
            if show_skip and xbmc.Player().isPlaying():
                try:
                    from resources.lib.wallplan import skip_button
                    log('skip button %s' % (skip_button(),))
                except Exception:
                    pass
                home.setProperty('FEFC.Skip', '1')
                xbmc.executebuiltin('ActivateWindow(videoosd)')
                xbmc.executebuiltin('SetFocus(11192)')
                while not monitor.abortRequested() and xbmc.Player().isPlaying():
                    if not xbmc.getCondVisibility('Window.IsVisible(videoosd)'):
                        xbmc.executebuiltin('ActivateWindow(videoosd)')
                        xbmc.executebuiltin('SetFocus(11192)')
                    if monitor.waitForAbort(0.2):
                        return
                home.setProperty('FEFC.Skip', '')
                xbmc.executebuiltin('Dialog.Close(videoosd,true)')
        home.setProperty('FEFC.Ready', '1')  # the home screen stays hidden behind a black splash until the intro has finished
        if _setting_bool('open_on_start') and xbmc.getSkinDir() != 'skin.fefc':  # the FEFC skin's home already is the FEFC menu
            xbmc.executebuiltin('ActivateWindow(Videos,plugin://plugin.video.fefc/,return)')
    home.setProperty('FEFC.Ready', '1')
    try:
        from resources.lib.sfxpref import sfx_enabled, should_persist_on
        _raw = ADDON.getSetting('play_sfx')
        if should_persist_on(_raw):
            ADDON.setSetting('play_sfx', 'true')
        home.setProperty('FEFC.SoundOff', '' if sfx_enabled(ADDON.getSetting('play_sfx')) else '1')
        apply_nav_sound(sfx_enabled(ADDON.getSetting('play_sfx')))
    except Exception:
        home.setProperty('FEFC.SoundOff', '' if ADDON.getSetting('play_sfx') != 'false' else '1')
        try:
            apply_nav_sound(ADDON.getSetting('play_sfx') != 'false')
        except Exception:
            pass
    # main loop: news ticker, pause-on-back, daily app update notice
    watcher = Watcher()
    tracker = Tracker()
    global _wall
    wall = _wall = HomeWall()
    # The startup JSON-RPC often lands before guisettings. Apply again once the
    # wall player is up, then on a slow repeat so a settings reload cannot mute cues.
    next_nav_sound = time.time() + 3
    next_feed = 0.0
    next_counts = 0.0
    next_new_files = 0.0
    next_catalog = time.time() + 25
    next_due = 0.0
    ticker_shown = ['']
    t_start = time.time()
    checked = False
    last_check = 0.0
    next_install_check = 0.0
    was_home = False
    try:
        sync_notify_prefs()
    except Exception as e:
        log('notify prefs start: %s' % e)
    perm_asked = [False]
    threading.Thread(target=_grid_pad_loop, args=(monitor,), daemon=True).start()
    while not monitor.abortRequested():
        now = time.time()
        if now >= next_nav_sound:
            try:
                from resources.lib.sfxpref import sfx_enabled
                from resources.lib.cues import REAPPLY_SECONDS
                on = sfx_enabled(ADDON.getSetting('play_sfx'))
                home.setProperty('FEFC.SoundOff', '' if on else '1')
                if _run_in_background(apply_nav_sound, on):
                    next_nav_sound = now + REAPPLY_SECONDS
                else:
                    # Background work is busy; retry soon instead of
                    # waiting out the full 45 s reapply interval.
                    next_nav_sound = now + 5
            except Exception as e:
                log('nav sound reapply: %s' % e)
                next_nav_sound = now + 45
        try:
            maybe_ask_notify_perm(perm_asked)
        except Exception as e:
            log('notify perm ask: %s' % e)
        try:
            consume_pending_nav(monitor)
        except Exception as e:
            log('pending nav: %s' % e)
        if now >= next_counts:  # tile counts (catalog + My List), refreshed every minute like the web app's home
            threading.Thread(target=refresh_home_counts, daemon=True).start()
            next_counts = now + 60
        if is_phone_pkg() and now >= next_new_files:
            threading.Thread(target=poll_new_files_feed, daemon=True).start()
            try:
                sync_notify_prefs()
            except Exception:
                pass
            next_new_files = now + 900  # 15 min; feed is published with the 9am ET social posts
        due_path = os.path.join(xbmcvfs.translatePath(ADDON.getAddonInfo('profile')), 'cache', 'refresh.due')
        if os.path.exists(due_path) and now >= next_due:
            next_catalog = min(next_catalog, now)
            next_due = now + 45
        if now >= next_catalog:
            def refresh_catalog():
                try:
                    base = (ADDON.getSetting('base_url') or BASE).rstrip('/') or BASE
                    prof = xbmcvfs.translatePath(ADDON.getAddonInfo('profile'))
                    cache = os.path.join(prof, 'cache')
                    try:
                        mins = int(ADDON.getSetting('refresh_minutes') or 180)
                    except ValueError:
                        mins = 180
                    _load_model_guarded(base, cache, mins, force=True)
                except Exception as e:
                    log('catalogue refresh: %s' % e)
            threading.Thread(target=refresh_catalog, daemon=True).start()
            try:
                mins = int(ADDON.getSetting('refresh_minutes') or 180)
            except ValueError:
                mins = 180
            next_catalog = now + max(60, mins * 60)
        if now >= next_feed:
            def refresh():
                try:
                    text = build_ticker()
                except Exception as e:
                    log('ticker: %s' % e)
                    return
                # A failed or empty fetch must not blank the line already on screen.
                if text and text != ticker_shown[0]:
                    ticker_shown[0] = text
                    home.setProperty('FEFC.Ticker', text)
            threading.Thread(target=refresh, daemon=True).start()
            next_feed = now + 1200
        try:
            details_sfx()
        except Exception as e:
            _log_tick('details sfx', e)
        try:
            transport_cues()
        except Exception as e:
            _log_tick('transport cue', e)
        try:
            wall.tick()
        except Exception as e:
            _log_tick('home wall', e)
        try:
            if not wall.playing():
                watcher.tick()
        except Exception as e:
            _log_tick('watcher', e)
        try:
            tracker.tick()
        except Exception as e:
            _log_tick('tracker', e)
        # The process can survive an APK replace. On Home only — never on
        # other screens and never during playback — and every few seconds,
        # compare it with the package on disk and drop a stale Update available badge.
        # The check itself runs on a daemon thread (busy flag in
        # _run_in_background) so it can never stall this tick loop.
        home_now = bool(xbmc.getCondVisibility('Window.IsActive(home)'))
        if home_now and (not was_home or now >= next_install_check):
            next_install_check = now + 5
            try:
                _run_in_background(maybe_refresh_installed)
            except Exception as e:
                log('resume install check: %s' % e)
        was_home = home_now
        # update check right after the intro (every launch), popup once; re-checked every 6 h to keep the tile badge current
        if not checked and now - t_start > 4 and (xbmc.getCondVisibility('Window.IsActive(home)') or now - t_start > 120):
            checked = True
            last_check = now
            ADDON.setSetting('last_update_check', str(now))
            check_update(prompt=not _foreground_video(), monitor=monitor)
        elif checked and now - last_check > 21600:
            last_check = now
            # Background only: prompt=False, so no dialog and no install
            # can be reached from this thread (see Item 66).
            _run_in_background(check_update, prompt=False, monitor=monitor)
        if monitor.waitForAbort(0.2 if wall.playing() else 0.5):
            break


if __name__ == '__main__':
    main()
