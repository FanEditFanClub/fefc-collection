"""Kodi routes for plugin.video.fefc. All data comes from resources/lib/catalog.py (the live FEFC catalogue)."""
import os
import sys
from urllib.parse import parse_qsl, urlencode, quote_plus

import xbmc
import xbmcaddon
import xbmcgui
import xbmcplugin
import xbmcvfs

from . import catalog

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


def _url(handle_url, **kw):
    return handle_url + '?' + urlencode(kw)


class Router:
    def __init__(self, argv):
        self.url = argv[0]
        self.handle = int(argv[1])
        self.params = dict(parse_qsl(argv[2][1:])) if len(argv) > 2 and argv[2] else {}

    # -- list item builders --------------------------------------------------------------------
    def _art(self, li, art):
        if art:
            li.setArt({'thumb': art, 'poster': art, 'icon': art, 'fanart': art})

    def _fanart_default(self, li):
        li.setArt({'fanart': 'special://home/addons/plugin.video.fefc/resources/fanart.jpg'})

    def add_folder(self, label, art='', info=None, **kw):
        li = xbmcgui.ListItem(label, offscreen=True)
        self._art(li, art)
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

    def add_video(self, m, vid):
        v = m['items'][vid]
        base = _base()
        info = catalog.video_info(m, vid)
        title = catalog.display_title(v[0])
        li = xbmcgui.ListItem(title, offscreen=True)
        art = catalog.poster_for(m, base, vid)
        self._art(li, art)
        tag = li.getVideoInfoTag()
        tag.setTitle(title)
        tag.setMediaType('movie')
        if info['plot']:
            tag.setPlot(info['plot'])
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

    def end(self, content='files', cache=True):
        xbmcplugin.setContent(self.handle, content)
        xbmcplugin.addSortMethod(self.handle, xbmcplugin.SORT_METHOD_UNSORTED)
        xbmcplugin.endOfDirectory(self.handle, cacheToDisc=cache)

    # -- routes ----------------------------------------------------------------------------------
    def root(self):
        m = _model()
        self.add_folder('Collections', '', 'Browse the collection folders, same tree as the FEFC app.', action='folder', id=m['root'])
        self.add_folder('Genres', '', 'Browse by genre (a title can be in several genres).', action='genres')
        self.add_folder('Recently Added', '', 'Newest files in the collection.', action='recent')
        self.add_folder('Search', '', 'Search every collection and edit.', action='search')
        self.end()

    def folder(self):
        m = _model()
        fid = self.params.get('id') or m['root']
        page = int(self.params.get('page') or 0)
        ks = m['kids'].get(fid, [])
        # drop empty folders
        ks = [k for k in ks if not m['items'][k][2] or m['cnt'].get(k)]
        chunk = ks[page * PAGE:(page + 1) * PAGE]
        self._maybe_sfx(m, fid, page)
        any_video = False
        for k in chunk:
            if m['items'][k][2]:
                self.add_dir_item(m, k)
            else:
                any_video = True
                self.add_video(m, k)
        if (page + 1) * PAGE < len(ks):
            self.add_folder('Next page (%d more) >>' % (len(ks) - (page + 1) * PAGE), '', action='folder', id=fid, page=page + 1)
        self.end('movies' if any_video else 'files')

    def _maybe_sfx(self, m, fid, page):
        if page or ADDON.getSetting('play_sfx') != 'true':
            return
        rel = catalog.sfx_for(m, fid)
        if rel:
            files = rel if isinstance(rel, list) else [rel]
            # prefer wav (Kodi plays UI sounds natively); other formats are tried too
            files = sorted(files, key=lambda f: 0 if str(f).lower().endswith('.wav') else 1)
            try:
                xbmc.playSFX(catalog.abs_url(_base(), files[0]), False)
            except Exception as e:
                _log('sfx failed: %s' % e)

    def genres(self):
        m = _model()
        art = m.get('genreart') or {}
        names = sorted(set(m['genre_videos']) - {'Unsorted'}) + (['Unsorted'] if 'Unsorted' in m['genre_videos'] else [])
        for g in names:
            a = art.get(g) or {}
            img = catalog.abs_url(_base(), (a.get('img') or '').split('?')[0]) if a.get('img') else ''
            self.add_folder('%s  (%d)' % (g, len(m['genre_videos'][g])), img, action='genre', genre=g)
        self.end()

    def genre(self):
        m = _model()
        g = self.params['genre']
        nf = len(m['genre_folders'].get(g, []))
        if nf:
            self.add_folder('Collections in %s  (%d)' % (g, nf), '', action='genre_collections', genre=g)
        vids = m['genre_videos'].get(g, [])
        letters = {}
        for i in vids:
            c = m['items'][i][0][:1].upper()
            c = c if c.isalpha() else '#'
            letters[c] = letters.get(c, 0) + 1
        for c in sorted(letters):
            self.add_folder('%s  (%d)' % (c, letters[c]), '', action='genre_letter', genre=g, letter=c)
        self.end()

    def genre_collections(self):
        m = _model()
        for k in m['genre_folders'].get(self.params['genre'], []):
            self.add_dir_item(m, k)
        self.end()

    def genre_letter(self):
        m = _model()
        g, letter = self.params['genre'], self.params['letter']
        for i in m['genre_videos'].get(g, []):
            c = m['items'][i][0][:1].upper()
            c = c if c.isalpha() else '#'
            if c == letter:
                self.add_video(m, i)
        self.end('movies')

    def recent(self):
        m = _model()
        vids = [i for i in m['added'] if i in m['items'] and not m['items'][i][2]]
        vids.sort(key=lambda i: m['added'][i], reverse=True)
        for i in vids[:PAGE]:
            self.add_video(m, i)
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
        any_video = False
        for i in res:
            if m['items'][i][2]:
                self.add_dir_item(m, i)
            else:
                any_video = True
                self.add_video(m, i)
        if not res:
            xbmcgui.Dialog().notification('FEFC', 'No results for "%s"' % q, xbmcgui.NOTIFICATION_INFO, 3000)
        self.end('movies' if any_video else 'files', cache=False)

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


ROUTES = {'': 'root', 'root': 'root', 'folder': 'folder', 'genres': 'genres', 'genre': 'genre',
          'genre_collections': 'genre_collections', 'genre_letter': 'genre_letter', 'recent': 'recent',
          'search': 'search', 'play': 'play'}


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
