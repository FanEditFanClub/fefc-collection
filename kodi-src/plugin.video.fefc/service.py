# -*- coding: utf-8 -*-
"""FEFC startup service. Only acts inside the branded FEFC app (detected by the bundled intro video); on plain Kodi it does nothing.
 - adds the "Fan Edit Fan Club" file source (sources.xml) when missing (read by Kodi at its next start)
 - plays the FEFC intro once per launch, then opens the FEFC add-on as the home screen
"""
import json
import os
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
        msg = 'A new FEFC app is available (build %s, you have %s). Download it now?' % (new.get('build'), cur.get('build'))
        if xbmcgui.Dialog().yesno('FEFC update', msg, nolabel='Later', yeslabel='Download'):
            xbmc.executebuiltin('StartAndroidActivity(,android.intent.action.VIEW,,%s)' % new.get('url', ''))
    elif manual:
        xbmcgui.Dialog().ok('FEFC', 'You have the latest FEFC app (Kodi %s, build %s).' % (cur.get('kodi'), cur.get('build')))


def main():
    if not xbmcvfs.exists(INTRO):
        return  # plain Kodi: nothing to do
    monitor = xbmc.Monitor()
    ensure_source()
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
        if ADDON.getSettingBool('open_on_start') and xbmc.getSkinDir() != 'skin.fefc':  # the FEFC skin's home already is the FEFC menu
            xbmc.executebuiltin('ActivateWindow(Videos,plugin://plugin.video.fefc/,return)')
    # app update notice (at most once a day)
    try:
        last = float(ADDON.getSetting('last_update_check') or 0)
    except ValueError:
        last = 0
    if time.time() - last > 86400 and not monitor.waitForAbort(20):
        ADDON.setSetting('last_update_check', str(time.time()))
        check_update()


if __name__ == '__main__':
    main()
