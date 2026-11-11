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
    """The APK's own fefc-build.json. A record written before the user confirms install is not the installed build."""
    try:
        with xbmcvfs.File(BUILD_FILE) as f:
            return json.loads(f.read())
    except Exception:
        return None


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


def install_update(new):
    """One non-interruptible flow: close every dialog, download with resume + automatic retries (one flow at a time,
    guarded by FEFC.Updating so no update popup or second download can start meanwhile), verify size + sha256,
    then hand the APK to Android's package installer."""
    import hashlib
    home = xbmcgui.Window(10000)
    if _updating():
        log('update already in progress')
        return
    home.setProperty('FEFC.Updating', '1')
    try:
        _install_update(new)
    finally:
        home.clearProperty('FEFC.Updating')


def my_package():
    """Android package of this install: the app's own data paths name it (com.fefc.kodi vs org.xbmc.kodi), so the
    updater always downloads the APK for the package that is actually running; fefc-build.json is the fallback."""
    for sp in ('special://xbmc/', 'special://home/', 'special://temp/'):
        try:
            t = xbmcvfs.translatePath(sp)
        except Exception:
            t = ''
        for pkg in ('com.fefc.kodi', 'org.xbmc.kodi'):
            if '/%s/' % pkg in t:
                return pkg
    return str((installed_build() or {}).get('pkg') or 'org.xbmc.kodi')


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
                return t[:i + len(marker)]
    return ''


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


def consume_pending_nav():
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
        check_update(manual=True, prompt=False)


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




def _install_update(new):
    import hashlib
    url, want, sha = _for_my_package(new)
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
        prog = xbmcgui.DialogProgressBG()
        prog.create('FEFC update', 'Downloading %s...' % version_label(new))
        tries = 0
        while tries < 8 and not ok:
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
                            chunk = r.read(256 * 1024)
                            if not chunk:
                                break
                            f.write(chunk)
                            done += len(chunk)
                            if total:
                                pct = min(99, int(done * 100 / total))
                                prog.update(pct, 'FEFC update',
                                            'Downloading %s: %d%% (%d / %d MB)' % (version_label(new), pct, done >> 20, total >> 20))
                size = os.path.getsize(part)
                if want and size < want:
                    raise RuntimeError('short download %d/%d' % (size, want))
                if sha:
                    prog.update(99, 'FEFC update', 'Checking the download...')
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
                prog.update(0, 'FEFC update', 'Connection problem, retrying (%d/8)...' % tries)
                xbmc.sleep(min(30, 3 * tries) * 1000)
        prog.close()
    if not ok:
        _cue('error')
        xbmcgui.Dialog().ok('FEFC update', 'The download did not finish after several tries. Check the connection and pick Update again; it will continue where it stopped.')
        return
    if not url:
        _cue('error')
        xbmcgui.Dialog().ok('FEFC update', 'No update package is published for this app.')
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
        uri = 'content://%s.file/#' % pkg + dst
    builtin = installer_builtin(uri, installer_package_for(pkg))
    if not builtin:
        _cue('error')
        xbmcgui.Dialog().ok('FEFC update', 'The installer could not be opened.')
        return
    _cue('verified')
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


def check_update(manual=False, prompt=True):
    """Compare the installed FEFC app build with the latest published one (the GitHub Action publishes version.json).
    Always refreshes the home Update tile; shows the what's-new + Install / Later popup when prompt is true."""
    cur = installed_build()
    if not cur:
        set_update_state(None, state='failed')
        if manual:
            xbmcgui.Dialog().ok('FEFC', 'This is not the FEFC app build, so there is no app update to check. Add-on updates arrive automatically.')
        return
    set_update_state(cur, state='checking')
    prog = xbmcgui.DialogProgressBG()
    prog.create('FEFC', 'Checking for updates')
    try:
        req = urllib.request.Request(VERSION_URL + '?t=%d' % int(time.time()), headers={'User-Agent': 'FEFC-Kodi'})
        new = json.loads(urllib.request.urlopen(req, timeout=15).read().decode('utf-8'))
    except Exception as e:
        log('update check failed: %s' % e)
        set_update_state(cur, state='failed')
        if manual:
            xbmcgui.Dialog().ok('FEFC', 'Unable to check for updates right now.')
        return
    finally:
        try:
            prog.close()
        except Exception:
            pass
    from resources.lib.updateflow import release_is_newer
    avail = release_is_newer(new.get('version'), new.get('build'), cur.get('version'), cur.get('build'))
    set_update_state(cur, new, avail)
    if _updating():
        if manual:
            xbmcgui.Dialog().notification('FEFC update', 'Already downloading the update...', time=3000)
        return
    if avail and manual:   # the Home update button: always a fresh check, then install straight away
        install_update(new)
        return
    if avail:
        if is_phone_pkg():
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
            install_update(new)
        return
    if manual:
        xbmcgui.Dialog().notification('FEFC', 'Up to date', time=2000, sound=False)


