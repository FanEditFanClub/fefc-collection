"""Kodi routes for plugin.video.fefc. All data comes from resources/lib/catalog.py (the live FEFC catalogue)."""
import os
import sys
import threading
import time
from urllib.parse import parse_qsl, urlencode, quote_plus

import xbmc
import xbmcaddon
import xbmcgui
import xbmcplugin
import xbmcvfs

from . import catalog
from . import mylist as mylist_mod
from . import downloads as downloads_mod
from . import namesort
from .webcounts import FOLD

ADDON = xbmcaddon.Addon()
PAGE = 100000  # 0.4.0: no pagination - every item on one scrollable page (Kodi loads art lazily)
CONTACT_EMAIL = 'faneditfanclub@gmail.com'
FEEDBACK_FORM_URL = 'https://is.gd/UVko0K'  # 0.5.1: short link for the Google Form (redirects to the docs.google.com form); the QR code and the shown URL both use this.



def _kids(m, fid):
    """Children of a folder; a Drive shortcut folder lists its target's children (like the web app)."""
    it = m['items'].get(fid)
    if it and it[2] and it[3]:
        fid = it[3]
    return m['kids'].get(fid, [])

def _log(msg):
    xbmc.log('[plugin.video.fefc] ' + str(msg), xbmc.LOGINFO)


def _base():
    b = (ADDON.getSetting('base_url') or '').strip() or 'https://fefc-collection.pages.dev'
    return b.rstrip('/')


def _model():
    prof = xbmcvfs.translatePath(ADDON.getAddonInfo('profile'))
    try:
        mins = int(ADDON.getSetting('refresh_minutes') or 180)
    except ValueError:
        mins = 180
    return catalog.load_model(_base(), os.path.join(prof, 'cache'), mins, _log)


def _ml():
    prof = xbmcvfs.translatePath(ADDON.getAddonInfo('profile'))
    return mylist_mod.MyList(os.path.join(prof, 'mylist'), _base())


def _dl():
    prof = xbmcvfs.translatePath(ADDON.getAddonInfo('profile'))
    return downloads_mod.Downloads(os.path.join(prof, 'downloads'))


SORTS = [('az', 'Name A-Z'), ('za', 'Name Z-A'), ('added', 'Recently Added'), ('files', 'Most Files')]


def _sort_path():
    return os.path.join(xbmcvfs.translatePath(ADDON.getAddonInfo('profile')), 'sort.json')


def _sort_get(fid):
    try:
        import json
        with open(_sort_path(), 'r', encoding='utf-8') as f:
            v = json.load(f).get(fid)
        return v if v in dict(SORTS) else 'az'
    except Exception:
        return 'az'


def _pref(k, default=''):
    try:
        import json
        with open(_sort_path(), 'r', encoding='utf-8') as f:
            return json.load(f).get(k) or default
    except Exception:
        return default


def _sort_set(fid, key):
    import json
    try:
        with open(_sort_path(), 'r', encoding='utf-8') as f:
            d = json.load(f)
    except Exception:
        d = {}
    d[fid] = key
    os.makedirs(os.path.dirname(_sort_path()), exist_ok=True)
    with open(_sort_path(), 'w', encoding='utf-8') as f:
        json.dump(d, f)


def _newest(m, i):
    """Newest added date (YYYY-MM-DD) of a file or of anything inside a folder (memoised)."""
    memo = m.setdefault('_newest', {})
    if i in memo:
        return memo[i]
    if not m['items'][i][2]:
        r = m['added'].get(i) or ''
    else:
        r = ''
        for k in _kids(m, i):
            t = _newest(m, k)
            if t > r:
                r = t
    memo[i] = r
    return r


def _descendant_videos(m, fid, cap=20000):
    out, st = [], [fid]
    seen = set()
    while st and len(out) < cap:
        x = st.pop()
        if x in seen:
            continue
        seen.add(x)
        for k in _kids(m, x):
            if m['items'][k][2]:
                st.append(m['items'][k][3] if m['items'][k][3] in m['items'] and m['items'][m['items'][k][3]][2] else k)
            else:
                out.append(k)
    return out


def _sorted_kids(m, ks, key):
    nk = lambda i: catalog.natkey(m['items'][i][0])
    folders = [k for k in ks if m['items'][k][2]]
    vids = [k for k in ks if not m['items'][k][2]]

    def one(rows):
        if key == 'za':
            return sorted(rows, key=nk, reverse=True)
        if key == 'added':
            rows = sorted(rows, key=nk)
            return sorted(rows, key=lambda i: _newest(m, i), reverse=True)
        if key == 'files':
            rows = sorted(rows, key=nk)
            return sorted(rows, key=lambda i: m['cnt'].get(i, 1), reverse=True)
        return sorted(rows, key=nk)
    return one(folders) + one(vids)


COLL_ID = '1fEaxNbFIrEwKRygETVm4jgtJGVAqKxGB'
TBC_ID = '1503Wl56hzRppaIFcQisvQksOaeYOEjnk'


def _fmt(n, one, many):
    return '{:,} {}'.format(n, one if n == 1 else many)


def home_counts():
    """Home tile sub-labels, worded like the web app: 'N collections · N files', '★ N Starred', 'N Genres'."""
    m = _model()

    def line(fid):
        # same numbers as the web app's countsLine (see webcounts.py)
        key = {m['root']: 'Main', COLL_ID: 'Collections', TBC_ID: 'TBC'}.get(fid)
        wc = (m.get('web_counts') or {}).get(key)
        if wc:
            folders, files = wc
        else:
            folders = sum(1 for k in m['kids'].get(fid, []) if m['items'][k][2])
            files = len(_descendant_videos(m, fid, cap=100000))
        return _fmt(folders, 'collection', 'collections') + '  \u00b7  ' + _fmt(files, 'file', 'files')
    meta = m.get('people_meta') or {}
    people = sum(1 for k, (n, r) in meta.items() if k in m['items'] and (m.get('rcnt') or m['cnt']).get(k))
    genres = len(set(m.get('genre_videos', {})) | set(m.get('genre_folders', {})))
    try:
        stars = len(_ml().ids())
    except Exception:
        stars = 0
    try:
        dls = _dl().count()
    except Exception:
        dls = 0
    mylist = 'History  \u00b7  %d Starred' % stars
    if dls:
        mylist += '  \u00b7  %d Download%s' % (dls, '' if dls == 1 else 's')
    return {'Main': line(m['root']), 'Collections': line(COLL_ID), 'TBC': line(TBC_ID),
            'People': _fmt(people, 'Collection', 'Collections'), 'Genres': _fmt(genres, 'Genre', 'Genres') if genres else '',
            'MyList': mylist}


def _url(handle_url, **kw):
    return handle_url + '?' + urlencode(kw)


