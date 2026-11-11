"""Genres as a Home-style 3x3 over the Home mosaic.

The dialog is transparent. Home keeps playing the one wall video, and the top
three mosaic cells stay visible because this screen has no wordmark. Tiles are
solid so the names stay readable. Nine names a page.
"""


def open_genre_board(entries):
    """entries: (label, key, art). Returns the genre key, or '' if they left."""
    import os
    import xbmc
    import xbmcgui

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
            self.menu = []

        def onInit(self):
            if self._ready:
                return
            self._ready = True
            self.tiles = [self.getControl(9101 + i) for i in range(9)]
            self.arts = []
            self.names = []
            for i in range(9):
                try:
                    self.arts.append(self.getControl(9201 + i))
                except Exception:
                    self.arts.append(None)
                try:
                    self.names.append(self.getControl(9301 + i))
                except Exception:
                    self.names.append(None)
            self.menu = [self.getControl(9401 + i) for i in range(4)]
            self.indicator = self.getControl(9150)
            off = xbmc.getInfoLabel('Window(home).Property(FEFC.SoundOff)') == '1'
            self.menu[2].setLabel('SOUND OFF' if off else 'SOUND ON')
            try:
                self.getControl(9405).setImage('fefc-ic-mute.png' if off else 'fefc-ic-sound.png')
            except Exception:
                pass
            self._show(0, 0)

        def _show(self, page, focus):
            self.page = page
            chunk = pages[page]
            n = len(chunk)
            focus = min(focus, max(0, n - 1))
            self._focus = focus
            self.indicator.setLabel('%d/%d' % (page + 1, max(1, len(pages))))
            for i, btn in enumerate(self.tiles):
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
                left = self.tiles[i - 1] if col else btn
                right = self.tiles[i + 1] if col < 2 and i + 1 < n else btn
                up = self.tiles[i - 3] if row else btn
                if row < 2 and i + 3 < n:
                    down = self.tiles[i + 3]
                else:
                    down = self.menu[0]
                if col == 2:
                    right = btn
                if col == 0:
                    left = btn
                btn.controlLeft(left)
                btn.controlRight(right)
                btn.controlUp(up)
                btn.controlDown(down)
            if n:
                for b in self.menu:
                    b.controlUp(self.tiles[min(6, n - 1)])
                self.setFocus(self.tiles[self._focus])
            else:
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
            from .router import _dialog_back
            # Remote Back, the Android back key, and Backspace. _dialog_back covers
            # the first two and plays the cue; ParentDir and Backspace still close.
            if aid in (xbmcgui.ACTION_PARENT_DIR, 110) or _dialog_back(action):
                self.picked = ''
                self.close()

        def onClick(self, cid):
            if 9101 <= cid <= 9109:
                i = cid - 9101
                chunk = pages[self.page]
                if i < len(chunk):
                    self.picked = chunk[i][1]
                    self.close()
                return
            if 9401 <= cid <= 9404:
                from .router import _bar_action
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