def _prompt(new, cur):
    """What's new first, then Install / Later. Returns True for Install."""
    if True:
        msg = 'A new FEFC app is available: %s. You have %s.' % (version_label(new), version_label(cur))
        wn = whats_new(new, cur)
        if wn:   # full-size scrollable notes first, then the short Install / Later question
            xbmcgui.Dialog().textviewer('FEFC app update: %s' % version_label(new), msg + '\n\n' + wn)
        msg += ' Download and install it now?'
        return xbmcgui.Dialog().yesno('FEFC update', msg, nolabel='Later', yeslabel='Install', defaultbutton=xbmcgui.DLG_YESNO_YES_BTN)

BASE = 'https://fefc-collection.pages.dev'
CTA = [('Discord', 'Join the FEFC Discord: discord.gg/d8A9xHTey7'),
       ('X', 'Follow @FanEditFanClub on X'),
       ('Facebook Group', 'Join the FEFC Facebook Group'),
       ('Reddit', 'Join r/FanEditFanClub on Reddit')]


def _get_json(url, timeout=15):
    req = urllib.request.Request(url, headers={'User-Agent': 'FEFC-Kodi'})
    return json.loads(urllib.request.urlopen(req, timeout=timeout).read().decode('utf-8'))


TICKER_ICONS = {'discord': ('\ue001', 'FF5865F2'), 'facebook': ('\ue002', 'FF1877F2'),
                'x': ('\ue003', 'FFFFFFFF'), 'reddit': ('\ue004', 'FFFF4500')}


def _cta(c):
    ic = TICKER_ICONS.get(c[0].split()[0].lower())
    return ('[COLOR %s]%s[/COLOR]  JOIN  %s' % (ic[1], ic[0], c[1])) if ic else 'JOIN  ' + c[1]


def _new_files_ticker_items():
    """Count line + recent titles from the same feed the daily notifier publishes with its social posts."""
    out = []
    try:
        feed = _get_json(NEW_FILES_FEED + '?t=%d' % int(time.time()), timeout=10) or {}
    except Exception as e:
        log('new-files ticker: %s' % e)
        return out
    title = str(feed.get('title') or '').strip()
    count = int(feed.get('count') or 0)
    if not title and count:
        label = 'New File' if count == 1 else 'New Files'
        verb = 'has been added' if count == 1 else 'have been added'
        title = '%s %s %s to The Fan Edit Fan Club Collection' % (count, label, verb)
    if title:
        out.append({'src': 'new', 'title': title})
    for name in (feed.get('recent') or [])[:12]:
        t = ' '.join(str(name or '').split())
        if t:
            out.append({'src': 'new', 'title': t})
    return out


def _ticker_mod():
    import sys
    lib = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'resources', 'lib')
    if lib not in sys.path:
        sys.path.insert(0, lib)
    import ticker
    return ticker


def _model_recent_items(limit=12):
    """Most recently-added collection files from the live model (refreshes every 180 min = the 3h resync),
    so the ticker's 'new files' items update on the same cycle as the database, not just the daily feed."""
    try:
        import sys
        lib = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'resources', 'lib')
        if lib not in sys.path:
            sys.path.insert(0, lib)
        import catalog
        base = (ADDON.getSetting('base_url') or BASE).rstrip('/') or BASE
        prof = xbmcvfs.translatePath(ADDON.getAddonInfo('profile'))
        try:
            mins = int(ADDON.getSetting('refresh_minutes') or 180)
        except ValueError:
            mins = 180
        m = catalog.load_model(base, os.path.join(prof, 'cache'), mins, log)
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
            xbmcgui.Window(10000).clearProperty('FEFC.PausedTitle')
            return
        full = xbmc.getCondVisibility('Window.IsActive(fullscreenvideo)')
        if not self.seen_full and not full and xbmc.getCondVisibility('Window.IsActive(videos)'):
            p = xbmc.getInfoLabel('Container.FolderPath') or ''
            if p.startswith('plugin://plugin.video.fefc/'):
                self.last_list = p
        if full:
            self.seen_full = True
            self.restore_until = 0.0
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
                xbmc.executebuiltin('Container.Update(%s,replace)' % self.last_list)
                self.restore_until = time.time() + 2.5
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
            self.vid = vid
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
        vid, ml = self.vid, None
        self.vid = None
        try:
            ml = self._ml()
            if self.total and self.pos >= self.total * 0.95:
                ml.clear_playback(vid)       # finished: no longer "continue watching"
            elif self.pos > 5:
                ml.set_playback(vid, self.pos, self.name, self.total)
            if ml.linked:
                threading.Thread(target=ml.sync, daemon=True).start()
        except Exception as e:
            log('finish: %s' % e)


