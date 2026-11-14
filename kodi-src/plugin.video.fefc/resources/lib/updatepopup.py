"""Centered update popup. 1280x720, scaled by Kodi onto 1080p.

Back hides the popup. The download keeps going. Update opens it again.
"""
import re

import xbmc
import xbmcgui

from .updateflow import progress_view

_MAX_ROWS = 6        # rows that fit on the 720 px screen: 110 + 6 * 90 = 650
_ROW_Y0 = 110
_ROW_H = 90
_URL_OK = re.compile(r'^https?://\S+$', re.I)


def _log(message):
    try:
        xbmc.log('[plugin.video.fefc] ' + message, xbmc.LOGWARNING)
    except Exception:
        pass            # logging is the last resort here; it must never raise into the UI


def _clean_url(url):
    """The link as a single http(s) URL, or '' when it is missing or not one."""
    if not isinstance(url, str):
        return ''
    url = ''.join(ch for ch in url.strip() if ch >= ' ' and ch != '\x7f')
    return url if _URL_OK.match(url) else ''


def _view_builtin(url):
    """StartAndroidActivity builtin for a VIEW intent. Kodi splits builtin arguments on
    commas and counts parentheses, so those and quotes are percent-encoded; the address
    means the same thing."""
    for ch, code in ((',', '%2C'), ('(', '%28'), (')', '%29'), ('"', '%22'), ("'", '%27')):
        url = url.replace(ch, code)
    return 'StartAndroidActivity(,android.intent.action.VIEW,,%s)' % url


def open_url(url):
    """Open a download link. Android gets a VIEW intent; any other platform shows the
    address so it can be typed on another device. Returns False for an unusable link."""
    safe = _clean_url(url)
    if not safe:
        _log('manual download: not an http(s) link: %r' % (str(url)[:120],))
        return False
    if xbmc.getCondVisibility('System.Platform.Android'):
        xbmc.executebuiltin(_view_builtin(safe))
    else:
        xbmcgui.Dialog().ok('Download the latest version', 'Open this address on a computer or phone:\n' + safe)
    return True


class ManualDownloads(xbmcgui.WindowDialog):
    """One focusable row per published platform. Selecting a row opens the URL.

    A row shows its short link (when it has one) above the button; the button opens the
    full URL. A row with no usable http(s) URL is shown as plain text with no button, so
    nothing on screen can be selected and then do nothing. At most _MAX_ROWS rows are
    drawn; more would run off the bottom of the screen, so when there are more, rows with no
    usable link are dropped first and the rest are cut after the sixth. self.buttons holds
    one button per row that has a link, in order."""

    def __init__(self, rows):
        super(ManualDownloads, self).__init__()
        if not isinstance(rows, (list, tuple)):
            rows = []
        self.rows = [r for r in rows if isinstance(r, dict)]
        if len(self.rows) > _MAX_ROWS:
            _log('manual downloads: showing %d of %d rows' % (_MAX_ROWS, len(self.rows)))
            # No room for all of them: rows with no usable link go first, then the rest are cut.
            usable = [r for r in self.rows if _clean_url(r.get('url'))]
            self.rows = (usable or self.rows)[:_MAX_ROWS]
        self.addControl(xbmcgui.ControlImage(0, 0, 1280, 720, 'fefc-white.png', colorDiffuse='E0000000'))
        self.addControl(xbmcgui.ControlLabel(80, 40, 1120, 48, 'Download the latest version', font='font_title_big', textColor='FFFFFFFF'))
        self.buttons = []
        self._entries = []
        y = _ROW_Y0
        if not self.rows:
            self.addControl(xbmcgui.ControlLabel(80, y + 30, 1120, 48, 'No download links are published yet.',
                                                 font='font14_title', textColor='FF7F8FA6', alignment=6))
        for row in self.rows:
            version = ('  ' + str(row.get('version'))) if row.get('version') else ''
            label = '%s%s' % (row.get('platform') or '', version)
            full = _clean_url(row.get('url'))
            if full:
                short = row.get('short')
                shown = short if isinstance(short, str) and short.strip() else full
                self.addControl(xbmcgui.ControlLabel(80, y, 1120, 28, shown, font='font12', textColor='FF99CCFF'))
                btn = xbmcgui.ControlButton(80, y + 30, 1120, 48, label, font='font14_title', textColor='FF000000',
                                            focusedColor='FF000000', alignment=6,
                                            focusTexture='fefc-ol-focus.png', noFocusTexture='fefc-ol-tile.png')
                self.addControl(btn)
                self.buttons.append(btn)
                self._entries.append((row, btn))
            else:
                self.addControl(xbmcgui.ControlLabel(80, y + 30, 1120, 48, '%s  (not published yet)' % label,
                                                     font='font14_title', textColor='FF7F8FA6', alignment=6))
            y += _ROW_H
        count = len(self.buttons)
        for i, btn in enumerate(self.buttons):
            btn.controlUp(self.buttons[i - 1] if count > 1 else btn)
            btn.controlDown(self.buttons[(i + 1) % count] if count > 1 else btn)
        if self.buttons:
            self.setFocus(self.buttons[0])

    def doModal(self):
        try:
            super(ManualDownloads, self).doModal()
        except Exception as exc:
            _log('manual downloads dialog failed: %r' % (exc,))

    def onAction(self, action):
        if action.getId() in (xbmcgui.ACTION_PREVIOUS_MENU, xbmcgui.ACTION_NAV_BACK, xbmcgui.ACTION_PARENT_DIR, 110):
            self.close()

    def onControl(self, control):
        for row, btn in self._entries:
            if control == btn:
                try:
                    open_url(row.get('url'))
                except Exception as exc:
                    _log('manual download link failed: %r' % (exc,))
                return


