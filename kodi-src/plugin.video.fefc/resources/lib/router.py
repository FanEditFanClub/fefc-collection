"""Kodi routes for plugin.video.fefc. All data comes from resources/lib/catalog.py (the live FEFC catalogue)."""
import os
import sys
import time
from urllib.parse import parse_qsl, urlencode, quote_plus

import xbmc
import xbmcaddon
import xbmcgui
import xbmcplugin
import xbmcvfs

from . import catalog
from . import mylist as mylist_mod

ADDON = xbmcaddon.Addon()
PAGE = 200


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
        for k in m['kids'].get(i, []):
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
        for k in m['kids'].get(x, []):
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


def _url(handle_url, **kw):
    return handle_url + '?' + urlencode(kw)


class Router:
    def __init__(self, argv):
        self.url = argv[0]
        self.handle = int(argv[1])
        self.params = dict(parse_qsl(argv[2][1:])) if len(argv) > 2 and argv[2] else {}
        self._mydb = None
        self._content = 'files'

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

    def add_folder(self, label, art='', info=None, landscape='', **kw):
        li = xbmcgui.ListItem(label, offscreen=True)
        self._art(li, art)
        if landscape:
            li.setArt({'landscape': landscape, 'thumb': landscape, 'fanart': landscape})
        tag = li.getVideoInfoTag()
        tag.setTitle(label)
        if info:
            tag.setPlot(info)
        xbmcplugin.addDirectoryItem(self.handle, _url(self.url, **kw), li, True)

    def add_dir_item(self, m, fid):
        v = m['items'][fid]
        n = m['cnt'].get(fid, 0)
        art = catalog.folder_art(m, _base(), fid)
        gs = m['vgenres'].get(fid) or []
        self.add_folder('%s  (%d)' % (v[0], n), art, ', '.join(gs), action='folder', id=fid)

    def add_tool(self, label, plot, art='DefaultAddonService.png', folder=False, **kw):
        li = xbmcgui.ListItem(label, offscreen=True)
        li.setArt({'thumb': art, 'icon': art})
        tag = li.getVideoInfoTag()
        tag.setTitle(label)
        tag.setPlot(plot)
        if not folder:
            li.setProperty('IsPlayable', 'false')
        xbmcplugin.addDirectoryItem(self.handle, _url(self.url, **kw), li, folder)

    def add_video(self, m, vid):
        v = m['items'][vid]
        base = _base()
        info = catalog.video_info(m, vid)
        title = catalog.display_title(v[0])
        li = xbmcgui.ListItem(title, offscreen=True)
        art = catalog.poster_for(m, base, vid)
        self._art(li, art, video=True)
        on = self.mydb().has(vid)
        li.setProperty('fefc_id', vid)
        li.setProperty('fefc_mylabel', 'Remove from My List' if on else 'Add to My List')
        li.addContextMenuItems([('Remove from My List' if on else 'Add to My List',
                                 'RunPlugin(%s)' % _url(self.url, action='mylist_toggle', id=vid))])
        tag = li.getVideoInfoTag()
        tag.setTitle(title)
        tag.setMediaType('movie')
        plot = info['plot']
        extra = []
        pb = self.mydb().playback(vid)
        if pb and (pb.get('sec') or 0) >= 10:
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
        gs = m['vgenres'].get(vid) or []
        if gs and gs != ['Unsorted']:
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
                'search': 'Search: %s' % self.params.get('q', '')}.get(a, 'Fan Edit Fan Club')
        except Exception:
            return 'Fan Edit Fan Club'

    def end(self, content='files', cache=True):
        xbmcplugin.setPluginCategory(self.handle, self._title())
        xbmcplugin.setContent(self.handle, content)
        xbmcplugin.addSortMethod(self.handle, xbmcplugin.SORT_METHOD_UNSORTED)
        xbmcplugin.endOfDirectory(self.handle, cacheToDisc=cache)
        # FEFC skin: view 500 = landscape grid (collections), 501 = portrait poster grid (video files)
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
        self.add_folder('Support Us', '', 'Patreon, PayPal and Venmo.', action='support')
        if xbmcvfs.exists('special://xbmc/fefc-build.json'):
            self.add_folder('Check for FEFC app update', '', 'See if a newer FEFC app is available.', action='update')
        self.end()

    def update(self):
        import service
        service.check_update(manual=True)
        if self.handle >= 0:
            xbmcplugin.endOfDirectory(self.handle, succeeded=False)

    def folder(self):
        m = _model()
        fid = self.params.get('id') or m['root']
        page = int(self.params.get('page') or 0)
        ks = m['kids'].get(fid, [])
        # drop empty folders
        ks = [k for k in ks if not m['items'][k][2] or m['cnt'].get(k)]
        key = _sort_get(fid)
        if key != 'az':
            ks = _sorted_kids(m, ks, key)
        chunk = ks[page * PAGE:(page + 1) * PAGE]
        if not page:
            self._maybe_sfx(catalog.sfx_for(m, fid))
            if ks:
                self.add_tool('Sort: %s   (select to change)' % dict(SORTS)[key], 'Change how this collection is sorted. Same options as the FEFC web app.',
                              action='sort', id=fid)
                if any(not m['items'][k][2] for k in ks) or any(m['items'][k][2] for k in ks):
                    self.add_tool('Shuffle Play', 'Play a random mix of edits from this collection.', 'DefaultMusicPlaylists.png', action='shuffle', id=fid)
        nf = nv = 0
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
        if ADDON.getSetting('play_sfx') != 'true' or not rel:
            return
        files = rel if isinstance(rel, list) else [rel]
        # Kodi plays wav natively: the site serves a wav copy of every clip under kodi-sfx/ (same 6 s / -16 LUFS clip)
        f = str(files[0])
        wav = 'kodi-sfx/' + os.path.splitext(os.path.basename(f))[0] + '.wav'
        try:
            path = self._sfx_local(catalog.abs_url(_base(), wav))
            if path:
                xbmc.playSFX(path, False)
        except Exception as e:
            _log('sfx failed: %s' % e)

    def genres(self):
        m = _model()
        art = m.get('genreart') or {}
        names = sorted(set(m['genre_videos']) - {'Unsorted'}) + (['Unsorted'] if 'Unsorted' in m['genre_videos'] else [])
        for g in names:
            a = art.get(g) or {}
            img = catalog.abs_url(_base(), (a.get('img') or '').split('?')[0]) if a.get('img') else ''
            self.add_folder('%s  (%d)' % (g, len(catalog.dedupe(m, m['genre_videos'][g])) + len(m['genre_folders'].get(g, []))), '', landscape=img, action='genre', genre=g)
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
        q = self.params.get('q')
        if q is None:
            kb = xbmc.Keyboard('', 'Search the FEFC collection')
            kb.doModal()
            if not kb.isConfirmed() or not kb.getText().strip():
                xbmcplugin.endOfDirectory(self.handle, succeeded=False)
                return
            q = kb.getText().strip()
            # re-enter with the query so back/refresh works
            xbmc.executebuiltin('Container.Update(%s,replace)' % _url(self.url, action='search', q=q))
            xbmcplugin.endOfDirectory(self.handle, succeeded=False)
            return
        m = _model()
        res = catalog.search(m, q)
        nf = nv = 0
        for i in res:
            if m['items'][i][2]:
                self.add_dir_item(m, i)
                nf += 1
            else:
                nv += 1
                self.add_video(m, i)
        if not res:
            xbmcgui.Dialog().notification('FEFC', 'No results for "%s"' % q, xbmcgui.NOTIFICATION_INFO, 3000)
        self.end('movies' if nv > nf else 'files', cache=False)

    def searchbox(self):
        """Home Search tile (RunPlugin, no directory handle): ask for the text first, then open the results list directly.
        Nothing is returned from a failed directory, so the keyboard cannot reappear over the results."""
        kb = xbmc.Keyboard('', 'Search the FEFC collection')
        kb.doModal()
        if kb.isConfirmed() and kb.getText().strip():
            q = kb.getText().strip()
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
        li = xbmcgui.ListItem('Sync My List with the FEFC web app' + ('  (%s)' % who if ml.linked else '  (not linked)'), offscreen=True)
        li.setArt({'thumb': 'DefaultAddonService.png', 'icon': 'DefaultAddonService.png'})
        li.getVideoInfoTag().setPlot('Share My List with the FEFC web app and Fire TV app: sign in with Google through your phone, or enter a 6-digit sync code.')
        li.setProperty('IsPlayable', 'false')
        xbmcplugin.addDirectoryItem(self.handle, _url(self.url, action='mylist_sync'), li, False)
        nf = nv = 0
        shown = set()
        sortk = self.params.get('sort') or _pref('_mylist', 'date')
        self.add_tool('Sort: %s   (select to change)' % ('Name A-Z' if sortk == 'az' else 'Date added'), 'Switch between date added and name.',
                      action='mylist_sortswitch', cur=sortk)
        self.add_tool('Recently opened', 'The last edits you opened or played (synced with the FEFC web app).', 'DefaultRecentlyAddedMovies.png',
                      folder=True, action='history')
        cont = []
        for sid in ml.continue_ids():
            i = self._resolve(m, sid)
            if i and not m['items'][i][2] and i not in cont:
                cont.append(i)
        for i in cont[:20]:
            self.add_video(m, i)
            nv += 1
            shown.add(i)
        ids = ml.ids()
        if sortk == 'az':
            ids = sorted(ids, key=lambda x: catalog.natkey(m['items'][self._resolve(m, x) or x][0]) if self._resolve(m, x) else ())
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
        new = 'date' if self.params.get('cur') == 'az' else 'az'
        _sort_set('_mylist', new)
        xbmc.executebuiltin('Container.Update(%s,replace)' % _url(self.url, action='mylist', sort=new, nosync='1'))
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
        m = _model()
        role = self.params.get('role')
        meta = m.get('people_meta') or {}
        if not role:
            na = sum(1 for k, (n, r) in meta.items() if r == 'actor' and k in m['items'])
            nd = sum(1 for k, (n, r) in meta.items() if r == 'director' and k in m['items'])
            self.add_folder('Actors  (%d)' % na, '', 'Edits grouped by actor.', action='people', role='actor')
            self.add_folder('Directors  (%d)' % nd, '', 'Edits grouped by director.', action='people', role='director')
            self.end()
            return
        rows = [k for k, (n, r) in meta.items() if r == role and k in m['items'] and m['cnt'].get(k)]
        rows.sort(key=lambda k: catalog.natkey(meta[k][0]))
        for k in rows:
            art = catalog.folder_art(m, _base(), k)
            self.add_folder('%s  (%d)' % (meta[k][0], m['cnt'].get(k, 0)), art, action='folder', id=k)
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
                % (label, xbmc.getInfoLabel('System.BuildVersion').split(' ')[0], ADDON.getAddonInfo('version'), _base()))
        while True:
            k = dlg.select('About FEFC', ['Version and info', "What's new", 'Privacy Policy', 'Terms of Use', 'Open-source notices', 'Close'])
            if k < 0 or k == 5:
                break
            try:
                if k == 0:
                    dlg.textviewer('About FEFC', info)
                elif k == 1:
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
                elif k == 2:
                    dlg.textviewer('Privacy Policy', self._page_text('/privacy.html'))
                elif k == 3:
                    dlg.textviewer('Terms of Use', self._page_text('/terms.html'))
                else:
                    with xbmcvfs.File('special://xbmc/FEFC-NOTICE.txt') as f:
                        dlg.textviewer('Open-source notices', f.read())
            except Exception as e:
                dlg.notification('FEFC', 'Could not load: %s' % str(e)[:60], xbmcgui.NOTIFICATION_ERROR, 4000)
        if self.handle >= 0:
            xbmcplugin.endOfDirectory(self.handle, succeeded=False)

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
        ml = self.mydb()
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
                code = dlg.input('Sync code (web app: My List > Sync My List > Create a code)', type=xbmcgui.INPUT_NUMERIC)
                if code:
                    err = ml.link(code) or ml.sync()
                    dlg.notification('My List', err or 'Linked and synced', xbmcgui.NOTIFICATION_ERROR if err else xbmcgui.NOTIFICATION_INFO, 4000)
            elif a == 'qr':
                self._link_window(ml, 'qr')
            elif a == 'device':
                self._link_window(ml, 'device')
            if ml.linked and a in ('code', 'qr', 'device'):
                break
        xbmc.executebuiltin('Container.Refresh')

    def _link_window(self, ml, mode):
        """On-screen link flow: QR code approved on a signed-in phone, or Google's device code."""
        try:
            if mode == 'qr':
                j = ml.qr_start()
                url, qid, secret, verify = j['url'], j['id'], j['secret'], j.get('verify', '')
                lines = ['Link My List', 'Scan the QR code with your phone (or open the address below).',
                         'On the phone, sign in with Google (or use a sync code) and tap Approve.',
                         'Check that the phone shows this confirm code: %s' % verify, _short_url(url)]
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
        qr_path = ''
        if mode == 'qr':
            try:
                from . import segno
                tmp = xbmcvfs.translatePath('special://temp/')
                for old in os.listdir(tmp):
                    if old.startswith('fefc-link-qr'):
                        try:
                            os.remove(os.path.join(tmp, old))
                        except OSError:
                            pass
                # unique name every time so Kodi's texture cache never serves a stale/blank image
                qr_path = os.path.join(tmp, 'fefc-link-qr-%d.png' % int(time.time() * 1000))
                segno.make(url, error='m').save(qr_path, kind='png', scale=10, border=4, dark='#000000', light='#ffffff')
                if not os.path.getsize(qr_path):
                    raise IOError('empty QR png')
            except Exception as e:
                _log('qr failed: %s' % e)
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
        dlg = xbmcgui.Dialog()
        intro = ('If you enjoy The Collection, consider making a donation to our Patreon starting at just $1/Month, or PayPal/Venmo '
                 '@FanEditFanClub anything you can spare. It helps cover the cloud storage fees and our time to find and organize '
                 'the world\'s largest fan edit collection so we can keep adding new edits for the community.')
        dlg.textviewer('Support Us', intro + '\n\n' + '\n'.join('%s (%s): %s' % (n, sub, u) for n, u, sub in self.SUPPORT))
        while True:
            k = dlg.select('Support Us: open a page on this device', ['%s  -  %s' % (n, sub) for n, u, sub in self.SUPPORT] + ['Close'])
            if k < 0 or k >= len(self.SUPPORT):
                break
            u = self.SUPPORT[k][1]
            xbmc.executebuiltin('StartAndroidActivity(,android.intent.action.VIEW,,%s)' % u)
            xbmc.sleep(800)
            dlg.notification('Support Us', 'If nothing opened, visit: %s' % u, xbmcgui.NOTIFICATION_INFO, 8000)
        if self.handle >= 0:
            xbmcplugin.endOfDirectory(self.handle, succeeded=False)


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
        """Open the file's Google Drive page in the browser / Drive app."""
        tid, name = self._target(self.params['id'])
        url = 'https://drive.google.com/file/d/' + tid + '/view'
        _log('open in Drive: %s' % url)
        xbmc.executebuiltin('StartAndroidActivity(,android.intent.action.VIEW,,%s)' % url)
        xbmcgui.Dialog().notification('FEFC', 'Opening in Drive: ' + catalog.display_title(name), xbmcgui.NOTIFICATION_INFO, 4000)