def refresh_home_counts():
    try:
        import sys
        sys.path.insert(0, xbmcvfs.translatePath(ADDON.getAddonInfo('path')))
        from resources.lib import router
        home = xbmcgui.Window(10000)
        for k, v in router.home_counts().items():
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

    def _bundled(self, sound):
        f = xbmcvfs.translatePath('special://xbmc/media/fefc-home-wall%s.mp4' % ('' if sound else '-silent'))
        return f if xbmcvfs.exists(f) or os.path.exists(f) else ''

    def _fetch(self):
        try:
            os.makedirs(os.path.dirname(self.path), exist_ok=True)
            req = urllib.request.Request(self.URL, headers={'User-Agent': 'FEFC-Kodi'})
            with urllib.request.urlopen(req, timeout=30) as r:
                data = r.read(20 * 1024 * 1024)
            if len(data) > 100000 and data[4:8] == b'ftyp':
                with open(self.path + '.tmp', 'wb') as f:
                    f.write(data)
                os.replace(self.path + '.tmp', self.path)
        except Exception as e:
            log('home wall download: %s' % e)
        self.fetching = False

    def playing(self):
        return xbmcgui.Window(10000).getProperty('FEFC.Wall') == '1'

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
        src = self._bundled(sound) or self._bundled(not sound)
        if not src:
            if not os.path.exists(self.path):
                if not self.fetching:
                    self.fetching = True
                    self.t_next = time.time() + 60
                    threading.Thread(target=self._fetch, daemon=True).start()
                return
            src = self.path
        li = xbmcgui.ListItem('FEFC', offscreen=True)
        li.setProperty('fefc_wall', '1')
        if at > self.LOOP - 3:
            at = 0.0
        if at > 0.5:
            li.setProperty('StartOffset', '%.2f' % at)
        home.setProperty('FEFC.Wall', '1')
        self.cur_sound = sound
        try:
            log('wall OpenFile at=%.2f sound=%s' % (at, sound))
            self._repeat = False
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
            except Exception:
                pass
            if not self._repeat:
                try:
                    xbmc.executeJSONRPC('{"jsonrpc":"2.0","id":1,"method":"Player.SetRepeat","params":{"playerid":1,"repeat":"one"}}')
                    self._repeat = True
                except Exception:
                    pass
            if sound != self.cur_sound:
                self._start(pl, sound, self.pos)
                return
            # RepeatOne does not loop a file that is not in a playlist, so the player hits EOF and
            # the next start is a new OpenFile. Seek the same player back to the start instead.
            if self.pos > self.LOOP - 1.2 and time.time() - getattr(self, '_seeked', 0) > 2:
                self._seeked = time.time()
                try:
                    pl.seekTime(0)
                except Exception:
                    pass
            if at_home:
                if self.pos > self.LOOP - 0.6 or self.pos < 0.35:
                    home.setProperty('FEFC.WallSeam', '1')
                else:
                    home.clearProperty('FEFC.WallSeam')
            return
        if cur:
            return
        # Player stopped while browsing or on Home. Resume the same loop; do not stack a second one.
        if home.getProperty('FEFC.Ready') != '1' or time.time() < self.t_next or self.fails >= 3:
            return
        self._start(pl, sound, self.pos if self.pos > 0.5 else 0.0)