class Router:
    def __init__(self, argv):
        self.url = argv[0]
        self.handle = int(argv[1])
        self.params = dict(parse_qsl(argv[2][1:])) if len(argv) > 2 and argv[2] else {}
        self._mydb = None
        self._content = 'files'
        self._land = False  # True once any landscape card (folder / tool / Support Us) is added
        self._vid = False   # 0.3.22: True once any video file is added (files are always portrait)

    def mydb(self):
        if self._mydb is None:
            self._mydb = _ml()
        return self._mydb

    # -- list item builders --------------------------------------------------------------------
    def _art(self, li, art, video=False):
        if art:
            li.setArt({'thumb': art, 'icon': art, 'fanart': art, **({'poster': art} if video else {})})

    def _fanart_default(self, li):
        li.setArt({'fanart': 'special://home/addons/plugin.video.fefc/resources/fanart.jpg'})

    def add_folder(self, label, art='', info=None, landscape='', props=None, **kw):
        li = xbmcgui.ListItem(label, offscreen=True)
        land = landscape or art
        self._art(li, art)
        if land:
            li.setArt({'landscape': land, 'thumb': land, 'fanart': land or art})
        props = dict(props or {})
        props.setdefault('fefc_kind', 'folder')
        props.setdefault('fefc_centerlabel', '1')
        for k, v in props.items():
            li.setProperty(k, v)
        self._land = True
        tag = li.getVideoInfoTag()
        tag.setTitle(label)
        if info:
            tag.setPlot(info)
        xbmcplugin.addDirectoryItem(self.handle, _url(self.url, **kw), li, True)

    def add_dir_item(self, m, fid):
        v = m['items'][fid]
        art = catalog.folder_art(m, _base(), fid)
        gs = m['vgenres'].get(fid) or []
        if fid == '1503Wl56hzRppaIFcQisvQksOaeYOEjnk' or v[3] == '1503Wl56hzRppaIFcQisvQksOaeYOEjnk':
            # Same To Be Catalogued tile + destination as Home. No count badge on the tile.
            t = 'special://xbmc/addons/skin.fefc/media/fefc-tbc-tile.png'
            self.add_folder('To Be Catalogued', t, ', '.join(gs), landscape=t, action='folder', id='1503Wl56hzRppaIFcQisvQksOaeYOEjnk')
            return
        if fid in (m.get('people_meta') or {}) or v[1] in (FOLD['actors'], FOLD['directors']):
            # Original Drive folder name (surname as catalogued). Not the metadata full name.
            self.add_folder(namesort.original_folder_name(v[0]), art, ', '.join(gs), action='folder', id=fid,
                            props={'fefc_people': '1'})
            return
        self.add_folder(v[0], art, ', '.join(gs), action='folder', id=fid)

    def add_tool(self, label, plot, art='DefaultAddonService.png', folder=False, landscape='', **kw):
        li = xbmcgui.ListItem(label, offscreen=True)
        # Sort / Shuffle / similar tools are landscape cards (same shape as folders)
        low = (label or '').lower()
        if not landscape:
            if 'shuffle' in low:
                landscape = 'special://xbmc/addons/skin.fefc/media/fefc-shuffle-tile.png'
            elif 'sort' in low:
                landscape = 'special://xbmc/addons/skin.fefc/media/fefc-sort-tile.png'
        land = landscape or art
        li.setArt({'thumb': land, 'icon': art, 'landscape': land, 'fanart': land})
        li.setProperty('fefc_kind', 'action')
        li.setProperty('fefc_centerlabel', '1')
        self._land = True
        tag = li.getVideoInfoTag()
        tag.setTitle(label)
        tag.setPlot(plot)
        if not folder:
            li.setProperty('IsPlayable', 'false')
        xbmcplugin.addDirectoryItem(self.handle, _url(self.url, **kw), li, folder)

    def add_video(self, m, vid):
        self._vid = True
        v = m['items'][vid]
        base = _base()
        info = catalog.video_info(m, vid)
        title = catalog.display_title(v[0])
        li = xbmcgui.ListItem(title, offscreen=True)
        art = catalog.poster_for(m, base, vid)
        self._art(li, art, video=True)
        on = self.mydb().has(vid)
        li.setProperty('fefc_id', vid)
        li.setProperty('fefc_kind', 'video')
        rel = catalog.sfx_up(m, vid)  # franchise clip: nearest ancestor folder that has clips (played by the service on the details page)
        wav = catalog.sfx_wav(rel) if rel else ''
        if wav:
            li.setProperty('fefc_sfx', catalog.abs_url(base, wav))
        li.setProperty('fefc_mylabel', 'Remove from My List' if on else 'Add to My List')
        # 0.4.2: details-page Download button label — "Downloaded" once the file is on the device.
        try:
            _dl_label = 'Downloaded' if _dl().has(vid) else 'Download'
        except Exception:
            _dl_label = 'Download'
        li.setProperty('fefc_download_label', _dl_label)
        li.addContextMenuItems([('Remove from My List' if on else 'Add to My List',
                                 'RunPlugin(%s)' % _url(self.url, action='mylist_toggle', id=vid))])
        tag = li.getVideoInfoTag()
        tag.setTitle(title)
        tag.setMediaType('movie')
        plot = info['plot']
        extra = []
        pb = self.mydb().playback(vid)
        if pb and (pb.get('sec') or 0) > 30:
            extra.append('Continue watching from %s' % pb.get('formatted'))
            try:
                tag.setResumePoint(float(pb['sec']), float(pb.get('total') or (info['runtime'] or 0) * 60 or pb['sec'] * 4))
            except Exception:
                pass
        rl = ['%s %s/10' % (l if l != 'imdb' else 'IMDb', sc) for l, sc, _v in info['ratings']]
        if rl:
            extra.append('Ratings: ' + '  |  '.join(rl))
        fi = (m.get('fileinfo') or {}).get(vid) or (m.get('fileinfo') or {}).get(m['items'][vid][3] if m['items'][vid][3] else '')
        if fi and fi.get('s'):
            extra.append('File: %.2f GB' % (fi['s'] / 1073741824.0))
        if extra:
            plot = (plot + '\n\n' if plot else '') + '\n'.join(extra)
        if plot:
            tag.setPlot(plot)
        if info['year']:
            tag.setYear(info['year'])
        gs = [g for g in (m['vgenres'].get(vid) or []) if g != 'Uncategorized']
        if gs:
            tag.setGenres(gs)
        if info['director']:
            tag.setDirectors(info['director'])
        if info['cast']:
            tag.setCast([xbmc.Actor(c, '', i) for i, c in enumerate(info['cast'])])
        if info['runtime']:
            tag.setDuration(int(info['runtime']) * 60)
        if info['editor']:
            tag.setStudios([info['editor']])
        first = True
        for label, score, votes in info['ratings']:
            tag.setRating(score, votes, label, first)
            first = False
        # 0.4.2: the details header shows the default (first) rating with its source, plus a source icon.
        # The ratings list is ordered IFDb, MRDb, IMDb, so the first entry is the default.
        if info['ratings']:
            _disp = {'FEFC-IFDb': ('ifdb', 'FanEdit.org'), 'MRDb': ('mrdb', 'MRDb'), 'imdb': ('imdb', 'IMDb')}
            _lab, _sc, _v = info['ratings'][0]
            _src, _name = _disp.get(_lab, ('imdb', _lab))
            li.setProperty('fefc_rating_src', _src)
            li.setProperty('fefc_rating_text', '%s %s/10' % (_name, _sc))
        added = m['added'].get(vid)
        if added:
            tag.setDateAdded(added + ' 00:00:00')
        tr = info.get('trailer')
        if isinstance(tr, dict) and tr.get('src') == 'youtube' and tr.get('id'):
            tag.setTrailer('plugin://plugin.video.youtube/play/?video_id=' + tr['id'])
        li.setProperty('IsPlayable', 'true')
        xbmcplugin.addDirectoryItem(self.handle, _url(self.url, action='play', id=vid), li, False)

    def _title(self):
        a = self.params.get('action') or 'root'
        try:
            if a == 'folder':
                m = _model()
                fid = self.params.get('id') or m['root']
                return 'Collections' if fid == m['root'] else m['items'][fid][0]
            return {'root': 'Fan Edit Fan Club', 'genres': 'Genres', 'recent': 'New Arrivals', 'history': 'Recently Opened', 'people': 'Actors & Directors'}.get(a) or {
                'genre': self.params.get('genre', 'Genre'),
                'mylist': 'My List',
                'search': 'Fan Edit Optimus'}.get(a, 'Fan Edit Fan Club')
        except Exception:
            return 'Fan Edit Fan Club'

    def _loc(self):
        """Location signature for back-navigation detection (folder id, or the action for top-level views)."""
        a = self.params.get('action') or 'root'
        if a == 'folder':
            try:
                return 'folder:' + (self.params.get('id') or _model()['root'])
            except Exception:
                return 'folder:' + (self.params.get('id') or '')
        if a == 'genre':
            return 'genre:' + self.params.get('genre', '')
        return a

    def end(self, content='files', cache=True):
        xbmcplugin.setPluginCategory(self.handle, self._title())
                # 0.3.22: video files are ALWAYS portrait posters; folders / tools / docs are landscape cards. Any list with a
        # video uses view 501, whose folder layout draws a landscape card, so mixed folders keep both shapes.
        content = 'movies' if self._vid else 'files'
        xbmcplugin.setContent(self.handle, content)
        xbmcplugin.addSortMethod(self.handle, xbmcplugin.SORT_METHOD_UNSORTED)
        xbmcplugin.endOfDirectory(self.handle, cacheToDisc=cache)
        # 0.5.2: remember where we are so run() can tell a ".." (parent) navigation from a fresh one.
        try:
            xbmcgui.Window(10000).setProperty('FEFC.LastLoc', self._loc())
        except Exception:
            pass
        # FEFC skin: view 500 = landscape grid (collections / tools), 501 = portrait poster grid (video files)
        if xbmc.getSkinDir() == 'skin.fefc':
            xbmc.executebuiltin('Container.SetViewMode(%d)' % (501 if content == 'movies' else 500))

    # -- routes ----------------------------------------------------------------------------------
    def root(self):
        m = _model()
        self.add_folder('Collections', '', 'Browse the collection folders, same tree as the FEFC app.', action='folder', id=m['root'])
        self.add_folder('New Arrivals', '', 'Newest files in the collection.', action='recent')
        self.add_folder('Genres', '', 'Browse by genre (a title can be in several genres).', action='genres')
        self.add_folder('My List', '', 'Your saved edits, synced with the FEFC web app.', action='mylist')
        self.add_folder('Search', '', 'Search every collection and edit.', action='search')
        self.add_folder('Read Me', '', 'Welcome and how the collection works.', action='readme')
        self.add_folder('Support Us', 'special://xbmc/addons/skin.fefc/media/fefc-support-tile.png', 'Patreon, PayPal and Venmo.', landscape='special://xbmc/addons/skin.fefc/media/fefc-support-tile.png', action='support')
        if xbmcvfs.exists('special://xbmc/fefc-build.json'):
            self.add_folder('Check for FEFC app update', '', 'See if a newer FEFC app is available.', action='update')
        self.end()

    def update(self):
        import service
        service.check_update(manual=True)
        if self.handle >= 0:
            xbmcplugin.endOfDirectory(self.handle, succeeded=False)

    def armback(self):
        """Keymap runs this, then the normal Back. Marks the press so the plugin reload does not play a second cue.
        When the sound skin is not set to always (wall video would mute it), play the wav here instead."""
        from .sfxpref import sfx_enabled
        from . import backcue
        home = xbmcgui.Window(10000)
        on = sfx_enabled(ADDON.getSetting('play_sfx'))
        skin_always = on and home.getProperty('FEFC.GuiSound') == 'always'
        try:
            last = float(home.getProperty('FEFC.BackAt') or '0')
        except ValueError:
            last = 0.0
        play, skip = backcue.arm_back(on, None, time.time(), last, skin_always)
        if skip:
            home.setProperty('FEFC.BackSkip', '1')
        if play:
            _play_back_sfx()
        if self.handle >= 0:
            xbmcplugin.endOfDirectory(self.handle, succeeded=False)

    def folder(self):
        m = _model()
        fid = self.params.get('id') or m['root']
        if str(fid).startswith('pt:'):
            return self.testing_folder(fid)
        page = int(self.params.get('page') or 0)
        ks = _kids(m, fid)
        # drop empty folders
        ks = [k for k in ks if not m['items'][k][2] or (m.get('rcnt') or m['cnt']).get(k)]
        key = _sort_get(fid)
        if fid in (FOLD['actors'], FOLD['directors']) and key in ('az', 'za'):
            # Alphabetical by the original folder name, not a parsed full name.
            ks = sorted(ks, key=lambda k: namesort.folder_sort_key(m['items'][k][0]))
            if key == 'za':
                ks.reverse()
        elif key != 'az':
            ks = _sorted_kids(m, ks, key)
        chunk = ks[page * PAGE:(page + 1) * PAGE]
        if fid == '1503Wl56hzRppaIFcQisvQksOaeYOEjnk' and not page:
            # 0.4.2: 01 - Testing is the first item in To Be Catalogued, with its own tile (the old
            # fefc-tbc-tile art says "TO BE CATALOGUED" and hid the "01 - Testing" label entirely).
            tile = 'special://xbmc/addons/skin.fefc/media/fefc-testing-tile.png'
            self.add_folder('01 - Testing', tile, 'App-only provider links. 2 verified videos.', landscape=tile, action='folder', id='pt:testing')
        if not page:
            self._maybe_sfx(catalog.sfx_for(m, fid))
            if ks:
                self.add_tool('Sort: %s   (select to change)' % dict(SORTS)[key], 'Change how this collection is sorted. Same options as the FEFC web app.',
                              action='sort', id=fid)
                if any(not m['items'][k][2] for k in ks) or any(m['items'][k][2] for k in ks):
                    self.add_tool('Shuffle Play', 'Play a random mix of edits from this collection.', 'DefaultMusicPlaylists.png', action='shuffle', id=fid)
        nf = nv = 0
        if not page:   # Support Us / Read First docs in this folder, like the web app's tiles
            seen_kind = set()
            for did, dname, kind in (m.get('docs') or {}).get((m['items'].get(fid) or [0, 0, 0, ''])[3] or fid, []):
                if kind == 'gdoc':
                    self.add_folder(dname, 'special://xbmc/addons/skin.fefc/media/fefc-doc-tile.png', 'Document (read-only).', landscape='special://xbmc/addons/skin.fefc/media/fefc-doc-tile.png', action='gdoc', id=did, title=dname)
                    continue
                if kind in seen_kind:
                    continue
                seen_kind.add(kind)
                if kind == 'support':
                    self.add_folder('Support Us', 'special://xbmc/addons/skin.fefc/media/fefc-support-tile.png', 'Patreon, PayPal and Venmo.', landscape='special://xbmc/addons/skin.fefc/media/fefc-support-tile.png', action='support')
                else:
                    self.add_folder('Read First', 'special://xbmc/addons/skin.fefc/media/fefc-readfirst-tile.png', 'Welcome and how the collection works.', landscape='special://xbmc/addons/skin.fefc/media/fefc-readfirst-tile.png', action='readme')
        for k in chunk:
            if m['items'][k][2]:
                self.add_dir_item(m, k)
                nf += 1
            else:
                self.add_video(m, k)
                nv += 1
        if (page + 1) * PAGE < len(ks):
            self.add_folder('Next page (%d more) >>' % (len(ks) - (page + 1) * PAGE), '', action='folder', id=fid, page=page + 1)
        self.end('movies' if nv > nf else 'files')

    def _sfx_local(self, url):
        """Download the wav once into the add-on's data folder and return its local path ('' if unavailable).
        playSFX must never be pointed at a remote/missing URL: on Android a failed open can crash Kodi."""
        import urllib.request
        d = xbmcvfs.translatePath('special://profile/addon_data/plugin.video.fefc/sfx/')
        os.makedirs(d, exist_ok=True)
        dst = os.path.join(d, os.path.basename(url.split('?')[0]))
        if not os.path.exists(dst) or os.path.getsize(dst) < 1000:
            req = urllib.request.Request(url, headers={'User-Agent': 'FEFC-Kodi'})
            with urllib.request.urlopen(req, timeout=8) as r:
                data = r.read(8 * 1024 * 1024)
            if len(data) < 1000 or data[:4] != b'RIFF':
                return ''
            with open(dst + '.tmp', 'wb') as f:
                f.write(data)
            os.replace(dst + '.tmp', dst)
        return dst

    def _maybe_sfx(self, rel):
        from .sfxpref import sfx_enabled
        if not sfx_enabled(ADDON.getSetting('play_sfx')) or not rel:
            return
        # playSFX mixes over the wall. It must not run on top of a film, and it must not use Player().play
        # (that would stop the ambience loop).
        try:
            import service as _svc
            if _svc._foreground_video():
                return
        except Exception:
            pass
        wav = catalog.sfx_wav(rel)
        if not wav:
            return
        try:
            path = self._sfx_local(catalog.abs_url(_base(), wav))
            if path:
                xbmc.playSFX(path, False)
        except Exception as e:
            _log('sfx failed: %s' % e)

    def genres(self):
        m = _model()
        art = m.get('genreart') or {}
        gk = set(m['genre_videos']) | set(m.get('genre_folders') or {})
        names = sorted(gk - {'Uncategorized', 'Unsorted'}) + (['Uncategorized'] if 'Uncategorized' in gk else [])
        for g in names:
            a = art.get(g) or {}
            img = catalog.abs_url(_base(), (a.get('img') or '').split('?')[0]) if a.get('img') else ''
            # 0.5.1: dedupe the folders too — duplicate folder shortcuts were all being counted, so the
            # genre totals ran high. Same one-entry-per-underlying-item logic as the home tile counts.
            self.add_folder('%s  (%d)' % (g, len(catalog.dedupe(m, m['genre_videos'].get(g, []))) + len(catalog.dedupe(m, m['genre_folders'].get(g, [])))), '', landscape=img, action='genre', genre=g)
        self.end()

    def genre(self):
        """Collections and files in a genre (like the web app), collections first, then files A-Z; paged."""
        m = _model()
        g = self.params['genre']
        page = int(self.params.get('page') or 0)
        nk = lambda i: catalog.natkey(m['items'][i][0])
        folders = sorted(catalog.dedupe(m, m['genre_folders'].get(g, [])), key=nk)
        vids = sorted(catalog.dedupe(m, m['genre_videos'].get(g, [])), key=nk)
        rows = folders + vids
        chunk = rows[page * PAGE:(page + 1) * PAGE]
        if not page:
            self._maybe_sfx(catalog.sfx_genre(m, g))
            if vids:
                self.add_tool('Shuffle Play', 'Play a random mix of edits from this genre.', 'DefaultMusicPlaylists.png', action='shuffle', genre=g)
        nf = nv = 0
        for k in chunk:
            if m['items'][k][2]:
                self.add_dir_item(m, k)
                nf += 1
            else:
                self.add_video(m, k)
                nv += 1
        if (page + 1) * PAGE < len(rows):
            self.add_folder('Next page (%d more) >>' % (len(rows) - (page + 1) * PAGE), '', action='genre', genre=g, page=page + 1)
        self.end('movies' if nv > nf else 'files')

    def recent(self):
        m = _model()
        vids = [i for i in m['added'] if i in m['items'] and not m['items'][i][2]]
        vids = catalog.dedupe(m, vids)
        vids.sort(key=lambda i: m['added'][i], reverse=True)
        page = int(self.params.get('page') or 0)
        for i in vids[page * PAGE:(page + 1) * PAGE]:
            self.add_video(m, i)
        if (page + 1) * PAGE < len(vids):
            self.add_folder('Next page (%d more) >>' % (len(vids) - (page + 1) * PAGE), '', action='recent', page=page + 1)
        xbmcplugin.addSortMethod(self.handle, xbmcplugin.SORT_METHOD_DATEADDED)
        self.end('movies', cache=False)

    def search(self):
        from . import searchflow
        q = self.params.get('q')
        if q is None:
            win = OptimusWindow()
            win.doModal()
            q = (win.query or '').strip()
            del win
            if not q:
                xbmcplugin.endOfDirectory(self.handle, succeeded=False)
                return
            # re-enter with the query so back/refresh works
            xbmc.executebuiltin('Container.Update(%s,replace)' % _url(self.url, action='search', q=q))
            xbmcplugin.endOfDirectory(self.handle, succeeded=False)
            return
        try:
            m = _model()
        except Exception as e:
            _log('search catalogue: %s' % e)
            xbmcgui.Dialog().notification('FEFC', searchflow.result_message(q, 0, True), xbmcgui.NOTIFICATION_ERROR, 4000)
            xbmcplugin.endOfDirectory(self.handle, succeeded=False)
            return
        res = catalog.search(m, q)
        nf = nv = 0
        for i in res:
            if m['items'][i][2]:
                self.add_dir_item(m, i)
                nf += 1
            else:
                nv += 1
                self.add_video(m, i)
        msg = searchflow.result_message(q, len(res), False)
        if msg:
            xbmcgui.Dialog().notification('FEFC', msg, xbmcgui.NOTIFICATION_INFO, 3000)
        self.end('movies' if nv > nf else 'files', cache=False)

    def searchbox(self):
        """Home Search tile (RunPlugin, no directory handle): the Optimus card collects the text, then the results list opens.
        The keyboard is not opened underneath the still-open card."""
        win = OptimusWindow()
        win.doModal()
        q = (win.query or '').strip()
        del win
        if q:
            xbmc.executebuiltin('ActivateWindow(Videos,"%s",return)' % _url(self.url, action='search', q=q))
        if self.handle >= 0:
            xbmcplugin.endOfDirectory(self.handle, succeeded=False)

    # -- My List (same data + sync backend as the FEFC web / Fire TV app) ---------------------------------
    def _resolve(self, m, sid):
        """A saved id -> an item in the model (the id itself, else a shortcut that points at it)."""
        if sid in m['items']:
            return sid
        for i, v in m['items'].items():
            if v[3] == sid:
                return i
        return None

    def mylist(self):
        m = _model()
        ml = self.mydb()
        if ml.linked and not self.params.get('nosync'):
            err = ml.sync()
            if err:
                _log('mylist sync: %s' % err)
        who = ml.db.get('user') or 'linked'
        dark = 'special://xbmc/addons/skin.fefc/media/fefc-ol-tile.png'
        link_plot = 'Share My List with the FEFC web app and Fire TV app: sign in with Google through your phone, or enter a 6-digit sync code.'
        if ml.linked:
            link_plot += ' Signed in as %s.' % who
        self.add_folder('Sync My List' if ml.linked else 'Link My List', dark, link_plot, landscape=dark, action='mylist_sync')
        nf = nv = 0
        shown = set()
        sortk = self.params.get('sort') or _pref('_mylist', 'date')
        if sortk not in ('date', 'az', 'za'):
            sortk = 'date'
        sort_name = {'date': 'Date added', 'az': 'Name A-Z', 'za': 'Name Z-A'}[sortk]
        self.add_folder('Sort: %s' % sort_name, dark, 'Date added, Name A-Z, or Name Z-A.', landscape=dark, action='mylist_sortswitch', cur=sortk)
        self.add_folder('Shuffle Play', dark, 'Play a random mix of starred videos.', landscape=dark, action='mylist_shuffle')
        self.add_folder('Recently Opened', dark, 'The last edits you opened or played (synced with the FEFC web app).', landscape=dark, action='history')
        try:
            ndl = _dl().count()
        except Exception:
            ndl = 0
        self.add_folder('Downloads' if not ndl else 'Downloads · %d' % ndl, dark, 'Videos downloaded to this device. Play offline, no streaming.', landscape=dark, action='downloads')
        ids = ml.ids()
        if sortk in ('az', 'za'):
            ids = sorted(ids, key=lambda x: catalog.natkey(m['items'][self._resolve(m, x) or x][0]) if self._resolve(m, x) else ())
            if sortk == 'za':
                ids.reverse()
        else:
            for sid in ml.continue_ids():
                i = self._resolve(m, sid)
                if i and not m['items'][i][2] and i not in shown:
                    self.add_video(m, i)
                    nv += 1
                    shown.add(i)
        for sid in ids:
            i = self._resolve(m, sid)
            if not i or i in shown:
                continue
            shown.add(i)
            if m['items'][i][2]:
                self.add_dir_item(m, i)
                nf += 1
            else:
                self.add_video(m, i)
                nv += 1
        if not shown:
            xbmcgui.Dialog().notification('My List', 'Empty. Press the menu/context key on an edit and choose Add to My List.', xbmcgui.NOTIFICATION_INFO, 5000)
        self.end('movies' if nv > nf else 'files', cache=False)

    def mylist_sortswitch(self):
        opts = [('date', 'Date added'), ('az', 'Name A-Z'), ('za', 'Name Z-A')]
        cur = self.params.get('cur') or _pref('_mylist', 'date')
        if cur not in dict(opts):
            cur = 'date'
        k = xbmcgui.Dialog().select('Sort My List', [n for _, n in opts], preselect=[i for i, _ in opts].index(cur))
        if k >= 0:
            _sort_set('_mylist', opts[k][0])
            xbmc.executebuiltin('Container.Update(%s,replace)' % _url(self.url, action='mylist', sort=opts[k][0], nosync='1'))
        if self.handle >= 0:
            xbmcplugin.endOfDirectory(self.handle, succeeded=False)

    def mylist_shuffle(self):
        """Shuffle starred videos only. Folders and the My List action tiles are not queued."""
        import random
        m = _model()
        ml = self.mydb()
        vids = []
        seen = set()
        for sid in ml.ids():
            i = self._resolve(m, sid)
            if not i or i in seen or m['items'][i][2]:
                continue
            seen.add(i)
            vids.append(i)
        if not vids:
            xbmcgui.Dialog().notification('FEFC', 'No starred videos to shuffle.', xbmcgui.NOTIFICATION_INFO, 3000)
            if self.handle >= 0:
                xbmcplugin.endOfDirectory(self.handle, succeeded=False)
            return
        pick = random.sample(vids, min(25, len(vids)))
        pl = xbmc.PlayList(xbmc.PLAYLIST_VIDEO)
        pl.clear()
        for v in pick:
            t = catalog.display_title(m['items'][v][0])
            li = xbmcgui.ListItem(t, path=_url('plugin://plugin.video.fefc/', action='play', id=v))
            li.getVideoInfoTag().setTitle(t)
            li.setProperty('IsPlayable', 'true')
            li.setProperty('fefc_kind', 'video')
            pl.add(_url('plugin://plugin.video.fefc/', action='play', id=v), li)
        xbmcgui.Dialog().notification('FEFC', 'Shuffle Play: %d starred videos' % len(pick), xbmcgui.NOTIFICATION_INFO, 3000)
        xbmc.Player().play(pl)
        if self.handle >= 0:
            xbmcplugin.endOfDirectory(self.handle, succeeded=False)

    def history(self):
        m = _model()
        ml = self.mydb()
        n = 0
        seen = set()
        for sid in ml.history_ids(60):
            i = self._resolve(m, sid)
            if not i or i in seen:
                continue
            seen.add(i)
            if m['items'][i][2]:
                self.add_dir_item(m, i)
            else:
                self.add_video(m, i)
                n += 1
        if not seen:
            xbmcgui.Dialog().notification('FEFC', 'Nothing opened yet.', xbmcgui.NOTIFICATION_INFO, 3000)
        self.end('movies', cache=False)

    def sort(self):
        fid = self.params['id']
        cur = _sort_get(fid)
        names = [n for k, n in SORTS]
        k = xbmcgui.Dialog().select('Sort this collection', names, preselect=[k for k, n in SORTS].index(cur))
        if k >= 0:
            _sort_set(fid, SORTS[k][0])
            xbmc.executebuiltin('Container.Update(%s,replace)' % _url(self.url, action='folder', id=fid))
        xbmcplugin.endOfDirectory(self.handle, succeeded=False)

    def shuffle(self):
        import random
        m = _model()
        if self.params.get('genre'):
            vids = catalog.dedupe(m, m['genre_videos'].get(self.params['genre'], []))
        else:
            vids = catalog.dedupe(m, _descendant_videos(m, self.params['id']))
        if not vids:
            xbmcgui.Dialog().notification('FEFC', 'Nothing to shuffle here.', xbmcgui.NOTIFICATION_INFO, 3000)
            xbmcplugin.endOfDirectory(self.handle, succeeded=False)
            return
        pick = random.sample(vids, min(25, len(vids)))
        pl = xbmc.PlayList(xbmc.PLAYLIST_VIDEO)
        pl.clear()
        for v in pick:
            t = catalog.display_title(m['items'][v][0])
            li = xbmcgui.ListItem(t, path=_url('plugin://plugin.video.fefc/', action='play', id=v))
            li.getVideoInfoTag().setTitle(t)
            li.setProperty('IsPlayable', 'true')
            pl.add(_url('plugin://plugin.video.fefc/', action='play', id=v), li)
        xbmcgui.Dialog().notification('FEFC', 'Shuffle Play: %d edits queued' % len(pick), xbmcgui.NOTIFICATION_INFO, 3000)
        xbmc.Player().play(pl)
        xbmcplugin.endOfDirectory(self.handle, succeeded=False)

    def people(self):
        """Flat actor/director list. Original Drive folder names, A–Z. Metadata full names are not shown.
        end() sets SORT_METHOD_UNSORTED so Kodi does not re-sort the labels."""
        m = _model()
        meta = m.get('people_meta') or {}
        role = self.params.get('role')
        rows = [k for k, (n, r) in meta.items() if (not role or r == role) and k in m['items'] and (m.get('rcnt') or m['cnt']).get(k)]
        rows.sort(key=lambda k: namesort.folder_sort_key(m['items'][k][0]))
        for k in rows:
            art = catalog.folder_art(m, _base(), k)
            self.add_folder(namesort.original_folder_name(m['items'][k][0]), art, action='folder', id=k,
                            props={'fefc_people': '1'})
        self.end()

    def _page_text(self, path):
        import html as _html
        import re
        import urllib.request
        req = urllib.request.Request(_base() + path, headers={'User-Agent': 'FEFC-Kodi'})
        raw = urllib.request.urlopen(req, timeout=15).read().decode('utf-8', 'replace')
        raw = re.sub(r'(?is)<(script|style|head)[^>]*>.*?</\1>', '', raw)
        raw = re.sub(r'(?i)</(p|h[1-6]|li|div|tr)>', '\n\n', raw)
        raw = re.sub(r'(?i)<br\s*/?>', '\n', raw)
        txt = _html.unescape(re.sub(r'<[^>]+>', '', raw)).replace('\xa0', ' ')
        return re.sub(r'\n{3,}', '\n\n', re.sub(r'[ \t]+', ' ', txt)).strip()

    def settings(self):
        """Menu-bar SETTINGS opens the FEFC settings (Notifications etc.); Kodi system settings are one entry away."""
        xbmc.executebuiltin('Addon.OpenSettings(plugin.video.fefc)')

    def kodi_settings(self):
        xbmc.executebuiltin('ActivateWindow(Settings)')

    def notify_perm(self):
        import service
        from .notifyplan import MESSAGES
        pkg = service.my_package()
        d = service._android_ext_files_dir() or ''
        path = os.path.join(d, 'fefc-notify-perm.txt') if d else ''
        if path and os.path.exists(path):
            try:
                os.remove(path)
            except OSError:
                pass
        xbmc.executebuiltin('StartAndroidActivity(%s,android.intent.action.VIEW,,"fefcnotify://perm",,,,,"com.fefc.kodi.FefcNotifyActivity")' % pkg)
        status = ''
        for _ in range(16):
            if path and os.path.exists(path):
                try:
                    status = open(path, encoding='utf-8', errors='ignore').read().strip()
                except Exception:
                    status = ''
                if status and status != 'prompt':
                    break
            xbmc.sleep(200)
        msg = MESSAGES.get(status) or ('No permission result came back from Android package %s. If no popup appeared, open this app in the system notification settings.' % pkg)
        if status in ('not_required', 'granted', 'already_granted', 'open_settings', 'denied', 'denied_settings', ''):
            xbmcgui.Dialog().ok('Notifications', msg)
        else:
            xbmcgui.Dialog().notification('Notifications', msg[:90], xbmcgui.NOTIFICATION_INFO, 5000)

    def sound_toggle(self):
        """Top-bar sound on/off (saved in the add-on settings, so it survives restarts and app updates)."""
        from .sfxpref import sfx_enabled
        on = not sfx_enabled(ADDON.getSetting('play_sfx'))
        ADDON.setSetting('play_sfx', 'true' if on else 'false')
        xbmcgui.Window(10000).setProperty('FEFC.SoundOff', '' if on else '1')
        try:
            import service
            service.apply_nav_sound(on)
        except Exception:
            pass
        xbmcgui.Dialog().notification('FEFC', 'Sound on' if on else 'Sound off', time=1500, sound=False)

    def about(self):
        dlg = xbmcgui.Dialog()
        build = {}
        try:
            import json
            with open(xbmcvfs.translatePath('special://xbmc/fefc-build.json'), 'r', encoding='utf-8') as f:
                build = json.load(f)
        except Exception:
            pass
        ver = str(build.get('version') or '').strip()
        label = ('%s (build %s)' % (ver, build.get('build'))) if ver else 'build %s' % build.get('build', '?')
        info = ('Fan Edit Fan Club\nFEFC app %s\nKodi %s\nAdd-on %s\nCollection: %s\n\n'
                'This is the Kodi version of the FEFC app. The collection is free; support us from the Support Us tile.'
                '\n\nFEFC is an unofficial community app built on Kodi (GPL-2.0-or-later). Not affiliated with the Kodi Foundation.'
                % (label, xbmc.getInfoLabel('System.BuildVersion').split(' ')[0], ADDON.getAddonInfo('version'), _base()))
        info += '\n\nQuestions or feedback? Email %s, or choose Give feedback below to scan a code.' % CONTACT_EMAIL
        while True:
            # 0.5.1: Give feedback is first — it was buried at the bottom of the list.
            k = dlg.select('About FEFC', ['Give feedback', 'Version and info', "What's new", 'Privacy Policy', 'Terms of Use', 'Open-source notices', 'Close'])
            if k < 0 or k == 6:
                break
            try:
                if k == 0:
                    self.feedback()
                elif k == 1:
                    dlg.textviewer('About FEFC', info)
                elif k == 2:
                    import json
                    import urllib.request
                    req = urllib.request.Request('https://fefc-collection.pages.dev/kodi-app/version.json?t=%d' % time.time(), headers={'User-Agent': 'FEFC-Kodi'})
                    j = json.loads(urllib.request.urlopen(req, timeout=15).read().decode('utf-8'))
                    out = []
                    for v in j.get('changelog') or []:
                        out.append("What's new in %s  (%s)" % (v.get('version'), v.get('date', '')))
                        out.extend(u'\u2022 ' + str(n) for n in v.get('notes') or [])
                        out.append('')
                    dlg.textviewer("What's new", '\n'.join(out).strip() or 'No release notes published yet.')
                elif k == 3:
                    dlg.textviewer('Privacy Policy', self._page_text('/privacy.html'))
                elif k == 4:
                    dlg.textviewer('Terms of Use', self._page_text('/terms.html'))
                elif k == 5:
                    with xbmcvfs.File('special://xbmc/FEFC-NOTICE.txt') as f:
                        dlg.textviewer('Open-source notices', f.read())
            except Exception as e:
                dlg.notification('FEFC', 'Could not load: %s' % str(e)[:60], xbmcgui.NOTIFICATION_ERROR, 4000)
        if self.handle >= 0:
            xbmcplugin.endOfDirectory(self.handle, succeeded=False)

    def feedback(self):
        """Feedback form QR (same remote-QR pattern as the Support and link windows).
        0.5.1: the QR code and the short URL are tappable — either opens the form in the browser."""
        qr_path = _qr_for(FEEDBACK_FORM_URL)
        lines = ['Give feedback on the FEFC app',
                 'Scan the code with your phone, or tap it to open the feedback form in your browser.',
                 'Or email us: %s' % CONTACT_EMAIL,
                 FEEDBACK_FORM_URL.replace('https://', '')]
        LinkWindow(lines, qr_path, open_url=FEEDBACK_FORM_URL).doModal()

    def mylist_toggle(self):
        m = _model()
        vid = self.params['id']
        ml = self.mydb()
        v = m['items'].get(vid)
        on = ml.toggle(vid, v[0] if v else '')
        msg = ('Added to My List' if on else 'Removed from My List') + (': ' + catalog.display_title(v[0]) if v else '')
        xbmcgui.Dialog().notification('FEFC', msg, xbmcgui.NOTIFICATION_INFO, 3000)
        hw = xbmcgui.Window(10000)
        hw.setProperty('FEFC.MyId', vid)
        hw.setProperty('FEFC.MyLabel', 'Remove from My List' if on else 'Add to My List')
        if ml.linked:
            err = ml.sync()
            if err:
                _log('mylist sync: %s' % err)
        if self.params.get('refresh') or xbmc.getInfoLabel('Container.PluginCategory') == 'My List':
            xbmc.executebuiltin('Container.Refresh')

    def mylist_sync(self):
        # Folder item: open the dialog, then close the directory handle so Back does not re-run it.
        def _end():
            if self.handle >= 0:
                xbmcplugin.endOfDirectory(self.handle, succeeded=False)
        home = xbmcgui.Window(10000)
        if xbmc.getCondVisibility('Window.IsActive(home)') and self.params.get('src') != 'menu':
            _log('mylist_sync: ignored (not an explicit press; Home is active)')
            _end()
            return
        if home.getProperty('FEFC.LinkOpen') == '1':
            _end()
            return
        home.setProperty('FEFC.LinkOpen', '1')
        try:
            self._mylist_sync()
        finally:
            home.clearProperty('FEFC.LinkOpen')
        _end()

    def _mylist_sync(self):
        ml = self.mydb()
        changed = False
        dlg = xbmcgui.Dialog()
        while True:
            opts = []
            acts = []
            if ml.linked:
                opts.append('Sync now'); acts.append('sync')
                opts.append('Unlink this device (%s)' % (ml.db.get('user') or 'linked')); acts.append('unlink')
            else:
                opts.append('Link with your phone (QR code: Google sign-in or a sync code on the web app)'); acts.append('qr')
                opts.append('Enter a 6-digit sync code from the web app'); acts.append('code')
                st = ml.status()
                if st.get('tv'):
                    opts.append('Sign in with Google (code for google.com/device)'); acts.append('device')
            opts.append('Close'); acts.append('close')
            k = dlg.select('My List sync', opts)
            if k < 0 or acts[k] == 'close':
                break
            a = acts[k]
            if a == 'sync':
                err = ml.sync()
                dlg.notification('My List', err or 'Synced', xbmcgui.NOTIFICATION_INFO if not err else xbmcgui.NOTIFICATION_ERROR, 3500)
            elif a == 'unlink':
                ml.unlink()
                dlg.notification('My List', 'Unlinked. Your list stays on this device.', xbmcgui.NOTIFICATION_INFO, 3500)
            elif a == 'code':
                from . import osinput
                code = osinput.get_text('Sync code (web app: My List > Sync My List > Create a code)', numeric=True)
                if code:
                    err = ml.link(code) or ml.sync()
                    dlg.notification('My List', err or 'Linked and synced', xbmcgui.NOTIFICATION_ERROR if err else xbmcgui.NOTIFICATION_INFO, 4000)
            elif a == 'qr':
                self._link_window(ml, 'qr')
            elif a == 'device':
                self._link_window(ml, 'device')
            changed = True
            if ml.linked and a in ('code', 'qr', 'device'):
                break
        # refresh only if something changed and the My List view is still the one on screen (never pop anything on Home)
        if changed and xbmc.getCondVisibility('Window.IsActive(videos) + String.Contains(Container.FolderPath,action=mylist)'):
            xbmc.executebuiltin('Container.Refresh')

    def _link_window(self, ml, mode):
        """On-screen link flow: QR code approved on a signed-in phone, or Google's device code."""
        try:
            if mode == 'qr':
                j = ml.qr_start()
                url, qid, secret, verify = j['url'], j['id'], j['secret'], j.get('verify', '')
                lines = ['Link My List', 'Scan the QR code with your phone (or open the address below).',
                         'On the phone, sign in with Google (or use a sync code) and tap Approve.',
                         'Check that the phone shows this confirm code: %s' % verify, url]
                ttl = int(j.get('expires_in') or 300)
            else:
                j = ml.device_start()
                url = j['verification_url']
                did = j['id']
                lines = ['Sign in with Google', 'On your phone or computer open: %s' % _short_url(url),
                         'Enter this code: %s' % j['user_code'], 'Then choose your Google account and allow.', _short_url(url)]
                ttl = int(j.get('expires_in') or 600)
        except Exception as e:
            xbmcgui.Dialog().ok('My List', 'Could not start linking: %s' % e)
            return
        qr_path = _qr_for(url)
        if mode == 'qr':
            lines[-1] = url.replace('https://', '')  # full link, own line, so it can be typed if needed
        win = LinkWindow(lines, qr_path)
        win.show()
        mon = xbmc.Monitor()
        t0 = time.time()
        status = 'pending'
        while not win.closed and not mon.abortRequested() and time.time() - t0 < ttl:
            if mon.waitForAbort(3):
                break
            try:
                status = ml.qr_poll(qid, secret) if mode == 'qr' else ml.device_poll(did)
            except Exception as e:
                _log('link poll: %s' % e)
                status = 'pending'
            if status in ('ok', 'expired', 'denied'):
                break
        win.close()
        del win
        if status == 'ok':
            err = ml.sync()
            xbmcgui.Dialog().notification('My List', err or 'Linked and synced', xbmcgui.NOTIFICATION_ERROR if err else xbmcgui.NOTIFICATION_INFO, 4000)
        elif status in ('expired', 'denied'):
            xbmcgui.Dialog().notification('My List', 'Linking %s.' % status, xbmcgui.NOTIFICATION_ERROR, 4000)

    # -- Read Me / Support Us (same content as the web app) -------------------------------------------------
    def castrows(self):
        """0.3.22: whole cast for the details screen, 3 names per row (no auto-scroll)."""
        m = _model(); vid = self.params.get('id', '')
        cast = []
        try:
            if vid in m['items']:
                cast = list(catalog.video_info(m, vid).get('cast') or [])
        except Exception:
            cast = []
        for i in range(0, len(cast), 3):
            r = cast[i:i + 3] + ['', '']
            li = xbmcgui.ListItem(r[0], r[1], offscreen=True)
            li.setProperty('c3', r[2])
            xbmcplugin.addDirectoryItem(self.handle, 'plugin://plugin.video.fefc/?action=noop', li, False)
        xbmcplugin.endOfDirectory(self.handle, cacheToDisc=False)

    def noop(self):
        pass

    def gdoc(self):
        """0.3.22: read-only view of a Google Doc from Fan Edit Collections (plain-text export; Drive is never changed)."""
        import urllib.request
        did = self.params.get('id', '')
        title = self.params.get('title') or 'Document'
        try:
            req = urllib.request.Request('https://docs.google.com/document/d/%s/export?format=txt' % did, headers={'User-Agent': 'FEFC-Kodi'})
            txt = urllib.request.urlopen(req, timeout=20).read().decode('utf-8-sig', 'replace').strip()
            if txt.lstrip().startswith('<'):
                raise ValueError('not shared publicly')
        except Exception as e:
            txt = 'Could not load this document right now (%s). It is also in the FEFC web app.' % e
        xbmcgui.Dialog().textviewer(title, txt)
        if self.handle >= 0:
            xbmcplugin.endOfDirectory(self.handle, succeeded=False)

    def readme(self):
        import html as _html
        import re
        import urllib.request
        txt = ''
        links = []
        try:
            req = urllib.request.Request(_base() + '/data/readfirst.html', headers={'User-Agent': 'FEFC-Kodi'})
            raw = urllib.request.urlopen(req, timeout=15).read().decode('utf-8', 'replace')

            def a(mo):
                u = _html.unescape(mo.group(1))
                label = re.sub(r'<[^>]+>', '', mo.group(2))
                lt = label.strip()
                if re.match(r'https?://', lt):
                    # a bare URL as link text: show a short clean form only
                    return re.sub(r'^https?://(www\.)?', '', lt).replace('/cw/', '/').rstrip('/')
                return label
            raw = re.sub(r'<a [^>]*href="([^"]+)"[^>]*>(.*?)</a>', a, raw, flags=re.S)
            raw = re.sub(r'</p>\s*<p>', '\n\n', raw)
            raw = re.sub(r'<br\s*/?>', '\n', raw)
            txt = _html.unescape(re.sub(r'<[^>]+>', '', raw)).replace('\xa0', ' ')
            txt = re.sub(r'\n{3,}', '\n\n', txt).strip()
            txt = re.sub(r'https?://\S+', '', txt)
            txt = re.sub(r'over 5,000!?', 'over 6,000!', txt)
        except Exception as e:
            txt = 'Could not load the Read Me right now (%s). It is also in the FEFC web app.' % e
        xbmcgui.Dialog().textviewer('Read Me: The Fan Edit Fan Club Collection', txt)
        if self.handle >= 0:
            xbmcplugin.endOfDirectory(self.handle, succeeded=False)

    SUPPORT = [('Patreon', 'https://www.patreon.com/cw/FanEditFanClub', 'From $1 / month'),
               ('PayPal', 'https://www.paypal.biz/faneditfanclub', 'One-time donation'),
               ('Venmo', 'https://venmo.com/u/FanEditFanClub', '@FanEditFanClub')]

    def support(self):
        """Support Us: PayPal / Patreon / Venmo tiles with QR codes (like the old Fire TV app and the web app)."""
        win = SupportWindow(self.SUPPORT)
        win.doModal()
        del win
        if self.handle >= 0:
            xbmcplugin.endOfDirectory(self.handle, succeeded=False)

    def _pt(self):
        if getattr(self, '_ptdoc', None) is None:
            from . import providers
            self._ptdoc = providers.fetch(_base())
        return self._ptdoc

    def testing_folder(self, fid=None):
        from . import providers
        fid = fid or self.params.get('id') or 'pt:testing'
        try:
            doc = self._pt()
        except Exception as e:
            _log('testing list: %s' % e)
            xbmcgui.Dialog().notification('FEFC', 'Testing list unavailable', xbmcgui.NOTIFICATION_ERROR, 4000)
            self.end('files', cache=False)
            return
        idx = providers.index(doc)
        has_kids = set(v.get('parent') for v in idx.values() if v.get('parent'))
        # 0.4.2: video tile, not the DOCUMENT tile — these are video files and links, not documents.
        tile = 'special://xbmc/addons/skin.fefc/media/fefc-video-tile.png'
        rows = [v for v in idx.values() if v.get('parent') == fid]
        rows.sort(key=lambda r: (0 if r.get('kind') == 'folder' else 1, (r.get('name') or '').lower()))
        for r in rows:
            plot = r.get('status_line') or ((r.get('status') or '') + '\nNot checked. This is a catalog link, not a film.')
            if r.get('catalog'):
                plot = 'Catalog: %s\n%s' % (r['catalog'], plot)
            if r.get('kind') == 'folder' and r['id'] in has_kids:
                self.add_folder(r['name'], tile, plot, landscape=tile, action='folder', id=r['id'])
            elif r.get('kodi_play') and r.get('play_url'):
                self._add_external(r, plot)
            else:
                # 0.4.2: a folder with no children below it is a LINK to an external folder, not a
                # container — navigating into it showed an empty list ("nothing happens"). Open the
                # provider page instead. Same for file/page links.
                self.add_tool(r['name'], plot, tile, folder=False, landscape=tile, action='open_link', id=r['id'])
        self.end('files', cache=False)

    def open_link(self):
        from . import providers
        rec = None
        try:
            rec = providers.find(self._pt(), self.params.get('id') or '')
        except Exception as e:
            _log('open link: %s' % type(e).__name__)
        if not rec or not rec.get('url'):
            xbmcgui.Dialog().ok('FEFC', 'No link is stored for this item.')
        elif rec.get('kodi_play') and rec.get('play_url'):
            self.play_external()
            return
        else:
            label = rec.get('open_label') or 'Open link'
            xbmcgui.Dialog().ok(label, providers.status_line(rec) + '\n\nIn-app Play is off. Opening the provider page.')
            _log('open provider %s' % (rec.get('name') or '')[:80])
            xbmc.executebuiltin('StartAndroidActivity(,android.intent.action.VIEW,,"%s")' % rec['url'].replace('"', '%22'))
        if self.handle >= 0:
            xbmcplugin.endOfDirectory(self.handle, succeeded=False)

    def _add_external(self, rec, plot):
        # 0.5.0: a playable video file — portrait poster grid (view 501), not the landscape card grid.
        # _vid flips end() to content 'movies', so these render as portrait posters like every other video.
        self._vid = True
        li = xbmcgui.ListItem(rec.get('name') or 'Verified file', offscreen=True)
        # 0.5.0: portrait VIDEO poster — the landscape VIDEO tile squashed into a 222x333 poster slot
        # is why these showed with no real artwork. No per-file poster exists for provider links, so
        # the portrait tile is the artwork until a real thumbnail is wired per provider.
        poster = 'special://xbmc/addons/skin.fefc/media/fefc-video-poster.png'
        li.setArt({'thumb': poster, 'icon': poster, 'poster': poster})
        li.setProperty('IsPlayable', 'true')
        li.setProperty('fefc_kind', 'video')
        tag = li.getVideoInfoTag()
        tag.setTitle(rec.get('name') or 'Verified file')
        tag.setPlot(plot)
        xbmcplugin.addDirectoryItem(self.handle, _url(self.url, action='play_external', id=rec['id']), li, False)

    def play_external(self):
        from . import providers
        rec = None
        try:
            rec = providers.find(self._pt(), self.params.get('id') or '')
        except Exception as e:
            _log('external play: %s' % type(e).__name__)
        url = (rec or {}).get('play_url') or ''
        if not rec or not rec.get('kodi_play') or not url:
            xbmcgui.Dialog().ok('FEFC', providers.status_line(rec or {}))
            xbmcplugin.setResolvedUrl(self.handle, False, xbmcgui.ListItem())
            return
        li = xbmcgui.ListItem(path=url)
        mime = rec.get('mime') or ''
        if not mime:
            low = url.lower().split('?', 1)[0]
            mime = 'video/x-matroska' if low.endswith('.mkv') else 'video/mp4'
        li.setMimeType(mime)
        li.setContentLookup(False)
        xbmcplugin.setResolvedUrl(self.handle, True, li)

    def play(self):
        m = _model()
        vid = self.params['id']
        v = m['items'].get(vid)
        name = v[0] if v else 'video.mp4'
        url = catalog.stream_url(_base(), vid, name)
        li = xbmcgui.ListItem(path=url)
        low = name.lower()
        mime = 'video/x-matroska' if low.endswith('.mkv') else 'video/mp4'
        li.setMimeType(mime)
        li.setContentLookup(False)
        xbmcplugin.setResolvedUrl(self.handle, True, li)

    # -- external players (same as the web / Fire TV app details page) -----------------------------------
    def _target(self, vid):
        m = _model()
        v = m['items'].get(vid)
        return (v[3] if v and v[3] else vid), (v[0] if v else 'video.mp4')

    def open_vlc(self):
        """Open the pages.dev stream (supports Range/seek) in VLC for Android."""
        import re
        tid, name = self._target(self.params['id'])
        nm = re.sub(r'[^A-Za-z0-9._\-]+', '_', name.strip())
        if not re.search(r'(?i)\.(mp4|m4v|mkv|webm|mov|avi|mpg|mpeg|m2ts|ts)$', nm):
            nm = re.sub(r'\.[^.]+$', '', nm) or 'video'
            nm += '.mp4'
        if len(nm) > 120:
            nm = nm[:100] + os.path.splitext(nm)[1]
        url = _base() + '/api/stream/' + tid + '/' + nm
        _log('open in VLC: %s' % url)
        xbmc.executebuiltin('StartAndroidActivity(org.videolan.vlc,android.intent.action.VIEW,video/*,%s)' % url)
        xbmcgui.Dialog().notification('FEFC', 'Opening in VLC. If nothing happens, install VLC for Android.', xbmcgui.NOTIFICATION_INFO, 4000)

    def open_drive(self):
        """Open the file's Google Drive page in the Drive app (no app chooser).
        0.5.1: the Drive package is named explicitly — with no package Android showed an
        'Open with' chooser first, and only opened Drive after it was dismissed."""
        tid, name = self._target(self.params['id'])
        url = 'https://drive.google.com/file/d/' + tid + '/view'
        _log('open in Drive: %s' % url)
        xbmc.executebuiltin('StartAndroidActivity(com.google.android.apps.docs,android.intent.action.VIEW,,%s)' % url)
        xbmcgui.Dialog().notification('FEFC', 'Opening in Drive: ' + catalog.display_title(name), xbmcgui.NOTIFICATION_INFO, 4000)

    # -- downloads (local copies; own section in My List) ---------------------------------------------------
    def download(self):
        """Download the video to the device, with a progress bar. Resumable; re-runs pick up where they stopped."""
        import urllib.request
        vid = self.params['id']
        m = _model()
        v = m['items'].get(vid)
        name = v[0] if v else 'video.mp4'
        dl = _dl()
        if dl.has(vid):
            xbmcgui.Dialog().notification('FEFC', 'Already downloaded — find it in My List > Downloads.', xbmcgui.NOTIFICATION_INFO, 4000)
            return
        tid, _nm = self._target(vid)
        url = catalog.stream_url(_base(), tid, name)
        dst = dl.file_path(vid, name)
        part = dst + '.part'
        prog = xbmcgui.DialogProgressBG()
        prog.create('FEFC download', 'Downloading %s...' % catalog.display_title(name))
        try:
            have = os.path.getsize(part) if os.path.exists(part) else 0
            hdr = {'User-Agent': 'FEFC-Kodi'}
            if have:
                hdr['Range'] = 'bytes=%d-' % have
            with urllib.request.urlopen(urllib.request.Request(url, headers=hdr), timeout=30) as r:
                if have and r.status != 206:
                    have = 0
                total = have + int(r.headers.get('Content-Length') or 0)
                with open(part, 'ab' if have else 'wb') as f:
                    done = have
                    while True:
                        if prog.isFinished():
                            prog.close()
                            xbmcgui.Dialog().notification('FEFC', 'Download paused — pick Download again to resume.', xbmcgui.NOTIFICATION_INFO, 4000)
                            return
                        chunk = r.read(256 * 1024)
                        if not chunk:
                            break
                        f.write(chunk)
                        done += len(chunk)
                        # DialogProgressBG is the same top-right background bar the software updater uses:
                        # it stays visible on every page, hides while a video plays fullscreen, and comes
                        # back when you hit Back. Keep it updating even when the total size is unknown.
                        # 0.4.4: show device storage left alongside the progress.
                        free = dl.free_bytes()
                        free_txt = ('  ·  %s free' % downloads_mod.fmt_size(free)) if free is not None else ''
                        if total:
                            prog.update(min(99, int(done * 100 / total)), 'FEFC download',
                                        '%s: %d / %d MB%s' % (catalog.display_title(name), done >> 20, total >> 20, free_txt))
                        else:
                            prog.update(0, 'FEFC download', '%s: %d MB downloaded%s' % (catalog.display_title(name), done >> 20, free_txt))
            os.replace(part, dst)
            dl.add(vid, name, dst, os.path.getsize(dst))
            prog.close()
            xbmcgui.Dialog().notification('FEFC', 'Download finished: ' + catalog.display_title(name), xbmcgui.NOTIFICATION_INFO, 5000)
        except Exception as e:
            prog.close()
            _log('download failed: %s' % e)
            xbmcgui.Dialog().ok('FEFC download', 'The download did not finish. Check the connection and pick Download again; it will continue where it stopped.')

    def downloads(self):
        """Downloads section: every local copy, newest first. Plays the file on the device (no streaming).
        0.4.4: a storage row at the top shows how much space is left on the device."""
        dl = _dl()
        free = dl.free_bytes()
        used = dl.used_bytes()
        fmt = downloads_mod.fmt_size
        if free is not None:
            self.add_tool('Device storage free: %s' % fmt(free),
                          'Downloads on this device use %s. Select for details.' % fmt(used),
                          'DefaultHarddisk.png', action='download_storage')
        else:
            self.add_tool('Device storage',
                          'Free space could not be read on this device. Select for details.',
                          'DefaultHarddisk.png', action='download_storage')
        rows = dl.all()
        if not rows:
            xbmcgui.Dialog().notification('Downloads', 'Nothing downloaded yet. Open a video and pick Download.', xbmcgui.NOTIFICATION_INFO, 5000)
            self._vid = True
            self.end()
            return
        for r in rows:
            li = xbmcgui.ListItem(catalog.display_title(r.get('name') or 'video.mp4'), offscreen=True)
            li.setProperty('IsPlayable', 'true')
            li.setProperty('fefc_kind', 'video')
            li.setProperty('fefc_download', 'true')
            poster = 'special://xbmc/addons/skin.fefc/media/fefc-video-poster.png'
            try:
                m = _model()
                if r.get('id') in m['items']:
                    poster = catalog.poster_for(m, _base(), r['id']) or poster
            except Exception:
                pass
            li.setArt({'thumb': poster, 'icon': poster, 'poster': poster})
            sz = r.get('size') or 0
            if sz:
                li.getVideoInfoTag().setPlot('Downloaded to this device  ·  %.2f GB' % (sz / 1073741824.0))
            li.addContextMenuItems([('Delete download', 'RunPlugin(%s)' % _url(self.url, action='download_delete', id=r['id']))])
            xbmcplugin.addDirectoryItem(self.handle, _url(self.url, action='play_download', id=r['id']), li, False)
        self._vid = True
        self.end()

    def download_storage(self):
        """Storage details dialog (from the Downloads section's storage row)."""
        dl = _dl()
        free = dl.free_bytes()
        total = dl.total_bytes()
        used = dl.used_bytes()
        n = dl.count()
        fmt = downloads_mod.fmt_size
        lines = []
        if total is not None and free is not None:
            lines.append('Device storage: %s free of %s' % (fmt(free), fmt(total)))
        elif free is not None:
            lines.append('Device storage free: %s' % fmt(free))
        else:
            lines.append('Device storage free: unknown on this device')
        lines.append('Downloads on this device: %s in %d file%s' % (fmt(used), n, '' if n == 1 else 's'))
        lines.append('')
        lines.append('Delete a download from its context menu to free space.')
        xbmcgui.Dialog().ok('FEFC downloads — storage', '\n'.join(lines))
        xbmcplugin.endOfDirectory(self.handle, succeeded=False)

    def play_download(self):
        vid = self.params['id']
        r = _dl().get(vid)
        if not r or not r.get('path') or not os.path.exists(r['path']):
            xbmcgui.Dialog().notification('FEFC', 'That download is gone — pick Download again to re-download it.', xbmcgui.NOTIFICATION_INFO, 4000)
            return
        li = xbmcgui.ListItem(path=r['path'])
        low = (r.get('name') or '').lower()
        li.setMimeType('video/x-matroska' if low.endswith('.mkv') else 'video/mp4')
        li.setContentLookup(False)
        xbmcplugin.setResolvedUrl(self.handle, True, li)

    def download_delete(self):
        vid = self.params['id']
        dl = _dl()
        r = dl.remove(vid)
        if r and r.get('path'):
            try:
                os.remove(r['path'])
            except OSError:
                pass
            try:
                os.remove(r['path'] + '.part')
            except OSError:
                pass
        xbmcgui.Dialog().notification('FEFC', 'Download deleted.', xbmcgui.NOTIFICATION_INFO, 3000)
        xbmc.executebuiltin('Container.Refresh')


