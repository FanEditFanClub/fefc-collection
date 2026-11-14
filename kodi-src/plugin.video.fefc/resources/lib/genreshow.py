"""Genres as a Home-style 3x3 over the Home mosaic.

The dialog is transparent. Home keeps playing the one wall video, and the top
three mosaic cells stay visible because this screen has no wordmark. Tiles are
solid so the names stay readable. Nine names a page.
"""
import os

import xbmc
import xbmcgui

# Safe at module top: router.py has no top-level genreshow import (it imports
# this module lazily inside genres()), so there is no import cycle. This
# replaces the per-keypress `from .router import ...` inside onAction/onClick.
from .router import _bar_action, _dialog_back


def open_genre_board(entries):
    """entries: (label, key, art). Returns the genre key, or '' if they left.

    Malformed entries (not a 3-tuple) are skipped, so a bad caller can never
    make _show()/onClick() index past a short tuple.
    """
    clean = []
    for e in entries or []:
        if isinstance(e, (list, tuple)) and len(e) == 3:
            clean.append((e[0] or '', e[1] or '', e[2] or ''))
    entries = clean
    pages = [entries[i:i + 9] for i in range(0, len(entries), 9)] or [[]]
    root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

    class GenreWindow(xbmcgui.WindowXMLDialog):
        def __init__(self, *args):
            super().__init__(*args)
            self.picked = ''
            self.page = 0
            self._focus = 0
            self._ready = False
            self.tiles = []
            self.arts = []
            self.names = []
            self.menu = []
            self.indicator = None
            self.sound_icon = None

        def onInit(self):
            if self._ready:
                return
            def _ctl(cid):
                try:
                    return self.getControl(cid)
                except Exception:
                    return None
            self.tiles = [_ctl(9101 + i) for i in range(9)]
            self.arts = []
            self.names = []
            for i in range(9):
                self.arts.append(_ctl(9201 + i))
                self.names.append(_ctl(9301 + i))
            self.menu = [_ctl(9401 + i) for i in range(4)]
            self.indicator = _ctl(9150)
            # Item 152: remember the sound icon so _bar_action can update it.
            self.sound_icon = _ctl(9405)
            off = xbmc.getInfoLabel('Window(home).Property(FEFC.SoundOff)') == '1'
            if self.menu[2] is not None:
                self.menu[2].setLabel('SOUND OFF' if off else 'SOUND ON')
            if self.sound_icon is not None:
                try:
                    self.sound_icon.setImage('fefc-ic-mute.png' if off else 'fefc-ic-sound.png')
                except Exception:
                    pass
            self._show(0, 0)
            # Only after init (including the first _show) succeeded.
            self._ready = True

        def _show(self, page, focus):
            # Defensive page: callers pass ints, but never index out of range.
            try:
                page = int(page)
            except (TypeError, ValueError):
                page = 0
            page = max(0, min(page, len(pages) - 1))
            self.page = page
            chunk = pages[page]
            n = len(chunk)
            focus = min(focus, max(0, n - 1))
            self._focus = focus
            if self.indicator is not None:
                self.indicator.setLabel('%d/%d' % (page + 1, max(1, len(pages))))
            for i, btn in enumerate(self.tiles):
                if btn is None:
                    continue
                art = self.arts[i] if i < len(self.arts) else None
                name = self.names[i] if i < len(self.names) else None
                if i < n:
                    btn.setLabel(chunk[i][0])
                    btn.setVisible(True)
                    btn.setEnabled(True)
                    if name is not None:
                        name.setLabel(chunk[i][0])
                        name.setVisible(True)
                    if art is not None:
                        art.setImage(chunk[i][2] or '')
                        art.setVisible(bool(chunk[i][2]))
                else:
                    btn.setLabel('')
                    btn.setVisible(False)
                    btn.setEnabled(False)
                    if name is not None:
                        name.setLabel('')
                        name.setVisible(False)
                    if art is not None:
                        art.setImage('')
                        art.setVisible(False)
            for i in range(n):
                col, row = i % 3, i // 3
                btn = self.tiles[i]
                if btn is None:
                    continue
                left = self.tiles[i - 1] if col and self.tiles[i - 1] is not None else btn
                right = self.tiles[i + 1] if col < 2 and i + 1 < n and self.tiles[i + 1] is not None else btn
                up = self.tiles[i - 3] if row and self.tiles[i - 3] is not None else btn
                if row < 2 and i + 3 < n:
                    down = self.tiles[i + 3] if self.tiles[i + 3] is not None else self.menu[0]
                else:
                    down = self.menu[0] if self.menu and self.menu[0] is not None else btn
                if col == 2:
                    right = btn
                if col == 0:
                    left = btn
                btn.controlLeft(left)
                btn.controlRight(right)
                btn.controlUp(up)
                btn.controlDown(down)
            if n:
                # Item 151: per-column Up. Menu columns are (0, 1, 1, 2) —
                # the shipped XML targets 9401->9107, 9402->9108,
                # 9403->9108, 9404->9109. Each button goes up to the last
                # visible tile in its column; a column with no tile on a
                # short page falls back to the last visible tile overall.
                _menu_cols = (0, 1, 1, 2)
                for j, b in enumerate(self.menu):
                    if b is None:
                        continue
                    col = _menu_cols[j] if j < len(_menu_cols) else 0
                    target = None
                    for i in range(n - 1, -1, -1):
                        if i % 3 == col and self.tiles[i] is not None:
                            target = self.tiles[i]
                            break
                    if target is None:
                        for i in range(n - 1, -1, -1):
                            if self.tiles[i] is not None:
                                target = self.tiles[i]
                                break
                    b.controlUp(target if target is not None else b)
                if self.tiles[self._focus] is not None:
                    self.setFocus(self.tiles[self._focus])
            else:
                # Item 155: empty board — the XML onup targets point at
                # hidden tiles. Point each menu button up at itself.
                for b in self.menu:
                    if b is not None:
                        b.controlUp(b)
                if self.menu and self.menu[0] is not None:
                    self.setFocus(self.menu[0])

        def _index(self):
            try:
                fid = self.getFocusId()
            except Exception:
                return None
            for i, btn in enumerate(self.tiles):
                if btn.getId() == fid:
                    return i
            return None

        def onAction(self, action):
            aid = action.getId()
            i = self._index()
            if aid == xbmcgui.ACTION_MOVE_RIGHT and i is not None and i % 3 == 2 and self.page < len(pages) - 1:
                self._show(self.page + 1, i - 2)
                return
            if aid == xbmcgui.ACTION_MOVE_LEFT and i is not None and i % 3 == 0 and self.page > 0:
                self._show(self.page - 1, i + 2)
                return
            # Remote Back, the Android back key, and Backspace. _dialog_back covers
            # the first two and plays the cue; ParentDir and Backspace still close.
            if aid in (xbmcgui.ACTION_PARENT_DIR, 110) or _dialog_back(action):
                self.picked = ''
                self.close()

        def onClick(self, cid):
            if 9101 <= cid <= 9109:
                i = cid - 9101
                chunk = pages[self.page] if 0 <= self.page < len(pages) else []
                if i < len(chunk):
                    self.picked = chunk[i][1]
                    self.close()
                return
            if 9401 <= cid <= 9404:
                _bar_action(self, self.menu[cid - 9401])

    home = xbmcgui.Window(10000)
    home.setProperty('FEFC.Genres', '1')
    win = GenreWindow('DialogGenres.xml', root, 'Default', '1080i')
    try:
        win.doModal()
        picked = win.picked
    finally:
        home.clearProperty('FEFC.Genres')
        del win
    return picked