class SkipIntro(xbmcgui.WindowDialog):
    """Focused SKIP tile. Bottom-right, inside the TV safe area, clear of the intro's centre."""

    def __init__(self):
        super().__init__()
        try:
            from resources.lib.wallplan import skip_button
            x, y, w, h = skip_button()
        except Exception:
            x, y, w, h = 1540, 910, 260, 92
        self.done = False
        self.btn = xbmcgui.ControlButton(x, y, w, h, 'SKIP', font='font13_title', textColor='FFFFFFFF',
                                         focusedColor='FFFFFFFF', alignment=6,
                                         focusTexture='fefc-ol-focus.png', noFocusTexture='fefc-ol-tile.png')
        self.addControl(self.btn)
        self.setFocus(self.btn)

    def _go(self):
        if self.done:
            return
        self.done = True
        try:
            xbmc.Player().stop()
        except Exception:
            pass
        self.close()

    def onControl(self, c):
        self._go()

    def onAction(self, action):
        aid = action.getId()
        select = {xbmcgui.ACTION_SELECT_ITEM, xbmcgui.ACTION_MOUSE_LEFT_CLICK, 401}
        if aid in select or aid in (xbmcgui.ACTION_PREVIOUS_MENU, xbmcgui.ACTION_NAV_BACK, xbmcgui.ACTION_STOP):
            self._go()


def details_sfx():
    """Play the file's franchise clip once when its details page opens (web parity). Local wav only; never a remote URL."""
    if not xbmc.getCondVisibility('Window.IsActive(movieinformation)'):
        _last_info[0] = ''
        return
    url = xbmc.getInfoLabel('ListItem.Property(fefc_sfx)')
    key = xbmc.getInfoLabel('ListItem.Property(fefc_id)')
    if not url or key == _last_info[0]:
        return
    _last_info[0] = key
    try:
        from sfxpref import sfx_enabled as _sfx_on
    except Exception:
        _sfx_on = lambda raw: str(raw).strip().lower() != 'false'
    if not _sfx_on(ADDON.getSetting('play_sfx')) or _foreground_video():
        return
    def go():
        try:
            d = xbmcvfs.translatePath('special://profile/addon_data/plugin.video.fefc/sfx/')
            os.makedirs(d, exist_ok=True)
            dst = os.path.join(d, os.path.basename(url.split('?')[0]))
            if not os.path.exists(dst) or os.path.getsize(dst) < 1000:
                req = urllib.request.Request(url, headers={'User-Agent': 'FEFC-Kodi'})
                with urllib.request.urlopen(req, timeout=8) as r:
                    data = r.read(8 * 1024 * 1024)
                if len(data) < 1000 or data[:4] != b'RIFF':
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


def apply_nav_sound(on):
    """Sound On: GUI sounds play during the wall video (mode 2) and the FEFC sound skin stays selected.
    Sound Off: GUI sounds off so Back does not ignore the mute. Does not stop the wall player."""
    from resources.lib.backcue import gui_sound_mode
    home = xbmcgui.Window(10000)
    home.setProperty('FEFC.GuiSound', 'always' if on else 'off')
    mode = gui_sound_mode(bool(on))
    def _set(setting, value):
        xbmc.executeJSONRPC(json.dumps({'jsonrpc': '2.0', 'id': 1, 'method': 'Settings.SetSettingValue',
                                        'params': {'setting': setting, 'value': value}}))
    try:
        _set('audiooutput.guisoundmode', mode)
        if on:
            _set('lookandfeel.soundskin', 'resource.uisounds.fefc')
    except Exception as e:
        log('nav sound: %s' % e)
    try:
        d = xbmcvfs.translatePath('special://profile/keymaps')
        dst = os.path.join(d, 'fefc-nav.xml')
        if os.path.exists(dst):
            os.remove(dst)
            xbmc.executebuiltin('ReloadKeymaps')
            log('removed back-swallowing keymap')
    except Exception as e:
        log('nav keymap: %s' % e)