def _png_rgb(path, rows):
    """Plain 8-bit RGB PNG (Kodi decodes this everywhere; 1-bit PNGs show up black/blank)."""
    import struct
    import zlib
    h, w = len(rows), len(rows[0]) // 3
    raw = b''.join(b'\x00' + r for r in rows)

    def chunk(t, d):
        return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    data = (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))
    with open(path, 'wb') as f:
        f.write(data)
        f.flush()
        os.fsync(f.fileno())
    return path


def _tmpdir():
    tmp = xbmcvfs.translatePath('special://temp/')
    for old in os.listdir(tmp):
        if old.startswith('fefc-link-qr') or old.startswith('fefc-white'):
            try:
                os.remove(os.path.join(tmp, old))
            except OSError:
                pass
    return tmp


def _make_qr_png(url, size=600):
    """Square 8-bit RGB PNG with a 4-module quiet zone, in the add-on profile (not special://temp)."""
    from .qrdraw import write_qr_png
    d = xbmcvfs.translatePath('special://profile/addon_data/plugin.video.fefc/qr')
    os.makedirs(d, exist_ok=True)
    path = os.path.join(d, 'fefc-qr-%d.png' % int(time.time() * 1000))
    info = write_qr_png(path, url, size=size, quiet=4)
    if os.path.getsize(path) < 100 or info['side'] != info['px'] * (info['modules'] + 8):
        raise IOError('QR png not written')
    return path


