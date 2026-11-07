"""Search keyboard decision. Ack means the Android IME activity opened."""
FAIL_AFTER = 1.5


def files_dirs(translated_paths, packages=('com.fefc.kodi', 'org.xbmc.kodi')):
    dirs = []

    def add(d):
        d = (d or '').rstrip('/')
        if d and d not in dirs:
            dirs.append(d)

    for t in translated_paths or []:
        t = t or ''
        for pkg in packages:
            for marker in ('/Android/data/%s/files' % pkg, '/%s/files' % pkg):
                i = t.find(marker)
                if i >= 0:
                    add(t[:i + len(marker)])
    for pkg in packages:
        for root in ('/storage/emulated/0', '/sdcard'):
            add('%s/Android/data/%s/files' % (root, pkg))
    return dirs


def input_plan(platform_android, dirs, ack, elapsed, fail_after=FAIL_AFTER):
    if ack:
        return 'native'
    if not platform_android and not dirs:
        return 'kodi'
    if elapsed >= fail_after:
        return 'fallback_kodi'
    return 'wait'