def _grid_pad_loop(monitor):
    """Move focus off a cell reserved under a portrait poster.

    The panel cannot skip an item by itself. This only runs while that cell is
    focused, and it never touches playback."""
    import sys
    lib = os.path.join(xbmcvfs.translatePath(ADDON.getAddonInfo('path')), 'resources', 'lib')
    if lib not in sys.path:
        sys.path.insert(0, lib)
    from shapes import skip_delta
    origin = None
    seen_path = ''
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
            if path != seen_path and total:
                seen_path = path
                if total <= 2500:
                    shown = 0
                    for i in range(total):
                        k = xbmc.getInfoLabel('Container.ListItemAbsolute(%d).Property(fefc_kind)' % i)
                        if k != 'spacer':
                            shown += 1
                    if shown:
                        xbmcgui.Window(10000).setProperty('FEFC.Shown', str(shown))
            cur = int(xbmc.getInfoLabel('Container.CurrentItem') or '0')
            pos = cur - 1 if cur else 0

            def lookup(i, pos=pos):
                off = i - pos
                if off == 0:
                    k = xbmc.getInfoLabel('Container.ListItem.Property(fefc_kind)')
                else:
                    k = xbmc.getInfoLabel('Container.ListItem(%d).Property(fefc_kind)' % off)
                return k or None

            step = skip_delta(pos, origin, lookup)
            if step is None:
                origin = pos
                if monitor.waitForAbort(0.2):
                    return
                continue
            if step == 'menu':
                xbmc.executebuiltin('SetFocus(9290)')
                origin = None
            else:
                xbmc.executebuiltin('SetFocus(%s,%d)' % (cid, pos + step))
                origin = pos
        except Exception as e:
            log('grid pad: %s' % e)
        if monitor.waitForAbort(0.05):
            return


def main():
    home = xbmcgui.Window(10000)
    if not xbmcvfs.exists(INTRO):
        home.setProperty('FEFC.Ready', '1')
        return  # plain Kodi: nothing to do
    monitor = xbmc.Monitor()
    ensure_source()
    set_select_action()
    cb = installed_build()
    if cb:
        xbmcgui.Window(10000).setProperty('FEFC.Version', 'FEFC app ' + version_label(cb))
        set_update_state(cb, state='checking')
    if ADDON.getSettingBool('open_on_start') or ADDON.getSettingBool('play_intro'):
        # wait for the home screen to be up
        for _ in range(60):
            if monitor.waitForAbort(0.5):
                return
            if xbmc.getCondVisibility('Window.IsActive(home)'):
                break
        if ADDON.getSettingBool('play_intro'):
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
        if ADDON.getSettingBool('open_on_start') and xbmc.getSkinDir() != 'skin.fefc':  # the FEFC skin's home already is the FEFC menu
            xbmc.executebuiltin('ActivateWindow(Videos,plugin://plugin.video.fefc/,return)')
    home.setProperty('FEFC.Ready', '1')
    try:
        import sys as _sys
        _lib = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'resources', 'lib')
        if _lib not in _sys.path:
            _sys.path.insert(0, _lib)
        from sfxpref import sfx_enabled, should_persist_on
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
    wall = HomeWall()
    next_feed = 0.0
    next_counts = 0.0
    next_new_files = 0.0
    next_catalog = time.time() + 25
    next_due = 0.0
    ticker_shown = ['']
    t_start = time.time()
    checked = False
    last_check = 0.0
    try:
        sync_notify_prefs()
    except Exception as e:
        log('notify prefs start: %s' % e)
    perm_asked = [False]
    threading.Thread(target=_grid_pad_loop, args=(monitor,), daemon=True).start()
    while not monitor.abortRequested():
        now = time.time()
        try:
            maybe_ask_notify_perm(perm_asked)
        except Exception as e:
            log('notify perm ask: %s' % e)
        try:
            consume_pending_nav()
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
                    import catalog
                    base = (ADDON.getSetting('base_url') or BASE).rstrip('/') or BASE
                    prof = xbmcvfs.translatePath(ADDON.getAddonInfo('profile'))
                    cache = os.path.join(prof, 'cache')
                    try:
                        mins = int(ADDON.getSetting('refresh_minutes') or 180)
                    except ValueError:
                        mins = 180
                    catalog.load_model(base, cache, mins, log, force=True)
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
            log('details sfx: %s' % e)
        try:
            wall.tick()
        except Exception as e:
            log('home wall: %s' % e)
        try:
            if not wall.playing():
                watcher.tick()
        except Exception as e:
            log('watcher: %s' % e)
        try:
            tracker.tick()
        except Exception as e:
            log('tracker: %s' % e)
        # update check right after the intro (every launch), popup once; re-checked every 6 h to keep the tile badge current
        if not checked and now - t_start > 4 and (xbmc.getCondVisibility('Window.IsActive(home)') or now - t_start > 120):
            checked = True
            last_check = now
            ADDON.setSetting('last_update_check', str(now))
            check_update(prompt=not xbmc.Player().isPlaying())
        elif checked and now - last_check > 21600:
            last_check = now
            check_update(prompt=False)
        if monitor.waitForAbort(0.2 if wall.playing() else 0.5):
            break


if __name__ == '__main__':
    main()