def _qr_for(url):
    """Local square code, then the remote square fallback. The encoded URL is not changed."""
    try:
        return _make_qr_png(url)
    except Exception as e:
        _log('local qr: %s' % e)
        return _remote_qr_png(url)


def _remote_qr_png(url):
    """Fallback: a QR PNG from a public QR service, saved locally."""
    src = 'https://api.qrserver.com/v1/create-qr-code/?size=600x600&margin=16&format=png&data=' + quote_plus(url)
    try:
        import urllib.request
        data = urllib.request.urlopen(urllib.request.Request(src, headers={'User-Agent': 'FEFC-Kodi'}), timeout=15).read()
        path = os.path.join(xbmcvfs.translatePath('special://temp/'), 'fefc-link-qr-r%d.png' % int(time.time() * 1000))
        with open(path, 'wb') as f:
            f.write(data)
        return path
    except Exception as e:
        _log('remote qr failed: %s' % e)
        return src  # let Kodi fetch it directly


def _white_png():
    path = os.path.join(xbmcvfs.translatePath('special://temp/'), 'fefc-white-%d.png' % int(time.time() * 1000))
    return _png_rgb(path, [b'\xff\xff\xff' * 8] * 8)


def _dialog_back(action):
    """Close on Back. Play the back cue only when the sound skin will not (avoids a second click)."""
    aid = action.getId()
    if aid not in (xbmcgui.ACTION_PREVIOUS_MENU, xbmcgui.ACTION_NAV_BACK, xbmcgui.ACTION_STOP):
        return False
    if aid != xbmcgui.ACTION_STOP:
        home = xbmcgui.Window(10000)
        if home.getProperty('FEFC.BackSkip') == '1':
            home.clearProperty('FEFC.BackSkip')
        elif home.getProperty('FEFC.GuiSound') != 'always':
            _play_back_sfx()
    return True


