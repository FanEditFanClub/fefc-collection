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


def install_update(new):
    """Download the new APK (verified against the published sha256) and hand it to Android's package installer."""
    import hashlib
    url = new.get('url', '')
    dst = xbmcvfs.translatePath('special://temp/FEFC-Kodi-update.apk')
    prog = xbmcgui.DialogProgress()
    prog.create('FEFC update', 'Downloading the new FEFC app...')
    ok = False
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'FEFC-Kodi'})
        h = hashlib.sha256()
        with urllib.request.urlopen(req, timeout=30) as r, open(dst + '.part', 'wb') as f:
            total = int(r.headers.get('Content-Length') or new.get('size') or 0)
            done = 0
            while True:
                chunk = r.read(256 * 1024)
                if not chunk:
                    break
                f.write(chunk)
                h.update(chunk)
                done += len(chunk)
                if total:
                    prog.update(min(99, int(done * 100 / total)), 'Downloading the new FEFC app... %d / %d MB' % (done >> 20, total >> 20))
                if prog.iscanceled():
                    raise RuntimeError('cancelled')
        if new.get('sha256') and h.hexdigest() != new['sha256']:
            raise RuntimeError('checksum mismatch')
        os.replace(dst + '.part', dst)
        ok = True
    except Exception as e:
        log('update download failed: %s' % e)
        try:
            os.remove(dst + '.part')
        except OSError:
            pass
    prog.close()
    if not ok:
        xbmcgui.Dialog().ok('FEFC update', 'The download did not finish. Try again later.')
        return
    uri = None
    for marker, name in (('/files/', 'ext'), ('/cache/', 'extcache')):
        if '/Android/data/' in dst and marker in dst:
            uri = 'content://org.xbmc.kodi.fefcupdate/%s/%s' % (name, dst.split(marker, 1)[1]); break
    if uri is None:
        for marker, name in (('/files/', 'int'), ('/cache/', 'cache')):
            if '/org.xbmc.kodi/' in dst and marker in dst:
                uri = 'content://org.xbmc.kodi.fefcupdate/%s/%s' % (name, dst.split(marker, 1)[1]); break
    if uri is None:  # unknown location: Kodi's own exported file provider
        uri = 'content://org.xbmc.kodi.file/#' + dst
    log('launching installer: %s' % uri)
    # 5th argument 1 = FLAG_GRANT_READ_URI_PERMISSION so the installer can read our FileProvider URI
    xbmc.executebuiltin('StartAndroidActivity(,android.intent.action.VIEW,application/vnd.android.package-archive,%s,1)' % uri)


def check_update(manual=False):
    """Compare the installed FEFC app build with the latest published one (the GitHub Action publishes version.json)."""
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
    if int(new.get('build', 0)) > int(cur.get('build', 0)):
        msg = 'A new FEFC app is available: %s. You have %s. Download and install it now?' % (version_label(new), version_label(cur))
        if xbmcgui.Dialog().yesno('FEFC update', msg, nolabel='Later', yeslabel='Install', defaultbutton=xbmcgui.DLG_YESNO_YES_BTN):
            install_update(new)
    elif manual:
        xbmcgui.Dialog().ok('FEFC', 'You have the latest FEFC app: %s (on Kodi %s).' % (version_label(cur), cur.get('kodi')))


BASE = 'https://fefc-collection.pages.dev'
CTA = [('Discord', 'Join the FEFC Discord: discord.gg/d8A9xHTey7'),
       ('X', 'Follow @FanEditFanClub on X'),
       ('Facebook Group', 'Join the FEFC Facebook Group'),
       ('Reddit', 'Join r/FanEditFanClub on Reddit')]


def _get_json(url, timeout=15):
    req = urllib.request.Request(url, headers={'User-Agent': 'FEFC-Kodi'})
    return json.loads(urllib.request.urlopen(req, timeout=timeout).read().decode('utf-8'))


def build_ticker():
    """Same community news as the web app's ticker: the live /api/feed, else data/community-feed.json; a join call-to-action every 3rd item."""
    base = (ADDON.getSetting('base_url') or BASE).rstrip('/')
    items = []
    try:
        items = _get_json(base + '/api/feed').get('items') or []
    except Exception as e:
        log('feed: %s' % e)
    if not items:
        try:
            for p in _get_json(base + '/data/community-feed.json').get('posts') or []:
                items.append({'src': p.get('src') or p.get('label') or '', 'title': p.get('title') or ''})
        except Exception as e:
            log('community-feed: %s' % e)
    parts = []
    k = 0
    for it in items[:30]:
        t = ' '.join(str(it.get('title') or '').split())
        if not t:
            continue
        src = str(it.get('src') or '').strip()
        parts.append(('%s: %s' % (src.upper(), t)) if src else t)
        k += 1
        if k % 3 == 0:
            parts.append('JOIN  ' + CTA[(k // 3 - 1) % len(CTA)][1])
    if not parts:
        parts = ['JOIN  ' + c[1] for c in CTA]
    return '        \u2022        '.join(parts) + '        \u2022        '


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


def main():
    home = xbmcgui.Window(10000)
    if not xbmcvfs.exists(INTRO):
        home.setProperty('FEFC.Ready', '1')
        return  # plain Kodi: nothing to do
    monitor = xbmc.Monitor()
    ensure_source()
    cb = installed_build()
    if cb:
        xbmcgui.Window(10000).setProperty('FEFC.Version', 'FEFC app ' + version_label(cb))
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
            # wait until the intro finishes (or is skipped), max 60 s
            for _ in range(120):
                if monitor.waitForAbort(0.5):
                    return
                if not xbmc.Player().isPlaying():
                    break
        home.setProperty('FEFC.Ready', '1')  # the home screen stays hidden behind a black splash until the intro has finished
        if ADDON.getSettingBool('open_on_start') and xbmc.getSkinDir() != 'skin.fefc':  # the FEFC skin's home already is the FEFC menu
            xbmc.executebuiltin('ActivateWindow(Videos,plugin://plugin.video.fefc/,return)')
    home.setProperty('FEFC.Ready', '1')
    # main loop: news ticker, pause-on-back, daily app update notice
    watcher = Watcher()
    tracker = Tracker()
    next_feed = 0.0
    try:
        last = float(ADDON.getSetting('last_update_check') or 0)
    except ValueError:
        last = 0
    t_start = time.time()
    checked = time.time() - last <= 86400
    while not monitor.abortRequested():
        now = time.time()
        if now >= next_feed:
            def refresh():
                try:
                    home.setProperty('FEFC.Ticker', build_ticker())
                except Exception as e:
                    log('ticker: %s' % e)
            threading.Thread(target=refresh, daemon=True).start()
            next_feed = now + 1200
        try:
            watcher.tick()
        except Exception as e:
            log('watcher: %s' % e)
        try:
            tracker.tick()
        except Exception as e:
            log('tracker: %s' % e)
        if not checked and now - t_start > 25:
            checked = True
            ADDON.setSetting('last_update_check', str(now))
            check_update()
        if monitor.waitForAbort(0.5):
            break


if __name__ == '__main__':
    main()
