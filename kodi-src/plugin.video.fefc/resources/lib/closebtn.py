"""Close (X) button for FEFC's Python dialogs, top right, for touch and mouse.

Remote navigation is unchanged: the button is not linked into any dialog's up/down/left/right
chain unless the dialog does so itself, and Back still closes every dialog."""
import os

import xbmcaddon
import xbmcgui
import xbmcvfs

X, Y, SIZE = 1196, 22, 60     # in the 1280x720 space of xbmcgui.WindowDialog


def _media(name):
    path = xbmcvfs.translatePath(xbmcaddon.Addon('plugin.video.fefc').getAddonInfo('path'))
    return os.path.join(path, 'resources', 'media', 'chrome', name)


def add_close(win, x=X, y=Y, size=SIZE):
    """Add the X to win and return it; compare it in onControl and close."""
    btn = xbmcgui.ControlButton(x, y, size, size, '', focusTexture=_media('close-on.png'),
                                noFocusTexture=_media('close.png'))
    win.addControl(btn)
    return btn


def is_close(win, control):
    btn = getattr(win, 'close_btn', None)
    try:
        return btn is not None and control is not None and control.getId() == btn.getId()
    except Exception:
        return control == btn