def _short_url(u):
    """Display form of a link that fits on screen (the QR code carries the full address)."""
    import re
    t = re.sub(r'^https?://(www\.)?', '', u or '')
    return t if len(t) <= 44 else t[:42] + '...'


class SupportWindow(xbmcgui.WindowDialog):
    """Web-style Support Us: Optimus on the left, three landscape payment cards.
    Selecting a card opens a square QR for that same URL. Logos use aspect keep."""
    COLORS = {'Patreon': 'FFFF424D', 'PayPal': 'FF003087', 'Venmo': 'FF008CFF'}
    KEEP = 2

    def __init__(self, items):
        super().__init__()
        self.items = items
        self.addControl(xbmcgui.ControlImage(0, 0, 1280, 720, 'fefc-white.png', colorDiffuse='F2050608'))
        self.addControl(xbmcgui.ControlLabel(40, 28, 1200, 48, 'SUPPORT US', font='font14_title', textColor='FFFF9C00', alignment=2))
        self.addControl(xbmcgui.ControlLabel(40, 82, 1200, 40, 'Thank you for supporting the collection.', font='font13', textColor='FFE8EEF6', alignment=2))
        self.addControl(xbmcgui.ControlImage(28, 140, 340, 500, 'fefc-optimus-begging.png', aspectRatio=self.KEEP))
        self.btns = []
        w, h, gap = 270, 176, 18
        x0, y0 = 390, 250
        for k, (name, url, sub) in enumerate(items):
            x = x0 + k * (w + gap)
            b = xbmcgui.ControlButton(x, y0, w, h, '', focusTexture='fefc-ol-focus.png', noFocusTexture='fefc-ol-tile.png')
            self.addControl(b)
            self.btns.append(b)
            icon = {'Patreon': 'fefc-ic-patreon.png', 'PayPal': 'fefc-ic-paypal.png', 'Venmo': 'fefc-ic-venmo.png'}.get(name, 'fefc-lc-pill.png')
            self.addControl(xbmcgui.ControlImage(x + 99, y0 + 14, 72, 72, icon, aspectRatio=self.KEEP))
            self.addControl(xbmcgui.ControlImage(x + 40, y0 + 94, w - 80, 6, 'fefc-white.png', colorDiffuse=self.COLORS.get(name, 'FFFF9C00')))
            self.addControl(xbmcgui.ControlLabel(x + 8, y0 + 106, w - 16, 32, name, font='font13_title', textColor='FFFFFFFF', alignment=6))
            self.addControl(xbmcgui.ControlLabel(x + 8, y0 + 138, w - 16, 28, sub, font='font12', textColor='FFFF9C00', alignment=6))
        for k, b in enumerate(self.btns):
            b.controlLeft(self.btns[k - 1])
            b.controlRight(self.btns[(k + 1) % len(self.btns)])
        self.addControl(xbmcgui.ControlLabel(40, 660, 1200, 32, 'Select a card for a square code.  Back to close.', font='font12', textColor='FF7F8FA6', alignment=2))
        self.setFocus(self.btns[0])

    def onControl(self, c):
        for k, b in enumerate(self.btns):
            if c == b:
                name, url, sub = self.items[k]
                PayQrWindow(name, url, sub).doModal()

    def onAction(self, action):
        if _dialog_back(action):
            self.close()