def _short_url(u):
    """Display form of a link that fits on screen (the QR code carries the full address)."""
    import re
    t = re.sub(r'^https?://(www\.)?', '', u or '')
    return t if len(t) <= 44 else t[:42] + '...'


class LinkWindow(xbmcgui.WindowDialog):
    """Full-screen card with a QR code / device code; Back closes it. Coordinates are 1280x720, inside the TV-safe area."""

    def __init__(self, lines, qr_path):
        super().__init__()
        self.closed = False
        self.addControl(xbmcgui.ControlImage(0, 0, 1280, 720, 'colors/white.png', colorDiffuse='F0050A14'))
        self.addControl(xbmcgui.ControlLabel(96, 54, 1088, 50, lines[0], font='font14_title', textColor='FFFFFFFF'))
        y = 120
        if qr_path:
            img = xbmcgui.ControlImage(96, 130, 400, 400, '', aspectRatio=1)
            self.addControl(img)
            img.setImage(qr_path, False)
            x = 540
        else:
            x = 96
        w = 1184 - x
        for t in lines[1:]:
            tb = xbmcgui.ControlTextBox(x, y, w, 90, font='font13', textColor='FFFFFFFF')
            self.addControl(tb)
            tb.setText(t)
            y += 84
        self.addControl(xbmcgui.ControlLabel(96, 610, 1088, 40, 'Press Back to cancel.', font='font12', textColor='FFFF9C00'))

    def onAction(self, action):
        if action.getId() in (xbmcgui.ACTION_PREVIOUS_MENU, xbmcgui.ACTION_NAV_BACK, xbmcgui.ACTION_STOP):
            self.closed = True
            self.close()


ROUTES = {'': 'root', 'root': 'root', 'folder': 'folder', 'genres': 'genres', 'genre': 'genre', 'recent': 'recent',
          'search': 'search', 'searchbox': 'searchbox', 'play': 'play', 'update': 'update', 'mylist': 'mylist', 'mylist_toggle': 'mylist_toggle',
          'mylist_sync': 'mylist_sync', 'open_vlc': 'open_vlc', 'open_drive': 'open_drive', 'readme': 'readme', 'support': 'support',
          'mylist_sortswitch': 'mylist_sortswitch', 'history': 'history', 'sort': 'sort', 'shuffle': 'shuffle', 'people': 'people',
          'about': 'about'}


def run(argv):
    r = Router(argv)
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
