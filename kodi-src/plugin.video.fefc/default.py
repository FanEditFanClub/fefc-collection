import sys


if __name__ == '__main__':
    try:
        from resources.lib import router

        router.run(sys.argv)
    except Exception:
        # Last-resort guard: router.run() already handles Router()
        # construction and dispatch failures, so this only fires for
        # something outside those guards. Show the user a message and
        # close the directory instead of letting the exception escape.
        try:
            import xbmcgui
            import xbmcplugin

            xbmcgui.Dialog().notification(
                'FEFC', 'Could not load the catalogue',
                xbmcgui.NOTIFICATION_ERROR, 5000)
            handle = int(sys.argv[1]) if len(sys.argv) > 1 else -1
            if handle >= 0:
                xbmcplugin.endOfDirectory(handle, succeeded=False)
        except Exception:
            pass