class PayQrWindow(xbmcgui.WindowDialog):
    """Square QR for one payment URL, with the quiet zone kept by aspect-keep."""
    KEEP = 2

    def __init__(self, name, url, sub):
        super().__init__()
        self.url = url
        self.addControl(xbmcgui.ControlImage(0, 0, 1280, 720, 'fefc-white.png', colorDiffuse='F2050608'))
        self.addControl(xbmcgui.ControlLabel(80, 36, 1120, 44, name, font='font14_title', textColor='FFFFFFFF', alignment=2))
        self.addControl(xbmcgui.ControlLabel(80, 84, 1120, 32, sub, font='font13', textColor='FFFF9C00', alignment=2))
        self.addControl(xbmcgui.ControlImage(440, 130, 400, 400, 'fefc-white.png'))
        self.addControl(xbmcgui.ControlImage(460, 150, 360, 360, _qr_for(url), aspectRatio=self.KEEP))
        self.addControl(xbmcgui.ControlLabel(80, 544, 1120, 32, _short_url(url), font='font12', textColor='FF99CCFF', alignment=2))
        self.btn = xbmcgui.ControlButton(460, 590, 360, 64, 'Open on this device', font='font13_title', textColor='FFFFFFFF',
                                          alignment=6, focusTexture='fefc-ol-focus.png', noFocusTexture='fefc-ol-tile.png')
        self.addControl(self.btn)
        self.setFocus(self.btn)
        self.addControl(xbmcgui.ControlLabel(80, 668, 1120, 28, 'Back to return to Support Us.', font='font12', textColor='FF7F8FA6', alignment=2))

    def onControl(self, c):
        if c == self.btn:
            xbmc.executebuiltin('StartAndroidActivity(,android.intent.action.VIEW,,%s)' % self.url)
            xbmcgui.Dialog().notification('Support Us', 'If nothing opened, scan the code or visit %s' % _short_url(self.url), xbmcgui.NOTIFICATION_INFO, 6000)

    def onAction(self, action):
        if _dialog_back(action):
            self.close()


