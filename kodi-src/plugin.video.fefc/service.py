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
    """version.json lists one APK per package id; download the one matching this install (legacy org.xbmc.kodi
    installs fall back to the top-level url/sha256, which always stay the org.xbmc.kodi APK)."""
    p = ((new.get('packages') or {}).get(my_package())) or {}
    return p.get('url') or new.get('url', ''), int(p.get('size') or new.get('size') or 0), p.get('sha256') or new.get('sha256') or ''


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
        marker = '/Android/data/com.fefc.kodi/files'
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
    xbmc.executebuiltin('StartAndroidActivity(com.fefc.kodi,android.intent.action.VIEW,,fefcnotify://perm,,,,com.fefc.kodi.FefcNotifyActivity)')


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
    xbmc.executebuiltin('Dialog.Close(all,true)')
    xbmc.sleep(300)
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
                                prog.update(min(99, int(done * 100 / total)), 'FEFC update',
                                            'Downloading %s: %d / %d MB' % (version_label(new), done >> 20, total >> 20))
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
        xbmcgui.Dialog().ok('FEFC update', 'The download did not finish after several tries. Check the connection and pick Update again; it will continue where it stopped.')
        return
    xbmc.executebuiltin('Dialog.Close(all,true)')
    uri = None
    pkg = my_package()
    for marker, name in (('/files/', 'ext'), ('/cache/', 'extcache')):
        if '/Android/data/' in dst and marker in dst:
            uri = 'content://%s.fefcupdate/%s/%s' % (pkg, name, dst.split(marker, 1)[1]); break
    if uri is None:
        for marker, name in (('/files/', 'int'), ('/cache/', 'cache')):
            if '/%s/' % pkg in dst and marker in dst:
                uri = 'content://%s.fefcupdate/%s/%s' % (pkg, name, dst.split(marker, 1)[1]); break
    if uri is None:  # unknown location: Kodi's own exported file provider
        uri = 'content://%s.file/#' % pkg + dst
    log('launching installer: %s' % uri)
    # 5th argument 1 = FLAG_GRANT_READ_URI_PERMISSION so the installer can read our FileProvider URI
    xbmc.executebuiltin('StartAndroidActivity(,android.intent.action.VIEW,application/vnd.android.package-archive,%s,1)' % uri)


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


def set_update_state(cur, new=None, avail=False):
    """Home Update tile: always shows the installed version; when an update is waiting, the new version and a NEW badge."""
    home = xbmcgui.Window(10000)
    cv = (str((cur or {}).get('version') or '').strip() or ('build %s' % (cur or {}).get('build', '?')))
    if avail and new:
        nv = (str(new.get('version') or '').strip() or ('build %s' % new.get('build')))
        if nv == cv:   # same version name, newer build: say which build
            nv, cv = 'build %s' % new.get('build'), 'build %s' % (cur or {}).get('build', '?')
        home.setProperty('FEFC.UpdateAvail', '1')
        home.setProperty('FEFC.UpdateLabel', 'Update v%s' % re.sub(r'(?i)\s*beta$', '', nv))
    else:
        home.clearProperty('FEFC.UpdateAvail')
        home.setProperty('FEFC.UpdateLabel', 'Up To Date')


def check_update(manual=False, prompt=True):
    """Compare the installed FEFC app build with the latest published one (the GitHub Action publishes version.json).
    Always refreshes the home Update tile; shows the what's-new + Install / Later popup when prompt is true."""
    cur = installed_build()
    if not cur:
        if manual:
            xbmcgui.Dialog().ok('FEFC', 'This is not the FEFC app build, so there is no app update to check. Add-on updates arrive automatically.')
        return
    try:
        req = urllib.request.Request(VERSION_URL + '?t=%d' % int(time.time()), headers={'User-Agent': 'FEFC-Kodi'})
        new = json.loads(urllib.request.urlopen(req, timeout=15).read().decode('utf-8'))
    except Exception as e:
        log('update check failed: %s' % e)
        if manual:
            xbmcgui.Dialog().ok('FEFC', 'Could not check for updates right now.')
        return
    avail = int(new.get('build', 0)) > int(cur.get('build', 0))
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


