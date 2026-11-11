"""Genres as a Home-style 3x3. Nine names a page, artwork or the Home tile."""


def _s(v):
    return int(round(v * 2 / 3.0))


def open_genre_board(entries):
    """entries: (label, key, art) already paged by the caller? Full list of tiles.

    Returns the original genre key the viewer selected, or '' if they left.
    """
    import xbmc
    import xbmcgui

    tw, th, gap = _s(400), _s(200), _s(12)
    ox = (1280 - (tw * 3 + gap * 2)) // 2
    oy = _s(200)
    pages = [entries[i:i + 9] for i in range(0, len(entries), 9)] or [[]]

    class GenreWindow(xbmcgui.WindowDialog):
        def __init__(self):
            super().__init__()
            self.picked = ''
            self.page = 0
            self.tiles = []
            self._focus = 0
            self.addControl(xbmcgui.ControlImage(0, 0, 1280, 720, 'fefc-white.png', colorDiffuse='FF000000'))
            self.addControl(xbmcgui.ControlImage(_s(96), _s(48), _s(220), _s(56), 'fefc-wordmark.png', aspectRatio=2))
            self.heading = xbmcgui.ControlLabel(_s(340), _s(54), _s(800), _s(56), 'GENRES', font='font13_title', textColor='FFFFFFFF', alignment=6)
            self.addControl(self.heading)
            self.indicator = xbmcgui.ControlLabel(_s(1100), _s(54), _s(280), _s(56), '', font='font13_title', textColor='FFFF9C00', alignment=6)
            self.addControl(self.indicator)
            self.prev_btn = xbmcgui.ControlButton(ox - _s(88), oy + th, _s(64), _s(64), '<', font='font14_title', textColor='FFFFFFFF', focusedColor='FF000000', focusTexture='fefc-ol-focus.png', noFocusTexture='fefc-ol-tile.png', alignment=6)
            self.next_btn = xbmcgui.ControlButton(ox + tw * 3 + gap * 2 + _s(24), oy + th, _s(64), _s(64), '>', font='font14_title', textColor='FFFFFFFF', focusedColor='FF000000', focusTexture='fefc-ol-focus.png', noFocusTexture='fefc-ol-tile.png', alignment=6)
            self.addControl(self.prev_btn)
            self.addControl(self.next_btn)
            from .router import _add_icon_bar
            self.menu, self.sound_icon = _add_icon_bar(self, self.heading)
            self._show(0, 0)

        def _show(self, page, focus):
            self.page = page
            for c in self.tiles:
                try:
                    self.removeControl(c)
                except Exception:
                    pass
            self.tiles = []
            chunk = pages[page]
            n = len(chunk)
            focus = min(focus, max(0, n - 1))
            self._focus = focus
            self.indicator.setLabel('%d/%d' % (page + 1, max(1, len(pages))))
            self.prev_btn.setVisible(page > 0)
            self.next_btn.setVisible(page < len(pages) - 1)
            for i, (label, _key, art) in enumerate(chunk):
                col, row = i % 3, i // 3
                x = ox + col * (tw + gap)
                y = oy + row * (th + gap)
                nofocus = art or 'special://skin/media/fefc-ol-tile.png'
                btn = xbmcgui.ControlButton(
                    x, y, tw, th, label, font='font11_tile',
                    textColor='FFFFFFFF', focusedColor='FFFFFFFF', alignment=6,
                    focusTexture='fefc-ol-focus.png', noFocusTexture=nofocus)
                self.addControl(btn)
                self.tiles.append(btn)
            for i, btn in enumerate(self.tiles):
                col, row = i % 3, i // 3
                left = self.tiles[i - 1] if col else btn
                right = self.tiles[i + 1] if col < 2 and i + 1 < n else btn
                up = self.tiles[i - 3] if row else btn
                if row < 2 and i + 3 < n:
                    down = self.tiles[i + 3]
                else:
                    down = self.menu[0]
                # Last column stays put so Right can turn the page. First column too, for Left.
                if col == 2:
                    right = btn
                if col == 0:
                    left = btn
                btn.controlLeft(left)
                btn.controlRight(right)
                btn.controlUp(up)
                btn.controlDown(down)
            if self.tiles:
                self.menu[0].controlUp(self.tiles[min(self._focus, n - 1)])
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
            import xbmcgui
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

        def onControl(self, c):
            if c == self.next_btn and self.page < len(pages) - 1:
                self._show(self.page + 1, 0)
                return
            if c == self.prev_btn and self.page > 0:
                self._show(self.page - 1, 0)
                return
            for i, btn in enumerate(self.tiles):
                if c == btn:
                    self.picked = pages[self.page][i][1]
                    self.close()
                    return
            from .router import _bar_action
            if c in self.menu:
                _bar_action(self, c)

    win = GenreWindow()
    win.doModal()
    picked = win.picked
    del win
    return picked