class LinkWindow(xbmcgui.WindowDialog):
    """Full-screen card with a QR code / device code; Back closes it. Coordinates are 1280x720, inside the TV-safe area.
    0.5.1: when open_url is given, the QR code and the URL line are tappable buttons that open it in the browser
    (used by the feedback form — tapping the code or the link opens the form instead of only being scannable)."""

    def __init__(self, lines, qr_path, open_url=''):
        super().__init__()
        self.closed = False
        self.open_url = open_url
        self.qr_btn = None
        self.url_btn = None
        self.addControl(xbmcgui.ControlImage(0, 0, 1280, 720, 'fefc-white.png', colorDiffuse='F0050A14'))
        self.addControl(xbmcgui.ControlLabel(96, 54, 1088, 50, lines[0], font='font14_title', textColor='FFFFFFFF'))
        y = 120
        if qr_path:
            self.addControl(xbmcgui.ControlImage(86, 120, 420, 420, 'fefc-white.png'))
            if open_url:
                self.qr_btn = xbmcgui.ControlButton(96, 130, 400, 400, '', focusTexture='fefc-ol-focus.png', noFocusTexture='')
                self.addControl(self.qr_btn)
            self.addControl(xbmcgui.ControlImage(96, 130, 400, 400, qr_path, aspectRatio=2))
            x = 540
        else:
            x = 96
        w = 1184 - x
        side = lines[1:-1] if qr_path else lines[1:]
        for t in side:
            tb = xbmcgui.ControlTextBox(x, y, w, 90, font='font13', textColor='FFFFFFFF')
            self.addControl(tb)
            tb.setText(t)
            y += 84
        if qr_path:  # the full link on its own full-width line under the QR, so it can be typed on a phone
            if open_url:
                self.url_btn = xbmcgui.ControlButton(96, 552, 1088, 40, lines[-1], font='font12', textColor='FF99CCFF', focusTexture='fefc-ol-focus.png', noFocusTexture='')
                self.addControl(self.url_btn)
            else:
                self.addControl(xbmcgui.ControlLabel(96, 552, 1088, 40, lines[-1], font='font12', textColor='FF99CCFF'))
        self.addControl(xbmcgui.ControlLabel(96, 610, 1088, 40, 'Press Back to cancel.' + ('  Tap the code or the link to open it in your browser.' if open_url else ''), font='font12', textColor='FFFF9C00'))

    def onControl(self, c):
        if self.open_url and c in (self.qr_btn, self.url_btn):
            xbmc.executebuiltin('StartAndroidActivity(,android.intent.action.VIEW,,%s)' % self.open_url)

    def onAction(self, action):
        if _dialog_back(action):
            self.closed = True
            self.close()


