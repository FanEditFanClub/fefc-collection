"""Centered update popup. 1280x720, scaled by Kodi onto 1080p.

Back hides the popup. The download keeps going. Update opens it again.
"""
import xbmc
import xbmcgui

from .updateflow import progress_view


class ManualDownloads(xbmcgui.WindowDialog):
    """One focusable row per published platform. Selecting a row opens the URL."""

    def __init__(self, rows):
        super(ManualDownloads, self).__init__()
        self.rows = rows or []
        self.addControl(xbmcgui.ControlImage(0, 0, 1280, 720, 'fefc-white.png', colorDiffuse='E0000000'))
        self.addControl(xbmcgui.ControlLabel(80, 40, 1120, 48, 'Download the latest version', font='font_title_big', textColor='FFFFFFFF'))
        self.buttons = []
        y = 110
        for row in self.rows:
            version = ('  ' + row.get('version')) if row.get('version') else ''
            label = '%s%s' % (row.get('platform') or '', version)
            url = row.get('short') or row.get('url') or ''
            self.addControl(xbmcgui.ControlLabel(80, y, 1120, 28, url, font='font12', textColor='FF99CCFF'))
            btn = xbmcgui.ControlButton(80, y + 30, 1120, 48, label, font='font14_title', textColor='FF000000',
                                        focusedColor='FF000000', alignment=6,
                                        focusTexture='fefc-ol-focus.png', noFocusTexture='fefc-ol-tile.png')
            self.addControl(btn)
            self.buttons.append(btn)
            y += 90
        if self.buttons:
            self.setFocus(self.buttons[0])

    def onAction(self, action):
        if action.getId() in (xbmcgui.ACTION_PREVIOUS_MENU, xbmcgui.ACTION_NAV_BACK, xbmcgui.ACTION_PARENT_DIR, 110):
            self.close()

    def onControl(self, control):
        for row, btn in zip(self.rows, self.buttons):
            if control == btn:
                url = row.get('url') or ''
                if url:
                    xbmc.executebuiltin('StartAndroidActivity(,android.intent.action.VIEW,,%s)' % url)
                return


class UpdatePopup(xbmcgui.WindowDialog):
    def __init__(self, version, links=None):
        super(UpdatePopup, self).__init__()
        self.version = version or ''
        self.links = links or []
        self.dismissed = False
        self.retry = False
        self._bar_w = 760
        self.addControl(xbmcgui.ControlImage(0, 0, 1280, 720, 'fefc-white.png', colorDiffuse='C0000000'))
        self.addControl(xbmcgui.ControlImage(200, 150, 880, 420, 'fefc-white.png', colorDiffuse='F012161C'))
        self.addControl(xbmcgui.ControlImage(200, 150, 880, 8, 'fefc-white.png', colorDiffuse='FFFF9C00'))
        self.title = xbmcgui.ControlLabel(230, 176, 820, 54, 'Updating FEFC', font='font_title_big', textColor='FFFFFFFF', alignment=2)
        self.version_l = xbmcgui.ControlLabel(230, 234, 820, 36, self.version, font='font14_title', textColor='FF99CCFF', alignment=2)
        self.addControl(self.title)
        self.addControl(self.version_l)
        self.addControl(xbmcgui.ControlImage(260, 300, self._bar_w, 36, 'fefc-white.png', colorDiffuse='FF1A2430'))
        self.fill = xbmcgui.ControlImage(260, 300, 1, 36, 'fefc-white.png', colorDiffuse='FFFF9C00')
        self.addControl(self.fill)
        self.line = xbmcgui.ControlLabel(230, 350, 820, 64, '0%', font='font_title_big', textColor='FFFFFFFF', alignment=2)
        self.sub = xbmcgui.ControlLabel(230, 420, 820, 40, '', font='font14_title', textColor='FFFFFFFF', alignment=2)
        self.addControl(self.line)
        self.addControl(self.sub)
        self.retry_btn = xbmcgui.ControlButton(
            490, 490, 300, 58, 'Retry', font='font14_title', textColor='FF000000', focusedColor='FF000000', alignment=6,
            focusTexture='fefc-ol-focus.png', noFocusTexture='fefc-ol-tile.png')
        self.addControl(self.retry_btn)
        self.retry_btn.setVisible(False)
        self.manual_btn = xbmcgui.ControlButton(
            180, 560, 920, 48, 'Download the latest version manually', font='font14_title', textColor='FF000000',
            focusedColor='FF000000', alignment=6, focusTexture='fefc-ol-focus.png', noFocusTexture='fefc-ol-tile.png')
        self.addControl(self.manual_btn)
        self.setFocus(self.retry_btn)

    def render(self, state, pct=0, done=0, total=0, detail=''):
        view = progress_view(state, self.version, pct, done, total, detail)
        try:
            self.title.setLabel(view['title'])
            self.version_l.setLabel(view['version'])
            self.line.setLabel(view['line'])
            self.sub.setLabel(view['sub'])
            width = max(1, int(self._bar_w * view['pct'] / 100.0))
            self.fill.setWidth(width)
            self.retry_btn.setVisible(bool(view['retry']))
            if view['retry']:
                self.setFocus(self.retry_btn)
        except Exception:
            pass

    def onAction(self, action):
        aid = action.getId()
        if aid in (xbmcgui.ACTION_PREVIOUS_MENU, xbmcgui.ACTION_NAV_BACK, xbmcgui.ACTION_PARENT_DIR, 110):
            self.dismissed = True
            self.close()

    def onControl(self, control):
        if control == self.retry_btn:
            self.retry = True
            self.close()
        elif control == self.manual_btn:
            ManualDownloads(self.links).doModal()