def build_ticker():
    """Community news + newly added collection files (same new-files.json feed as the phone notifications)."""
    base = (ADDON.getSetting('base_url') or BASE).rstrip('/')
    new_items = []
    try:
        new_items = _new_files_ticker_items()
    except Exception as e:
        log('new-files ticker merge: %s' % e)
    community = []
    try:
        community = _get_json(base + '/api/feed').get('items') or []
    except Exception as e:
        log('feed: %s' % e)
    if not community:
        try:
            for p in _get_json(base + '/data/community-feed.json').get('posts') or []:
                community.append({'src': p.get('src') or p.get('label') or '', 'title': p.get('title') or ''})
        except Exception as e:
            log('community-feed: %s' % e)
    items = list(new_items) + list(community)
    parts = []
    k = 0
    for it in items[:40]:
        t = ' '.join(str(it.get('title') or '').split())
        if not t:
            continue
        src = str(it.get('src') or '').strip()
        if src.lower() == 'new':
            parts.append('[COLOR FFFFB02E]NEW[/COLOR]  %s' % t)
        else:
            ic = TICKER_ICONS.get(src.lower().replace('twitter', 'x'))
            if ic:  # brand icon glyph (bundled in the FEFC Jura font) right before the post, like the web ticker
                parts.append('[COLOR %s]%s[/COLOR]  %s' % (ic[1], ic[0], t))
            else:
                parts.append(('%s: %s' % (src.upper(), t)) if src else t)
        k += 1
        if k % 3 == 0:
            parts.append(_cta(CTA[(k // 3 - 1) % len(CTA)]))
    if not parts:
        parts = [_cta(c) for c in CTA]
    return '   •   '.join(parts) + '   •   '



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
    """OnLive-style Home background. 0.3.22: a 75 s 1280x720 seamless loop bundled in the APK (instant start; the
    still first frame is the skin background so there is never a blank wait). Two encodes: with the original FEFC
    ambience (intro.mp3 tail, ~-20 LUFS, TP -5.9 dBTP) and silent, picked by the SOUND toggle. Falls back to a
    one-time download when the bundle is missing. Stopped as soon as Home is left or anything else wants the player."""
    URL = BASE + '/assets/home-wall.mp4'
    LOOP = 75.0

    def __init__(self):
        self.path = os.path.join(xbmcvfs.translatePath('special://profile/addon_data/plugin.video.fefc/'), 'home-wall-v2.mp4')
        self.fetching = False
        self.fails = 0
        self.t_next = 0.0
        self.cur_sound = None

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
        if at > 0.5:
            li.setProperty('StartOffset', '%.2f' % at)
        home.setProperty('FEFC.Wall', '1')
        self.cur_sound = sound
        try:
            pl.play(src, li, windowed=True)
            xbmc.executebuiltin('PlayerControl(RepeatOne)')
        except Exception as e:
            log('home wall play: %s' % e)
            self.fails += 1
            home.clearProperty('FEFC.Wall')
        self.t_next = time.time() + 2

    def tick(self):
        home = xbmcgui.Window(10000)
        pl = xbmc.Player()
        sound = home.getProperty('FEFC.SoundOff') != '1'
        at_home = xbmc.getCondVisibility('Window.IsActive(home) + !Window.IsActive(fullscreenvideo)') and home.getProperty('FEFC.Ready') == '1'
        if self.playing():
            cur = ''
            try:
                cur = pl.getPlayingFile() if pl.isPlaying() else ''
            except Exception:
                pass
            if not at_home or (cur and 'home-wall' not in cur):
                if 'home-wall' in cur:
                    self.stop()
                else:
                    home.clearProperty('FEFC.Wall')   # something else took the player
                    home.clearProperty('FEFC.WallSeam')
                return
            if not cur:   # loop ended or failed: restart straight away
                home.clearProperty('FEFC.Wall')
                self.t_next = 0.0
            else:
                try:
                    t = pl.getTime()
                except Exception:
                    t = 1.0
                # hide the decoder restart behind the identical still frame
                if t > self.LOOP - 0.6 or t < 0.35:
                    home.setProperty('FEFC.WallSeam', '1')
                else:
                    home.clearProperty('FEFC.WallSeam')
                if sound != self.cur_sound:   # SOUND toggled: swap encode, same position
                    self._start(pl, sound, t)
                return
        if not at_home or pl.isPlaying() or home.getProperty('FEFC.PausedTitle') or time.time() < self.t_next:
            return
        if self.fails >= 3:
            return
        self._start(pl, sound)


class SkipIntro(xbmcgui.WindowDialog):
    """Small overlay on the intro video: 'Skip intro' is focused, one press of OK goes straight to Home."""

    def __init__(self):
        super().__init__()
        self.done = False
        self.addControl(xbmcgui.ControlImage(1010, 600, 230, 64, 'fefc-lc-pill.png', colorDiffuse='DD000000'))
        self.btn = xbmcgui.ControlButton(1020, 608, 210, 48, 'SKIP INTRO  >', font='font13_title', textColor='FF000000',
                                         focusedColor='FF000000', alignment=6,
                                         focusTexture='fefc-lc-pill.png', noFocusTexture='fefc-lc-pill.png')
        self.addControl(self.btn)
        self.setFocus(self.btn)

    def onControl(self, c):
        self.done = True
        try:
            xbmc.Player().stop()
        except Exception:
            pass
        self.close()

    def onAction(self, action):
        if action.getId() in (xbmcgui.ACTION_PREVIOUS_MENU, xbmcgui.ACTION_NAV_BACK, xbmcgui.ACTION_STOP):
            self.onControl(None)


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
    if ADDON.getSetting('play_sfx') != 'true' or (xbmc.Player().isPlaying() and not xbmcgui.Window(10000).getProperty('FEFC.Wall')):
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
        set_update_state(cb)
    if ADDON.getSettingBool('open_on_start') or ADDON.getSettingBool('play_intro'):
        # wait for the home screen to be up
        for _ in range(60):
            if monitor.waitForAbort(0.5):
                return
            if xbmc.getCondVisibility('Window.IsActive(home)'):
                break
        if ADDON.getSettingBool('play_intro'):
            xbmc.executebuiltin('PlayMedia(%s,noresume)' % INTRO)
            xbmc.sleep(1500)
            # wait until the intro finishes (or is skipped), max 60 s; after ~3 s show a focused 'Skip intro' button
            skip = None
            for n in range(120):
                if monitor.waitForAbort(0.5):
                    return
                if not xbmc.Player().isPlaying():
                    break
                if n == 6 and skip is None:
                    try:
                        skip = SkipIntro()
                        skip.show()
                    except Exception as e:
                        log('skip intro: %s' % e)
            if skip is not None:
                try:
                    skip.close()
                except Exception:
                    pass
                del skip
        home.setProperty('FEFC.Ready', '1')  # the home screen stays hidden behind a black splash until the intro has finished
        if ADDON.getSettingBool('open_on_start') and xbmc.getSkinDir() != 'skin.fefc':  # the FEFC skin's home already is the FEFC menu
            xbmc.executebuiltin('ActivateWindow(Videos,plugin://plugin.video.fefc/,return)')
    home.setProperty('FEFC.Ready', '1')
    home.setProperty('FEFC.SoundOff', '' if ADDON.getSetting('play_sfx') == 'true' else '1')
    # main loop: news ticker, pause-on-back, daily app update notice
    watcher = Watcher()
    tracker = Tracker()
    wall = HomeWall()
    next_feed = 0.0
    next_counts = 0.0
    next_new_files = 0.0
    t_start = time.time()
    checked = False
    last_check = 0.0
    try:
        sync_notify_prefs()
    except Exception as e:
        log('notify prefs start: %s' % e)
    perm_asked = [False]
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
        if now >= next_feed:
            def refresh():
                try:
                    home.setProperty('FEFC.Ticker', build_ticker())
                except Exception as e:
                    log('ticker: %s' % e)
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