def _optimus_art():
    local = os.path.join(xbmcvfs.translatePath(ADDON.getAddonInfo('path')), 'resources', 'media', 'optimus-watch.webp')
    if os.path.exists(local):
        return local
    return _base() + '/assets/optimus-watch.webp'


class OptimusWindow(xbmcgui.WindowDialog):
    """Search card: Optimus, an editable field, and a Search button. The field submits the catalogue query.
    A second keyboard is not opened while this card is still on screen."""

    def __init__(self):
        super().__init__()
        from . import optimusplan
        self.query = ''
        self.addControl(xbmcgui.ControlImage(0, 0, 1280, 720, 'fefc-white.png', colorDiffuse='F2050608'))
        # Still is the fallback until a reviewed optimus-search clip exists. Same box, keep aspect.
        self.addControl(xbmcgui.ControlImage(48, 110, 480, 480, _optimus_art(), aspectRatio=2))
        self.addControl(xbmcgui.ControlLabel(560, 96, 660, 52, optimusplan.TITLE, font='font14_title', textColor='FFFFFFFF'))
        cue = xbmcgui.ControlTextBox(560, 160, 660, 88, font='font13', textColor='FFE8EEF6')
        self.addControl(cue)
        cue.setText(optimusplan.CUE)
        self.edit = xbmcgui.ControlEdit(560, 268, 660, 72, '', font='font13', textColor='FFFFFFFF',
                                         focusTexture='fefc-ol-focus.png', noFocusTexture='fefc-ol-tile.png')
        self.addControl(self.edit)
        self.btn = xbmcgui.ControlButton(560, 364, 280, 72, optimusplan.SEARCH_LABEL, font='font13_title', textColor='FFFFFFFF',
                                          focusTexture='fefc-ol-focus.png', noFocusTexture='fefc-ol-tile.png', alignment=6)
        self.addControl(self.btn)
        self.status = xbmcgui.ControlLabel(560, 460, 660, 48, 'Type a title, then press Search.', font='font12', textColor='FF99CCFF')
        self.addControl(self.status)
        self.addControl(xbmcgui.ControlLabel(560, 540, 660, 36, 'Back to close.', font='font12', textColor='FF7F8FA6'))
        self.edit.controlDown(self.btn)
        self.btn.controlUp(self.edit)
        self.setFocus(self.edit)

    def _submit(self):
        from . import searchflow
        try:
            text = self.edit.getText()
        except Exception:
            text = ''
        r = searchflow.submit(text)
        if not r['ok']:
            try:
                self.status.setLabel(r['status'])
            except Exception:
                pass
            return
        self.query = r['query']
        self.close()

    def onControl(self, c):
        if c == self.btn:
            self._submit()

    def onAction(self, action):
        if action.getId() == xbmcgui.ACTION_SELECT_ITEM:
            self._submit()
            return
        if _dialog_back(action):
            self.close()


ROUTES = {'': 'root', 'root': 'root', 'folder': 'folder', 'genres': 'genres', 'genre': 'genre', 'recent': 'recent',
          'search': 'search', 'searchbox': 'searchbox', 'play': 'play', 'update': 'update', 'mylist': 'mylist', 'mylist_toggle': 'mylist_toggle',
          'mylist_sync': 'mylist_sync', 'open_vlc': 'open_vlc', 'open_drive': 'open_drive', 'readme': 'readme', 'support': 'support',
          'mylist_sortswitch': 'mylist_sortswitch', 'mylist_shuffle': 'mylist_shuffle', 'history': 'history', 'sort': 'sort', 'shuffle': 'shuffle', 'people': 'people',
          'about': 'about', 'sound_toggle': 'sound_toggle', 'settings': 'settings', 'notify_perm': 'notify_perm',
          'open_link': 'open_link', 'play_external': 'play_external',
          'download': 'download', 'downloads': 'downloads', 'play_download': 'play_download', 'download_delete': 'download_delete',
          'download_storage': 'download_storage',
          'kodi_settings': 'kodi_settings', 'gdoc': 'gdoc', 'castrows': 'castrows', 'noop': 'noop',
          'armback': 'armback'}


def _play_back_sfx():
    """Play the packaged back wav. Does not stop or restart the home-wall player."""
    from .sfxpref import sfx_enabled
    from . import backcue
    try:
        if not sfx_enabled(ADDON.getSetting('play_sfx')):
            return
        vol = None
        try:
            import json
            r = json.loads(xbmc.executeJSONRPC(json.dumps({
                'jsonrpc': '2.0', 'id': 1, 'method': 'Application.GetProperties',
                'params': {'properties': ['volume', 'muted']}})))
            props = r.get('result') or {}
            if props.get('muted'):
                vol = 0
            elif 'volume' in props:
                vol = int(props['volume'])
        except Exception:
            vol = None
        home = xbmcgui.Window(10000)
        try:
            last = float(home.getProperty('FEFC.BackAt') or '0')
        except ValueError:
            last = 0.0
        now = time.time()
        if not backcue.should_play(True, vol, now, last):
            return
        paths = []
        try:
            paths.append(os.path.join(xbmcvfs.translatePath(ADDON.getAddonInfo('path')), 'resources', 'ui-back.wav'))
        except Exception:
            pass
        for spec in backcue.WAV_CANDIDATES:
            try:
                paths.append(xbmcvfs.translatePath(spec))
            except Exception:
                pass
        for p in paths:
            if p and os.path.exists(p) and os.path.getsize(p) > 100:
                xbmc.playSFX(p, False)
                home.setProperty('FEFC.BackAt', str(now))
                return
    except Exception:
        pass


def _is_back_nav(prev, new):
    """True when `new` is the parent of `prev` (a '..' tap): folder:<child> -> folder:<parent>, or any folder -> root."""
    if not prev or not new or prev == new:
        return False
    try:
        m = _model()
    except Exception:
        return False
    if new == 'root':
        return prev.startswith('folder:')
    if not (prev.startswith('folder:') and new.startswith('folder:')):
        return False
    child, parent = prev[7:], new[7:]
    it = (m.get('items') or {}).get(child)
    if not it:
        return False
    # parent id of the child folder (items[][1]); a shortcut's target is followed like everywhere else
    p = it[1] or ''
    if it[2] and it[3]:
        p = it[3]
    # walk up: the new folder is a back step if it is the child's parent (or the child's own target parent)
    seen = set()
    cur = child
    for _ in range(30):
        par = (m.get('items') or {}).get(cur, [None, ''])[1] or ''
        if not par or par in seen:
            break
        if par == parent:
            return True
        seen.add(par)
        cur = par
    return False


def run(argv):
    r = Router(argv)
    # 0.5.2: the Android back gesture plays the back UI sound, but tapping the ".." back-folder row did not —
    # Kodi's parentdir UI-sound mapping does not fire for plugin ".." navigation. Detect the parent step here
    # (new location is the parent of the previous one) and play the back sound ourselves.
    try:
        prev = xbmcgui.Window(10000).getProperty('FEFC.LastLoc')
        home = xbmcgui.Window(10000)
        if _is_back_nav(prev, r._loc()):
            if home.getProperty('FEFC.BackSkip') == '1':
                home.clearProperty('FEFC.BackSkip')
            else:
                _play_back_sfx()
    except Exception:
        pass
    action = r.params.get('action', '')
    fn = ROUTES.get(action)
    try:
        getattr(r, fn or 'root')()
    except Exception as e:
        _log('error in %s: %r' % (action, e))
        xbmcgui.Dialog().notification('FEFC', 'Could not load the catalogue: %s' % str(e)[:80], xbmcgui.NOTIFICATION_ERROR, 5000)
        try:
            xbmcplugin.endOfDirectory(r.handle, succeeded=False)
        except Exception:
            pass
