"""Centered update popup. 1280x720, scaled by Kodi onto 1080p.

Back hides the popup. The download keeps going. Update opens it again.
"""
import xbmc
import xbmcgui

from .updateflow import progress_view


class UpdatePopup(xbmcgui.WindowDialog):
    def __init__(self, version):
        super(UpdatePopup, self).__init__()
        self.version = version or ''
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