class UpdatePopup(xbmcgui.WindowDialog):
    def __init__(self, version, links=None):
        super(UpdatePopup, self).__init__()
        self.version = version or ''
        self.links = links or []
        self.dismissed = False
        self.retry = False
        self._bar_w = 760
        self._retry_shown = False
        self._logged = set()
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
        self._wire(False)
        # Retry starts hidden, and a hidden control cannot take focus: start on the manual
        # button so Select and the arrow keys have something to act on.
        self.setFocus(self.manual_btn)

    def _wire(self, retry_visible):
        """Up and Down between Retry and the manual button. While Retry is hidden the manual
        button's Up points at itself, so focus cannot be sent to a control that is not there."""
        self.retry_btn.controlUp(self.retry_btn)
        self.retry_btn.controlDown(self.manual_btn)
        self.manual_btn.controlUp(self.retry_btn if retry_visible else self.manual_btn)
        self.manual_btn.controlDown(self.manual_btn)

    def _log_once(self, exc):
        key = repr(exc)
        if key not in self._logged:
            self._logged.add(key)
            _log('update popup render: %s' % key)

    def render(self, state, pct=0, done=0, total=0, detail=''):
        try:
            view = progress_view(state, self.version, pct, done, total, detail)
            self.title.setLabel(view['title'])
            self.version_l.setLabel(view['version'])
            self.line.setLabel(view['line'])
            self.sub.setLabel(view['sub'])
            percent = min(100.0, max(0.0, float(view['pct'])))
            self.fill.setWidth(max(1, int(self._bar_w * percent / 100.0)))
            retry = bool(view['retry'])
            self.retry_btn.setVisible(retry)
            if retry != self._retry_shown:
                self._wire(retry)
            if retry:
                self.setFocus(self.retry_btn)
            elif self._retry_shown:
                self.setFocus(self.manual_btn)
            self._retry_shown = retry
        except Exception as exc:
            self._log_once(exc)

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
            try:
                ManualDownloads(self.links).doModal()
            except Exception as exc:
                _log('manual downloads failed: %r' % (exc,))
